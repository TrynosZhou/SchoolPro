"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildGeneralLedgerReport = buildGeneralLedgerReport;
exports.listChartOfAccounts = listChartOfAccounts;
exports.generalLedgerReportToCsv = generalLedgerReportToCsv;
exports.exportGeneralLedgerPdf = exportGeneralLedgerPdf;
exports.getAccountBalanceDetail = getAccountBalanceDetail;
const data_source_1 = require("../config/data-source");
const entities_1 = require("../entities");
const school_branding_service_1 = require("./school-branding.service");
const ledger_service_1 = require("./ledger.service");
const pdf_1 = require("../utils/pdf");
function escCsv(v) {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
}
async function buildGeneralLedgerReport(filters) {
    const page = Math.max(1, Number(filters.page) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(filters.pageSize) || 50));
    const offset = (page - 1) * pageSize;
    const where = ['1=1'];
    const params = [];
    let idx = 1;
    if (filters.startDate) {
        where.push(`e."transactionDate" >= $${idx++}`);
        params.push(filters.startDate);
    }
    if (filters.endDate) {
        where.push(`e."transactionDate" <= $${idx++}`);
        params.push(filters.endDate);
    }
    if (filters.accountId) {
        where.push(`e."accountId" = $${idx++}`);
        params.push(filters.accountId);
    }
    if (filters.accountType) {
        where.push(`a."accountType" = $${idx++}`);
        params.push(filters.accountType);
    }
    if (filters.referenceType) {
        where.push(`e."referenceType" = $${idx++}`);
        params.push(filters.referenceType);
    }
    if (filters.search?.trim()) {
        where.push(`(e.description ILIKE $${idx} OR a."accountName" ILIKE $${idx} OR a."accountCode" ILIKE $${idx})`);
        params.push(`%${filters.search.trim().replace(/\s+/g, '%')}%`);
        idx++;
    }
    const whereSql = where.join(' AND ');
    const countRows = await data_source_1.AppDataSource.query(`SELECT COUNT(*)::int as total
     FROM general_ledger_entries e
     JOIN chart_of_accounts a ON a.id = e."accountId"
     WHERE ${whereSql}`, params);
    const total = Number(countRows[0]?.total || 0);
    const rows = await data_source_1.AppDataSource.query(`SELECT
       e.id,
       e."transactionDate",
       e."accountId",
       a."accountCode",
       a."accountName",
       a."accountType",
       e.description,
       e."debitAmount",
       e."creditAmount",
       e."runningBalance",
       e."referenceType",
       e."referenceId",
       e."journalBatchId",
       e."isReversed",
       e."createdAt"
     FROM general_ledger_entries e
     JOIN chart_of_accounts a ON a.id = e."accountId"
     WHERE ${whereSql}
     ORDER BY e."transactionDate" DESC, e."createdAt" DESC
     LIMIT $${idx} OFFSET $${idx + 1}`, [...params, pageSize, offset]);
    const summaryRows = await data_source_1.AppDataSource.query(`SELECT
       COALESCE(SUM(e."debitAmount"), 0) as debits,
       COALESCE(SUM(e."creditAmount"), 0) as credits
     FROM general_ledger_entries e
     JOIN chart_of_accounts a ON a.id = e."accountId"
     WHERE ${whereSql}`, params);
    const totalDebits = (0, ledger_service_1.roundGlMoney)(Number(summaryRows[0]?.debits || 0));
    const totalCredits = (0, ledger_service_1.roundGlMoney)(Number(summaryRows[0]?.credits || 0));
    const variance = (0, ledger_service_1.roundGlMoney)(totalDebits - totalCredits);
    const items = rows.map((r) => ({
        id: String(r.id),
        transactionDate: String(r.transactionDate).slice(0, 10),
        accountId: String(r.accountId),
        accountCode: String(r.accountCode),
        accountName: String(r.accountName),
        accountType: r.accountType,
        description: String(r.description),
        debitAmount: (0, ledger_service_1.roundGlMoney)(Number(r.debitAmount)),
        creditAmount: (0, ledger_service_1.roundGlMoney)(Number(r.creditAmount)),
        runningBalance: (0, ledger_service_1.roundGlMoney)(Number(r.runningBalance)),
        referenceType: r.referenceType,
        referenceId: r.referenceId ? String(r.referenceId) : undefined,
        journalBatchId: String(r.journalBatchId),
        isReversed: Boolean(r.isReversed),
        createdAt: String(r.createdAt),
    }));
    return {
        generatedAt: new Date().toISOString(),
        filters,
        items,
        pagination: {
            page,
            pageSize,
            total,
            totalPages: Math.max(1, Math.ceil(total / pageSize)),
        },
        summary: {
            totalDebits,
            totalCredits,
            variance,
            balanced: Math.abs(variance) <= 0.005,
        },
    };
}
async function listChartOfAccounts() {
    return data_source_1.AppDataSource.getRepository(entities_1.ChartOfAccount).find({
        where: { isActive: true },
        order: { accountCode: 'ASC' },
    });
}
function generalLedgerReportToCsv(report) {
    const lines = [];
    lines.push('General Ledger Report');
    lines.push(`Generated,${escCsv(report.generatedAt)}`);
    if (report.filters.startDate || report.filters.endDate) {
        lines.push(`Period,${escCsv(`${report.filters.startDate || '…'} to ${report.filters.endDate || '…'}`)}`);
    }
    lines.push('');
    lines.push([
        'Date',
        'Account Code',
        'Account Name',
        'Account Type',
        'Description',
        'Debit',
        'Credit',
        'Running Balance',
        'Reference Type',
        'Reversed',
    ].join(','));
    for (const row of report.items) {
        lines.push([
            escCsv(row.transactionDate),
            escCsv(row.accountCode),
            escCsv(row.accountName),
            escCsv(row.accountType),
            escCsv(row.description),
            escCsv(row.debitAmount.toFixed(2)),
            escCsv(row.creditAmount.toFixed(2)),
            escCsv(row.runningBalance.toFixed(2)),
            escCsv(row.referenceType),
            escCsv(row.isReversed ? 'Yes' : 'No'),
        ].join(','));
    }
    lines.push('');
    lines.push(`Total Debits,${escCsv(report.summary.totalDebits.toFixed(2))}`);
    lines.push(`Total Credits,${escCsv(report.summary.totalCredits.toFixed(2))}`);
    lines.push(`Variance,${escCsv(report.summary.variance.toFixed(2))}`);
    return `\uFEFF${lines.join('\n')}`;
}
async function exportGeneralLedgerPdf(report) {
    const branding = await (0, school_branding_service_1.loadSchoolBranding)();
    const rows = report.items.map((r) => ({
        transactionDate: r.transactionDate,
        accountLabel: `${r.accountCode} - ${r.accountName}`,
        description: r.description,
        debitAmount: r.debitAmount,
        creditAmount: r.creditAmount,
        runningBalance: r.runningBalance,
        referenceType: r.referenceType,
        isReversed: r.isReversed,
    }));
    const { startDate, endDate } = report.filters;
    return (0, pdf_1.generateGeneralLedgerPdf)({
        ...branding,
        dateFrom: startDate || '',
        dateTo: endDate || '',
        generatedAt: report.generatedAt,
        summary: report.summary,
        rows,
    });
}
async function getAccountBalanceDetail(accountId) {
    const account = await data_source_1.AppDataSource.getRepository(entities_1.ChartOfAccount).findOne({ where: { id: accountId } });
    if (!account)
        throw new Error('Account not found.');
    const [row] = await data_source_1.AppDataSource.query(`SELECT e."runningBalance"
     FROM general_ledger_entries e
     WHERE e."accountId" = $1 AND e."isReversed" = false
     ORDER BY e."transactionDate" DESC, e."createdAt" DESC
     LIMIT 1`, [accountId]);
    return {
        account,
        runningBalance: (0, ledger_service_1.roundGlMoney)(Number(row?.runningBalance || 0)),
    };
}
