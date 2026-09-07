import 'reflect-metadata';
import path from 'path';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { env } from './env';
import { entities } from '../entities';
import { DemoDataSource } from './demo-data-source';
import { tenantContext } from './tenant-context';

const migrationsGlob = path.join(
  __dirname,
  '..',
  'migrations',
  __filename.endsWith('.ts') ? '*.ts' : '*.js',
);

const DB_NOT_FOUND_RE = /database "([^"]+)" does not exist/i;
const DB_NOT_FOUND_CODE = '3D000';

function pickSslForDatabaseCreation(mode: string): boolean | { rejectUnauthorized: boolean } {
  if (mode === 'require') return { rejectUnauthorized: false };
  if (mode === 'disable') return false;
  // 'auto' / other: on Render we MUST use SSL for maintenance DB too
  return env.nodeEnv === 'production' || env.onRender ? { rejectUnauthorized: false } : false;
}

/**
 * Connects to the Postgres `postgres` maintenance database (same host/credentials)
 * and creates `targetDatabase` if it does not already exist. Returns `true` if the
 * database was created (or confirmed to already exist) and a retry is worthwhile.
 *
 * This handles the very common Render / Neon / Supabase / managed-PG scenario where
 * the instance itself is reachable and credentials are correct, but the specific
 * DB name requested by env vars was never provisioned.
 */
export async function ensurePostgresDatabaseCreated(params: {
  host: string;
  port: number;
  username: string;
  password: string;
  targetDatabase: string;
  sslMode: string;
}): Promise<{ created: boolean; existed: boolean }> {
  const { host, port, username, password, targetDatabase, sslMode } = params;
  const ssl = pickSslForDatabaseCreation(sslMode);
  const sanitizedDb = targetDatabase.replace(/[^a-zA-Z0-9_]/g, '_');
  let client: Client | null = null;
  try {
    client = new Client({
      host,
      port,
      user: username,
      password,
      database: 'postgres',
      ssl,
      connectionTimeoutMillis: 8000,
      statement_timeout: 8000,
    });
    await client.connect();
    const check = await client.query<{ exists: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = $1) AS "exists"`,
      [sanitizedDb],
    );
    if (check.rows.length > 0 && !!check.rows[0].exists) {
      return { created: false, existed: true };
    }
    // CREATE DATABASE cannot run inside a transaction block; execute plain.
    await client.query(`CREATE DATABASE "${sanitizedDb}"`);
    try { await client.end(); } catch { /* swallow */ }
    client = null;
    console.log(
      `[startup] Auto-created Postgres database "${sanitizedDb}" on ${host}:${port} ` +
        `as user ${username} (sslMode=${sslMode}).`,
    );
    return { created: true, existed: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[startup] Could not auto-create database "${sanitizedDb}" on ${host}:${port} ` +
        `(sslMode=${sslMode}): ${msg}`,
    );
    return { created: false, existed: false };
  } finally {
    if (client) { try { await client.end(); } catch { /* swallow */ } }
  }
}

function defaultSslConfig() {
  switch (env.db.sslMode) {
    case 'require':
      return { rejectUnauthorized: false };
    case 'disable':
      return false;
    case 'auto':
    default:
      return env.nodeEnv === 'production' ? { rejectUnauthorized: false } : false;
  }
}

function buildDataSourceOptions(ssl: boolean | { rejectUnauthorized: boolean }) {
  return {
    type: 'postgres' as const,
    host: env.db.host,
    port: env.db.port,
    username: env.db.username,
    password: env.db.password,
    database: env.db.database,
    ssl,
    synchronize: false,
    migrationsRun: false,
    logging: env.nodeEnv === 'development',
    entities,
    migrations: [migrationsGlob],
    extra: {
      statement_timeout: 60000,
    },
  };
}

class DataSourceHolder {
  current: DataSource;
  constructor() {
    this.current = new DataSource(buildDataSourceOptions(defaultSslConfig()));
  }
  set(next: DataSource): void {
    this.current = next;
  }
  get(): DataSource {
    return this.current;
  }
}

