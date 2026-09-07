"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureDemoSchemaBootstrapped = ensureDemoSchemaBootstrapped;
const pg_1 = require("pg");
const typeorm_1 = require("typeorm");
const env_1 = require("./env");
const entities_1 = require("../entities");
const data_source_1 = require("./data-source");
const DB_NOT_FOUND_RE = /database "([^"]+)" does not exist/i;
const DB_NOT_FOUND_CODE = '3D000';
function pickSslForDemo(mode) {
    if (mode === 'require')
        return { rejectUnauthorized: false };
    if (mode === 'disable')
        return false;
    return env_1.env.nodeEnv === 'production' || env_1.env.onRender ? { rejectUnauthorized: false } : false;
}
function demoSslConfig() {
    switch (env_1.env.demo.db.sslMode) {
        case 'require':
            return { rejectUnauthorized: false };
        case 'disable':
            return false;
        case 'auto':
        default:
            return env_1.env.nodeEnv === 'production' ? { rejectUnauthorized: false } : false;
    }
}
function isDatabaseNotFoundError(err) {
    if (err instanceof Error) {
        const anyErr = err;
        if (anyErr.code === DB_NOT_FOUND_CODE)
            return true;
        if (DB_NOT_FOUND_RE.test(err.message))
            return true;
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
async function ensureDemoSchemaBootstrapped() {
    const ssl = pickSslForDemo(env_1.env.demo.db.sslMode);
    try {
        await (0, data_source_1.ensurePostgresDatabaseCreated)({
            host: env_1.env.demo.db.host,
            port: env_1.env.demo.db.port,
            username: env_1.env.demo.db.username,
            password: env_1.env.demo.db.password,
            targetDatabase: env_1.env.demo.db.database,
            sslMode: env_1.env.demo.db.sslMode,
        });
    }
    catch (err) {
        console.warn('[demo] Could not auto-create demo database (will still attempt connection):', err instanceof Error ? err.message : String(err));
    }
    let client = null;
    try {
        client = new pg_1.Client({
            host: env_1.env.demo.db.host,
            port: env_1.env.demo.db.port,
            user: env_1.env.demo.db.username,
            password: env_1.env.demo.db.password,
            database: env_1.env.demo.db.database,
            ssl,
            connectionTimeoutMillis: 10000,
        });
        await client.connect();
    }
    catch (err) {
        if (client) {
            try {
                await client.end();
            }
            catch { /* swallow */ }
        }
        if (isDatabaseNotFoundError(err)) {
            console.log('[demo] Demo database not found after auto-create attempt; retrying creation…');
            const r = await (0, data_source_1.ensurePostgresDatabaseCreated)({
                host: env_1.env.demo.db.host,
                port: env_1.env.demo.db.port,
                username: env_1.env.demo.db.username,
                password: env_1.env.demo.db.password,
                targetDatabase: env_1.env.demo.db.database,
                sslMode: env_1.env.demo.db.sslMode,
            });
            console.log(`[demo] Retry auto-create result: created=${r.created}, existed=${r.existed}`);
            client = new pg_1.Client({
                host: env_1.env.demo.db.host,
                port: env_1.env.demo.db.port,
                user: env_1.env.demo.db.username,
                password: env_1.env.demo.db.password,
                database: env_1.env.demo.db.database,
                ssl,
                connectionTimeoutMillis: 10000,
            });
            await client.connect();
        }
        else {
            throw err;
        }
    }
    try {
        const res = await client.query(`SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'users'
       ) AS exists`);
        if (res.rows[0]?.exists) {
            try {
                await client.end();
            }
            catch { /* swallow */ }
            return false;
        }
    }
    finally {
        try {
            if (client)
                await client.end();
        }
        catch { /* swallow */ }
    }
    console.log('[demo] Bootstrapping demo database schema (first-time synchronize)…');
    const bootstrap = new typeorm_1.DataSource({
        type: 'postgres',
        host: env_1.env.demo.db.host,
        port: env_1.env.demo.db.port,
        username: env_1.env.demo.db.username,
        password: env_1.env.demo.db.password,
        database: env_1.env.demo.db.database,
        ssl: demoSslConfig(),
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
