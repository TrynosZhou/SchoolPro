"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DemoDataSource = exports.AppDataSource = exports.RealAppDataSource = void 0;
require("reflect-metadata");
const path_1 = __importDefault(require("path"));
const typeorm_1 = require("typeorm");
const env_1 = require("./env");
const entities_1 = require("../entities");
const demo_data_source_1 = require("./demo-data-source");
Object.defineProperty(exports, "DemoDataSource", { enumerable: true, get: function () { return demo_data_source_1.DemoDataSource; } });
const tenant_context_1 = require("./tenant-context");
/** ts-node (CLI/dev) loads .ts migrations; compiled dist/server.js loads .js migrations. */
const migrationsGlob = path_1.default.join(__dirname, '..', 'migrations', __filename.endsWith('.ts') ? '*.ts' : '*.js');
/**
 * The real production DataSource. Only `server.ts` (boot/`.initialize()`) and the
 * TypeORM migration CLI should import this directly — everywhere else in the app
 * should import `AppDataSource` below instead.
 */
exports.RealAppDataSource = new typeorm_1.DataSource({
    type: 'postgres',
    host: env_1.env.db.host,
    port: env_1.env.db.port,
    username: env_1.env.db.username,
    password: env_1.env.db.password,
    database: env_1.env.db.database,
    /** Neon (and most managed Postgres) requires SSL; local dev Postgres does not. */
    ssl: env_1.env.nodeEnv === 'production' ? { rejectUnauthorized: false } : false,
    /** Migrations own schema changes; sync would race them and break on NOT NULL backfills. */
    synchronize: false,
    migrationsRun: false,
    logging: env_1.env.nodeEnv === 'development',
    entities: entities_1.entities,
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
exports.AppDataSource = new Proxy(exports.RealAppDataSource, {
    get(target, prop, _receiver) {
        const active = tenant_context_1.tenantContext.isDemo() ? demo_data_source_1.DemoDataSource : target;
        const value = Reflect.get(active, prop, active);
        return typeof value === 'function' ? value.bind(active) : value;
    },
});
