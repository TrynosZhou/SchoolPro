"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppDataSource = void 0;
require("reflect-metadata");
const path_1 = __importDefault(require("path"));
const typeorm_1 = require("typeorm");
const env_1 = require("./env");
const entities_1 = require("../entities");
/** ts-node (CLI/dev) loads .ts migrations; compiled dist/server.js loads .js migrations. */
const migrationsGlob = path_1.default.join(__dirname, '..', 'migrations', __filename.endsWith('.ts') ? '*.ts' : '*.js');
exports.AppDataSource = new typeorm_1.DataSource({
    type: 'postgres',
    host: env_1.env.db.host,
    port: env_1.env.db.port,
    username: env_1.env.db.username,
    password: env_1.env.db.password,
    database: env_1.env.db.database,
    /** Migrations own schema changes; sync would race them and break on NOT NULL backfills. */
    synchronize: false,
    migrationsRun: true,
    logging: env_1.env.nodeEnv === 'development',
    entities: entities_1.entities,
    migrations: [migrationsGlob],
    /** Enforce referential integrity on all foreign keys */
    extra: {
        statement_timeout: 60000,
    },
});
