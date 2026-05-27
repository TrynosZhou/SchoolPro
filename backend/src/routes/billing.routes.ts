// @ts-nocheck
import { Router, Response } from 'express';
import path from 'path';
import fs from 'fs';
import PDFDocument from 'pdfkit';
import { AppDataSource } from '../config/data-source';
import { Invoice, Payment, Receipt, LedgerEntry, Student, Notification, CashbookEntry, SchoolSettings, Term, SchoolFee } from '../entities';
import { UserRole, InvoiceStatus, PaymentMethod } from '../entities/enums';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { generateNumber, today } from '../utils/helpers';
import { generateInvoicePdf, generateReceiptPdf, SchoolBranding } from '../utils/pdf';
import { ensureDefaultSchoolFees, isFeeCodeInUse, normalizeFeeCode } from '../services/fee-catalog.service';
import { ensureRegistrationSchoolFees } from '../services/registration-invoice.service';
import { loadSchoolBranding } from '../services/school-branding.service';
import { sendWhatsAppReminder } from '../services/whatsapp.service';
import { findLatest, relations } from '../utils/typeorm-helpers';
import {
  buildOutstandingInvoicesReport,
  buildDebtorAgingReport,
  debtorAgingToCsv,
  buildStudentLedgerReport,
  buildStudentReconciliationReport,
  reconciliationReportToCsv,
  searchStudents,
} from '../services/fin-reports.service';
import {
  buildFeeCollectionRevenueReport,
  feeCollectionReportToCsv,
} from '../services/fee-collection-revenue.service';
import { generateReconciliationPdf } from '../utils/pdf';

const router = Router();
router.use(authenticate);

router.get('/fees', authorize(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.PRINCIPAL, UserRole.TEACHER), async (req, res: Response) => {
  await ensureRegistrationSchoolFees();
  const repo = AppDataSource.getRepository(SchoolFee);
  const activeOnly = req.query.active === 'true';
  const fees = await repo.find({
    ...(activeOnly ? { where: { isActive: true } } : {}),
    order: { sortOrder: 'ASC', name: 'ASC' },
  });
  res.json(fees);
});

router.post('/fees', authorize(UserRole.ADMIN), async (req, res: Response) => {
  await ensureRegistrationSchoolFees();
  const repo = AppDataSource.getRepository(SchoolFee);
  const { name, code, description, defaultAmount, icon, isActive, sortOrder } = req.body;
  if (!name?.trim()) {
    return res.status(400).json({ message: 'Fee name is required' });
  }
  const feeCode = normalizeFeeCode(code || name);
  if (!feeCode) {
    return res.status(400).json({ message: 'Fee code is required' });
  }
  const existing = await repo.findOne({ where: { code: feeCode } });
  if (existing) {
    return res.status(409).json({ message: 'A fee with this code already exists' });
  }
  const fee = await repo.save(
    repo.create({
      code: feeCode,
      name: String(name).trim(),
      description: description?.trim() || undefined,
      defaultAmount: Number(defaultAmount) || 0,
      icon: icon?.trim() || undefined,
      isActive: isActive !== false,
      sortOrder: Number(sortOrder) || 0,
    }),
  );
  res.status(201).json(fee);
});

