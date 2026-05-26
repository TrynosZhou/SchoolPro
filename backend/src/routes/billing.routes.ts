// @ts-nocheck
import { Router, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { AppDataSource } from '../config/data-source';
import { Invoice, Payment, Receipt, LedgerEntry, Student, Notification, CashbookEntry } from '../entities';
import { UserRole, InvoiceStatus, PaymentMethod } from '../entities/enums';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { generateNumber, today } from '../utils/helpers';
import { generateReceiptPdf } from '../utils/pdf';
import { sendWhatsAppReminder } from '../services/whatsapp.service';
import { findLatest, relations } from '../utils/typeorm-helpers';

const router = Router();
router.use(authenticate);

router.get('/invoices', authorize(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.PRINCIPAL, UserRole.PARENT), async (req: AuthRequest, res: Response) => {
  const repo = AppDataSource.getRepository(Invoice);
  const { studentId, status, termId } = req.query;
  const qb = repo.createQueryBuilder('i')
    .leftJoinAndSelect('i.student', 's')
    .leftJoinAndSelect('s.schoolClass', 'c')
    .leftJoinAndSelect('i.lines', 'l');

  if (studentId) qb.andWhere('i.studentId = :studentId', { studentId });
  if (status) qb.andWhere('i.status = :status', { status });
  if (termId) qb.andWhere('i.termId = :termId', { termId });

  if (req.user!.role === UserRole.PARENT) {
    const children = await AppDataSource.query(
      `SELECT "studentId" FROM guardians WHERE "parentId" = $1`,
      [req.user!.parentId]
    );
    const ids = children.map((c: { studentId: string }) => c.studentId);
    if (!ids.length) return res.json([]);
    qb.andWhere('i.studentId IN (:...ids)', { ids });
  }

  res.json(await qb.orderBy('i.createdAt', 'DESC').getMany());
});

router.post('/invoices', authorize(UserRole.ADMIN), async (req, res: Response) => {
  const repo = AppDataSource.getRepository(Invoice);
  const ledgerRepo = AppDataSource.getRepository(LedgerEntry);
  const { lines, ...data } = req.body;

  const totalAmount = lines?.reduce((s: number, l: { amount: number }) => s + Number(l.amount), 0) || data.totalAmount;
  const created = repo.create({
    ...data,
    invoiceNumber: generateNumber('INV'),
    totalAmount,
    issuedDate: today(),
    status: InvoiceStatus.SENT,
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
    entryDate: today(),
    description: `Invoice ${invoice.invoiceNumber} - ${data.description}`,
    debit: totalAmount,
    credit: 0,
    balance: prevBalance + Number(totalAmount),
    referenceType: 'invoice',
    referenceId: invoice.id,
  }));

  res.status(201).json(invoice);
});

router.post('/payments', authorize(UserRole.ADMIN), async (req: AuthRequest, res: Response) => {
  const paymentRepo = AppDataSource.getRepository(Payment);
  const receiptRepo = AppDataSource.getRepository(Receipt);
  const invoiceRepo = AppDataSource.getRepository(Invoice);
  const ledgerRepo = AppDataSource.getRepository(LedgerEntry);
  const studentRepo = AppDataSource.getRepository(Student);
  const notifRepo = AppDataSource.getRepository(Notification);

  const { studentId, invoiceId, amount, method, feeType, label, notes } = req.body;

  const student = await studentRepo.findOne({
    where: { id: studentId },
    relations: relations('schoolClass', 'schoolClass.form', 'guardians'),
  });
  if (!student) return res.status(404).json({ message: 'Student not found' });

  const payment = await paymentRepo.save(paymentRepo.create({
    paymentReference: generateNumber('PAY'),
    studentId,
    invoiceId,
    amount,
    method: method as PaymentMethod,
    feeType,
    label,
    notes,
    recordedById: req.user!.userId,
  }));

  if (invoiceId) {
    const invoice = await invoiceRepo.findOne({ where: { id: invoiceId } });
    if (invoice) {
      invoice.amountPaid = Number(invoice.amountPaid) + Number(amount);
      invoice.status = invoice.amountPaid >= Number(invoice.totalAmount)
        ? InvoiceStatus.PAID
        : InvoiceStatus.PARTIAL;
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
    entryDate: today(),
    description: `Payment - ${label}`,
    debit: 0,
    credit: amount,
    balance: prevBalance - Number(amount),
    referenceType: 'payment',
    referenceId: payment.id,
  }));

  const cashbookRepo = AppDataSource.getRepository(CashbookEntry);
  const lastCash = await findLatest(cashbookRepo);
  const cashBalance = lastCash ? Number(lastCash.balance) : 0;
  await cashbookRepo.save(
    cashbookRepo.create({
      entryDate: today(),
      type: 'receipt' as never,
      description: `${label} - ${student.firstName} ${student.lastName}`,
      moneyIn: amount,
      moneyOut: 0,
      balance: cashBalance + Number(amount),
      paymentMethod: method,
      reference: payment.paymentReference,
      studentId,
      recordedById: req.user!.userId,
    })
  );

  const receiptNumber = generateNumber('RCP');
  const pdfPath = await generateReceiptPdf({
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
    await sendWhatsAppReminder(
      primaryGuardian.phone,
      `Payment received for ${student.firstName}: $${amount} (${label}). Receipt: ${receiptNumber}`
    );
  }

  res.status(201).json({ payment, receipt });
});

