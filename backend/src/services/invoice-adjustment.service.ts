import { AppDataSource } from '../config/data-source';
import { Invoice, InvoiceAdjustment, InvoiceLine, LedgerEntry, Student } from '../entities';
import { InvoiceAdjustmentType, InvoiceStatus } from '../entities/enums';
import { generateNumber, today } from '../utils/helpers';
import { relations } from '../utils/typeorm-helpers';
import {
  BALANCE_FORWARD_FEE_TYPE,
  ensureTermBalanceInitialized,
  refreshTermClosingBalance,
  roundMoney,
} from './term-balance.service';

export interface AdjustmentStudentLookup {
  id: string;
  admissionNumber: string;
  firstName: string;
  lastName: string;
  gender?: string;
  className?: string;
  invoiceBalance: number;
}

export interface InvoiceAdjustmentResult {
  noteNumber: string;
  type: InvoiceAdjustmentType;
  amount: number;
  studentId: string;
  invoiceBalanceBefore: number;
  invoiceBalanceAfter: number;
  affectedInvoices: Array<{ invoiceNumber: string; applied: number }>;
}

function refreshInvoiceStatus(invoice: Invoice): void {
  const paid = roundMoney(Number(invoice.amountPaid));
  const total = roundMoney(Number(invoice.totalAmount));
  if (total <= 0 || paid >= total) {
    invoice.status = InvoiceStatus.PAID;
    return;
  }
  if (paid > 0) {
    invoice.status = InvoiceStatus.PARTIAL;
    return;
  }
  if (invoice.status === InvoiceStatus.OVERDUE) {
    invoice.status = InvoiceStatus.OVERDUE;
    return;
  }
  invoice.status = InvoiceStatus.SENT;
}

async function fetchStudentInvoiceBalance(studentId: string): Promise<number> {
  const result = await AppDataSource.query(
    `
      SELECT COALESCE(SUM(GREATEST("totalAmount" - "amountPaid", 0)), 0) as owed
      FROM invoices
      WHERE "studentId" = $1
        AND status IN ('sent', 'partial', 'overdue')
    `,
    [studentId],
  );
  return roundMoney(Math.max(0, Number(result[0]?.owed || 0)));
}

export async function lookupStudentForAdjustment(rawQ: string): Promise<AdjustmentStudentLookup[]> {
  const q = String(rawQ || '').trim();
  if (!q) return [];

  const pattern = `%${q.replace(/\s+/g, '%')}%`;
  const rows = await AppDataSource.query(
    `
      SELECT
        s.id,
        s."admissionNumber",
        s."firstName",
        s."lastName",
        s.gender,
        c.name as "className"
      FROM students s
      LEFT JOIN classes c ON c.id = s."classId"
      WHERE
        s."isActive" = true
        AND (
          s.id::text = $1
          OR s."admissionNumber" ILIKE $2
          OR s."firstName" ILIKE $2
          OR s."lastName" ILIKE $2
          OR CONCAT(s."firstName", ' ', s."lastName") ILIKE $2
        )
      ORDER BY s."lastName" ASC, s."firstName" ASC
      LIMIT 20
    `,
    [q, pattern],
  );

  const results: AdjustmentStudentLookup[] = [];
  for (const row of rows) {
    const invoiceBalance = await fetchStudentInvoiceBalance(String(row.id));
    results.push({
      id: String(row.id),
      admissionNumber: String(row.admissionNumber),
      firstName: String(row.firstName),
      lastName: String(row.lastName),
      gender: row.gender ? String(row.gender) : undefined,
      className: row.className ? String(row.className) : undefined,
      invoiceBalance,
    });
  }
  return results;
}

async function loadOutstandingInvoices(studentId: string): Promise<Invoice[]> {
  const invoiceRepo = AppDataSource.getRepository(Invoice);
  const invoices = await invoiceRepo.find({
    where: { studentId },
    relations: relations('lines'),
    order: { dueDate: 'ASC', createdAt: 'ASC' },
  });
  return invoices.filter((inv) => {
    if (inv.feeType === BALANCE_FORWARD_FEE_TYPE) return false;
    if (!['sent', 'partial', 'overdue'].includes(inv.status)) return false;
    return roundMoney(Number(inv.totalAmount) - Number(inv.amountPaid)) > 0;
  });
}

