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
async function initializeServer() {
    try {
        try {
            (0, pdf_1.ensureUploadDirs)();
        }
        catch (err) {
            console.warn('[startup] Could not ensure local upload directories (safe to ignore when using S3 storage):', err);
        }
        await data_source_1.AppDataSource.initialize();
        console.log('[startup] Database connected');
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
            console.error('[startup] FATAL: migrations failed. Schema may be inconsistent — aborting startup.', err);
            throw err;
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
    }
    catch (err) {
        console.error('initializeServer failed:', err);
        throw err;
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
