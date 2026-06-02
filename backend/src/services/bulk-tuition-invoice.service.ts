import { AppDataSource } from '../config/data-source';
import { Form, Invoice, InvoiceLine, LedgerEntry, Payment, Student, StudentTermBalance, Term } from '../entities';
import { InvoiceStatus } from '../entities/enums';
import { generateNumber, today } from '../utils/helpers';
import { relations } from '../utils/typeorm-helpers';
import {
  applyAvailablePrepaidToInvoice,
  ensureTermBalanceInitialized,
  findNextTerm,
  refreshTermClosingBalance,
  roundMoney,
} from './term-balance.service';
import {
  bulkTuitionInvoiceDescription,
  resolveFormLevel,
  resolveTuitionFeeForFormLevel,
} from './registration-invoice.service';

export interface BulkTuitionPreview {
  currentTerm: { id: string; name: string };
  nextTerm: { id: string; name: string };
  studentCount: number;
  alreadyInvoicedCount: number;
  pendingCount: number;
  estimatedTotal: number;
}

export interface BulkTuitionResult extends BulkTuitionPreview {
  created: number;
  skipped: number;
  skippedStudents: Array<{ id: string; name: string; reason: string }>;
  totalBilled: number;
}

function resolveStudentForm(student: Student): Form | null {
  if (student.form) return student.form;
  if (student.schoolClass?.form) return student.schoolClass.form;
  return null;
}

async function loadBillingTerms(): Promise<{ currentTerm: Term; nextTerm: Term }> {
  const termRepo = AppDataSource.getRepository(Term);
  const currentTerm = await termRepo.findOne({ where: { isCurrent: true } });
  if (!currentTerm) {
    throw new Error('No current term is set. Mark a term as current in academic settings.');
  }

  const nextTerm = await findNextTerm(currentTerm);
  if (!nextTerm) {
    throw new Error(
      `No next term found after ${currentTerm.name}. Add the next term in academic settings first.`,
    );
  }

  return { currentTerm, nextTerm };
}

export async function previewBulkTuitionInvoices(): Promise<BulkTuitionPreview> {
  const { currentTerm, nextTerm } = await loadBillingTerms();
  const description = bulkTuitionInvoiceDescription(nextTerm.name);

  const studentRepo = AppDataSource.getRepository(Student);
  const invoiceRepo = AppDataSource.getRepository(Invoice);
  const students = await studentRepo.find({
    where: { isActive: true },
    relations: relations('schoolClass', 'schoolClass.form', 'form'),
    order: { lastName: 'ASC', firstName: 'ASC' },
  });

  const existing = await invoiceRepo.find({
    where: { termId: currentTerm.id, description },
    select: { studentId: true },
  });
  const alreadyInvoiced = new Set(existing.map((inv) => inv.studentId));

  let estimatedTotal = 0;
  let pendingCount = 0;

  for (const student of students) {
    if (alreadyInvoiced.has(student.id)) continue;
    const form = resolveStudentForm(student);
    const level = form ? resolveFormLevel(form) : 1;
    const tuitionFee = await resolveTuitionFeeForFormLevel(level);
    const amount = Number(tuitionFee?.defaultAmount || 0);
    if (amount <= 0) continue;
    estimatedTotal += amount;
    pendingCount += 1;
  }

  return {
    currentTerm: { id: currentTerm.id, name: currentTerm.name },
    nextTerm: { id: nextTerm.id, name: nextTerm.name },
    studentCount: students.length,
    alreadyInvoicedCount: alreadyInvoiced.size,
    pendingCount,
    estimatedTotal: Math.round(estimatedTotal * 100) / 100,
  };
}

