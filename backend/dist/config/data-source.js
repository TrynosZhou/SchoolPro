"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DemoDataSource = exports.AppDataSource = exports.RealAppDataSource = void 0;
exports.ensurePostgresDatabaseCreated = ensurePostgresDatabaseCreated;
exports.initializeRealAppDataSourceWithSslFallback = initializeRealAppDataSourceWithSslFallback;
require("reflect-metadata");
const path_1 = __importDefault(require("path"));
const pg_1 = require("pg");
const typeorm_1 = require("typeorm");
const env_1 = require("./env");
const entities_1 = require("../entities");
const demo_data_source_1 = require("./demo-data-source");
Object.defineProperty(exports, "DemoDataSource", { enumerable: true, get: function () { return demo_data_source_1.DemoDataSource; } });
const tenant_context_1 = require("./tenant-context");
const migrationsGlob = path_1.default.join(__dirname, '..', 'migrations', __filename.endsWith('.ts') ? '*.ts' : '*.js');
const DB_NOT_FOUND_RE = /database "([^"]+)" does not exist/i;
const DB_NOT_FOUND_CODE = '3D000';
function pickSslForDatabaseCreation(mode) {
    if (mode === 'require')
        return { rejectUnauthorized: false };
    if (mode === 'disable')
        return false;
    // 'auto' / other: on Render we MUST use SSL for maintenance DB too
    return env_1.env.nodeEnv === 'production' || env_1.env.onRender ? { rejectUnauthorized: false } : false;
}
/**
 * Connects to the Postgres `postgres` maintenance database (same host/credentials)
 * and creates `targetDatabase` if it does not already exist. Returns `true` if the
 * database was created (or confirmed to already exist) and a retry is worthwhile.
 *
 * This handles the very common Render / Neon / Supabase / managed-PG scenario where
 * the instance itself is reachable and credentials are correct, but the specific
 * DB name requested by env vars was never provisioned.
 */
