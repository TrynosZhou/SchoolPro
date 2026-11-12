import { AppDataSource } from '../config/data-source';
import { In } from 'typeorm';
import { Invoice, InvoiceLine, LedgerEntry, Student, TuitionExemption } from '../entities';
import { InvoiceStatus } from '../entities/enums';
import { TuitionExemptionType } from '../entities/enums';
import { today } from '../utils/helpers';
import { formatGenderLabel, formatStudentClassLabel } from '../utils/class-display';
import { relations } from '../utils/typeorm-helpers';
import {
  BALANCE_FORWARD_FEE_TYPE,
  ensureTermBalanceInitialized,
  refreshTermClosingBalance,
  roundMoney,
} from './term-balance.service';

export interface TuitionExemptionRow {
  id: string;
  studentId: string;
  admissionNumber: string;
  firstName: string;
  lastName: string;
  gender?: string;
  className?: string;
  classLabel?: string;
  exemptionType: TuitionExemptionType;
  value: number;
  reason?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  /** Effect on the student's outstanding balance — only set when an exemption is saved. */
  applied?: ExemptionSyncSummary;
}

export interface ExemptionStudentSearchRow {
  id: string;
  admissionNumber: string;
  firstName: string;
  lastName: string;
  gender?: string;
  className?: string;
  hasExemption: boolean;
}

export interface TuitionExemptionDiscount {
  baseAmount: number;
  discountAmount: number;
  netAmount: number;
  label: string;
}

export function isStaffChildExemption(
  exemption: Pick<TuitionExemption, 'exemptionType'> | null | undefined,
): boolean {
  return exemption?.exemptionType === TuitionExemptionType.STAFF_CHILD;
}

export function formatExemptionLabel(type: TuitionExemptionType, value: number): string {
  if (type === TuitionExemptionType.STAFF_CHILD) {
    return 'Staff child exemption';
  }
  if (type === TuitionExemptionType.PERCENTAGE) {
    return `Tuition exemption (${value}%)`;
  }
  return `Tuition exemption ($${value.toFixed(2)})`;
}

function staffChildDiscountLabel(feeDescription: string): string {
  return `Staff child exemption — ${feeDescription}`;
}

export function computeTuitionExemptionDiscount(
  baseAmount: number,
  exemption: Pick<TuitionExemption, 'exemptionType' | 'value'> | null | undefined,
): TuitionExemptionDiscount {
  const base = roundMoney(Math.max(0, Number(baseAmount || 0)));
  if (!exemption || base <= 0) {
    return { baseAmount: base, discountAmount: 0, netAmount: base, label: '' };
  }

  if (isStaffChildExemption(exemption)) {
    return {
      baseAmount: base,
      discountAmount: base,
      netAmount: 0,
      label: 'Staff child exemption',
    };
  }

  const value = Number(exemption.value || 0);
  let discount = 0;
  if (exemption.exemptionType === TuitionExemptionType.PERCENTAGE) {
    const pct = Math.min(100, Math.max(0, value));
    discount = roundMoney((base * pct) / 100);
  } else {
    discount = roundMoney(Math.min(base, Math.max(0, value)));
  }

  const netAmount = roundMoney(Math.max(0, base - discount));
  return {
    baseAmount: base,
    discountAmount: discount,
    netAmount,
    label: discount > 0 ? formatExemptionLabel(exemption.exemptionType, value) : '',
  };
}

export async function getActiveExemptionForStudent(studentId: string): Promise<TuitionExemption | null> {
  return AppDataSource.getRepository(TuitionExemption).findOne({
    where: { studentId, isActive: true },
  });
}

export async function loadActiveExemptionsMap(studentIds: string[]): Promise<Map<string, TuitionExemption>> {
  const map = new Map<string, TuitionExemption>();
  if (!studentIds.length) return map;

  const rows = await AppDataSource.getRepository(TuitionExemption).find({
    where: { studentId: In(studentIds), isActive: true },
  });
  for (const row of rows) {
    map.set(row.studentId, row);
  }
  return map;
}

export async function searchStudentsForExemption(rawQ: string): Promise<ExemptionStudentSearchRow[]> {
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
        c.name as "className",
        te.id IS NOT NULL as "hasExemption"
      FROM students s
      LEFT JOIN classes c ON c.id = s."classId"
      LEFT JOIN tuition_exemptions te ON te."studentId" = s.id AND te."isActive" = true
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

  return rows.map((r: Record<string, unknown>) => ({
    id: String(r.id),
    admissionNumber: String(r.admissionNumber),
    firstName: String(r.firstName),
    lastName: String(r.lastName),
    gender: formatGenderLabel(r.gender ? String(r.gender) : undefined),
    className: r.className ? String(r.className) : undefined,
    classLabel: formatStudentClassLabel(r.className ? String(r.className) : undefined),
    hasExemption: Boolean(r.hasExemption),
  }));
}

