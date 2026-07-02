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
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const data_source_1 = require("../config/data-source");
const enums_1 = require("../entities/enums");
const enums_2 = require("../entities/enums");
const auth_1 = require("../middleware/auth");
const general_ledger_report_service_1 = require("../services/general-ledger-report.service");
const ledger_service_1 = require("../services/ledger.service");
const router = (0, express_1.Router)();
const GL_ROLES = [enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL];
router.use(auth_1.authenticate);
router.use((0, auth_1.authorize)(...GL_ROLES));
function parseGlFilters(req) {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const pageSize = Math.min(200, Math.max(1, parseInt(String(req.query.pageSize || '50'), 10) || 50));
    const accountType = String(req.query.accountType || '').trim().toUpperCase();
    const referenceType = String(req.query.referenceType || '').trim().toUpperCase();
    return {
        startDate: String(req.query.startDate || '').trim() || undefined,
        endDate: String(req.query.endDate || '').trim() || undefined,
        accountId: String(req.query.accountId || '').trim() || undefined,
        accountType: Object.values(enums_2.GlAccountType).includes(accountType)
            ? accountType
            : undefined,
        referenceType: Object.values(enums_2.GlReferenceType).includes(referenceType)
            ? referenceType
            : undefined,
        search: String(req.query.search || '').trim() || undefined,
        page,
        pageSize,
    };
}
router.get('/integrity', async (_req, res) => {
    const result = await (0, ledger_service_1.checkSystemGlBalance)();
    res.json(result);
});
router.get('/export', async (req, res) => {
    const format = String(req.query.format || 'csv').toLowerCase();
    const filters = parseGlFilters(req);
    filters.page = 1;
    filters.pageSize = 10000;
    const report = await (0, general_ledger_report_service_1.buildGeneralLedgerReport)(filters);
    if (format === 'pdf') {
        const pdf = await (0, general_ledger_report_service_1.exportGeneralLedgerPdf)(report);
        const inline = String(req.query.preview || '') === 'true';
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="general-ledger.pdf"`);
        return res.send(pdf);
    }
    const csv = (0, general_ledger_report_service_1.generalLedgerReportToCsv)(report);
    res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="general-ledger.csv"');
    return res.send(csv);
});
router.get('/:accountId/balance', async (req, res) => {
    try {
        const detail = await (0, general_ledger_report_service_1.getAccountBalanceDetail)(String(req.params.accountId));
        res.json(detail);
    }
    catch (e) {
        res.status(404).json({ message: e instanceof Error ? e.message : 'Account not found' });
    }
});
router.post('/reverse/:entryId', async (req, res) => {
    try {
        const result = await (0, ledger_service_1.reverseEntry)(String(req.params.entryId), req.user.userId);
        res.json({ message: 'Entry reversed successfully.', ...result });
    }
    catch (e) {
        res.status(400).json({ message: e instanceof Error ? e.message : 'Reversal failed' });
    }
});
router.get('/', async (req, res) => {
    await (0, ledger_service_1.ensureChartOfAccountsSeeded)();
    const [{ glCount, paymentCount }] = await data_source_1.AppDataSource.query(`
    SELECT
      (SELECT COUNT(*)::int FROM general_ledger_entries) as "glCount",
      (SELECT COUNT(*)::int FROM payments) as "paymentCount"
  `);
    if (Number(glCount) === 0 && Number(paymentCount) > 0) {
        const { backfillGeneralLedgerFromHistory } = await Promise.resolve().then(() => __importStar(require('../services/gl-backfill.service')));
        await backfillGeneralLedgerFromHistory();
    }
    const report = await (0, general_ledger_report_service_1.buildGeneralLedgerReport)(parseGlFilters(req));
    res.json(report);
});
exports.default = router;