async function loadDebitTargetInvoice(studentId: string): Promise<Invoice | null> {
  const outstanding = await loadOutstandingInvoices(studentId);
  if (outstanding.length) return outstanding[0];

  const invoiceRepo = AppDataSource.getRepository(Invoice);
  const invoices = await invoiceRepo.find({
    where: { studentId },
    relations: relations('lines'),
    order: { createdAt: 'DESC' },
  });
  return (
    invoices.find(
      (inv) => inv.status !== InvoiceStatus.CANCELLED && inv.feeType !== BALANCE_FORWARD_FEE_TYPE,
    ) || null
  );
}

async function appendLedgerEntry(input: {
  studentId: string;
  termId?: string;
  description: string;
  debit: number;
  credit: number;
  referenceType: string;
  referenceId: string;
}): Promise<void> {
  const ledgerRepo = AppDataSource.getRepository(LedgerEntry);
  const lastLedger = await ledgerRepo.findOne({
    where: { studentId: input.studentId },
    order: { createdAt: 'DESC' },
  });
  const prevBalance = lastLedger ? Number(lastLedger.balance) : 0;
  await ledgerRepo.save(
    ledgerRepo.create({
      studentId: input.studentId,
      termId: input.termId,
      entryDate: today(),
      description: input.description,
      debit: roundMoney(input.debit),
      credit: roundMoney(input.credit),
      balance: roundMoney(prevBalance + input.debit - input.credit),
      referenceType: input.referenceType,
      referenceId: input.referenceId,
    }),
  );
}

export async function applyCreditNote(input: {
  studentId: string;
  amount: number;
  reason?: string;
  recordedById?: string;
}): Promise<InvoiceAdjustmentResult> {
  const amount = roundMoney(Number(input.amount));
  if (!input.studentId) throw new Error('Student is required.');
  if (amount <= 0) throw new Error('Credit note amount must be greater than zero.');

  const student = await AppDataSource.getRepository(Student).findOne({
    where: { id: input.studentId, isActive: true },
  });
  if (!student) throw new Error('Student not found or inactive.');

  const balanceBefore = await fetchStudentInvoiceBalance(input.studentId);
  if (balanceBefore <= 0) {
    throw new Error('Student has no outstanding invoice balance to credit.');
  }
  if (amount > balanceBefore + 0.005) {
    throw new Error(`Credit amount cannot exceed the current invoice balance of $${balanceBefore.toFixed(2)}.`);
  }

  const invoiceRepo = AppDataSource.getRepository(Invoice);
  const lineRepo = AppDataSource.getRepository(InvoiceLine);
  const adjustmentRepo = AppDataSource.getRepository(InvoiceAdjustment);
  const outstanding = await loadOutstandingInvoices(input.studentId);

  const noteNumber = generateNumber('CN');
  const reason = input.reason?.trim() || 'Credit note adjustment';
  const adjustment = await adjustmentRepo.save(
    adjustmentRepo.create({
      noteNumber,
      studentId: input.studentId,
      type: InvoiceAdjustmentType.CREDIT_NOTE,
      amount,
      reason,
      recordedById: input.recordedById,
    }),
  );

  let remaining = amount;
  const affectedInvoices: Array<{ invoiceNumber: string; applied: number }> = [];
  let primaryTermId: string | undefined;

  for (const invoice of outstanding) {
    if (remaining <= 0) break;
    const due = roundMoney(Number(invoice.totalAmount) - Number(invoice.amountPaid));
    if (due <= 0) continue;

    const applied = roundMoney(Math.min(due, remaining));
    invoice.totalAmount = roundMoney(Number(invoice.totalAmount) - applied);
    refreshInvoiceStatus(invoice);
    await invoiceRepo.save(invoice);

    await lineRepo.save(
      lineRepo.create({
        invoiceId: invoice.id,
        description: `${noteNumber} — ${reason}`,
        quantity: 1,
        unitPrice: -applied,
        amount: -applied,
      }),
    );

    affectedInvoices.push({ invoiceNumber: invoice.invoiceNumber, applied });
    if (!primaryTermId && invoice.termId) primaryTermId = invoice.termId;
    remaining = roundMoney(remaining - applied);

    if (invoice.termId) {
      await refreshTermClosingBalance(input.studentId, invoice.termId);
    }
  }

  await appendLedgerEntry({
    studentId: input.studentId,
    termId: primaryTermId,
    description: `Credit note ${noteNumber} — ${reason}`,
    debit: 0,
    credit: amount,
    referenceType: 'credit_note',
    referenceId: adjustment.id,
  });

  if (primaryTermId) {
    await ensureTermBalanceInitialized(input.studentId, primaryTermId);
    await refreshTermClosingBalance(input.studentId, primaryTermId);
  }

  const balanceAfter = await fetchStudentInvoiceBalance(input.studentId);
  return {
    noteNumber,
    type: InvoiceAdjustmentType.CREDIT_NOTE,
    amount,
    studentId: input.studentId,
    invoiceBalanceBefore: balanceBefore,
    invoiceBalanceAfter: balanceAfter,
    affectedInvoices,
  };
}

