import { Router, Response } from 'express';
import { AppDataSource } from '../config/data-source';
import { UserRole } from '../entities/enums';
import { GlAccountType, GlReferenceType } from '../entities/enums';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import {
  buildGeneralLedgerReport,
  exportGeneralLedgerPdf,
  generalLedgerReportToCsv,
  getAccountBalanceDetail,
  GlListFilters,
} from '../services/general-ledger-report.service';
import {
  checkSystemGlBalance,
  ensureChartOfAccountsSeeded,
  reverseEntry,
} from '../services/ledger.service';

const router = Router();
const GL_ROLES = [UserRole.ADMIN, UserRole.DIRECTOR, UserRole.PRINCIPAL];

router.use(authenticate);
router.use(authorize(...GL_ROLES));

function parseGlFilters(req: AuthRequest): GlListFilters {
  const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(String(req.query.pageSize || '50'), 10) || 50));
  const accountType = String(req.query.accountType || '').trim().toUpperCase();
  const referenceType = String(req.query.referenceType || '').trim().toUpperCase();

  return {
    startDate: String(req.query.startDate || '').trim() || undefined,
    endDate: String(req.query.endDate || '').trim() || undefined,
    accountId: String(req.query.accountId || '').trim() || undefined,
    accountType: Object.values(GlAccountType).includes(accountType as GlAccountType)
      ? (accountType as GlAccountType)
      : undefined,
    referenceType: Object.values(GlReferenceType).includes(referenceType as GlReferenceType)
      ? (referenceType as GlReferenceType)
      : undefined,
    search: String(req.query.search || '').trim() || undefined,
    page,
    pageSize,
  };
}

router.get('/integrity', async (_req, res: Response) => {
  const result = await checkSystemGlBalance();
  res.json(result);
});

router.get('/export', async (req: AuthRequest, res: Response) => {
  const format = String(req.query.format || 'csv').toLowerCase();
  const filters = parseGlFilters(req);
  filters.page = 1;
  filters.pageSize = 10000;

  const report = await buildGeneralLedgerReport(filters);

  if (format === 'pdf') {
    const pdf = await exportGeneralLedgerPdf(report);
    const inline = String(req.query.preview || '') === 'true';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `${inline ? 'inline' : 'attachment'}; filename="general-ledger.pdf"`,
    );
    return res.send(pdf);
  }

  const csv = generalLedgerReportToCsv(report);
  res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="general-ledger.csv"');
  return res.send(csv);
});

router.get('/:accountId/balance', async (req, res: Response) => {
  try {
    const detail = await getAccountBalanceDetail(String(req.params.accountId));
    res.json(detail);
  } catch (e) {
    res.status(404).json({ message: e instanceof Error ? e.message : 'Account not found' });
  }
});

router.post('/reverse/:entryId', async (req: AuthRequest, res: Response) => {
  try {
    const result = await reverseEntry(String(req.params.entryId), req.user!.userId);
    res.json({ message: 'Entry reversed successfully.', ...result });
  } catch (e) {
    res.status(400).json({ message: e instanceof Error ? e.message : 'Reversal failed' });
  }
});

router.get('/', async (req: AuthRequest, res: Response) => {
  await ensureChartOfAccountsSeeded();
  const [{ glCount, paymentCount }] = await AppDataSource.query(`
    SELECT
      (SELECT COUNT(*)::int FROM general_ledger_entries) as "glCount",
      (SELECT COUNT(*)::int FROM payments) as "paymentCount"
  `);
  if (Number(glCount) === 0 && Number(paymentCount) > 0) {
    const { backfillGeneralLedgerFromHistory } = await import('../services/gl-backfill.service');
    await backfillGeneralLedgerFromHistory();
  }
  const report = await buildGeneralLedgerReport(parseGlFilters(req));
  res.json(report);
});

export default router;
