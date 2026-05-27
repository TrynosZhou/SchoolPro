"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-nocheck
const express_1 = require("express");
const path_1 = __importDefault(require("path"));
const data_source_1 = require("../config/data-source");
const entities_1 = require("../entities");
const enums_1 = require("../entities/enums");
const auth_1 = require("../middleware/auth");
const helpers_1 = require("../utils/helpers");
const pdf_1 = require("../utils/pdf");
const fee_catalog_service_1 = require("../services/fee-catalog.service");
const registration_invoice_service_1 = require("../services/registration-invoice.service");
const school_branding_service_1 = require("../services/school-branding.service");
const whatsapp_service_1 = require("../services/whatsapp.service");
const typeorm_helpers_1 = require("../utils/typeorm-helpers");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
router.get('/fees', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.TEACHER), async (req, res) => {
    await (0, registration_invoice_service_1.ensureRegistrationSchoolFees)();
    const repo = data_source_1.AppDataSource.getRepository(entities_1.SchoolFee);
    const activeOnly = req.query.active === 'true';
    const fees = await repo.find({
        ...(activeOnly ? { where: { isActive: true } } : {}),
        order: { sortOrder: 'ASC', name: 'ASC' },
    });
    res.json(fees);
});
router.post('/fees', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (req, res) => {
    await (0, registration_invoice_service_1.ensureRegistrationSchoolFees)();
    const repo = data_source_1.AppDataSource.getRepository(entities_1.SchoolFee);
    const { name, code, description, defaultAmount, icon, isActive, sortOrder } = req.body;
    if (!name?.trim()) {
        return res.status(400).json({ message: 'Fee name is required' });
    }
    const feeCode = (0, fee_catalog_service_1.normalizeFeeCode)(code || name);
    if (!feeCode) {
        return res.status(400).json({ message: 'Fee code is required' });
    }
    const existing = await repo.findOne({ where: { code: feeCode } });
    if (existing) {
        return res.status(409).json({ message: 'A fee with this code already exists' });
    }
    const fee = await repo.save(repo.create({
        code: feeCode,
        name: String(name).trim(),
        description: description?.trim() || undefined,
        defaultAmount: Number(defaultAmount) || 0,
        icon: icon?.trim() || undefined,
        isActive: isActive !== false,
        sortOrder: Number(sortOrder) || 0,
    }));
    res.status(201).json(fee);
});
router.patch('/fees/:id', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.SchoolFee);
    const fee = await repo.findOne({ where: { id: req.params.id } });
    if (!fee)
        return res.status(404).json({ message: 'Fee not found' });
    const { name, code, description, defaultAmount, icon, isActive, sortOrder } = req.body;
    if (name !== undefined)
        fee.name = String(name).trim();
    if (description !== undefined)
        fee.description = description?.trim() || undefined;
    if (defaultAmount !== undefined)
        fee.defaultAmount = Number(defaultAmount) || 0;
    if (icon !== undefined)
        fee.icon = icon?.trim() || undefined;
    if (isActive !== undefined)
        fee.isActive = Boolean(isActive);
    if (sortOrder !== undefined)
        fee.sortOrder = Number(sortOrder) || 0;
    if (code !== undefined) {
        const feeCode = (0, fee_catalog_service_1.normalizeFeeCode)(code);
        if (!feeCode)
            return res.status(400).json({ message: 'Invalid fee code' });
        if (feeCode !== fee.code) {
            const inUse = await (0, fee_catalog_service_1.isFeeCodeInUse)(fee.code);
            if (inUse) {
                return res.status(400).json({
                    message: 'Cannot change code — this fee is already used on invoices or payments',
                });
            }
            const clash = await repo.findOne({ where: { code: feeCode } });
            if (clash && clash.id !== fee.id) {
                return res.status(409).json({ message: 'Another fee already uses this code' });
            }
            fee.code = feeCode;
        }
    }
    res.json(await repo.save(fee));
});
router.delete('/fees/:id', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.SchoolFee);
    const fee = await repo.findOne({ where: { id: req.params.id } });
    if (!fee)
        return res.status(404).json({ message: 'Fee not found' });
    const inUse = await (0, fee_catalog_service_1.isFeeCodeInUse)(fee.code);
    if (inUse) {
        return res.status(400).json({
            message: 'This fee is linked to invoices or payments. Deactivate it instead of deleting.',
        });
    }
    await repo.delete({ id: fee.id });
    res.json({ message: 'Fee deleted' });
});
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
    const studentRepo = data_source_1.AppDataSource.getRepository(entities_1.Student);
    const { lines, ...data } = req.body;
    const student = await studentRepo.findOne({
        where: { id: data.studentId },
        relations: (0, typeorm_helpers_1.relations)('schoolClass'),
    });
    if (!student)
        return res.status(404).json({ message: 'Student not found' });
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
    const branding = await (0, school_branding_service_1.loadSchoolBranding)();
    let termName;
    if (data.termId) {
        const term = await data_source_1.AppDataSource.getRepository(entities_1.Term).findOne({ where: { id: data.termId } });
        termName = term?.name;
    }
    const invoiceLines = lines?.map((l) => ({
        description: l.description,
        quantity: l.quantity ?? 1,
        unitPrice: l.unitPrice ?? l.amount,
        amount: Number(l.amount),
    })) ?? [{ description: data.description, quantity: 1, unitPrice: totalAmount, amount: Number(totalAmount) }];
    const pdfPath = await (0, pdf_1.generateInvoicePdf)({
        invoiceNumber: invoice.invoiceNumber,
        studentName: `${student.firstName} ${student.lastName}`,
        admissionNumber: student.admissionNumber,
        className: student.schoolClass?.name || 'N/A',
        description: data.description,
        feeType: data.feeType,
        issuedDate: invoice.issuedDate || (0, helpers_1.today)(),
        dueDate: data.dueDate,
        status: invoice.status,
        totalAmount: Number(totalAmount),
        amountPaid: Number(invoice.amountPaid),
        termName,
        lines: invoiceLines,
        ...branding,
    });
    invoice.pdfPath = pdfPath;
    await repo.save(invoice);
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
    const paymentAmount = Number(amount) || 0;
    if (paymentAmount <= 0) {
        return res.status(400).json({ message: 'Payment amount must be greater than zero' });
    }
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
        amount: paymentAmount,
        method: method,
        feeType,
        label,
        notes,
        recordedById: req.user.userId,
    }));
    if (invoiceId) {
        const invoice = await invoiceRepo.findOne({ where: { id: invoiceId, studentId } });
        if (invoice) {
            invoice.amountPaid = Number(invoice.amountPaid) + paymentAmount;
            invoice.status = Number(invoice.amountPaid) >= Number(invoice.totalAmount)
                ? enums_1.InvoiceStatus.PAID
                : enums_1.InvoiceStatus.PARTIAL;
            await invoiceRepo.save(invoice);
        }
    }
    else {
        // Auto-allocate payment against outstanding invoices (oldest first)
        let remaining = paymentAmount;
        const outstanding = await invoiceRepo.find({
            where: { studentId },
            order: { dueDate: 'ASC', createdAt: 'ASC' },
        });
        for (const inv of outstanding) {
            if (remaining <= 0)
                break;
            const due = Math.max(0, Number(inv.totalAmount) - Number(inv.amountPaid));
            if (due <= 0)
                continue;
            const applied = Math.min(due, remaining);
            inv.amountPaid = Number(inv.amountPaid) + applied;
            inv.status = Number(inv.amountPaid) >= Number(inv.totalAmount)
                ? enums_1.InvoiceStatus.PAID
                : enums_1.InvoiceStatus.PARTIAL;
            await invoiceRepo.save(inv);
            remaining -= applied;
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
        credit: paymentAmount,
        balance: prevBalance - paymentAmount,
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
        moneyIn: paymentAmount,
        moneyOut: 0,
        balance: cashBalance + paymentAmount,
        paymentMethod: method,
        reference: payment.paymentReference,
        studentId,
        recordedById: req.user.userId,
    }));
    const branding = await (0, school_branding_service_1.loadSchoolBranding)();
    const receiptNumber = (0, helpers_1.generateNumber)('RCP');
    const pdfPath = await (0, pdf_1.generateReceiptPdf)({
        receiptNumber,
        studentName: `${student.firstName} ${student.lastName}`,
        admissionNumber: student.admissionNumber,
        className: student.schoolClass?.name || 'N/A',
        amount: paymentAmount,
        method,
        label,
        paidAt: new Date(),
        ...branding,
    });
    const receipt = await receiptRepo.save(receiptRepo.create({
        receiptNumber,
        paymentId: payment.id,
        pdfPath,
    }));
    await notifRepo.save(notifRepo.create({
        title: 'Payment Received',
        message: `${student.firstName} ${student.lastName} (${student.schoolClass?.name}) paid $${paymentAmount} for ${label}`,
        type: 'payment',
        metadata: { studentId, classId: student.classId, amount: paymentAmount, label },
    }));
    const primaryGuardian = student.guardians?.find((g) => g.isPrimary) || student.guardians?.[0];
    if (primaryGuardian?.phone) {
        await (0, whatsapp_service_1.sendWhatsAppReminder)(primaryGuardian.phone, `Payment received for ${student.firstName}: $${paymentAmount} (${label}). Receipt: ${receiptNumber}`);
    }
    res.status(201).json({ payment, receipt });
});
router.get('/receipts/:id/pdf', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.PARENT), async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.Receipt);
    const receipt = await repo.findOne({
        where: { id: req.params.id },
        relations: (0, typeorm_helpers_1.relations)('payment', 'payment.student', 'payment.student.schoolClass'),
    });
    if (!receipt?.payment?.student) {
        return res.status(404).json({ message: 'Receipt not found' });
    }
    const branding = await (0, school_branding_service_1.loadSchoolBranding)();
    const p = receipt.payment;
    const s = p.student;
    const pdfPath = await (0, pdf_1.generateReceiptPdf)({
        receiptNumber: receipt.receiptNumber,
        studentName: `${s.firstName} ${s.lastName}`,
        admissionNumber: s.admissionNumber,
        className: s.schoolClass?.name || 'N/A',
        amount: Number(p.amount),
        method: p.method,
        label: p.label,
        paidAt: p.paidAt,
        ...branding,
    });
    receipt.pdfPath = pdfPath;
    await repo.save(receipt);
    res.sendFile(path_1.default.resolve(pdfPath));
});
router.get('/invoices/:id/pdf', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.PARENT), async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.Invoice);
    const invoice = await repo.findOne({
        where: { id: req.params.id },
        relations: (0, typeorm_helpers_1.relations)('student', 'student.schoolClass', 'lines', 'term'),
    });
    if (!invoice?.student) {
        return res.status(404).json({ message: 'Invoice not found' });
    }
    if (req.user.role === enums_1.UserRole.PARENT) {
        const children = await data_source_1.AppDataSource.query(`SELECT "studentId" FROM guardians WHERE "parentId" = $1`, [req.user.parentId]);
        const ids = children.map((c) => c.studentId);
        if (!ids.includes(invoice.studentId)) {
            return res.status(403).json({ message: 'Access denied' });
        }
    }
    const branding = await (0, school_branding_service_1.loadSchoolBranding)();
    const s = invoice.student;
    const lines = invoice.lines?.map((l) => ({
        description: l.description,
        quantity: l.quantity,
        unitPrice: Number(l.unitPrice),
        amount: Number(l.amount),
    })) ??
        [{ description: invoice.description, quantity: 1, unitPrice: Number(invoice.totalAmount), amount: Number(invoice.totalAmount) }];
    const pdfPath = await (0, pdf_1.generateInvoicePdf)({
        invoiceNumber: invoice.invoiceNumber,
        studentName: `${s.firstName} ${s.lastName}`,
        admissionNumber: s.admissionNumber,
        className: s.schoolClass?.name || 'N/A',
        description: invoice.description,
        feeType: invoice.feeType,
        issuedDate: invoice.issuedDate || (0, helpers_1.today)(),
        dueDate: invoice.dueDate,
        status: invoice.status,
        totalAmount: Number(invoice.totalAmount),
        amountPaid: Number(invoice.amountPaid),
        termName: invoice.term?.name,
        lines,
        ...branding,
    });
    invoice.pdfPath = pdfPath;
    await repo.save(invoice);
    res.sendFile(path_1.default.resolve(pdfPath));
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
router.get('/student-balance', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL), async (req, res) => {
    const rawQ = String(req.query.q || '').trim();
    if (!rawQ) {
        return res.status(400).json({ message: 'Query is required' });
    }
    const q = `%${rawQ.replace(/\s+/g, '%')}%`;
    const result = await data_source_1.AppDataSource.query(`
      SELECT
        s.id,
        s."admissionNumber",
        s."firstName",
        s."lastName",
        c.name as "className",
        COALESCE(inv."totalInvoiced", 0) as "totalInvoiced",
        COALESCE(pay."totalPaid", 0) as "totalPaid",
        COALESCE(inv."totalInvoiced", 0) - COALESCE(pay."totalPaid", 0) as balance
      FROM students s
      LEFT JOIN classes c ON c.id = s."classId"
      LEFT JOIN (
        SELECT "studentId", COALESCE(SUM("totalAmount"), 0) as "totalInvoiced"
        FROM invoices
        GROUP BY "studentId"
      ) inv ON inv."studentId" = s.id
      LEFT JOIN (
        SELECT "studentId", COALESCE(SUM(amount), 0) as "totalPaid"
        FROM payments
        GROUP BY "studentId"
      ) pay ON pay."studentId" = s.id
      WHERE
        s."isActive" = true
        AND (
          s.id::text = $1
          OR s."admissionNumber" ILIKE $2
          OR s."firstName" ILIKE $2
          OR s."lastName" ILIKE $2
          OR CONCAT(s."firstName", ' ', s."lastName") ILIKE $2
        )
      GROUP BY s.id, c.name, inv."totalInvoiced", pay."totalPaid"
      ORDER BY balance DESC, s."lastName" ASC, s."firstName" ASC
      LIMIT 20
    `, [rawQ, q]);
    res.json(result.map((r) => ({
        ...r,
        totalInvoiced: Number(r.totalInvoiced || 0),
        totalPaid: Number(r.totalPaid || 0),
        balance: Number(r.balance || 0),
    })));
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