async function ensurePostgresDatabaseCreated(params) {
    const { host, port, username, password, targetDatabase, sslMode } = params;
    const ssl = pickSslForDatabaseCreation(sslMode);
    const sanitizedDb = targetDatabase.replace(/[^a-zA-Z0-9_]/g, '_');
    let client = null;
    try {
        client = new pg_1.Client({
            host,
            port,
            user: username,
            password,
            database: 'postgres',
            ssl,
            connectionTimeoutMillis: 8000,
            statement_timeout: 8000,
        });
        await client.connect();
        const check = await client.query(`SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = $1) AS "exists"`, [sanitizedDb]);
        if (check.rows.length > 0 && !!check.rows[0].exists) {
            return { created: false, existed: true };
        }
        // CREATE DATABASE cannot run inside a transaction block; execute plain.
        await client.query(`CREATE DATABASE "${sanitizedDb}"`);
        try {
            await client.end();
        }
        catch { /* swallow */ }
        client = null;
        console.log(`[startup] Auto-created Postgres database "${sanitizedDb}" on ${host}:${port} ` +
            `as user ${username} (sslMode=${sslMode}).`);
        return { created: true, existed: false };
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[startup] Could not auto-create database "${sanitizedDb}" on ${host}:${port} ` +
            `(sslMode=${sslMode}): ${msg}`);
        return { created: false, existed: false };
    }
    finally {
        if (client) {
            try {
                await client.end();
            }
            catch { /* swallow */ }
        }
    }
}
function defaultSslConfig() {
    switch (env_1.env.db.sslMode) {
        case 'require':
            return { rejectUnauthorized: false };
        case 'disable':
            return false;
        case 'auto':
        default:
            return env_1.env.nodeEnv === 'production' ? { rejectUnauthorized: false } : false;
    }
}
function buildDataSourceOptions(ssl) {
    return {
        type: 'postgres',
        host: env_1.env.db.host,
        port: env_1.env.db.port,
        username: env_1.env.db.username,
        password: env_1.env.db.password,
        database: env_1.env.db.database,
        ssl,
        synchronize: false,
        migrationsRun: false,
        logging: env_1.env.nodeEnv === 'development',
        entities: entities_1.entities,
        migrations: [migrationsGlob],
        extra: {
            statement_timeout: 60000,
        },
    };
}
class DataSourceHolder {
    constructor() {
        this.current = new typeorm_1.DataSource(buildDataSourceOptions(defaultSslConfig()));
    }
    set(next) {
        this.current = next;
    }
    get() {
        return this.current;
    }
}
const _holder = new DataSourceHolder();
exports.RealAppDataSource = new Proxy(_holder, {
    get(target, prop, _receiver) {
        if (prop === '_holder')
            return target;
        if (prop === 'set')
            return (next) => target.set(next);
        const actual = target.get();
        const value = Reflect.get(actual, prop, actual);
        return typeof value === 'function' ? value.bind(actual) : value;
    },
});
function buildTenantProxy(target) {
    return new Proxy(target, {
        get(t, prop, _receiver) {
            const real = t.get();
            const active = tenant_context_1.tenantContext.isDemo() ? demo_data_source_1.DemoDataSource : real;
            const value = Reflect.get(active, prop, active);
            return typeof value === 'function' ? value.bind(active) : value;
        },
    });
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
async function initializeRealAppDataSourceWithSslFallback() {
    const already = _holder.get();
    if (already.isInitialized) {
        return { sslMode: env_1.env.db.sslMode, ds: already };
    }
    const candidates = [];
    const mode = env_1.env.db.sslMode || 'auto';
    const onRenderOrProd = env_1.env.onRender || env_1.env.nodeEnv === 'production';
    if (onRenderOrProd) {
        candidates.push({ sslMode: 'require', ssl: { rejectUnauthorized: false } });
        if (mode === 'disable') {
            candidates.push({ sslMode: 'disable', ssl: false });
        }
    }
    else if (mode === 'auto') {
        candidates.push({ sslMode: 'disable', ssl: false });
        candidates.push({ sslMode: 'require', ssl: { rejectUnauthorized: false } });
    }
    else if (mode === 'require') {
        candidates.push({ sslMode: 'require', ssl: { rejectUnauthorized: false } });
    }
    else if (mode === 'disable') {
        candidates.push({ sslMode: 'disable', ssl: false });
    }
    else {
        candidates.push({ sslMode: mode, ssl: { rejectUnauthorized: false } });
    }
    let dbCreatedThisRound = false;
    let lastError;
    for (const candidate of candidates) {
        let retriesForThisCandidate = 0;
        while (retriesForThisCandidate < 2) {
            retriesForThisCandidate++;
            try {
                const current = _holder.get();
                if (current.isInitialized)
                    await current.destroy();
                const replacement = new typeorm_1.DataSource(buildDataSourceOptions(candidate.ssl));
                await replacement.initialize();
                _holder.set(replacement);
                console.log(`[startup] DB connected using sslMode=${candidate.sslMode}`);
                return { sslMode: candidate.sslMode, ds: replacement };
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                console.warn(`[startup] DB connect failed using sslMode=${candidate.sslMode} to host=${env_1.env.db.host}:${env_1.env.db.port} db=${env_1.env.db.database} user=${env_1.env.db.username} — ${msg}`);
                lastError = err;
                if (isDatabaseNotFoundError(err) && !dbCreatedThisRound) {
                    console.log(`[startup] Database "${env_1.env.db.database}" not found — attempting to auto-create it on ${env_1.env.db.host}:${env_1.env.db.port}…`);
                    try {
                        const result = await ensurePostgresDatabaseCreated({
                            host: env_1.env.db.host,
                            port: env_1.env.db.port,
                            username: env_1.env.db.username,
                            password: env_1.env.db.password,
                            targetDatabase: env_1.env.db.database,
                            sslMode: candidate.sslMode,
                        });
                        if (result.created || result.existed) {
                            dbCreatedThisRound = true;
                            console.log(`[startup] Auto-create confirmed (created=${result.created}, existed=${result.existed}) — retrying sslMode=${candidate.sslMode}…`);
                            continue;
                        }
                    }
                    catch (createErr) {
                        console.warn(`[startup] Auto-create attempt failed for "${env_1.env.db.database}": ${createErr instanceof Error ? createErr.message : String(createErr)}`);
                    }
                }
                break;
            }
        }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
exports.AppDataSource = buildTenantProxy(_holder);
