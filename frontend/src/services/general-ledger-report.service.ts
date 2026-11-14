import { AppDataSource } from '../config/data-source';
import { ChartOfAccount } from '../entities';
import { GlAccountType, GlReferenceType } from '../entities/enums';
import { loadSchoolBranding } from './school-branding.service';
import { roundGlMoney } from './ledger.service';
import { generateGeneralLedgerPdf, GeneralLedgerPdfRow } from '../utils/pdf';

export interface GlListFilters {
  startDate?: string;
  endDate?: string;
  accountId?: string;
  accountType?: GlAccountType;
  referenceType?: GlReferenceType;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface GlListRow {
  id: string;
  transactionDate: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: GlAccountType;
  description: string;
  debitAmount: number;
  creditAmount: number;
  runningBalance: number;
  referenceType: GlReferenceType;
  referenceId?: string;
  journalBatchId: string;
  isReversed: boolean;
  createdAt: string;
}

export interface GlListReport {
  generatedAt: string;
  filters: GlListFilters;
  items: GlListRow[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  summary: { totalDebits: number; totalCredits: number; variance: number; balanced: boolean };
}

function escCsv(v: string | number): string {
  const s = String(v ?? '');
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function buildGeneralLedgerReport(filters: GlListFilters): Promise<GlListReport> {
  const page = Math.max(1, Number(filters.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(filters.pageSize) || 50));
  const offset = (page - 1) * pageSize;

  const where: string[] = ['1=1'];
  const params: unknown[] = [];
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

  const countRows = await AppDataSource.query(
    `SELECT COUNT(*)::int as total
     FROM general_ledger_entries e
     JOIN chart_of_accounts a ON a.id = e."accountId"
     WHERE ${whereSql}`,
    params,
  );
  const total = Number(countRows[0]?.total || 0);

  const rows = await AppDataSource.query(
    `SELECT
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
     LIMIT $${idx} OFFSET $${idx + 1}`,
    [...params, pageSize, offset],
  );

  const summaryRows = await AppDataSource.query(
    `SELECT
       COALESCE(SUM(e."debitAmount"), 0) as debits,
       COALESCE(SUM(e."creditAmount"), 0) as credits
     FROM general_ledger_entries e
     JOIN chart_of_accounts a ON a.id = e."accountId"
     WHERE ${whereSql}`,
    params,
  );
  const totalDebits = roundGlMoney(Number(summaryRows[0]?.debits || 0));
  const totalCredits = roundGlMoney(Number(summaryRows[0]?.credits || 0));
  const variance = roundGlMoney(totalDebits - totalCredits);

  const items: GlListRow[] = rows.map((r: Record<string, unknown>) => ({
    id: String(r.id),
    transactionDate: String(r.transactionDate).slice(0, 10),
    accountId: String(r.accountId),
    accountCode: String(r.accountCode),
    accountName: String(r.accountName),
    accountType: r.accountType as GlAccountType,
    description: String(r.description),
    debitAmount: roundGlMoney(Number(r.debitAmount)),
    creditAmount: roundGlMoney(Number(r.creditAmount)),
    runningBalance: roundGlMoney(Number(r.runningBalance)),
    referenceType: r.referenceType as GlReferenceType,
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

export async function listChartOfAccounts(): Promise<ChartOfAccount[]> {
  return AppDataSource.getRepository(ChartOfAccount).find({
    where: { isActive: true },
    order: { accountCode: 'ASC' },
  });
}

export function generalLedgerReportToCsv(report: GlListReport): string {
  const lines: string[] = [];
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

export async function exportGeneralLedgerPdf(
  report: GlListReport,
): Promise<Buffer> {
  const branding = await loadSchoolBranding();
  const rows: GeneralLedgerPdfRow[] = report.items.map((r) => ({
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
  return generateGeneralLedgerPdf({
    ...branding,
    dateFrom: startDate || '',
    dateTo: endDate || '',
    generatedAt: report.generatedAt,
    summary: report.summary,
    rows,
  });
}

export async function getAccountBalanceDetail(accountId: string): Promise<{
  account: ChartOfAccount;
  runningBalance: number;
}> {
  const account = await AppDataSource.getRepository(ChartOfAccount).findOne({ where: { id: accountId } });
  if (!account) throw new Error('Account not found.');

  const [row] = await AppDataSource.query(
    `SELECT e."runningBalance"
     FROM general_ledger_entries e
     WHERE e."accountId" = $1 AND e."isReversed" = false
     ORDER BY e."transactionDate" DESC, e."createdAt" DESC
     LIMIT 1`,
    [accountId],
  );

  return {
    account,
    runningBalance: roundGlMoney(Number(row?.runningBalance || 0)),
  };
}
