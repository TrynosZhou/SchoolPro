"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DemoDataSource = exports.AppDataSource = exports.RealAppDataSource = void 0;
exports.initializeRealAppDataSourceWithSslFallback = initializeRealAppDataSourceWithSslFallback;
require("reflect-metadata");
const path_1 = __importDefault(require("path"));
const typeorm_1 = require("typeorm");
const env_1 = require("./env");
const entities_1 = require("../entities");
const demo_data_source_1 = require("./demo-data-source");
Object.defineProperty(exports, "DemoDataSource", { enumerable: true, get: function () { return demo_data_source_1.DemoDataSource; } });
const tenant_context_1 = require("./tenant-context");
const migrationsGlob = path_1.default.join(__dirname, '..', 'migrations', __filename.endsWith('.ts') ? '*.ts' : '*.js');
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
async function initializeRealAppDataSourceWithSslFallback() {
    const already = _holder.get();
    if (already.isInitialized) {
        return { sslMode: env_1.env.db.sslMode, ds: already };
    }
    const candidates = [];
    const mode = env_1.env.db.sslMode || 'auto';
    if (mode === 'auto') {
        candidates.push({ sslMode: 'require', ssl: { rejectUnauthorized: false } });
        candidates.push({ sslMode: 'disable', ssl: false });
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
    let lastError;
    for (const candidate of candidates) {
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
        }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
exports.AppDataSource = buildTenantProxy(_holder);
