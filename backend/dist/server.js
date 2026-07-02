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
require("reflect-metadata");
const app_1 = __importDefault(require("./app"));
const data_source_1 = require("./config/data-source");
const env_1 = require("./config/env");
const pdf_1 = require("./utils/pdf");
async function runDeferredStartup() {
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
async function bootstrap() {
    try {
        (0, pdf_1.ensureUploadDirs)();
        await data_source_1.AppDataSource.initialize();
        console.log('Database connected');
        const { seedDatabase } = await Promise.resolve().then(() => __importStar(require('./seed')));
        await seedDatabase();
        const { ensureDefaultRoles } = await Promise.resolve().then(() => __importStar(require('./services/role-permissions.service')));
        await ensureDefaultRoles();
        const { ensureChartOfAccountsSeeded } = await Promise.resolve().then(() => __importStar(require('./services/ledger.service')));
        await ensureChartOfAccountsSeeded();
        app_1.default.listen(env_1.env.port, () => {
            console.log(`School Pro API running on http://localhost:${env_1.env.port}`);
        });
        void runDeferredStartup();
    }
    catch (err) {
        console.error('Failed to start server:', err);
        process.exit(1);
    }
}
bootstrap();
process.on('unhandledRejection', (reason) => {
    console.error('Unhandled promise rejection:', reason);
});
process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
});
