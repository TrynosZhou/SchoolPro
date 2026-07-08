// @ts-nocheck
import { Router, Response } from 'express';
import { AppDataSource } from '../config/data-source';
import { CashbookEntry } from '../entities';
import { UserRole } from '../entities/enums';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { findLatest } from '../utils/typeorm-helpers';
import { postCashbookExpenseToGl, postCashbookReceiptToGl } from '../services/gl-posting.service';
import { FINANCE_ROLES, FINANCE_WRITE_ROLES } from '../config/portal-roles';

const router = Router();
router.use(authenticate);

router.get('/cashbook', authorize(...FINANCE_ROLES), async (req, res: Response) => {
  const repo = AppDataSource.getRepository(CashbookEntry);
  const { from, to } = req.query;
  const qb = repo.createQueryBuilder('c').orderBy('c.entryDate', 'DESC').addOrderBy('c.createdAt', 'DESC');
  if (from && to) qb.where('c.entryDate BETWEEN :from AND :to', { from, to });
  res.json(await qb.getMany());
});

router.post('/cashbook', authorize(...FINANCE_WRITE_ROLES), async (req: AuthRequest, res: Response) => {
  const repo = AppDataSource.getRepository(CashbookEntry);
  const last = await findLatest(repo);
  const prevBalance = last ? Number(last.balance) : 0;
  const { moneyIn = 0, moneyOut = 0, ...data } = req.body;
  const entry = repo.create({
    ...data,
    moneyIn,
    moneyOut,
    balance: prevBalance + Number(moneyIn) - Number(moneyOut),
    recordedById: req.user?.userId,
  });
  const saved = await repo.save(entry);
  try {
    if (Number(moneyOut) > 0) {
      await postCashbookExpenseToGl(saved, req.user!.userId);
    } else if (Number(moneyIn) > 0 && !saved.studentId) {
      await postCashbookReceiptToGl(saved, req.user!.userId);
    }
  } catch (glErr) {
    console.error('GL posting failed for cashbook entry:', glErr);
  }
  res.status(201).json(saved);
});

router.get('/balance-sheet', authorize(...FINANCE_ROLES), async (_req, res: Response) => {
  const cashbook = await findLatest(AppDataSource.getRepository(CashbookEntry));
  const debtors = await AppDataSource.query(`
    SELECT COALESCE(SUM("totalAmount" - "amountPaid"), 0) as total
    FROM invoices WHERE status IN ('sent', 'partial', 'overdue')
  `);
  const payments = await AppDataSource.query(`
    SELECT COALESCE(SUM(amount), 0) as total FROM payments
    WHERE "paidAt" >= date_trunc('month', CURRENT_DATE)
  `);

  res.json({
    cashBalance: cashbook ? Number(cashbook.balance) : 0,
    totalDebtors: Number(debtors[0]?.total || 0),
    monthlyCollections: Number(payments[0]?.total || 0),
    generatedAt: new Date(),
  });
});

router.get('/recent-payments', authorize(...FINANCE_ROLES), async (req, res: Response) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 15, 50);
  const payments = await AppDataSource.query(`
    SELECT p.id, p."paymentReference", p.amount, p.method, p.label, p."feeType", p."paidAt",
      s."firstName", s."lastName", s."admissionNumber", c.name as "className"
    FROM payments p
    JOIN students s ON s.id = p."studentId"
    LEFT JOIN classes c ON c.id = s."classId"
    ORDER BY p."paidAt" DESC
    LIMIT $1
  `, [limit]);
  res.json(payments);
});

router.get('/class-debt-summary', authorize(...FINANCE_ROLES), async (_req, res: Response) => {
  const result = await AppDataSource.query(`
    SELECT c.id, c.name, f.name as "formName",
      COALESCE(SUM(i."totalAmount" - i."amountPaid"), 0) as owed,
      COUNT(DISTINCT CASE WHEN i."totalAmount" > i."amountPaid" THEN s.id END) as "studentsOwing"
    FROM classes c
    LEFT JOIN forms f ON f.id = c."formId"
    LEFT JOIN students s ON s."classId" = c.id AND s."isActive" = true
    LEFT JOIN invoices i ON i."studentId" = s.id AND i.status IN ('sent', 'partial', 'overdue')
    GROUP BY c.id, c.name, f.name
    ORDER BY owed DESC
  `);
  res.json(result);
});

router.get('/cashbook/summary', authorize(...FINANCE_ROLES), async (req, res: Response) => {
  const { from, to } = req.query;
  let dateFilter = '';
  const params: string[] = [];
  if (from && to) {
    dateFilter = `WHERE "entryDate" BETWEEN $1 AND $2`;
    params.push(from as string, to as string);
  }
  const [totals] = await AppDataSource.query(`
    SELECT
      COALESCE(SUM("moneyIn"), 0) as "totalIn",
      COALESCE(SUM("moneyOut"), 0) as "totalOut",
      COUNT(*) as entries
    FROM cashbook_entries ${dateFilter}
  `, params);
  res.json(totals);
});

router.get('/debtors-aging', authorize(...FINANCE_ROLES), async (_req, res: Response) => {
  const result = await AppDataSource.query(`
    SELECT
      CASE
        WHEN CURRENT_DATE - i."dueDate" <= 30 THEN '0-30 days'
        WHEN CURRENT_DATE - i."dueDate" <= 60 THEN '31-60 days'
        WHEN CURRENT_DATE - i."dueDate" <= 90 THEN '61-90 days'
        ELSE '90+ days'
      END as bucket,
      COUNT(*) as count,
      SUM(i."totalAmount" - i."amountPaid") as amount
    FROM invoices i
    WHERE i.status IN ('sent', 'partial', 'overdue')
      AND i."totalAmount" > i."amountPaid"
    GROUP BY bucket
    ORDER BY bucket
  `);
  res.json(result);
});

export default router;


