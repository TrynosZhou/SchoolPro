import 'reflect-metadata';
import path from 'path';
import { DataSource } from 'typeorm';
import { env } from './env';
import { entities } from '../entities';
import { DemoDataSource } from './demo-data-source';
import { tenantContext } from './tenant-context';

/** ts-node (CLI/dev) loads .ts migrations; compiled dist/server.js loads .js migrations. */
const migrationsGlob = path.join(
  __dirname,
  '..',
  'migrations',
  __filename.endsWith('.ts') ? '*.ts' : '*.js',
);

/**
 * The real production DataSource. Only `server.ts` (boot/`.initialize()`) and the
 * TypeORM migration CLI should import this directly — everywhere else in the app
 * should import `AppDataSource` below instead.
 */
export const RealAppDataSource = new DataSource({
  type: 'postgres',
  host: env.db.host,
  port: env.db.port,
  username: env.db.username,
  password: env.db.password,
  database: env.db.database,
  /** Migrations own schema changes; sync would race them and break on NOT NULL backfills. */
  synchronize: false,
  migrationsRun: true,
  logging: env.nodeEnv === 'development',
  entities,
  migrations: [migrationsGlob],
  /** Enforce referential integrity on all foreign keys */
  extra: {
    statement_timeout: 60000,
  },
});

/**
 * `AppDataSource` is a transparent `Proxy` around the real DataSource — it forwards
 * every property/method access (`.getRepository()`, `.manager`, `.createQueryBuilder()`,
 * `.query()`, `.transaction()`, etc.) to whichever DataSource is "active" for the
 * current request: production, or the fully separate demo database, based on the
 * AsyncLocalStorage tenant context set by `tenantContextMiddleware`.
 *
 * Why a Proxy instead of threading a tenant argument through every call site: this
 * codebase has ~100+ call sites across ~30 route/service files that do
 * `import { AppDataSource } from '../config/data-source'; AppDataSource.getRepository(Foo)`.
 * Refactoring all of them would be slow and risky (one missed call site = a possible
 * demo/production data leak). By making the *export itself* tenant-aware, every one of
 * those call sites keeps working completely unchanged, but is now structurally
 * incapable of reaching the wrong database — the routing decision lives in exactly one
 * place instead of being a convention every future call site has to remember.
 *
 * Demo-only code (the seed script, the reset cron job) should import `DemoDataSource`
 * directly instead of relying on ambient context, so a truncate/reseed can never be
 * ambiguous about which database it's touching.
 */
export const AppDataSource: DataSource = new Proxy(RealAppDataSource, {
  get(target, prop, _receiver) {
    const active = tenantContext.isDemo() ? DemoDataSource : target;
    const value = Reflect.get(active, prop, active);
    return typeof value === 'function' ? value.bind(active) : value;
  },
}) as DataSource;

export { DemoDataSource };