router.get('/receipts/:id/pdf', authorize(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.PRINCIPAL, UserRole.PARENT), async (req, res: Response) => {
  const repo = AppDataSource.getRepository(Receipt);
  const receipt = await repo.findOne({
    where: { id: req.params.id },
    relations: relations('payment', 'payment.student'),
  });
  if (!receipt?.pdfPath || !fs.existsSync(receipt.pdfPath)) {
    return res.status(404).json({ message: 'Receipt PDF not found' });
  }
  res.sendFile(path.resolve(receipt.pdfPath));
});

router.get('/receipts/student/:studentId', authorize(UserRole.ADMIN, UserRole.PARENT, UserRole.DIRECTOR, UserRole.PRINCIPAL), async (req, res: Response) => {
  const payments = await AppDataSource.getRepository(Payment).find({
    where: { studentId: req.params.studentId },
    relations: relations('receipt'),
    order: { paidAt: 'DESC' },
  });
  res.json(payments.filter((p) => p.receipt).map((p) => ({ ...p.receipt, payment: p })));
});

router.get('/statement/:studentId', authorize(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.PRINCIPAL, UserRole.PARENT), async (req, res: Response) => {
  const { termId } = req.query;
  const ledgerRepo = AppDataSource.getRepository(LedgerEntry);
  const invoiceRepo = AppDataSource.getRepository(Invoice);
  const paymentRepo = AppDataSource.getRepository(Payment);

  const where: Record<string, string> = { studentId: req.params.studentId };
  if (termId) where.termId = termId as string;

  const ledger = await ledgerRepo.find({ where, order: { entryDate: 'ASC' } });
  const invoices = await invoiceRepo.find({ where: { studentId: req.params.studentId } });
  const payments = await paymentRepo.find({ where: { studentId: req.params.studentId } });

  const totalInvoiced = invoices.reduce((s, i) => s + Number(i.totalAmount), 0);
  const totalPaid = payments.reduce((s, p) => s + Number(p.amount), 0);
  const balance = totalInvoiced - totalPaid;

  res.json({ ledger, invoices, payments, summary: { totalInvoiced, totalPaid, balance } });
});

router.post('/reminders/send', authorize(UserRole.ADMIN), async (req, res: Response) => {
  const { studentIds, message } = req.body;
  const studentRepo = AppDataSource.getRepository(Student);
  const sent = [];

  for (const id of studentIds) {
    const student = await studentRepo.findOne({ where: { id }, relations: relations('guardians', 'schoolClass') });
    if (!student) continue;
    const guardian = student.guardians?.find((g) => g.isPrimary) || student.guardians?.[0];
    if (!guardian?.phone) continue;

    const invoiceRepo = AppDataSource.getRepository(Invoice);
    const unpaid = await invoiceRepo.find({
      where: { studentId: id, status: InvoiceStatus.SENT },
    });
    const owed = unpaid.reduce((s, i) => s + (Number(i.totalAmount) - Number(i.amountPaid)), 0);
    if (owed <= 0) continue;

    const msg = message || `Fee reminder: ${student.firstName} ${student.lastName} (${student.schoolClass?.name}) owes $${owed.toFixed(2)}. Please arrange payment.`;
    await sendWhatsAppReminder(guardian.phone, msg);
    sent.push({ studentId: id, phone: guardian.phone, amountOwed: owed });
  }

  res.json({ sent: sent.length, details: sent });
});

router.get('/summary', authorize(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.PRINCIPAL), async (_req, res: Response) => {
  const [debtors, monthly, today, pending] = await Promise.all([
    AppDataSource.query(`
      SELECT COALESCE(SUM("totalAmount" - "amountPaid"), 0) as total
      FROM invoices WHERE status IN ('sent', 'partial', 'overdue')
    `),
    AppDataSource.query(`
      SELECT COALESCE(SUM(amount), 0) as total FROM payments
      WHERE "paidAt" >= date_trunc('month', CURRENT_DATE)
    `),
    AppDataSource.query(`
      SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count FROM payments
      WHERE "paidAt"::date = CURRENT_DATE
    `),
    AppDataSource.query(`
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

router.get('/payments', authorize(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.PRINCIPAL), async (req, res: Response) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
  const { studentId } = req.query;
  const paymentRepo = AppDataSource.getRepository(Payment);
  const payments = await paymentRepo.find({
    ...(studentId ? { where: { studentId: studentId as string } } : {}),
    relations: relations('student', 'student.schoolClass', 'receipt', 'invoice'),
    order: { paidAt: 'DESC' },
    take: limit,
  });
  res.json(payments);
});

router.get('/debtors', authorize(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.PRINCIPAL), async (req, res: Response) => {
  const result = await AppDataSource.query(`
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

router.get('/class-balances/:classId', authorize(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.PRINCIPAL), async (req, res: Response) => {
  const result = await AppDataSource.query(`
    SELECT COALESCE(SUM(i."totalAmount" - i."amountPaid"), 0) as "totalOwed",
      COUNT(DISTINCT s.id) as "studentsWithBalance"
    FROM students s
    LEFT JOIN invoices i ON i."studentId" = s.id AND i.status IN ('sent', 'partial', 'overdue')
    WHERE s."classId" = $1 AND s."isActive" = true
  `, [req.params.classId]);
  res.json(result[0]);
});

export default router;


