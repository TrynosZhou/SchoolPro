"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-nocheck
const express_1 = require("express");
const data_source_1 = require("../config/data-source");
const entities_1 = require("../entities");
const auth_1 = require("../middleware/auth");
const typeorm_helpers_1 = require("../utils/typeorm-helpers");
const gl_posting_service_1 = require("../services/gl-posting.service");
const portal_roles_1 = require("../config/portal-roles");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
router.get('/cashbook', (0, auth_1.authorize)(...portal_roles_1.FINANCE_ROLES), async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.CashbookEntry);
    const { from, to } = req.query;
    const qb = repo.createQueryBuilder('c').orderBy('c.entryDate', 'DESC').addOrderBy('c.createdAt', 'DESC');
    if (from && to)
        qb.where('c.entryDate BETWEEN :from AND :to', { from, to });
    res.json(await qb.getMany());
});
router.post('/cashbook', (0, auth_1.authorize)(...portal_roles_1.FINANCE_WRITE_ROLES), async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.CashbookEntry);
    const last = await (0, typeorm_helpers_1.findLatest)(repo);
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
            await (0, gl_posting_service_1.postCashbookExpenseToGl)(saved, req.user.userId);
        }
        else if (Number(moneyIn) > 0 && !saved.studentId) {
            await (0, gl_posting_service_1.postCashbookReceiptToGl)(saved, req.user.userId);
        }
    }
    catch (glErr) {
        console.error('GL posting failed for cashbook entry:', glErr);
    }
    res.status(201).json(saved);
});
router.get('/balance-sheet', (0, auth_1.authorize)(...portal_roles_1.FINANCE_ROLES), async (_req, res) => {
    const cashbook = await (0, typeorm_helpers_1.findLatest)(data_source_1.AppDataSource.getRepository(entities_1.CashbookEntry));
    const debtors = await data_source_1.AppDataSource.query(`
    SELECT COALESCE(SUM("totalAmount" - "amountPaid"), 0) as total
    FROM invoices WHERE status IN ('sent', 'partial', 'overdue')
  `);
    const payments = await data_source_1.AppDataSource.query(`
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
router.get('/recent-payments', (0, auth_1.authorize)(...portal_roles_1.FINANCE_ROLES), async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 15, 50);
    const payments = await data_source_1.AppDataSource.query(`
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
router.get('/class-debt-summary', (0, auth_1.authorize)(...portal_roles_1.FINANCE_ROLES), async (_req, res) => {
    const result = await data_source_1.AppDataSource.query(`
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
router.get('/cashbook/summary', (0, auth_1.authorize)(...portal_roles_1.FINANCE_ROLES), async (req, res) => {
    const { from, to } = req.query;
    let dateFilter = '';
    const params = [];
    if (from && to) {
        dateFilter = `WHERE "entryDate" BETWEEN $1 AND $2`;
        params.push(from, to);
    }
    const [totals] = await data_source_1.AppDataSource.query(`
    SELECT
      COALESCE(SUM("moneyIn"), 0) as "totalIn",
      COALESCE(SUM("moneyOut"), 0) as "totalOut",
      COUNT(*) as entries
    FROM cashbook_entries ${dateFilter}
  `, params);
    res.json(totals);
});
router.get('/debtors-aging', (0, auth_1.authorize)(...portal_roles_1.FINANCE_ROLES), async (_req, res) => {
    const result = await data_source_1.AppDataSource.query(`
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
exports.default = router;
