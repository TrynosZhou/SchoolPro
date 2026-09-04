"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DemoDataSource = void 0;
require("reflect-metadata");
const path_1 = __importDefault(require("path"));
const typeorm_1 = require("typeorm");
const env_1 = require("./env");
const entities_1 = require("../entities");
/** ts-node (CLI/dev) loads .ts migrations; compiled dist/server.js loads .js migrations. */
const migrationsGlob = path_1.default.join(__dirname, '..', 'migrations', __filename.endsWith('.ts') ? '*.ts' : '*.js');
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
exports.DemoDataSource = new typeorm_1.DataSource({
    type: 'postgres',
    host: env_1.env.demo.db.host,
    port: env_1.env.demo.db.port,
    username: env_1.env.demo.db.username,
    password: env_1.env.demo.db.password,
    database: env_1.env.demo.db.database,
    synchronize: false,
    /** Demo DB is bootstrapped from entities on first use; incremental migrations target prod upgrades. */
    migrationsRun: false,
    logging: false,
    entities: entities_1.entities,
    migrations: [migrationsGlob],
    extra: {
        statement_timeout: 60000,
    },
});
