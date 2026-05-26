"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-nocheck
const express_1 = require("express");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const data_source_1 = require("../config/data-source");
const entities_1 = require("../entities");
const enums_1 = require("../entities/enums");
const auth_1 = require("../middleware/auth");
const helpers_1 = require("../utils/helpers");
const pdf_1 = require("../utils/pdf");
const whatsapp_service_1 = require("../services/whatsapp.service");
const typeorm_helpers_1 = require("../utils/typeorm-helpers");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
router.get('/invoices', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.PARENT), async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.Invoice);
    const { studentId, status, termId } = req.query;
    const qb = repo.createQueryBuilder('i')
        .leftJoinAndSelect('i.student', 's')
        .leftJoinAndSelect('s.schoolClass', 'c')
        .leftJoinAndSelect('i.lines', 'l');
    if (studentId)
        qb.andWhere('i.studentId = :studentId', { studentId });
    if (status)
        qb.andWhere('i.status = :status', { status });
    if (termId)
        qb.andWhere('i.termId = :termId', { termId });
    if (req.user.role === enums_1.UserRole.PARENT) {
        const children = await data_source_1.AppDataSource.query(`SELECT "studentId" FROM guardians WHERE "parentId" = $1`, [req.user.parentId]);
        const ids = children.map((c) => c.studentId);
        if (!ids.length)
            return res.json([]);
        qb.andWhere('i.studentId IN (:...ids)', { ids });
    }
    res.json(await qb.orderBy('i.createdAt', 'DESC').getMany());
});
router.post('/invoices', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.Invoice);
    const ledgerRepo = data_source_1.AppDataSource.getRepository(entities_1.LedgerEntry);
    const { lines, ...data } = req.body;
    const totalAmount = lines?.reduce((s, l) => s + Number(l.amount), 0) || data.totalAmount;
    const created = repo.create({
        ...data,
        invoiceNumber: (0, helpers_1.generateNumber)('INV'),
        totalAmount,
        issuedDate: (0, helpers_1.today)(),
        status: enums_1.InvoiceStatus.SENT,
        lines,
    });
    const invoice = await repo.save(Array.isArray(created) ? created[0] : created);
    const lastLedger = await ledgerRepo.findOne({
        where: { studentId: data.studentId },
        order: { createdAt: 'DESC' },
    });
    const prevBalance = lastLedger ? Number(lastLedger.balance) : 0;
    await ledgerRepo.save(ledgerRepo.create({
        studentId: data.studentId,
        termId: data.termId,
        entryDate: (0, helpers_1.today)(),
        description: `Invoice ${invoice.invoiceNumber} - ${data.description}`,
        debit: totalAmount,
        credit: 0,
        balance: prevBalance + Number(totalAmount),
        referenceType: 'invoice',
        referenceId: invoice.id,
    }));
    res.status(201).json(invoice);
});
router.post('/payments', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (req, res) => {
    const paymentRepo = data_source_1.AppDataSource.getRepository(entities_1.Payment);
    const receiptRepo = data_source_1.AppDataSource.getRepository(entities_1.Receipt);
    const invoiceRepo = data_source_1.AppDataSource.getRepository(entities_1.Invoice);
    const ledgerRepo = data_source_1.AppDataSource.getRepository(entities_1.LedgerEntry);
    const studentRepo = data_source_1.AppDataSource.getRepository(entities_1.Student);
    const notifRepo = data_source_1.AppDataSource.getRepository(entities_1.Notification);
    const { studentId, invoiceId, amount, method, feeType, label, notes } = req.body;
    const student = await studentRepo.findOne({
        where: { id: studentId },
        relations: (0, typeorm_helpers_1.relations)('schoolClass', 'schoolClass.form', 'guardians'),
    });
    if (!student)
        return res.status(404).json({ message: 'Student not found' });
    const payment = await paymentRepo.save(paymentRepo.create({
        paymentReference: (0, helpers_1.generateNumber)('PAY'),
        studentId,
        invoiceId,
        amount,
        method: method,
        feeType,
        label,
        notes,
        recordedById: req.user.userId,
    }));
    if (invoiceId) {
        const invoice = await invoiceRepo.findOne({ where: { id: invoiceId } });
        if (invoice) {
            invoice.amountPaid = Number(invoice.amountPaid) + Number(amount);
            invoice.status = invoice.amountPaid >= Number(invoice.totalAmount)
                ? enums_1.InvoiceStatus.PAID
                : enums_1.InvoiceStatus.PARTIAL;
            await invoiceRepo.save(invoice);
        }
    }
    const lastLedger = await ledgerRepo.findOne({
        where: { studentId },
        order: { createdAt: 'DESC' },
    });
    const prevBalance = lastLedger ? Number(lastLedger.balance) : 0;
    await ledgerRepo.save(ledgerRepo.create({
        studentId,
        entryDate: (0, helpers_1.today)(),
        description: `Payment - ${label}`,
        debit: 0,
        credit: amount,
        balance: prevBalance - Number(amount),
        referenceType: 'payment',
        referenceId: payment.id,
    }));
    const cashbookRepo = data_source_1.AppDataSource.getRepository(entities_1.CashbookEntry);
    const lastCash = await (0, typeorm_helpers_1.findLatest)(cashbookRepo);
    const cashBalance = lastCash ? Number(lastCash.balance) : 0;
    await cashbookRepo.save(cashbookRepo.create({
        entryDate: (0, helpers_1.today)(),
        type: 'receipt',
        description: `${label} - ${student.firstName} ${student.lastName}`,
        moneyIn: amount,
        moneyOut: 0,
        balance: cashBalance + Number(amount),
        paymentMethod: method,
        reference: payment.paymentReference,
        studentId,
        recordedById: req.user.userId,
    }));
    const receiptNumber = (0, helpers_1.generateNumber)('RCP');
    const pdfPath = await (0, pdf_1.generateReceiptPdf)({
        receiptNumber,
        studentName: `${student.firstName} ${student.lastName}`,
        admissionNumber: student.admissionNumber,
        className: student.schoolClass?.name || 'N/A',
        amount: Number(amount),
        method,
        label,
        paidAt: new Date(),
    });
    const receipt = await receiptRepo.save(receiptRepo.create({
        receiptNumber,
        paymentId: payment.id,
        pdfPath,
    }));
    await notifRepo.save(notifRepo.create({
        title: 'Payment Received',
        message: `${student.firstName} ${student.lastName} (${student.schoolClass?.name}) paid $${amount} for ${label}`,
        type: 'payment',
        metadata: { studentId, classId: student.classId, amount, label },
    }));
    const primaryGuardian = student.guardians?.find((g) => g.isPrimary) || student.guardians?.[0];
    if (primaryGuardian?.phone) {
        await (0, whatsapp_service_1.sendWhatsAppReminder)(primaryGuardian.phone, `Payment received for ${student.firstName}: $${amount} (${label}). Receipt: ${receiptNumber}`);
    }
    res.status(201).json({ payment, receipt });
});
router.get('/receipts/:id/pdf', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.PARENT), async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.Receipt);
    const receipt = await repo.findOne({
        where: { id: req.params.id },
        relations: (0, typeorm_helpers_1.relations)('payment', 'payment.student'),
    });
    if (!receipt?.pdfPath || !fs_1.default.existsSync(receipt.pdfPath)) {
        return res.status(404).json({ message: 'Receipt PDF not found' });
    }
    res.sendFile(path_1.default.resolve(receipt.pdfPath));
});
router.get('/receipts/student/:studentId', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.PARENT, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL), async (req, res) => {
    const payments = await data_source_1.AppDataSource.getRepository(entities_1.Payment).find({
        where: { studentId: req.params.studentId },
        relations: (0, typeorm_helpers_1.relations)('receipt'),
        order: { paidAt: 'DESC' },
    });
    res.json(payments.filter((p) => p.receipt).map((p) => ({ ...p.receipt, payment: p })));
});
router.get('/statement/:studentId', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.PARENT), async (req, res) => {
    const { termId } = req.query;
    const ledgerRepo = data_source_1.AppDataSource.getRepository(entities_1.LedgerEntry);
    const invoiceRepo = data_source_1.AppDataSource.getRepository(entities_1.Invoice);
    const paymentRepo = data_source_1.AppDataSource.getRepository(entities_1.Payment);
    const where = { studentId: req.params.studentId };
    if (termId)
        where.termId = termId;
    const ledger = await ledgerRepo.find({ where, order: { entryDate: 'ASC' } });
    const invoices = await invoiceRepo.find({ where: { studentId: req.params.studentId } });
    const payments = await paymentRepo.find({ where: { studentId: req.params.studentId } });
    const totalInvoiced = invoices.reduce((s, i) => s + Number(i.totalAmount), 0);
    const totalPaid = payments.reduce((s, p) => s + Number(p.amount), 0);
    const balance = totalInvoiced - totalPaid;
    res.json({ ledger, invoices, payments, summary: { totalInvoiced, totalPaid, balance } });
});
router.post('/reminders/send', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (req, res) => {
    const { studentIds, message } = req.body;
    const studentRepo = data_source_1.AppDataSource.getRepository(entities_1.Student);
    const sent = [];
    for (const id of studentIds) {
        const student = await studentRepo.findOne({ where: { id }, relations: (0, typeorm_helpers_1.relations)('guardians', 'schoolClass') });
        if (!student)
            continue;
        const guardian = student.guardians?.find((g) => g.isPrimary) || student.guardians?.[0];
        if (!guardian?.phone)
            continue;
        const invoiceRepo = data_source_1.AppDataSource.getRepository(entities_1.Invoice);
        const unpaid = await invoiceRepo.find({
            where: { studentId: id, status: enums_1.InvoiceStatus.SENT },
        });
        const owed = unpaid.reduce((s, i) => s + (Number(i.totalAmount) - Number(i.amountPaid)), 0);
        if (owed <= 0)
            continue;
        const msg = message || `Fee reminder: ${student.firstName} ${student.lastName} (${student.schoolClass?.name}) owes $${owed.toFixed(2)}. Please arrange payment.`;
        await (0, whatsapp_service_1.sendWhatsAppReminder)(guardian.phone, msg);
        sent.push({ studentId: id, phone: guardian.phone, amountOwed: owed });
    }
    res.json({ sent: sent.length, details: sent });
});
router.get('/summary', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL), async (_req, res) => {
    const [debtors, monthly, today, pending] = await Promise.all([
        data_source_1.AppDataSource.query(`
      SELECT COALESCE(SUM("totalAmount" - "amountPaid"), 0) as total
      FROM invoices WHERE status IN ('sent', 'partial', 'overdue')
    `),
        data_source_1.AppDataSource.query(`
      SELECT COALESCE(SUM(amount), 0) as total FROM payments
      WHERE "paidAt" >= date_trunc('month', CURRENT_DATE)
    `),
        data_source_1.AppDataSource.query(`
      SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count FROM payments
      WHERE "paidAt"::date = CURRENT_DATE
    `),
        data_source_1.AppDataSource.query(`
      SELECT COUNT(*) as count FROM invoices WHERE status IN ('sent', 'partial', 'overdue')
    `),
    ]);
    res.json({
        totalDebtors: Number(debtors[0]?.total || 0),
        monthlyCollections: Number(monthly[0]?.total || 0),
        todayCollections: Number(today[0]?.total || 0),
        todayPaymentCount: Number(today[0]?.count || 0),
        pendingInvoices: Number(pending[0]?.count || 0),
    });
});
router.get('/payments', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL), async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const { studentId } = req.query;
    const paymentRepo = data_source_1.AppDataSource.getRepository(entities_1.Payment);
    const payments = await paymentRepo.find({
        ...(studentId ? { where: { studentId: studentId } } : {}),
        relations: (0, typeorm_helpers_1.relations)('student', 'student.schoolClass', 'receipt', 'invoice'),
        order: { paidAt: 'DESC' },
        take: limit,
    });
    res.json(payments);
});
router.get('/debtors', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL), async (req, res) => {
    const result = await data_source_1.AppDataSource.query(`
    SELECT s.id, s."firstName", s."lastName", s."admissionNumber", c.name as "className",
      COALESCE(SUM(i."totalAmount" - i."amountPaid"), 0) as owed,
      MAX(i."dueDate") as "oldestDue"
    FROM students s
    LEFT JOIN classes c ON c.id = s."classId"
    LEFT JOIN invoices i ON i."studentId" = s.id AND i.status IN ('sent', 'partial', 'overdue')
    WHERE s."isActive" = true
    GROUP BY s.id, c.name
    HAVING COALESCE(SUM(i."totalAmount" - i."amountPaid"), 0) > 0
    ORDER BY owed DESC
  `);
    res.json(result);
});
router.get('/class-balances/:classId', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL), async (req, res) => {
    const result = await data_source_1.AppDataSource.query(`
    SELECT COALESCE(SUM(i."totalAmount" - i."amountPaid"), 0) as "totalOwed",
      COUNT(DISTINCT s.id) as "studentsWithBalance"
    FROM students s
    LEFT JOIN invoices i ON i."studentId" = s.id AND i.status IN ('sent', 'partial', 'overdue')
    WHERE s."classId" = $1 AND s."isActive" = true
  `, [req.params.classId]);
    res.json(result[0]);
});
exports.default = router;
