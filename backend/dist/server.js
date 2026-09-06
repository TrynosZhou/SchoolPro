"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStartupState = getStartupState;
exports.initializeServer = initializeServer;
require("reflect-metadata");
const app_1 = __importDefault(require("./app"));
const data_source_1 = require("./config/data-source");
const demo_data_source_1 = require("./config/demo-data-source");
const bootstrap_demo_schema_1 = require("./config/bootstrap-demo-schema");
const env_1 = require("./config/env");
const pdf_1 = require("./utils/pdf");
async function startDemoTenant() {
    if (!env_1.env.demo.enabled) {
        console.log('[demo] Feature disabled (DEMO_FEATURE_ENABLED=false) — skipping demo DB & reset job.');
        return;
    }
    try {
        await (0, bootstrap_demo_schema_1.ensureDemoSchemaBootstrapped)();
        await demo_data_source_1.DemoDataSource.initialize();
        console.log('[demo] Demo database connected.');
        const { startDemoResetJob } = await Promise.resolve().then(() => __importStar(require('./jobs/demo-reset.job')));
        startDemoResetJob();
    }
    catch (err) {
        console.error('[demo] Failed to initialize the demo database — demo login will be unavailable:', err);
    }
}
async function runDeferredStartup() {
    try {
        const { backfillStudentLifecycle } = await Promise.resolve().then(() => __importStar(require('./services/student-lifecycle.service')));
        const lifecycle = await backfillStudentLifecycle();
        if (lifecycle.statusFixed > 0 || lifecycle.snapshotsCreated > 0) {
            console.log(`[analytics] Student lifecycle backfill: ${lifecycle.statusFixed} status(es) normalised, ` +
                `${lifecycle.snapshotsCreated} enrollment snapshot(s) created`);
        }
    }
    catch (err) {
        console.error('[startup] Student lifecycle backfill failed:', err);
    }
    try {
        const { backfillGeneralLedgerFromHistory } = await Promise.resolve().then(() => __importStar(require('./services/gl-backfill.service')));
        const backfill = await backfillGeneralLedgerFromHistory();
        const posted = backfill.paymentsPosted +
            backfill.cashbookExpensesPosted +
            backfill.cashbookReceiptsPosted +
            backfill.payrollRunsPosted;
        if (posted > 0) {
            console.log(`[GL] Backfilled ${posted} journal batches from historical records ` +
                `(payments: ${backfill.paymentsPosted}, expenses: ${backfill.cashbookExpensesPosted}, ` +
                `receipts: ${backfill.cashbookReceiptsPosted}, payroll: ${backfill.payrollRunsPosted})`);
        }
        if (backfill.errors.length) {
            console.warn(`[GL] Backfill warnings: ${backfill.errors.slice(0, 3).join('; ')}`);
        }
        const integrity = await (await Promise.resolve().then(() => __importStar(require('./services/ledger.service')))).checkSystemGlBalance();
        if (!integrity.balanced) {
            console.warn(`[GL] System debit/credit imbalance detected: variance $${integrity.variance.toFixed(2)}`);
        }
    }
    catch (err) {
        console.error('[startup] Deferred GL tasks failed:', err);
    }
}
const _startupState = {
    ok: false,
    error: undefined,
    startedAt: 0,
};
function getStartupState() {
    return _startupState;
}
async function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
async function initializeServer() {
    // #region debug-point H3:init-server-entry
    (() => { try {
        const f = require('fs'), p = require('path');
        let rp = '.dbg/db-warming-503.env';
        const roots = [process.cwd(), p.resolve(__dirname, '..', '..'), p.resolve(__dirname, '..', '..', '..')];
        let found = null;
        for (const r of roots) {
            const cand = p.join(r, rp);
            if (f.existsSync(cand)) {
                found = cand;
                break;
            }
        }
        let u = 'http://127.0.0.1:7777/event', s = 'db-warming-503';
        try {
            if (found) {
                const e = f.readFileSync(found, 'utf8');
                u = e.match(/DEBUG_SERVER_URL=(.+)/)?.[1] || u;
                s = e.match(/DEBUG_SESSION_ID=(.+)/)?.[1] || s;
            }
        }
        catch { }
        require('http').request({ method: 'POST', host: new URL(u).hostname, port: new URL(u).port, path: new URL(u).pathname, headers: { 'Content-Type': 'application/json' } }, () => { }).on('error', () => { }).end(JSON.stringify({ sessionId: s, runId: 'pre', hypothesisId: 'H3', location: 'server.ts:initializeServer-entry', msg: '[DEBUG] initializeServer called', data: { okBeforeCall: _startupState.ok, startedAtBefore: _startupState.startedAt, sslModeBefore: _startupState.sslMode, mainModule: require.main === module }, ts: Date.now() }));
    }
    catch { } })();
    // #endregion
    if (_startupState.ok)
        return;
    try {
        try {
            (0, pdf_1.ensureUploadDirs)();
        }
        catch (err) {
            console.warn('[startup] Could not ensure local upload directories (safe to ignore when using S3 storage):', err);
        }
        console.log(`[startup] Connecting to PostgreSQL host=${env_1.env.db.host} port=${env_1.env.db.port} ` +
            `database=${env_1.env.db.database} user=${env_1.env.db.username} (nodeEnv=${env_1.env.nodeEnv})`);
        const localhostish = env_1.env.db.host === 'localhost' || env_1.env.db.host === '127.0.0.1' || env_1.env.db.host === '';
        if (localhostish && env_1.env.nodeEnv === 'production') {
            console.error('[startup] DANGER: nodeEnv=production but DB_HOST is still pointing at ' +
                `${JSON.stringify(env_1.env.db.host)}. A Vercel serverless function has NO local Postgres — ` +
                'you MUST set DB_HOST / DB_PORT / DB_DATABASE / DB_USERNAME / DB_PASSWORD in ' +
                'Vercel Project → Settings → Environment Variables (for all 3 environments: ' +
                'Production, Preview, Development). DB_SSL_MODE=require is also almost always ' +
                'needed for managed Postgres providers (Neon / Supabase / Railway / Render / AWS RDS).');
        }
        let lastDbErr;
        const attempts = 4;
        for (let attempt = 0; attempt < attempts; attempt++) {
            try {
                const { sslMode, ds } = await (0, data_source_1.initializeRealAppDataSourceWithSslFallback)();
                try {
                    await ds.query('SELECT 1 AS _ping');
                }
                catch (pingErr) {
                    console.warn(`[startup] DB ping failed on attempt ${attempt + 1} — ${pingErr instanceof Error ? pingErr.message : String(pingErr)}`);
                    try {
                        if (ds.isInitialized)
                            await ds.destroy();
                    }
                    catch { /* swallow */ }
                    await sleep(500 * (attempt + 1));
                    continue;
                }
                _startupState.ok = true;
                _startupState.error = undefined;
                _startupState.sslMode = sslMode;
                _startupState.startedAt = Date.now();
                lastDbErr = undefined;
                // #region debug-point H1:ok-flag-set
                (() => { try {
                    const f = require('fs'), p = require('path');
                    let rp = '.dbg/db-warming-503.env';
                    const roots = [process.cwd(), p.resolve(__dirname, '..', '..'), p.resolve(__dirname, '..', '..', '..')];
                    let found = null;
                    for (const r of roots) {
                        const cand = p.join(r, rp);
                        if (f.existsSync(cand)) {
                            found = cand;
                            break;
                        }
                    }
                    let u = 'http://127.0.0.1:7777/event', s = 'db-warming-503';
                    try {
                        if (found) {
                            const e = f.readFileSync(found, 'utf8');
                            u = e.match(/DEBUG_SERVER_URL=(.+)/)?.[1] || u;
                            s = e.match(/DEBUG_SESSION_ID=(.+)/)?.[1] || s;
                        }
                    }
                    catch { }
                    require('http').request({ method: 'POST', host: new URL(u).hostname, port: new URL(u).port, path: new URL(u).pathname, headers: { 'Content-Type': 'application/json' } }, () => { }).on('error', () => { }).end(JSON.stringify({ sessionId: s, runId: 'pre', hypothesisId: 'H1', location: 'server.ts:startup-ok-set', msg: '[DEBUG] _startupState.ok set to TRUE after DB ping', data: { sslMode, attempt: attempt + 1, nowMs: Date.now() }, ts: Date.now() }));
                }
                catch { } })();
                // #endregion
                break;
            }
            catch (err) {
                lastDbErr = err;
                console.warn(`[startup] DB initialize attempt ${attempt + 1}/${attempts} failed — ${err instanceof Error ? err.message : String(err)}`);
                if (attempt < attempts - 1) {
                    await sleep(500 * (attempt + 1));
                }
            }
        }
        if (!_startupState.ok) {
            const msg = lastDbErr instanceof Error ? lastDbErr.message : String(lastDbErr);
            // #region debug-point H4:degraded-mode-final
            (() => { try {
                const f = require('fs'), p = require('path');
                let rp = '.dbg/db-warming-503.env';
                const roots = [process.cwd(), p.resolve(__dirname, '..', '..'), p.resolve(__dirname, '..', '..', '..')];
                let found = null;
                for (const r of roots) {
                    const cand = p.join(r, rp);
                    if (f.existsSync(cand)) {
                        found = cand;
                        break;
                    }
                }
                let u = 'http://127.0.0.1:7777/event', s = 'db-warming-503';
                try {
                    if (found) {
                        const e = f.readFileSync(found, 'utf8');
                        u = e.match(/DEBUG_SERVER_URL=(.+)/)?.[1] || u;
                        s = e.match(/DEBUG_SESSION_ID=(.+)/)?.[1] || s;
                    }
                }
                catch { }
                require('http').request({ method: 'POST', host: new URL(u).hostname, port: new URL(u).port, path: new URL(u).pathname, headers: { 'Content-Type': 'application/json' } }, () => { }).on('error', () => { }).end(JSON.stringify({ sessionId: s, runId: 'pre', hypothesisId: 'H4', location: 'server.ts:degraded-mode', msg: '[DEBUG] Boot finished in DEGRADED mode - DB unreachable', data: { errMsg: msg, errName: lastDbErr instanceof Error ? lastDbErr.name : typeof lastDbErr, attempts: 4, dbHost: env_1.env.db.host, dbPort: env_1.env.db.port, dbUser: env_1.env.db.username, dbDatabase: env_1.env.db.database, sslMode: env_1.env.db.sslMode, nodeEnv: env_1.env.nodeEnv }, ts: Date.now() }));
            }
            catch { } })();
            // #endregion
            console.error(`[startup] Cannot connect to the database after ${attempts} attempts — continuing in "degraded" mode. ` +
                `Public endpoints (health, branding, password-policy) will return defaults. ` +
                `Authenticated endpoints will return 503 until DB is reachable. Detail: ${msg}`);
            _startupState.ok = false;
            _startupState.error = lastDbErr instanceof Error ? lastDbErr : new Error(msg);
            _startupState.startedAt = Date.now();
            return;
        }
        try {
            const applied = await data_source_1.RealAppDataSource.runMigrations({ transaction: 'each' });
            if (applied.length > 0) {
                console.log(`[startup] Applied ${applied.length} migration(s): ` +
                    applied.map((m) => m.name ?? String(m)).join(', '));
            }
            else {
                console.log('[startup] Database schema is up to date (no new migrations).');
            }
        }
        catch (err) {
            console.warn('[startup] Migrations could not be applied — continuing without them. ' +
                'If endpoints later report "relation does not exist", you must run migrations via the CLI first. Detail:', err instanceof Error ? err.message : String(err));
        }
        try {
            const { seedDatabase } = await Promise.resolve().then(() => __importStar(require('./seed')));
            await seedDatabase();
        }
        catch (err) {
            console.warn('[startup] seedDatabase skipped (non-fatal; tables may already have data or schema is still initialising):', err instanceof Error ? err.message : String(err));
        }
        try {
            const { ensureDefaultRoles } = await Promise.resolve().then(() => __importStar(require('./services/role-permissions.service')));
            await ensureDefaultRoles();
        }
        catch (err) {
            console.warn('[startup] ensureDefaultRoles skipped (non-fatal):', err instanceof Error ? err.message : String(err));
        }
        try {
            const { ensureChartOfAccountsSeeded } = await Promise.resolve().then(() => __importStar(require('./services/ledger.service')));
            await ensureChartOfAccountsSeeded();
        }
        catch (err) {
            console.warn('[startup] ensureChartOfAccountsSeeded skipped (non-fatal):', err instanceof Error ? err.message : String(err));
        }
        _startupState.startedAt = Date.now();
    }
    catch (err) {
        console.error('initializeServer failed (continuing in degraded mode):', err);
        _startupState.ok = false;
        _startupState.error = err instanceof Error ? err : new Error(String(err));
        _startupState.startedAt = Date.now();
    }
}
async function bootstrap() {
    try {
        await initializeServer();
        app_1.default.listen(env_1.env.port, () => {
            console.log(`School Pro API running on http://localhost:${env_1.env.port}`);
        });
        const { startScheduler } = await Promise.resolve().then(() => __importStar(require('./services/scheduler.service')));
        startScheduler();
        try {
            const { probeRedis } = await Promise.resolve().then(() => __importStar(require('./config/redis')));
            if (!env_1.env.redis.enabled) {
                console.log('[result-notification-queue] Redis disabled (REDIS_ENABLED=false) — background notifications off.');
            }
            else if (await probeRedis()) {
                const { startResultNotificationWorker } = await Promise.resolve().then(() => __importStar(require('./queues/result-notification.queue')));
                const { processResultNotificationJob } = await Promise.resolve().then(() => __importStar(require('./services/result-notification.service')));
                startResultNotificationWorker(processResultNotificationJob);
            }
            else {
                console.warn(`[result-notification-queue] Redis not reachable at ${env_1.env.redis.url} — ` +
                    'background WhatsApp/SMS notifications disabled. Start Redis or set REDIS_ENABLED=false.');
            }
        }
        catch (err) {
            console.error('[startup] Result notification worker failed to start:', err);
        }
        void runDeferredStartup();
        void startDemoTenant();
    }
    catch (err) {
        console.error('Failed to start server:', err);
        process.exit(1);
    }
}
if (require.main === module) {
    bootstrap();
}
process.on('unhandledRejection', (reason) => {
    console.error('Unhandled promise rejection:', reason);
});
process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
});