router.patch('/fees/:id', authorize(UserRole.ADMIN), async (req, res: Response) => {
  const repo = AppDataSource.getRepository(SchoolFee);
  const fee = await repo.findOne({ where: { id: req.params.id } });
  if (!fee) return res.status(404).json({ message: 'Fee not found' });

  const { name, code, description, defaultAmount, icon, isActive, sortOrder } = req.body;
  if (name !== undefined) fee.name = String(name).trim();
  if (description !== undefined) fee.description = description?.trim() || undefined;
  if (defaultAmount !== undefined) fee.defaultAmount = Number(defaultAmount) || 0;
  if (icon !== undefined) fee.icon = icon?.trim() || undefined;
  if (isActive !== undefined) fee.isActive = Boolean(isActive);
  if (sortOrder !== undefined) fee.sortOrder = Number(sortOrder) || 0;

  if (code !== undefined) {
    const feeCode = normalizeFeeCode(code);
    if (!feeCode) return res.status(400).json({ message: 'Invalid fee code' });
    if (feeCode !== fee.code) {
      const inUse = await isFeeCodeInUse(fee.code);
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

router.delete('/fees/:id', authorize(UserRole.ADMIN), async (req, res: Response) => {
  const repo = AppDataSource.getRepository(SchoolFee);
  const fee = await repo.findOne({ where: { id: req.params.id } });
  if (!fee) return res.status(404).json({ message: 'Fee not found' });

  const inUse = await isFeeCodeInUse(fee.code);
  if (inUse) {
    return res.status(400).json({
      message: 'This fee is linked to invoices or payments. Deactivate it instead of deleting.',
    });
  }

  await repo.delete({ id: fee.id });
  res.json({ message: 'Fee deleted' });
});

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
  const studentRepo = AppDataSource.getRepository(Student);
  const { lines, ...data } = req.body;

  const student = await studentRepo.findOne({
    where: { id: data.studentId },
    relations: relations('schoolClass'),
  });
  if (!student) return res.status(404).json({ message: 'Student not found' });

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

  const branding = await loadSchoolBranding();
  let termName: string | undefined;
  if (data.termId) {
    const term = await AppDataSource.getRepository(Term).findOne({ where: { id: data.termId } });
    termName = term?.name;
  }

  const invoiceLines =
    lines?.map((l: { description: string; quantity?: number; unitPrice?: number; amount: number }) => ({
      description: l.description,
      quantity: l.quantity ?? 1,
      unitPrice: l.unitPrice ?? l.amount,
      amount: Number(l.amount),
    })) ?? [{ description: data.description, quantity: 1, unitPrice: totalAmount, amount: Number(totalAmount) }];

  const pdfPath = await generateInvoicePdf({
    invoiceNumber: invoice.invoiceNumber,
    studentName: `${student.firstName} ${student.lastName}`,
    admissionNumber: student.admissionNumber,
    className: student.schoolClass?.name || 'N/A',
    description: data.description,
    feeType: data.feeType,
    issuedDate: invoice.issuedDate || today(),
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

router.post('/payments', authorize(UserRole.ADMIN), async (req: AuthRequest, res: Response) => {
  const { studentId, invoiceId, amount, method, feeType, label, notes } = req.body;
  const paymentAmount = Number(amount) || 0;
  if (paymentAmount <= 0) {
    return res.status(400).json({ message: 'Payment amount must be greater than zero' });
  }

  const studentRepo = AppDataSource.getRepository(Student);
  const student = await studentRepo.findOne({
    where: { id: studentId },
    relations: relations('schoolClass', 'schoolClass.form', 'guardians'),
  });
  if (!student) return res.status(404).json({ message: 'Student not found' });

  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    const paymentRepo = queryRunner.manager.getRepository(Payment);
    const invoiceRepo = queryRunner.manager.getRepository(Invoice);
    const ledgerRepo = queryRunner.manager.getRepository(LedgerEntry);
    const cashbookRepo = queryRunner.manager.getRepository(CashbookEntry);
    const receiptRepo = queryRunner.manager.getRepository(Receipt);
    const notifRepo = queryRunner.manager.getRepository(Notification);

    const payment = await paymentRepo.save(paymentRepo.create({
      paymentReference: generateNumber('PAY'),
      studentId,
      invoiceId,
      amount: paymentAmount,
      method: method as PaymentMethod,
      feeType,
      label,
      notes,
      recordedById: req.user!.userId,
    }));

    let ledgerTermId: string | undefined;
    if (invoiceId) {
      const invoice = await invoiceRepo.findOne({ where: { id: invoiceId, studentId } });
      if (invoice) {
        ledgerTermId = invoice.termId || undefined;
        invoice.amountPaid = Number(invoice.amountPaid) + paymentAmount;
        invoice.status = Number(invoice.amountPaid) >= Number(invoice.totalAmount)
          ? InvoiceStatus.PAID
          : InvoiceStatus.PARTIAL;
        await invoiceRepo.save(invoice);
      }
    } else {
      // Auto-allocate payment against outstanding invoices (oldest first).
      let remaining = paymentAmount;
      const outstanding = await invoiceRepo.find({
        where: { studentId },
        order: { dueDate: 'ASC', createdAt: 'ASC' },
      });
      for (const inv of outstanding) {
        if (remaining <= 0) break;
        const due = Math.max(0, Number(inv.totalAmount) - Number(inv.amountPaid));
        if (due <= 0) continue;
        const applied = Math.min(due, remaining);
        inv.amountPaid = Number(inv.amountPaid) + applied;
        inv.status = Number(inv.amountPaid) >= Number(inv.totalAmount)
          ? InvoiceStatus.PAID
          : InvoiceStatus.PARTIAL;
        await invoiceRepo.save(inv);
        if (!ledgerTermId && inv.termId) ledgerTermId = inv.termId;
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
      termId: ledgerTermId,
      entryDate: today(),
      description: `Payment - ${label}`,
      debit: 0,
      credit: paymentAmount,
      balance: prevBalance - paymentAmount,
      referenceType: 'payment',
      referenceId: payment.id,
    }));

    const lastCash = await findLatest(cashbookRepo);
    const cashBalance = lastCash ? Number(lastCash.balance) : 0;
    await cashbookRepo.save(
      cashbookRepo.create({
        entryDate: today(),
        type: 'receipt' as never,
        description: `${label} - ${student.firstName} ${student.lastName}`,
        moneyIn: paymentAmount,
        moneyOut: 0,
        balance: cashBalance + paymentAmount,
        paymentMethod: method,
        reference: payment.paymentReference,
        studentId,
        recordedById: req.user!.userId,
      }),
    );

    const branding = await loadSchoolBranding();
    const receiptNumber = generateNumber('RCP');
    const pdfPath = await generateReceiptPdf({
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

    await queryRunner.commitTransaction();

    const primaryGuardian = student.guardians?.find((g) => g.isPrimary) || student.guardians?.[0];
    if (primaryGuardian?.phone) {
      try {
        await sendWhatsAppReminder(
          primaryGuardian.phone,
          `Payment received for ${student.firstName}: $${paymentAmount} (${label}). Receipt: ${receiptNumber}`,
        );
      } catch {
        // WhatsApp delivery should not rollback successful accounting writes.
      }
    }

    return res.status(201).json({ payment, receipt });
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
});

router.get('/receipts/:id/pdf', authorize(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.PRINCIPAL, UserRole.PARENT), async (req, res: Response) => {
  const repo = AppDataSource.getRepository(Receipt);
  const receipt = await repo.findOne({
    where: { id: req.params.id },
    relations: relations('payment', 'payment.student', 'payment.student.schoolClass'),
  });
  if (!receipt?.payment?.student) {
    return res.status(404).json({ message: 'Receipt not found' });
  }

  const branding = await loadSchoolBranding();
  const p = receipt.payment;
  const s = p.student;
  const pdfPath = await generateReceiptPdf({
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

  res.sendFile(path.resolve(pdfPath));
});

router.get('/invoices/:id/pdf', authorize(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.PRINCIPAL, UserRole.PARENT), async (req, res: Response) => {
  const repo = AppDataSource.getRepository(Invoice);
  const invoice = await repo.findOne({
    where: { id: req.params.id },
    relations: relations('student', 'student.schoolClass', 'lines', 'term'),
  });
  if (!invoice?.student) {
    return res.status(404).json({ message: 'Invoice not found' });
  }

  if (req.user!.role === UserRole.PARENT) {
    const children = await AppDataSource.query(
      `SELECT "studentId" FROM guardians WHERE "parentId" = $1`,
      [req.user!.parentId],
    );
    const ids = children.map((c: { studentId: string }) => c.studentId);
    if (!ids.includes(invoice.studentId)) {
      return res.status(403).json({ message: 'Access denied' });
    }
  }

  const branding = await loadSchoolBranding();
  const s = invoice.student;
  const lines =
    invoice.lines?.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unitPrice: Number(l.unitPrice),
      amount: Number(l.amount),
    })) ??
    [{ description: invoice.description, quantity: 1, unitPrice: Number(invoice.totalAmount), amount: Number(invoice.totalAmount) }];

  const pdfPath = await generateInvoicePdf({
    invoiceNumber: invoice.invoiceNumber,
    studentName: `${s.firstName} ${s.lastName}`,
    admissionNumber: s.admissionNumber,
    className: s.schoolClass?.name || 'N/A',
    description: invoice.description,
    feeType: invoice.feeType,
    issuedDate: invoice.issuedDate || today(),
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

  res.sendFile(path.resolve(pdfPath));
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

router.get('/reports/student-ledger', authorize(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.PRINCIPAL), async (req, res: Response) => {
  const termId = String(req.query.termId || '').trim();
  const q = String(req.query.q || '').trim();
  const studentId = String(req.query.studentId || '').trim();

  if (!termId) {
    return res.status(400).json({ message: 'termId is required' });
  }

  const term = await AppDataSource.getRepository(Term).findOne({ where: { id: termId } });
  if (!term) return res.status(404).json({ message: 'Term not found' });

  let targetStudentId = studentId;
  if (!targetStudentId) {
    if (!q) {
      return res.status(400).json({ message: 'Enter Student ID, first name, or last name' });
    }
    const matches = await searchStudents(q);
    if (!matches.length) {
      return res.status(404).json({ message: 'No matching student found' });
    }
    if (matches.length > 1) {
      return res.json({ needsSelection: true, term: { id: term.id, name: term.name }, matches });
    }
    targetStudentId = matches[0].id;
  }

  const report = await buildStudentLedgerReport(targetStudentId, termId);
  if (!report) return res.status(404).json({ message: 'Student not found' });

  return res.json({ needsSelection: false, report });
});

router.get('/reports/outstanding-invoices', authorize(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.PRINCIPAL), async (_req, res: Response) => {
  const data = await buildOutstandingInvoicesReport();
  res.json(data);
});

function reconciliationQueryParams(req: { query: Record<string, unknown> }) {
  return {
    dateFrom: String(req.query.dateFrom || '').trim() || undefined,
    dateTo: String(req.query.dateTo || '').trim() || undefined,
    termId: String(req.query.termId || '').trim() || undefined,
    formId: String(req.query.formId || '').trim() || undefined,
    classId: String(req.query.classId || '').trim() || undefined,
    studentId: String(req.query.studentId || '').trim() || undefined,
    q: String(req.query.q || '').trim() || undefined,
    feeType: String(req.query.feeType || '').trim() || undefined,
    detailed: req.query.detailed !== 'false',
  };
}

router.get('/reports/student-reconciliation', authorize(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.PRINCIPAL), async (req, res: Response) => {
  const result = await buildStudentReconciliationReport(reconciliationQueryParams(req));
  if ('error' in result) return res.status(400).json({ message: result.error });
  if ('needsSelection' in result) return res.json(result);
  res.json(result);
});

router.get('/reports/student-reconciliation/export.pdf', authorize(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.PRINCIPAL), async (req, res: Response) => {
  const detailed = req.query.mode !== 'summary';
  const result = await buildStudentReconciliationReport({
    ...reconciliationQueryParams(req),
    detailed,
  });
  if ('error' in result) return res.status(400).json({ message: result.error });
  if ('needsSelection' in result) {
    return res.status(400).json({ message: 'Multiple students match — select one student before exporting' });
  }

  const branding = await loadSchoolBranding();
  const pdf = await generateReconciliationPdf({
    ...branding,
    dateFrom: result.filters.dateFrom,
    dateTo: result.filters.dateTo,
    termName: result.filters.termName,
    generatedAt: result.generatedAt,
    summary: result.summary,
    detailed,
    rows: result.students.map((r) => ({
      admissionNumber: r.student.admissionNumber,
      name: `${r.student.firstName} ${r.student.lastName}`,
      classLabel: `${r.student.formName || ''} ${r.student.className || ''}`.trim(),
      status: r.status,
      totalBilled: r.studentModule.totalBilled,
      totalCollected: r.studentModule.totalCollected,
      closingBalance: r.studentModule.closingBalance,
      outstandingBalance: r.studentModule.outstandingBalance,
      variance: r.variance.closingBalanceVariance,
      discrepancies: r.discrepancies,
    })),
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="student-reconciliation-${detailed ? 'detailed' : 'summary'}.pdf"`);
  res.send(pdf);
});

router.get('/reports/student-reconciliation/export.xlsx', authorize(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.PRINCIPAL), async (req, res: Response) => {
  const detailed = req.query.mode !== 'summary';
  const result = await buildStudentReconciliationReport({
    ...reconciliationQueryParams(req),
    detailed,
  });
  if ('error' in result) return res.status(400).json({ message: result.error });
  if ('needsSelection' in result) {
    return res.status(400).json({ message: 'Multiple students match — select one student before exporting' });
  }

  const csv = reconciliationReportToCsv(result, detailed);
  res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="student-reconciliation-${detailed ? 'detailed' : 'summary'}.csv"`);
  res.send(csv);
});

function debtorAgingQueryParams(req: { query: Record<string, unknown> }) {
  return {
    dateFrom: String(req.query.dateFrom || '').trim() || undefined,
    dateTo: String(req.query.dateTo || '').trim() || undefined,
    termId: String(req.query.termId || '').trim() || undefined,
    formId: String(req.query.formId || '').trim() || undefined,
    classId: String(req.query.classId || '').trim() || undefined,
    studentId: String(req.query.studentId || '').trim() || undefined,
    q: String(req.query.q || '').trim() || undefined,
    feeType: String(req.query.feeType || '').trim() || undefined,
    agingBucket: String(req.query.agingBucket || '').trim() || undefined,
    excludeZeroBalances: req.query.excludeZeroBalances !== 'false',
    escalationDays: Number(req.query.escalationDays || 90),
  };
}

router.get('/reports/debtor-aging', authorize(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.PRINCIPAL), async (req, res: Response) => {
  const result = await buildDebtorAgingReport(debtorAgingQueryParams(req));
  if ('error' in result) return res.status(400).json({ message: result.error });
  if ('needsSelection' in result) return res.json(result);
  res.json(result);
});

router.get('/reports/debtor-aging/export.xlsx', authorize(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.PRINCIPAL), async (req, res: Response) => {
  const detailed = req.query.mode !== 'summary';
  const result = await buildDebtorAgingReport(debtorAgingQueryParams(req));
  if ('error' in result) return res.status(400).json({ message: result.error });
  if ('needsSelection' in result) return res.status(400).json({ message: 'Multiple students match — select one before export' });
  const csv = debtorAgingToCsv(result, detailed);
  res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="debtor-aging-${detailed ? 'detailed' : 'summary'}.csv"`);
  res.send(csv);
});

router.get('/reports/debtor-aging/export.pdf', authorize(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.PRINCIPAL), async (req, res: Response) => {
  const detailed = req.query.mode !== 'summary';
  const result = await buildDebtorAgingReport(debtorAgingQueryParams(req));
  if ('error' in result) return res.status(400).json({ message: result.error });
  if ('needsSelection' in result) return res.status(400).json({ message: 'Multiple students match — select one before export' });

  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 34 });
  const chunks: Buffer[] = [];
  doc.on('data', (c) => chunks.push(c));
  doc.on('end', () => {
    const pdf = Buffer.concat(chunks);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="debtor-aging-${detailed ? 'detailed' : 'summary'}.pdf"`);
    res.send(pdf);
  });
  doc.fontSize(15).text('Debtor Aging Report');
  doc.moveDown(0.3);
  doc.fontSize(9).text(`Date: ${result.filters.dateFrom || 'Start'} to ${result.filters.dateTo}`);
  doc.text(`Debtors: ${result.summary.totalDebtors}  |  Outstanding: $${result.summary.totalOutstanding.toFixed(2)}`);
  doc.text(`Buckets: 0-30 $${result.summary.byBucket.current.toFixed(2)} | 31-60 $${result.summary.byBucket['31_60'].toFixed(2)} | 61-90 $${result.summary.byBucket['61_90'].toFixed(2)} | 91-120 $${result.summary.byBucket['91_120'].toFixed(2)} | 120+ $${result.summary.byBucket['120_plus'].toFixed(2)}`);
  doc.moveDown(0.5);
  result.students.slice(0, detailed ? 120 : 60).forEach((s) => {
    doc.fontSize(8).text(
      `${s.admissionNumber}  ${s.firstName} ${s.lastName}  ${s.formName || ''} ${s.className || ''}  Outstanding: $${s.outstandingBalance.toFixed(2)}  120+: $${s.aging['120_plus'].toFixed(2)}  Status: ${s.accountStatus}`,
    );
    if (detailed) {
      doc.fontSize(7).fillColor('#666').text(`Guardian: ${s.guardianName || 'N/A'}  Phone: ${s.guardianPhone || 'N/A'}  Last payment: ${s.lastPaymentDate || 'N/A'}  Escalate: ${s.escalationFlag ? 'Yes' : 'No'}`);
      doc.fillColor('#000');
    }
  });
  doc.end();
});

router.post('/reports/debtor-aging/notes', authorize(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.PRINCIPAL), async (req: AuthRequest, res: Response) => {
  const { studentId, note } = req.body || {};
  if (!studentId || !String(note || '').trim()) return res.status(400).json({ message: 'studentId and note are required' });
  const notifRepo = AppDataSource.getRepository(Notification);
  const saved = await notifRepo.save(notifRepo.create({
    userId: req.user!.userId,
    title: 'Debtor Follow-up Note',
    message: String(note).trim(),
    type: 'debtor_note',
    metadata: { studentId, createdBy: req.user!.userId },
  }));
  res.status(201).json(saved);
});

router.get('/reports/debtor-aging/notes/:studentId', authorize(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.PRINCIPAL), async (req, res: Response) => {
  const rows = await AppDataSource.getRepository(Notification).find({
    where: { type: 'debtor_note' },
    order: { createdAt: 'DESC' },
  });
  res.json(rows.filter((r) => (r.metadata as Record<string, unknown>)?.studentId === req.params.studentId));
});

function feeCollectionQueryParams(req: { query: Record<string, unknown> }, summaryOnly = false) {
  return {
    dateFrom: String(req.query.dateFrom || '').trim() || undefined,
    dateTo: String(req.query.dateTo || '').trim() || undefined,
    termId: String(req.query.termId || '').trim() || undefined,
    formId: String(req.query.formId || '').trim() || undefined,
    classId: String(req.query.classId || '').trim() || undefined,
    studentId: String(req.query.studentId || '').trim() || undefined,
    q: String(req.query.q || '').trim() || undefined,
    feeType: String(req.query.feeType || '').trim() || undefined,
    paymentMethod: String(req.query.paymentMethod || '').trim() || undefined,
    collectionStatus: String(req.query.collectionStatus || '').trim() as '' | 'fully_paid' | 'partial' | 'unpaid',
    compareDateFrom: String(req.query.compareDateFrom || '').trim() || undefined,
    compareDateTo: String(req.query.compareDateTo || '').trim() || undefined,
    compareTermId: String(req.query.compareTermId || '').trim() || undefined,
    summaryOnly,
  };
}

router.get('/reports/fee-collection-revenue', authorize(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.PRINCIPAL), async (req: AuthRequest, res: Response) => {
  const summaryOnly = req.user!.role === UserRole.PRINCIPAL;
  const result = await buildFeeCollectionRevenueReport(feeCollectionQueryParams(req, summaryOnly));
  if ('error' in result) return res.status(400).json({ message: result.error });
  if ('needsSelection' in result) return res.json(result);
  res.json({ ...result, accessLevel: summaryOnly ? 'summary' : 'full' });
});

router.get('/reports/fee-collection-revenue/export.xlsx', authorize(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.PRINCIPAL), async (req: AuthRequest, res: Response) => {
  const summaryOnly = req.user!.role === UserRole.PRINCIPAL;
  const detailed = !summaryOnly && req.query.mode !== 'summary';
  const result = await buildFeeCollectionRevenueReport(feeCollectionQueryParams(req, summaryOnly));
  if ('error' in result) return res.status(400).json({ message: result.error });
  if ('needsSelection' in result) return res.status(400).json({ message: 'Multiple students match — select one before export' });
  const csv = feeCollectionReportToCsv(result, detailed);
  res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="fee-collection-revenue-${detailed ? 'detailed' : 'summary'}.csv"`);
  res.send(csv);
});

router.get('/reports/fee-collection-revenue/export.pdf', authorize(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.PRINCIPAL), async (req: AuthRequest, res: Response) => {
  const summaryOnly = req.user!.role === UserRole.PRINCIPAL;
  const detailed = !summaryOnly && req.query.mode !== 'summary';
  const result = await buildFeeCollectionRevenueReport(feeCollectionQueryParams(req, summaryOnly));
  if ('error' in result) return res.status(400).json({ message: result.error });
  if ('needsSelection' in result) return res.status(400).json({ message: 'Multiple students match — select one before export' });

  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 34 });
  const chunks: Buffer[] = [];
  doc.on('data', (c) => chunks.push(c));
  doc.on('end', () => {
    const pdf = Buffer.concat(chunks);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="fee-collection-revenue-${detailed ? 'detailed' : 'summary'}.pdf"`);
    res.send(pdf);
  });
  const o = result.overview;
  doc.fontSize(15).text('Fee Collection & Revenue Report');
  doc.moveDown(0.3);
  doc.fontSize(9).text(`Period: ${result.filters.dateFrom} to ${result.filters.dateTo}`);
  if (result.filters.termName) doc.text(`Term: ${result.filters.termName}`);
  doc.text(`Expected: $${o.totalExpected.toFixed(2)}  |  Collected: $${o.totalCollected.toFixed(2)}  |  Outstanding: $${o.totalOutstanding.toFixed(2)}  |  Rate: ${o.collectionRatePct}%`);
  doc.text(`Paid in full: ${o.studentsPaidInFull}  |  Partial: ${o.studentsPartial}  |  Unpaid: ${o.studentsUnpaid}`);
  if (result.compareOverview) {
    const c = result.compareOverview;
    doc.text(`Compare period — Expected: $${c.totalExpected.toFixed(2)}  Collected: $${c.totalCollected.toFixed(2)}  Rate: ${c.collectionRatePct}%`);
  }
  doc.moveDown(0.4);
  doc.text(`Projected end-of-term collection: $${result.projections.projectedEndOfTermCollection.toFixed(2)}  Shortfall: $${result.projections.projectedShortfall.toFixed(2)}`);
  doc.moveDown(0.5);
  if (detailed && result.daily.length) {
    doc.fontSize(10).text('Daily collections (sample)');
    result.daily.slice(0, 14).forEach((day) => {
      doc.fontSize(8).text(`${day.date}: $${day.dayTotal.toFixed(2)} (${day.payments.length} payments${day.reversedCount ? `, ${day.reversedCount} reversed` : ''})`);
    });
  }
  doc.moveDown(0.3);
  doc.fontSize(10).text('By fee category');
  result.byCategory.slice(0, 12).forEach((c) => {
    doc.fontSize(8).text(`${c.label}: expected $${c.expected.toFixed(2)}  collected $${c.collected.toFixed(2)}  (${c.collectionRatePct}%)`);
  });
  doc.end();
});

router.post('/reports/fee-collection-revenue/schedule', authorize(UserRole.ADMIN, UserRole.DIRECTOR), async (req: AuthRequest, res: Response) => {
  const { frequency, emails, mode } = req.body || {};
  const freq = String(frequency || '').toLowerCase();
  if (!['daily', 'weekly', 'monthly'].includes(freq)) {
    return res.status(400).json({ message: 'frequency must be daily, weekly, or monthly' });
  }
  const recipients = String(emails || '')
    .split(/[,;]/)
    .map((e: string) => e.trim())
    .filter(Boolean);
  if (!recipients.length) return res.status(400).json({ message: 'At least one email recipient is required' });
  const notifRepo = AppDataSource.getRepository(Notification);
  const saved = await notifRepo.save(notifRepo.create({
    userId: req.user!.userId,
    title: 'Fee Collection Report Schedule',
    message: `Scheduled ${freq} ${mode || 'summary'} report to ${recipients.join(', ')}`,
    type: 'fee_collection_schedule',
    metadata: { frequency: freq, emails: recipients, mode: mode || 'summary', createdBy: req.user!.userId },
  }));
  res.status(201).json({ message: 'Report schedule saved. Delivery runs when email (SMTP) is configured.', schedule: saved });
});

router.post('/reports/debtor-aging/write-off', authorize(UserRole.ADMIN), async (req: AuthRequest, res: Response) => {
  const { studentId, reason, approvedBy } = req.body || {};
  if (!studentId || !String(reason || '').trim() || !String(approvedBy || '').trim()) {
    return res.status(400).json({ message: 'studentId, reason, and approvedBy are required' });
  }
  const invoiceRepo = AppDataSource.getRepository(Invoice);
  const ledgerRepo = AppDataSource.getRepository(LedgerEntry);
  const notifRepo = AppDataSource.getRepository(Notification);
  const invoices = await invoiceRepo.find({ where: { studentId } });
  let totalWrittenOff = 0;
  for (const inv of invoices) {
    const due = Math.max(0, Number(inv.totalAmount) - Number(inv.amountPaid));
    if (due <= 0.005) continue;
    inv.amountPaid = Number(inv.totalAmount);
    inv.status = InvoiceStatus.CANCELLED;
    await invoiceRepo.save(inv);
    totalWrittenOff += due;
  }
  if (totalWrittenOff > 0) {
    const last = await ledgerRepo.findOne({ where: { studentId }, order: { createdAt: 'DESC' } });
    await ledgerRepo.save(ledgerRepo.create({
      studentId,
      entryDate: today(),
      description: `Debt write-off approved by ${approvedBy}: ${reason}`,
      debit: 0,
      credit: totalWrittenOff,
      balance: Number(last?.balance || 0) - totalWrittenOff,
      referenceType: 'writeoff',
      referenceId: studentId,
    }));
  }
  await notifRepo.save(notifRepo.create({
    userId: req.user!.userId,
    title: 'Debt Write-off',
    message: `Write-off of $${totalWrittenOff.toFixed(2)} approved by ${approvedBy}. Reason: ${reason}`,
    type: 'debt_writeoff',
    metadata: { studentId, approvedBy, reason, totalWrittenOff },
  }));
  res.json({ studentId, totalWrittenOff });
});

router.get('/reports/debtor-aging/reminder-letter.pdf', authorize(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.PRINCIPAL), async (req, res: Response) => {
  const studentId = String(req.query.studentId || '').trim();
  if (!studentId) return res.status(400).json({ message: 'studentId is required' });
  const report = await buildDebtorAgingReport({ studentId, dateTo: today(), excludeZeroBalances: false });
  if ('error' in report || 'needsSelection' in report || !report.students.length) {
    return res.status(404).json({ message: 'Student debtor record not found' });
  }
  const s = report.students[0];
  const doc = new PDFDocument({ size: 'A4', margin: 48 });
  const chunks: Buffer[] = [];
  doc.on('data', (c) => chunks.push(c));
  doc.on('end', () => {
    const pdf = Buffer.concat(chunks);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="fee-reminder-${s.admissionNumber}.pdf"`);
    res.send(pdf);
  });
  doc.fontSize(14).text('Fee Reminder Letter');
  doc.moveDown(0.7);
  doc.fontSize(11).text(`Student: ${s.firstName} ${s.lastName} (${s.admissionNumber})`);
  doc.text(`Class: ${s.formName || ''} ${s.className || ''}`);
  doc.text(`Guardian: ${s.guardianName || 'N/A'}  Phone: ${s.guardianPhone || 'N/A'}`);
  doc.moveDown(0.6);
  doc.text(`Outstanding balance: $${s.outstandingBalance.toFixed(2)}`);
  doc.text(`Current: $${s.aging.current.toFixed(2)} | 31-60: $${s.aging['31_60'].toFixed(2)} | 61-90: $${s.aging['61_90'].toFixed(2)} | 91-120: $${s.aging['91_120'].toFixed(2)} | 120+: $${s.aging['120_plus'].toFixed(2)}`);
  doc.moveDown(0.9);
  doc.text('Dear Parent/Guardian,');
  doc.text('This is a reminder that the above student account has outstanding school fees. Kindly settle the balance or contact the finance office to agree a payment plan.');
  doc.moveDown(1.2);
  doc.text('Finance Office');
  doc.end();
});

router.get('/student-balance', authorize(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.PRINCIPAL), async (req, res: Response) => {
  const rawQ = String(req.query.q || '').trim();
  if (!rawQ) {
    return res.status(400).json({ message: 'Query is required' });
  }

  const q = `%${rawQ.replace(/\s+/g, '%')}%`;
  const result = await AppDataSource.query(
    `
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
    `,
    [rawQ, q],
  );

  res.json(result.map((r: any) => ({
    ...r,
    totalInvoiced: Number(r.totalInvoiced || 0),
    totalPaid: Number(r.totalPaid || 0),
    balance: Number(r.balance || 0),
  })));
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


