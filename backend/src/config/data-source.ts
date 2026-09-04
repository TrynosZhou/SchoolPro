import 'reflect-metadata';
import path from 'path';
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

  let lastError: unknown;
  for (const candidate of candidates) {
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
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export let AppDataSource: DataSource = buildTenantProxy(_holder);

export { DemoDataSource };