export async function createBulkTuitionInvoices(): Promise<BulkTuitionResult> {
  const preview = await previewBulkTuitionInvoices();
  const termRepo = AppDataSource.getRepository(Term);
  const currentTerm = await termRepo.findOne({ where: { id: preview.currentTerm.id } });
  const nextTerm = await termRepo.findOne({ where: { id: preview.nextTerm.id } });
  if (!currentTerm || !nextTerm) {
    throw new Error('Billing terms could not be loaded.');
  }

  const description = bulkTuitionInvoiceDescription(nextTerm.name);
  const dueDate = nextTerm.startDate || today();

  const studentRepo = AppDataSource.getRepository(Student);
  const invoiceRepo = AppDataSource.getRepository(Invoice);
  const lineRepo = AppDataSource.getRepository(InvoiceLine);
  const ledgerRepo = AppDataSource.getRepository(LedgerEntry);

  const students = await studentRepo.find({
    where: { isActive: true },
    relations: relations('schoolClass', 'schoolClass.form', 'form'),
    order: { lastName: 'ASC', firstName: 'ASC' },
  });

  const existing = await invoiceRepo.find({
    where: { termId: currentTerm.id, description },
    select: { studentId: true },
  });
  const alreadyInvoiced = new Set(existing.map((inv) => inv.studentId));

  let created = 0;
  let skipped = 0;
  let totalBilled = 0;
  const skippedStudents: BulkTuitionResult['skippedStudents'] = [];

  for (const student of students) {
    const studentName = `${student.firstName} ${student.lastName}`.trim();

    if (alreadyInvoiced.has(student.id)) {
      skipped += 1;
      skippedStudents.push({ id: student.id, name: studentName, reason: 'Already invoiced for this term' });
      continue;
    }

    const form = resolveStudentForm(student);
    if (!form) {
      skipped += 1;
      skippedStudents.push({ id: student.id, name: studentName, reason: 'No class or form assigned' });
      continue;
    }

    const level = resolveFormLevel(form);
    const tuitionFee = await resolveTuitionFeeForFormLevel(level);
    if (!tuitionFee) {
      skipped += 1;
      skippedStudents.push({ id: student.id, name: studentName, reason: 'Tuition fee not configured' });
      continue;
    }

    const amount = Math.round(Number(tuitionFee.defaultAmount) * 100) / 100;
    if (amount <= 0) {
      skipped += 1;
      skippedStudents.push({
        id: student.id,
        name: studentName,
        reason: 'Tuition fee amount is zero — set it in Manage Fees',
      });
      continue;
    }

    const lineDescription = `${tuitionFee.name} (${nextTerm.name})`;
    let invoice = await invoiceRepo.save(
      invoiceRepo.create({
        invoiceNumber: generateNumber('INV'),
        studentId: student.id,
        termId: currentTerm.id,
        feeType: tuitionFee.code,
        description,
        totalAmount: amount,
        amountPaid: 0,
        status: InvoiceStatus.SENT,
        dueDate,
        issuedDate: today(),
      }),
    );

    await lineRepo.save(
      lineRepo.create({
        invoiceId: invoice.id,
        description: lineDescription,
        quantity: 1,
        unitPrice: amount,
        amount,
      }),
    );

    const lastLedger = await ledgerRepo.findOne({
      where: { studentId: student.id },
      order: { createdAt: 'DESC' },
    });
    const prevBalance = lastLedger ? Number(lastLedger.balance) : 0;
    await ledgerRepo.save(
      ledgerRepo.create({
        studentId: student.id,
        termId: currentTerm.id,
        entryDate: today(),
        description: `Invoice ${invoice.invoiceNumber} - ${description}`,
        debit: amount,
        credit: 0,
        balance: prevBalance + amount,
        referenceType: 'invoice',
        referenceId: invoice.id,
      }),
    );

    await ensureTermBalanceInitialized(student.id, currentTerm.id);
    invoice = await applyAvailablePrepaidToInvoice(invoice);
    await refreshTermClosingBalance(student.id, currentTerm.id);

    created += 1;
    totalBilled += amount;
    alreadyInvoiced.add(student.id);
  }

  return {
    ...preview,
    created,
    skipped,
    skippedStudents,
    totalBilled: Math.round(totalBilled * 100) / 100,
  };
}

export interface BulkTuitionReverseResult {
  description: string;
  billingTermId: string;
  billingTermName: string;
  removed: number;
  skipped: number;
  skippedInvoices: Array<{ invoiceNumber: string; reason: string }>;
  totalReversed: number;
}

async function recomputeLedgerBalances(studentId: string): Promise<void> {
  const ledgerRepo = AppDataSource.getRepository(LedgerEntry);
  const rows = await ledgerRepo.find({
    where: { studentId },
    order: { entryDate: 'ASC', createdAt: 'ASC' },
  });
  let running = 0;
  for (const row of rows) {
    running = roundMoney(running + Number(row.debit) - Number(row.credit));
    row.balance = running;
    await ledgerRepo.save(row);
  }
}