export async function applyDebitNote(input: {
  studentId: string;
  amount: number;
  reason?: string;
  recordedById?: string;
}): Promise<InvoiceAdjustmentResult> {
  const amount = roundMoney(Number(input.amount));
  if (!input.studentId) throw new Error('Student is required.');
  if (amount <= 0) throw new Error('Debit note amount must be greater than zero.');

  const student = await AppDataSource.getRepository(Student).findOne({
    where: { id: input.studentId, isActive: true },
  });
  if (!student) throw new Error('Student not found or inactive.');

  const balanceBefore = await fetchStudentInvoiceBalance(input.studentId);
  const invoice = await loadDebitTargetInvoice(input.studentId);
  if (!invoice) {
    throw new Error('No invoice found for this student. Create an invoice before applying a debit note.');
  }

  const invoiceRepo = AppDataSource.getRepository(Invoice);
  const lineRepo = AppDataSource.getRepository(InvoiceLine);
  const adjustmentRepo = AppDataSource.getRepository(InvoiceAdjustment);

  const noteNumber = generateNumber('DN');
  const reason = input.reason?.trim() || 'Debit note adjustment';
  const adjustment = await adjustmentRepo.save(
    adjustmentRepo.create({
      noteNumber,
      studentId: input.studentId,
      type: InvoiceAdjustmentType.DEBIT_NOTE,
      amount,
      reason,
      recordedById: input.recordedById,
    }),
  );

  invoice.totalAmount = roundMoney(Number(invoice.totalAmount) + amount);
  refreshInvoiceStatus(invoice);
  await invoiceRepo.save(invoice);

  await lineRepo.save(
    lineRepo.create({
      invoiceId: invoice.id,
      description: `${noteNumber} — ${reason}`,
      quantity: 1,
      unitPrice: amount,
      amount,
    }),
  );

  await appendLedgerEntry({
    studentId: input.studentId,
    termId: invoice.termId || undefined,
    description: `Debit note ${noteNumber} — ${reason}`,
    debit: amount,
    credit: 0,
    referenceType: 'debit_note',
    referenceId: adjustment.id,
  });

  if (invoice.termId) {
    await ensureTermBalanceInitialized(input.studentId, invoice.termId);
    await refreshTermClosingBalance(input.studentId, invoice.termId);
  }

  const balanceAfter = await fetchStudentInvoiceBalance(input.studentId);
  return {
    noteNumber,
    type: InvoiceAdjustmentType.DEBIT_NOTE,
    amount,
    studentId: input.studentId,
    invoiceBalanceBefore: balanceBefore,
    invoiceBalanceAfter: balanceAfter,
    affectedInvoices: [{ invoiceNumber: invoice.invoiceNumber, applied: amount }],
  };
}
