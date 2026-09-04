"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureDemoSchemaBootstrapped = ensureDemoSchemaBootstrapped;
const pg_1 = require("pg");
const typeorm_1 = require("typeorm");
const env_1 = require("./env");
const entities_1 = require("../entities");
/**
 * Fresh demo databases have no tables — incremental migrations assume a base
 * schema that was originally created via synchronize. Bootstrap once from
 * entities when `users` is missing, then let the normal DemoDataSource init
 * handle connection pooling (migrations are skipped on demo; entities are the
 * source of truth for a greenfield demo install).
 */
async function ensureDemoSchemaBootstrapped() {
    const client = new pg_1.Client({
        host: env_1.env.demo.db.host,
        port: env_1.env.demo.db.port,
        user: env_1.env.demo.db.username,
        password: env_1.env.demo.db.password,
        database: env_1.env.demo.db.database,
    });
    await client.connect();
    const res = await client.query(`SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'users'
     ) AS exists`);
    await client.end();
    if (res.rows[0]?.exists)
        return false;
    console.log('[demo] Bootstrapping demo database schema (first-time synchronize)…');
    const bootstrap = new typeorm_1.DataSource({
        type: 'postgres',
        host: env_1.env.demo.db.host,
        port: env_1.env.demo.db.port,
        username: env_1.env.demo.db.username,
        password: env_1.env.demo.db.password,
        database: env_1.env.demo.db.database,
        synchronize: true,
        migrationsRun: false,
        logging: false,
        entities: entities_1.entities,
    });
    await bootstrap.initialize();
    await bootstrap.destroy();
    console.log('[demo] Demo schema bootstrap complete.');
    return true;
}
