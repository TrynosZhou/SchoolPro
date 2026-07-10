import 'reflect-metadata';
import path from 'path';
import { DataSource } from 'typeorm';
import { env } from './env';
import { entities } from '../entities';

/** ts-node (CLI/dev) loads .ts migrations; compiled dist/server.js loads .js migrations. */
const migrationsGlob = path.join(
  __dirname,
  '..',
  'migrations',
  __filename.endsWith('.ts') ? '*.ts' : '*.js',
);

/**
 * A fully separate Postgres database dedicated to demo accounts. It reuses the exact
 * same entity classes/migrations as production, so structurally it is always in sync
 * with the real schema — but it is a physically distinct database with its own
 * connection pool, meaning a bug in demo-only code (e.g. the nightly reset job) can
 * never touch production data even in the worst case.
 *
 * Only ever access this directly from demo-only code (the seed script, the reset job,
 * and `server.ts` boot). Everywhere else in the app, keep using the `AppDataSource`
 * export from `data-source.ts` — it transparently routes here when the current
 * request is a demo session.
 */
export const DemoDataSource = new DataSource({
  type: 'postgres',
  host: env.demo.db.host,
  port: env.demo.db.port,
  username: env.demo.db.username,
  password: env.demo.db.password,
  database: env.demo.db.database,
  synchronize: false,
  /** Demo DB is bootstrapped from entities on first use; incremental migrations target prod upgrades. */
  migrationsRun: false,
  logging: false,
  entities,
  migrations: [migrationsGlob],
  extra: {
    statement_timeout: 60000,
  },
});
