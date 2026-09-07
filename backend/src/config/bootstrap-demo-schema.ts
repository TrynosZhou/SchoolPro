import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { env } from './env';
import { entities } from '../entities';
import { ensurePostgresDatabaseCreated } from './data-source';

const DB_NOT_FOUND_RE = /database "([^"]+)" does not exist/i;
const DB_NOT_FOUND_CODE = '3D000';

function pickSslForDemo(mode: string): boolean | { rejectUnauthorized: boolean } {
  if (mode === 'require') return { rejectUnauthorized: false };
  if (mode === 'disable') return false;
  return env.nodeEnv === 'production' || env.onRender ? { rejectUnauthorized: false } : false;
}

function demoSslConfig() {
  switch (env.demo.db.sslMode) {
    case 'require':
      return { rejectUnauthorized: false };
    case 'disable':
      return false;
    case 'auto':
    default:
      return env.nodeEnv === 'production' ? { rejectUnauthorized: false } : false;
  }
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

/**
 * Fresh demo databases have no tables — incremental migrations assume a base
 * schema that was originally created via synchronize. Bootstrap once from
 * entities when `users` is missing, then let the normal DemoDataSource init
 * handle connection pooling (migrations are skipped on demo; entities are the
 * source of truth for a greenfield demo install).
 */
export async function ensureDemoSchemaBootstrapped(): Promise<boolean> {
  const ssl = pickSslForDemo(env.demo.db.sslMode);

  try {
    await ensurePostgresDatabaseCreated({
      host: env.demo.db.host,
      port: env.demo.db.port,
      username: env.demo.db.username,
      password: env.demo.db.password,
      targetDatabase: env.demo.db.database,
      sslMode: env.demo.db.sslMode,
    });
  } catch (err) {
    console.warn('[demo] Could not auto-create demo database (will still attempt connection):',
      err instanceof Error ? err.message : String(err));
  }

  let client: Client | null = null;
  try {
    client = new Client({
      host: env.demo.db.host,
      port: env.demo.db.port,
      user: env.demo.db.username,
      password: env.demo.db.password,
      database: env.demo.db.database,
      ssl,
      connectionTimeoutMillis: 10000,
    });
    await client.connect();
  } catch (err) {
    if (client) { try { await client.end(); } catch { /* swallow */ } }
    if (isDatabaseNotFoundError(err)) {
      console.log('[demo] Demo database not found after auto-create attempt; retrying creation…');
      const r = await ensurePostgresDatabaseCreated({
        host: env.demo.db.host,
        port: env.demo.db.port,
        username: env.demo.db.username,
        password: env.demo.db.password,
        targetDatabase: env.demo.db.database,
        sslMode: env.demo.db.sslMode,
      });
      console.log(`[demo] Retry auto-create result: created=${r.created}, existed=${r.existed}`);
      client = new Client({
        host: env.demo.db.host,
        port: env.demo.db.port,
        user: env.demo.db.username,
        password: env.demo.db.password,
        database: env.demo.db.database,
        ssl,
        connectionTimeoutMillis: 10000,
      });
      await client.connect();
    } else {
      throw err;
    }
  }

  try {
    const res = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'users'
       ) AS exists`,
    );

    if (res.rows[0]?.exists) {
      try { await client.end(); } catch { /* swallow */ }
      return false;
    }
  } finally {
    try { if (client) await client.end(); } catch { /* swallow */ }
  }

  console.log('[demo] Bootstrapping demo database schema (first-time synchronize)…');
  const bootstrap = new DataSource({
    type: 'postgres',
    host: env.demo.db.host,
    port: env.demo.db.port,
    username: env.demo.db.username,
    password: env.demo.db.password,
    database: env.demo.db.database,
    ssl: demoSslConfig(),
    synchronize: true,
    migrationsRun: false,
    logging: false,
    entities,
  });
  await bootstrap.initialize();
  await bootstrap.destroy();
  console.log('[demo] Demo schema bootstrap complete.');
  return true;
}
