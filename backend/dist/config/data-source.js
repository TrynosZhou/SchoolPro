"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppDataSource = void 0;
require("reflect-metadata");
const typeorm_1 = require("typeorm");
const env_1 = require("./env");
const entities_1 = require("../entities");
exports.AppDataSource = new typeorm_1.DataSource({
    type: 'postgres',
    host: env_1.env.db.host,
    port: env_1.env.db.port,
    username: env_1.env.db.username,
    password: env_1.env.db.password,
    database: env_1.env.db.database,
    synchronize: env_1.env.nodeEnv === 'development',
    logging: env_1.env.nodeEnv === 'development',
    entities: entities_1.entities,
    migrations: ['src/migrations/*.ts'],
    /** Enforce referential integrity on all foreign keys */
    extra: {
        statement_timeout: 60000,
    },
});