async function reversePrepaidAppliedToInvoice(
  studentId: string,
  termId: string,
  prepaidApplied: number,
): Promise<void> {
  if (prepaidApplied <= 0.005) return;

  const tbRepo = AppDataSource.getRepository(StudentTermBalance);
  const tb = await tbRepo.findOne({ where: { studentId, termId } });
  if (!tb) return;

  let remaining = roundMoney(prepaidApplied);
  const fromOverpay = Math.min(remaining, Number(tb.overpaymentPrepaidApplied));
  tb.overpaymentPrepaidApplied = roundMoney(Math.max(0, Number(tb.overpaymentPrepaidApplied) - fromOverpay));
  remaining = roundMoney(remaining - fromOverpay);
  tb.prepaidApplied = roundMoney(Math.max(0, Number(tb.prepaidApplied) - remaining));
  await tbRepo.save(tb);
}

/** Remove bulk tuition invoices (e.g. "Tuition fees for Term 3") and restore prior balances. */
export async function reverseBulkTuitionInvoices(
  nextTermName?: string,
): Promise<BulkTuitionReverseResult> {
  const termRepo = AppDataSource.getRepository(Term);
  const invoiceRepo = AppDataSource.getRepository(Invoice);
  const lineRepo = AppDataSource.getRepository(InvoiceLine);
  const ledgerRepo = AppDataSource.getRepository(LedgerEntry);
  const paymentRepo = AppDataSource.getRepository(Payment);

  let description: string;
  if (nextTermName) {
    description = bulkTuitionInvoiceDescription(nextTermName);
  } else {
    const { nextTerm } = await loadBillingTerms();
    description = bulkTuitionInvoiceDescription(nextTerm.name);
  }

  const invoices = await invoiceRepo.find({
    where: { description },
    relations: relations('lines'),
    order: { createdAt: 'ASC' },
  });

  if (!invoices.length) {
    throw new Error(`No bulk tuition invoices found with description "${description}".`);
  }

  const billingTermId = invoices[0].termId!;
  const billingTerm = billingTermId
    ? await termRepo.findOne({ where: { id: billingTermId } })
    : null;

  let removed = 0;
  let skipped = 0;
  let totalReversed = 0;
  const skippedInvoices: BulkTuitionReverseResult['skippedInvoices'] = [];
  const affectedStudents = new Set<string>();

  for (const invoice of invoices) {
    const payments = await paymentRepo.find({ where: { invoiceId: invoice.id } });
    const paymentTotal = roundMoney(payments.reduce((s, p) => s + Number(p.amount), 0));
    if (paymentTotal > 0.005) {
      skipped += 1;
      skippedInvoices.push({
        invoiceNumber: invoice.invoiceNumber,
        reason: `Has recorded payments ($${paymentTotal.toFixed(2)})`,
      });
      continue;
    }

    const prepaidOnInvoice = roundMoney(Number(invoice.amountPaid));
    if (invoice.termId && prepaidOnInvoice > 0.005) {
      await reversePrepaidAppliedToInvoice(invoice.studentId, invoice.termId, prepaidOnInvoice);
    }

    await ledgerRepo.delete({ referenceType: 'invoice', referenceId: invoice.id });
    if (invoice.lines?.length) {
      await lineRepo.remove(invoice.lines);
    } else {
      await lineRepo.delete({ invoiceId: invoice.id });
    }

    totalReversed += roundMoney(Number(invoice.totalAmount));
    affectedStudents.add(invoice.studentId);
    await invoiceRepo.remove(invoice);
    removed += 1;
  }

  for (const studentId of affectedStudents) {
    await recomputeLedgerBalances(studentId);
    if (billingTermId) {
      await refreshTermClosingBalance(studentId, billingTermId);
    }
  }

  return {
    description,
    billingTermId: billingTermId || '',
    billingTermName: billingTerm?.name || 'Unknown',
    removed,
    skipped,
    skippedInvoices,
    totalReversed: roundMoney(totalReversed),
  };
}