const _holder = new DataSourceHolder();

export const RealAppDataSource = new Proxy(_holder, {
  get(target, prop, _receiver) {
    if (prop === '_holder') return target;
    if (prop === 'set') return (next: DataSource) => target.set(next);
    const actual = target.get();
    const value = Reflect.get(actual, prop, actual);
    return typeof value === 'function' ? value.bind(actual) : value;
  },
}) as unknown as DataSource & { _holder: DataSourceHolder; set: (next: DataSource) => void };

function buildTenantProxy(target: DataSourceHolder): DataSource {
  return new Proxy(target, {
    get(t, prop, _receiver) {
      const real = t.get();
      const active = tenantContext.isDemo() ? DemoDataSource : real;
      const value = Reflect.get(active, prop, active);
      return typeof value === 'function' ? value.bind(active) : value;
    },
  }) as unknown as DataSource;
}

function isDatabaseNotFoundError(err: unknown): boolean {
  if (err instanceof Error) {
    const anyErr = err as { code?: string };
    if (anyErr.code === DB_NOT_FOUND_CODE) return true;
    if (DB_NOT_FOUND_RE.test(err.message)) return true;
  }
  const str = String(err);
  return DB_NOT_FOUND_RE.test(str);
}

export async function initializeRealAppDataSourceWithSslFallback(): Promise<{
  sslMode: string;
  ds: DataSource;
}> {
  const already = _holder.get();
  if (already.isInitialized) {
    return { sslMode: env.db.sslMode, ds: already };
  }

  const candidates: Array<{ sslMode: string; ssl: boolean | { rejectUnauthorized: boolean } }> =
    [];
  const mode = env.db.sslMode || 'auto';
  if (mode === 'auto') {
    candidates.push({ sslMode: 'require', ssl: { rejectUnauthorized: false } });
    candidates.push({ sslMode: 'disable', ssl: false });
  } else if (mode === 'require') {
    candidates.push({ sslMode: 'require', ssl: { rejectUnauthorized: false } });
  } else if (mode === 'disable') {
    candidates.push({ sslMode: 'disable', ssl: false });
  } else {
    candidates.push({ sslMode: mode, ssl: { rejectUnauthorized: false } });
  }

  let dbCreatedThisRound = false;
  let lastError: unknown;
  for (const candidate of candidates) {
    let retriesForThisCandidate = 0;
    while (retriesForThisCandidate < 2) {
      retriesForThisCandidate++;
      try {
        const current = _holder.get();
        if (current.isInitialized) await current.destroy();
        const replacement = new DataSource(buildDataSourceOptions(candidate.ssl));
        await replacement.initialize();
        _holder.set(replacement);
        console.log(`[startup] DB connected using sslMode=${candidate.sslMode}`);
        return { sslMode: candidate.sslMode, ds: replacement };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(
          `[startup] DB connect failed using sslMode=${candidate.sslMode} to host=${env.db.host}:${env.db.port} db=${env.db.database} user=${env.db.username} — ${msg}`,
        );
        lastError = err;

        if (isDatabaseNotFoundError(err) && !dbCreatedThisRound) {
          console.log(`[startup] Database "${env.db.database}" not found — attempting to auto-create it on ${env.db.host}:${env.db.port}…`);
          try {
            const result = await ensurePostgresDatabaseCreated({
              host: env.db.host,
              port: env.db.port,
              username: env.db.username,
              password: env.db.password,
              targetDatabase: env.db.database,
              sslMode: candidate.sslMode,
            });
            if (result.created || result.existed) {
              dbCreatedThisRound = true;
              console.log(`[startup] Auto-create confirmed (created=${result.created}, existed=${result.existed}) — retrying sslMode=${candidate.sslMode}…`);
              continue;
            }
          } catch (createErr) {
            console.warn(
              `[startup] Auto-create attempt failed for "${env.db.database}": ${
                createErr instanceof Error ? createErr.message : String(createErr)
              }`,
            );
          }
        }
        break;
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export let AppDataSource: DataSource = buildTenantProxy(_holder);

export { DemoDataSource };