export async function listTuitionExemptions(): Promise<TuitionExemptionRow[]> {
  const rows = await AppDataSource.getRepository(TuitionExemption).find({
    where: { isActive: true },
    relations: relations('student', 'student.schoolClass'),
    order: { updatedAt: 'DESC' },
  });

  return rows.map((row) => ({
    id: row.id,
    studentId: row.studentId,
    admissionNumber: row.student?.admissionNumber || '',
    firstName: row.student?.firstName || '',
    lastName: row.student?.lastName || '',
    gender: formatGenderLabel(row.student?.gender),
    className: row.student?.schoolClass?.name || undefined,
    classLabel: formatStudentClassLabel(row.student?.schoolClass?.name),
    exemptionType: row.exemptionType,
    value: roundMoney(Number(row.value)),
    reason: row.reason || undefined,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

function validateExemptionInput(
  exemptionType: string,
  value: unknown,
): { exemptionType: TuitionExemptionType; value: number } {
  const type = String(exemptionType || '').trim() as TuitionExemptionType;
  if (!Object.values(TuitionExemptionType).includes(type)) {
    throw new Error('Exemption type must be percentage, amount, or staff child.');
  }

  if (type === TuitionExemptionType.STAFF_CHILD) {
    return { exemptionType: type, value: 0 };
  }

  const num = roundMoney(Number(value));
  if (!Number.isFinite(num) || num < 0) {
    throw new Error('Exemption value must be zero or greater.');
  }
  if (type === TuitionExemptionType.PERCENTAGE && num > 100) {
    throw new Error('Percentage exemption cannot exceed 100%.');
  }

  return { exemptionType: type, value: num };
}

export async function upsertTuitionExemption(input: {
  studentId: string;
  exemptionType: string;
  value: number;
  reason?: string;
}): Promise<TuitionExemptionRow> {
  const student = await AppDataSource.getRepository(Student).findOne({
    where: { id: input.studentId, isActive: true },
    relations: relations('schoolClass'),
  });
  if (!student) {
    throw new Error('Student not found or inactive.');
  }

  const parsed = validateExemptionInput(input.exemptionType, input.value);
  const repo = AppDataSource.getRepository(TuitionExemption);
  let row = await repo.findOne({ where: { studentId: input.studentId } });

  if (row) {
    row.exemptionType = parsed.exemptionType;
    row.value = parsed.value;
    row.reason = input.reason?.trim() || undefined;
    row.isActive = true;
  } else {
    row = repo.create({
      studentId: input.studentId,
      exemptionType: parsed.exemptionType,
      value: parsed.value,
      reason: input.reason?.trim() || undefined,
      isActive: true,
    });
  }

  const saved = await repo.save(row);
  const applied = await syncTuitionExemptionToInvoices(saved.studentId);
  return {
    id: saved.id,
    studentId: saved.studentId,
    admissionNumber: student.admissionNumber,
    firstName: student.firstName,
    lastName: student.lastName,
    gender: formatGenderLabel(student.gender),
    className: student.schoolClass?.name || undefined,
    classLabel: formatStudentClassLabel(student.schoolClass?.name),
    exemptionType: saved.exemptionType,
    value: roundMoney(Number(saved.value)),
    reason: saved.reason || undefined,
    isActive: saved.isActive,
    createdAt: saved.createdAt.toISOString(),
    updatedAt: saved.updatedAt.toISOString(),
    applied,
  };
}

export async function removeTuitionExemption(id: string): Promise<ExemptionSyncSummary> {
  const repo = AppDataSource.getRepository(TuitionExemption);
  const row = await repo.findOne({ where: { id } });
  if (!row) {
    throw new Error('Exemption not found.');
  }
  const studentId = row.studentId;
  await repo.remove(row);
  return syncTuitionExemptionToInvoices(studentId);
}

export function buildFeeInvoiceLines(
  feeDescription: string,
  baseAmount: number,
  exemption: TuitionExemption | null | undefined,
): Array<{ description: string; quantity: number; unitPrice: number; amount: number }> {
  const base = roundMoney(Math.max(0, Number(baseAmount || 0)));
  if (!isStaffChildExemption(exemption) || base <= 0) {
    return [{
      description: feeDescription,
      quantity: 1,
      unitPrice: base,
      amount: base,
    }];
  }

  return [
    {
      description: feeDescription,
      quantity: 1,
      unitPrice: base,
      amount: base,
    },
    {
      description: staffChildDiscountLabel(feeDescription),
      quantity: 1,
      unitPrice: -base,
      amount: -base,
    },
  ];
}

export function buildTuitionInvoiceLines(
  tuitionFeeName: string,
  termName: string,
  baseAmount: number,
  exemption: TuitionExemption | null | undefined,
): Array<{ description: string; quantity: number; unitPrice: number; amount: number }> {
  const fullLineDescription = `${tuitionFeeName} (${termName})`;
  if (isStaffChildExemption(exemption)) {
    return buildFeeInvoiceLines(fullLineDescription, baseAmount, exemption);
  }

  const { discountAmount, netAmount, label } = computeTuitionExemptionDiscount(baseAmount, exemption);

  if (discountAmount <= 0) {
    return [{
      description: fullLineDescription,
      quantity: 1,
      unitPrice: netAmount,
      amount: netAmount,
    }];
  }

  return [
    {
      description: fullLineDescription,
      quantity: 1,
      unitPrice: roundMoney(baseAmount),
      amount: roundMoney(baseAmount),
    },
    {
      description: label,
      quantity: 1,
      unitPrice: -discountAmount,
      amount: -discountAmount,
    },
  ];
}

type InvoiceLineInput = { description: string; quantity: number; unitPrice: number; amount: number };

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

function isExemptionLine(line: Pick<InvoiceLine, 'description' | 'amount'>): boolean {
  const desc = String(line.description || '').toLowerCase();
  return Number(line.amount) < 0
    || desc.includes('tuition exemption')
    || desc.includes('staff child exemption');
}

function isTuitionBaseLine(line: Pick<InvoiceLine, 'description' | 'amount'>): boolean {
  const desc = String(line.description || '').toLowerCase();
  return Number(line.amount) > 0 && desc.includes('tuition') && !desc.includes('exemption');
}

function isChargeLine(line: Pick<InvoiceLine, 'description' | 'amount'>): boolean {
  return Number(line.amount) > 0 && !isExemptionLine(line);
}

function toLineInput(line: InvoiceLine): InvoiceLineInput {
  return {
    description: line.description,
    quantity: Number(line.quantity || 1),
    unitPrice: roundMoney(Number(line.unitPrice)),
    amount: roundMoney(Number(line.amount)),
  };
}

function linesEqual(a: InvoiceLineInput[], b: InvoiceLineInput[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (
      a[i].description !== b[i].description
      || roundMoney(a[i].amount) !== roundMoney(b[i].amount)
      || roundMoney(a[i].unitPrice) !== roundMoney(b[i].unitPrice)
    ) {
      return false;
    }
  }
  return true;
}

const EPS = 0.005;

export interface OutstandingBalanceExemption {
  /** Outstanding balance before the exemption is applied. */
  outstanding: number;
  /** Amount taken off the outstanding balance. */
  exemptedAmount: number;
  /** Outstanding balance after the exemption is applied. */
  balanceAfter: number;
  /** True when the whole outstanding balance is written off. */
  fullWriteOff: boolean;
}

/**
 * Work out how much of an outstanding balance an exemption covers.
 *  - Staff child or 100% exemption: the whole outstanding balance is written off.
 *  - Fixed percentage (below 100%): applied to the tuition invoice amount per invoice in
 *    syncTuitionExemptionToInvoices; here it only caps the total at the outstanding balance.
 *  - Fixed amount: the amount is deducted, never more than the outstanding balance.
 */
export function computeOutstandingBalanceExemption(
  outstandingBalance: number,
  exemption: Pick<TuitionExemption, 'exemptionType' | 'value'> | null | undefined,
): OutstandingBalanceExemption {
  const outstanding = roundMoney(Math.max(0, Number(outstandingBalance || 0)));
  if (!exemption || outstanding <= EPS) {
    return { outstanding, exemptedAmount: 0, balanceAfter: outstanding, fullWriteOff: false };
  }

  const value = Number(exemption.value || 0);
  let exempted: number;
  if (isStaffChildExemption(exemption)) {
    exempted = outstanding;
  } else if (exemption.exemptionType === TuitionExemptionType.PERCENTAGE) {
    const pct = Math.min(100, Math.max(0, value));
    exempted = pct >= 100 ? outstanding : roundMoney((outstanding * pct) / 100);
  } else {
    exempted = roundMoney(Math.min(outstanding, Math.max(0, value)));
  }

  exempted = roundMoney(Math.min(outstanding, exempted));
  const balanceAfter = roundMoney(Math.max(0, outstanding - exempted));
  return { outstanding, exemptedAmount: exempted, balanceAfter, fullWriteOff: balanceAfter <= EPS };
}

function outstandingExemptionLineLabel(exemption: TuitionExemption, fullWriteOff: boolean): string {
  if (isStaffChildExemption(exemption)) {
    return 'Staff child exemption — outstanding balance written off';
  }
  const base = formatExemptionLabel(exemption.exemptionType, Number(exemption.value));
  return fullWriteOff
    ? `${base} — outstanding balance written off`
    : `${base} — deducted from invoice balance`;
}

async function appendLedgerAdjustment(input: {
  studentId: string;
  termId?: string;
  invoiceNumber: string;
  invoiceId: string;
  delta: number;
  outstandingBefore: number;
  exemption: TuitionExemption | null;
}): Promise<void> {
  const delta = roundMoney(input.delta);
  if (Math.abs(delta) < EPS) return;

  const ledgerRepo = AppDataSource.getRepository(LedgerEntry);
  const lastLedger = await ledgerRepo.findOne({
    where: { studentId: input.studentId },
    order: { createdAt: 'DESC' },
  });
  const prevBalance = lastLedger ? Number(lastLedger.balance) : 0;

  const isCredit = delta < 0;
  const amount = Math.abs(delta);
  let description: string;
  if (isCredit) {
    const label = input.exemption
      ? formatExemptionLabel(input.exemption.exemptionType, Number(input.exemption.value))
      : 'Tuition exemption';
    const fullWriteOff = amount >= roundMoney(input.outstandingBefore) - EPS;
    description = fullWriteOff
      ? `${label} — $${amount.toFixed(2)} outstanding balance written off on ${input.invoiceNumber}.`
      : `${label} — $${amount.toFixed(2)} deducted from invoice ${input.invoiceNumber} (balance before exemption $${roundMoney(input.outstandingBefore).toFixed(2)}).`;
  } else {
    description = input.exemption && isStaffChildExemption(input.exemption)
      ? `Staff child exemption removed — $${amount.toFixed(2)} restored to ${input.invoiceNumber}.`
      : `Tuition exemption removed or reduced — $${amount.toFixed(2)} restored to ${input.invoiceNumber}.`;
  }

  await ledgerRepo.save(
    ledgerRepo.create({
      studentId: input.studentId,
      termId: input.termId,
      entryDate: today(),
      description,
      debit: isCredit ? 0 : amount,
      credit: isCredit ? amount : 0,
      balance: roundMoney(prevBalance + delta),
      referenceType: 'tuition_exemption',
      referenceId: input.invoiceId,
    }),
  );
}

export interface ExemptionSyncSummary {
  /** Outstanding balance across the student's invoices before any exemption (gross charges less payments). */
  outstandingBefore: number;
  /** Amount currently exempted from that balance. */
  exemptedAmount: number;
  /** Outstanding balance remaining after the exemption. */
  outstandingAfter: number;
  fullWriteOff: boolean;
  invoicesAdjusted: number;
}

/**
 * Apply the active exemption (or remove it) on the student's existing invoices, including any
 * balance brought forward from earlier terms. The calculation always starts from the ORIGINAL
 * invoice balance (gross charges less payments), so saving or editing an exemption repeatedly
 * never double-counts.
 */
export async function syncTuitionExemptionToInvoices(studentId: string): Promise<ExemptionSyncSummary> {
  const exemption = await getActiveExemptionForStudent(studentId);
  const invoiceRepo = AppDataSource.getRepository(Invoice);
  const lineRepo = AppDataSource.getRepository(InvoiceLine);

  const invoices = await invoiceRepo.find({
    where: { studentId },
    relations: relations('lines'),
    order: { createdAt: 'ASC' },
  });

  interface Candidate {
    invoice: Invoice;
    charges: InvoiceLineInput[];
    /** Original (gross) tuition invoiced on this invoice — the base for a percentage exemption. */
    tuitionBase: number;
    originalOutstanding: number;
    }

  const candidates: Candidate[] = [];
  for (const invoice of invoices) {
    if (invoice.status === InvoiceStatus.CANCELLED || invoice.status === InvoiceStatus.DRAFT) continue;
    const lines = invoice.lines || [];
    const hasExemptionLine = lines.some(isExemptionLine);
    const isOpen = ['sent', 'partial', 'overdue'].includes(invoice.status);
    // Paid invoices are only revisited to restore a balance that an earlier exemption wrote off.
    if (!isOpen && !hasExemptionLine) continue;

    const charges = lines.filter(isChargeLine).map(toLineInput);
    if (!charges.length) continue;

    const gross = roundMoney(charges.reduce((sum, line) => sum + Number(line.amount), 0));
    const paid = roundMoney(Number(invoice.amountPaid));
    const tuitionBase = invoice.feeType === BALANCE_FORWARD_FEE_TYPE
      ? 0
      : roundMoney(lines.filter(isTuitionBaseLine).reduce((sum, line) => sum + Number(line.amount), 0));
    candidates.push({
      invoice,
      charges,
      tuitionBase,
      originalOutstanding: roundMoney(Math.max(0, gross - paid)),
    });
  }

  const totalOutstanding = roundMoney(candidates.reduce((sum, c) => sum + c.originalOutstanding, 0));
  const plan = computeOutstandingBalanceExemption(totalOutstanding, exemption);
  const isPercentage = exemption?.exemptionType === TuitionExemptionType.PERCENTAGE;
  const withBalance = candidates.filter((c) => c.originalOutstanding > EPS);

  // How much of the outstanding balance is exempted on each invoice.
  //  - Full write-off (staff child / 100%): the whole balance on every invoice.
  //  - Fixed percentage: the percentage of the ORIGINAL tuition invoice amount, deducted from that
  //    invoice's balance, so the student pays the reduced tuition for the term.
  //  - Fixed amount: deducted from the outstanding balance, oldest invoice first.
  const allocation = new Map<string, number>();
  let exemptedTotal = 0;
  let remaining = plan.exemptedAmount;
  for (const c of withBalance) {
    let share: number;
    if (plan.fullWriteOff) {
      share = c.originalOutstanding;
    } else if (isPercentage) {
      const pct = Math.min(100, Math.max(0, Number(exemption?.value || 0)));
      share = roundMoney((c.tuitionBase * pct) / 100);
    } else {
      share = remaining;
    }
    share = roundMoney(Math.min(c.originalOutstanding, Math.max(0, share)));
    if (!isPercentage && !plan.fullWriteOff) remaining = roundMoney(remaining - share);
    exemptedTotal = roundMoney(exemptedTotal + share);
    allocation.set(c.invoice.id, share);
  }
  const summaryExempted = plan.fullWriteOff || !isPercentage ? plan.exemptedAmount : exemptedTotal;

  const affectedTermIds = new Set<string>();
  let invoicesAdjusted = 0;

  for (const candidate of candidates) {
    const { invoice, charges } = candidate;
    const share = allocation.get(invoice.id) ?? 0;

    const rebuilt: InvoiceLineInput[] = [...charges];
    if (share > EPS && exemption) {
      rebuilt.push({
        description: outstandingExemptionLineLabel(exemption, share >= candidate.originalOutstanding - EPS),
        quantity: 1,
        unitPrice: -share,
        amount: -share,
      });
    }

    const lines = invoice.lines || [];
    const oldTotal = roundMoney(Number(invoice.totalAmount));
    const newTotal = roundMoney(rebuilt.reduce((sum, line) => sum + Number(line.amount), 0));
    if (linesEqual(lines.map(toLineInput), rebuilt) && oldTotal === newTotal) continue;

    await lineRepo.delete({ invoiceId: invoice.id });
    for (const line of rebuilt) {
      await lineRepo.save(
        lineRepo.create({
          invoiceId: invoice.id,
          description: line.description,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          amount: line.amount,
        }),
      );
    }

    const delta = roundMoney(newTotal - oldTotal);
    invoice.totalAmount = newTotal;
    refreshInvoiceStatus(invoice);
    await invoiceRepo.save(invoice);
    invoicesAdjusted += 1;

    await appendLedgerAdjustment({
      studentId,
      termId: invoice.termId || undefined,
      invoiceNumber: invoice.invoiceNumber,
      invoiceId: invoice.id,
      delta,
      outstandingBefore: candidate.originalOutstanding,
      exemption,
    });

    if (invoice.termId) {
      affectedTermIds.add(invoice.termId);
      await ensureTermBalanceInitialized(studentId, invoice.termId);
    }
  }

  for (const termId of affectedTermIds) {
    await refreshTermClosingBalance(studentId, termId);
  }

  return {
    outstandingBefore: plan.outstanding,
    exemptedAmount: summaryExempted,
    outstandingAfter: roundMoney(Math.max(0, plan.outstanding - summaryExempted)),
    fullWriteOff: plan.fullWriteOff || (summaryExempted > 0 && roundMoney(plan.outstanding - summaryExempted) <= EPS),
    invoicesAdjusted,
  };
}
