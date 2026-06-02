import { AppDataSource } from '../config/data-source';
import { Invoice, Payment, Student, Term, LedgerEntry, StudentTermBalance } from '../entities';
import { relations } from '../utils/typeorm-helpers';
import {
  BALANCE_FORWARD_FEE_TYPE,
  ensureTermBalanceInitialized,
  findPreviousTerm,
  getAvailablePrepaidCredit,
} from './term-balance.service';

export interface StudentSearchRow {
  id: string;
  admissionNumber: string;
  firstName: string;
  lastName: string;
  className?: string;
  formName?: string;
}

export interface LedgerLine {
  date: string;
  type: 'invoice' | 'payment' | 'opening';
  reference: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface StudentLedgerReport {
  student: StudentSearchRow;
  term: { id: string; name: string; startDate: string; endDate: string };
  lines: LedgerLine[];
  summary: {
    openingBalance: number;
    totalDebits: number;
    totalCredits: number;
    closingBalance: number;
  };
}

export interface OutstandingInvoiceRow {
  invoiceId: string;
  invoiceNumber: string;
  description: string;
  issuedDate?: string;
  dueDate: string;
  totalAmount: number;
  amountPaid: number;
  balance: number;
  status: string;
}

export interface OutstandingStudentRow {
  id: string;
  admissionNumber: string;
  firstName: string;
  lastName: string;
  classId?: string;
  className: string;
  formName?: string;
  invoiceBalance: number;
  invoices: OutstandingInvoiceRow[];
}

export interface OutstandingInvoicesGroup {
  classId: string;
  className: string;
  formName?: string;
  classTotal: number;
  students: OutstandingStudentRow[];
}

export async function searchStudents(q: string, limit = 20): Promise<StudentSearchRow[]> {
  const rawQ = String(q || '').trim();
  if (!rawQ) return [];

  const pattern = `%${rawQ.replace(/\s+/g, '%')}%`;
  const rows = await AppDataSource.query(
    `
      SELECT
        s.id,
        s."admissionNumber",
        s."firstName",
        s."lastName",
        c.name as "className",
        f.name as "formName"
      FROM students s
      LEFT JOIN classes c ON c.id = s."classId"
      LEFT JOIN forms f ON f.id = s."formId"
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
      LIMIT $3
    `,
    [rawQ, pattern, limit],
  );

  return rows.map((r: Record<string, string>) => ({
    id: r.id,
    admissionNumber: r.admissionNumber,
    firstName: r.firstName,
    lastName: r.lastName,
    className: r.className || undefined,
    formName: r.formName || undefined,
  }));
}

export async function buildStudentLedgerReport(
  studentId: string,
  termId: string,
): Promise<StudentLedgerReport | null> {
  const termRepo = AppDataSource.getRepository(Term);
  const studentRepo = AppDataSource.getRepository(Student);
  const invoiceRepo = AppDataSource.getRepository(Invoice);
  const paymentRepo = AppDataSource.getRepository(Payment);

  const term = await termRepo.findOne({ where: { id: termId } });
  if (!term) return null;

  const student = await studentRepo.findOne({
    where: { id: studentId, isActive: true },
    relations: relations('schoolClass', 'form'),
  });
  if (!student) return null;

  await ensureTermBalanceInitialized(studentId, termId);
  const termBalanceRepo = AppDataSource.getRepository(StudentTermBalance);
  const termBalance = await termBalanceRepo.findOne({ where: { studentId, termId } });
  const prevTerm = await findPreviousTerm(term);

  const termStartDate = toDateKey(term.startDate);
  const termEndDate = toDateKey(term.endDate);
  const termStart = `${termStartDate}T00:00:00.000Z`;
  const termEnd = `${termEndDate}T23:59:59.999Z`;

  const ledgerRepo = AppDataSource.getRepository(LedgerEntry);
  const termLedgerPaymentRows = await ledgerRepo
    .createQueryBuilder('l')
    .select('l.referenceId', 'referenceId')
    .where('l.studentId = :studentId', { studentId })
    .andWhere('l.termId = :termId', { termId })
    .andWhere('l.referenceType = :referenceType', { referenceType: 'payment' })
    .getRawMany<{ referenceId: string | null }>();
  const termLedgerPaymentIds = termLedgerPaymentRows
    .map((row) => row.referenceId)
    .filter((id): id is string => Boolean(id));

  const termInvoices = await invoiceRepo.find({
    where: { studentId, termId },
    relations: relations('lines'),
    order: { issuedDate: 'ASC', dueDate: 'ASC' },
  });

  const termInvoiceIds = termInvoices.map((i) => i.id);

  let termPayments: Payment[] = [];
  const termPaymentQb = paymentRepo
    .createQueryBuilder('p')
    .where('p.studentId = :studentId', { studentId });

  const termPaymentConditions: string[] = [
    '(p."paidAt" >= :termStart AND p."paidAt" <= :termEnd)',
  ];
  const termPaymentParams: Record<string, unknown> = { studentId, termStart, termEnd };

  if (termInvoiceIds.length) {
    termPaymentConditions.push('p."invoiceId" IN (:...ids)');
    termPaymentParams.ids = termInvoiceIds;
  }
  if (termLedgerPaymentIds.length) {
    termPaymentConditions.push('p.id IN (:...termLedgerPaymentIds)');
    termPaymentParams.termLedgerPaymentIds = termLedgerPaymentIds;
  }

  termPayments = await termPaymentQb
    .andWhere(`(${termPaymentConditions.join(' OR ')})`, termPaymentParams)
    .orderBy('p.paidAt', 'ASC')
    .getMany();

  const openingBalance = termBalance ? Number(termBalance.openingBalance) : 0;
  const prepaidAvailable = termBalance ? await getAvailablePrepaidCredit(termBalance) : 0;

  type RawTxn = {
    date: string;
    sortAt: number;
    type: 'invoice' | 'payment';
    reference: string;
    description: string;
    debit: number;
    credit: number;
  };

  const txns: RawTxn[] = [];

  for (const inv of termInvoices) {
    if (inv.feeType === BALANCE_FORWARD_FEE_TYPE) continue;
    const date = inv.issuedDate || inv.dueDate;
    txns.push({
      date,
      sortAt: new Date(date).getTime(),
      type: 'invoice',
      reference: inv.invoiceNumber,
      description: inv.description,
      debit: Number(inv.totalAmount),
      credit: 0,
    });
  }

  for (const pay of termPayments) {
    const date = pay.paidAt instanceof Date
      ? pay.paidAt.toISOString().slice(0, 10)
      : String(pay.paidAt).slice(0, 10);
    txns.push({
      date,
      sortAt: new Date(pay.paidAt).getTime(),
      type: 'payment',
      reference: pay.paymentReference,
      description: pay.label || pay.notes || 'Payment received',
      debit: 0,
      credit: Number(pay.amount),
    });
  }

  txns.sort((a, b) => a.sortAt - b.sortAt || a.reference.localeCompare(b.reference));

  const lines: LedgerLine[] = [];
  let running = openingBalance;

  if (openingBalance !== 0 || prepaidAvailable > 0) {
    const prevLabel = prevTerm?.name || 'previous term';
    const description =
      openingBalance > 0
        ? `Opening balance brought forward from ${prevLabel}`
        : `Prepaid credit brought forward from ${prevLabel}`;
    lines.push({
      date: term.startDate,
      type: 'opening',
      reference: '—',
      description,
      debit: openingBalance > 0 ? openingBalance : 0,
      credit: openingBalance < 0 ? Math.abs(openingBalance) : 0,
      balance: running,
    });
  }

  let totalDebits = 0;
  let totalCredits = 0;

  for (const txn of txns) {
    running = running + txn.debit - txn.credit;
    totalDebits += txn.debit;
    totalCredits += txn.credit;
    lines.push({
      date: txn.date,
      type: txn.type,
      reference: txn.reference,
      description: txn.description,
      debit: txn.debit,
      credit: txn.credit,
      balance: running,
    });
  }

  return {
    student: {
      id: student.id,
      admissionNumber: student.admissionNumber,
      firstName: student.firstName,
      lastName: student.lastName,
      className: student.schoolClass?.name,
      formName: student.form?.name,
    },
    term: {
      id: term.id,
      name: term.name,
      startDate: term.startDate,
      endDate: term.endDate,
    },
    lines,
    summary: {
      openingBalance,
      totalDebits,
      totalCredits,
      closingBalance: running,
    },
  };
}

export async function buildOutstandingInvoicesReport(): Promise<{
  groups: OutstandingInvoicesGroup[];
  grandTotal: number;
  studentCount: number;
  invoiceCount: number;
}> {
  const rows = await AppDataSource.query(
    `
      SELECT
        s.id as "studentId",
        s."admissionNumber",
        s."firstName",
        s."lastName",
        s."classId",
        c.name as "className",
        f.name as "formName",
        i.id as "invoiceId",
        i."invoiceNumber",
        i.description,
        i."issuedDate",
        i."dueDate",
        i."totalAmount",
        i."amountPaid",
        i.status,
        (i."totalAmount" - i."amountPaid") as balance
      FROM invoices i
      INNER JOIN students s ON s.id = i."studentId"
      LEFT JOIN classes c ON c.id = s."classId"
      LEFT JOIN forms f ON f.id = s."formId"
      WHERE s."isActive" = true
        AND (i."totalAmount" - i."amountPaid") > 0.005
      ORDER BY balance DESC, s."lastName" ASC, s."firstName" ASC
    `,
  );

  const byClass = new Map<string, OutstandingInvoicesGroup>();
  let grandTotal = 0;
  let invoiceCount = 0;

  for (const r of rows) {
    const balance = Number(r.balance || 0);
    grandTotal += balance;
    invoiceCount += 1;

    const classId = r.classId || '__unassigned__';
    const className = r.className || 'Unassigned';
    if (!byClass.has(classId)) {
      byClass.set(classId, {
        classId,
        className,
        formName: r.formName || undefined,
        classTotal: 0,
        students: [],
      });
    }

    const group = byClass.get(classId)!;
    let student = group.students.find((s) => s.id === r.studentId);
    if (!student) {
      student = {
        id: r.studentId,
        admissionNumber: r.admissionNumber,
        firstName: r.firstName,
        lastName: r.lastName,
        classId: r.classId || undefined,
        className,
        formName: r.formName || undefined,
        invoiceBalance: 0,
        invoices: [],
      };
      group.students.push(student);
    }

    student.invoiceBalance += balance;
    student.invoices.push({
      invoiceId: r.invoiceId,
      invoiceNumber: r.invoiceNumber,
      description: r.description,
      issuedDate: r.issuedDate || undefined,
      dueDate: r.dueDate,
      totalAmount: Number(r.totalAmount || 0),
      amountPaid: Number(r.amountPaid || 0),
      balance,
      status: r.status,
    });
    group.classTotal += balance;
  }

  const groups = [...byClass.values()]
    .map((g) => ({
      ...g,
      students: [...g.students].sort((a, b) => b.invoiceBalance - a.invoiceBalance),
    }))
    .sort((a, b) => b.classTotal - a.classTotal);

  const studentCount = groups.reduce((s, g) => s + g.students.length, 0);

  return { groups, grandTotal, studentCount, invoiceCount };
}

export type ReconciliationStatus = 'reconciled' | 'unreconciled' | 'pending';

export interface ReconciliationFilters {
  dateFrom: string;
  dateTo: string;
  termId?: string;
  termName?: string;
  formId?: string;
  classId?: string;
  studentId?: string;
  feeType?: string;
}

export interface ReconciliationTransaction {
  id: string;
  date: string;
  type: 'charge' | 'payment' | 'adjustment' | 'credit';
  feeType: string;
  reference: string;
  description: string;
  amount: number;
  inStudentModule: boolean;
  inLedger: boolean;
  matched: boolean;
}

export interface StudentReconciliationRow {
  student: StudentSearchRow & { classId?: string; formId?: string };
  status: ReconciliationStatus;
  studentModule: {
    openingBalance: number;
    totalBilled: number;
    totalCollected: number;
    adjustments: number;
    closingBalance: number;
    outstandingBalance: number;
    unappliedPayments: number;
  };
  ledgerModule: {
    openingBalance: number;
    totalDebits: number;
    totalCredits: number;
    closingBalance: number;
  };
  variance: {
    billedVsLedgerDebits: number;
    collectedVsLedgerCredits: number;
    closingBalanceVariance: number;
  };
  financialAid: {
    disbursed: number;
    applied: number;
  };
  discrepancies: string[];
  transactions: ReconciliationTransaction[];
}

export interface StudentReconciliationReport {
  filters: ReconciliationFilters;
  generatedAt: string;
  summary: {
    studentCount: number;
    reconciled: number;
    unreconciled: number;
    pending: number;
    totalExpectedRevenue: number;
    totalCollected: number;
    totalVariance: number;
    totalOutstanding: number;
    totalUnappliedPayments: number;
  };
  students: StudentReconciliationRow[];
}

const RECON_EPS = 0.005;
const AID_FEE_TYPES = new Set(['financial_aid', 'scholarship', 'bursary']);

export const RECON_FEE_TYPE_OPTIONS = [
  { value: '', label: 'All transaction types' },
  { value: 'tuition', label: 'Tuition fees' },
  { value: 'registration', label: 'Registration / levies' },
  { value: 'bus_levy', label: 'Bus levy' },
  { value: 'uniform', label: 'Uniform' },
  { value: 'tuckshop', label: 'Tuckshop' },
  { value: 'exam', label: 'Exam fees' },
  { value: 'sports', label: 'Sports' },
  { value: 'donation', label: 'Donations' },
  { value: 'financial_aid', label: 'Financial aid' },
  { value: 'scholarship', label: 'Scholarship' },
  { value: 'refund', label: 'Refunds' },
  { value: 'other', label: 'Other' },
];

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function toDateKey(value: string | Date | null | undefined): string {
  if (value == null || value === '') return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function invoiceDate(i: Invoice): string {
  return toDateKey(i.issuedDate || i.dueDate);
}

function paymentDate(p: Payment): string {
  return toDateKey(p.paidAt);
}

function inDateRange(dateStr: string | Date, from: string, to: string): boolean {
  const d = toDateKey(dateStr);
  if (!d) return false;
  return d >= from && d <= to;
}

async function resolveReconciliationDates(
  dateFrom?: string,
  dateTo?: string,
  termId?: string,
): Promise<{ dateFrom: string; dateTo: string; termName?: string } | null> {
  if (termId) {
    const term = await AppDataSource.getRepository(Term).findOne({ where: { id: termId } });
    if (!term) return null;
    return {
      dateFrom: dateFrom || term.startDate,
      dateTo: dateTo || term.endDate,
      termName: term.name,
    };
  }
  if (dateFrom && dateTo) return { dateFrom, dateTo };
  return null;
}

async function getFilteredStudentIds(filters: {
  formId?: string;
  classId?: string;
  studentId?: string;
  q?: string;
}): Promise<StudentSearchRow[]> {
  const params: unknown[] = [];
  let idx = 1;
  const clauses = ['s."isActive" = true'];

  if (filters.studentId) {
    clauses.push(`s.id = $${idx++}`);
    params.push(filters.studentId);
  } else if (filters.q) {
    const rawQ = filters.q.trim();
    const pattern = `%${rawQ.replace(/\s+/g, '%')}%`;
    clauses.push(`(
      s.id::text = $${idx}
      OR s."admissionNumber" ILIKE $${idx + 1}
      OR s."firstName" ILIKE $${idx + 1}
      OR s."lastName" ILIKE $${idx + 1}
      OR CONCAT(s."firstName", ' ', s."lastName") ILIKE $${idx + 1}
    )`);
    params.push(rawQ, pattern);
    idx += 2;
  }

  if (filters.classId) {
    clauses.push(`s."classId" = $${idx++}`);
    params.push(filters.classId);
  }
  if (filters.formId) {
    clauses.push(`s."formId" = $${idx++}`);
    params.push(filters.formId);
  }

  const rows = await AppDataSource.query(
    `
      SELECT
        s.id,
        s."admissionNumber",
        s."firstName",
        s."lastName",
        s."classId",
        s."formId",
        c.name as "className",
        f.name as "formName"
      FROM students s
      LEFT JOIN classes c ON c.id = s."classId"
      LEFT JOIN forms f ON f.id = s."formId"
      WHERE ${clauses.join(' AND ')}
      ORDER BY f.level ASC NULLS LAST, c.name ASC NULLS LAST, s."lastName" ASC, s."firstName" ASC
      LIMIT 500
    `,
    params,
  );

  return rows.map((r: Record<string, string>) => ({
    id: r.id,
    admissionNumber: r.admissionNumber,
    firstName: r.firstName,
    lastName: r.lastName,
    classId: r.classId || undefined,
    formId: r.formId || undefined,
    className: r.className || undefined,
    formName: r.formName || undefined,
  }));
}

async function reconcileStudent(
  student: StudentSearchRow & { classId?: string; formId?: string },
  dateFrom: string,
  dateTo: string,
  feeType?: string,
  includeTransactions = true,
  termId?: string,
): Promise<StudentReconciliationRow> {
  const invoiceRepo = AppDataSource.getRepository(Invoice);
  const paymentRepo = AppDataSource.getRepository(Payment);
  const ledgerRepo = AppDataSource.getRepository(LedgerEntry);

  const invQb = invoiceRepo.createQueryBuilder('i').where('i.studentId = :sid', { sid: student.id });
  const payQb = paymentRepo.createQueryBuilder('p').where('p.studentId = :sid', { sid: student.id });
  const ledQb = ledgerRepo.createQueryBuilder('l').where('l.studentId = :sid', { sid: student.id });

  if (feeType) {
    invQb.andWhere('i.feeType = :feeType', { feeType });
    payQb.andWhere('p.feeType = :feeType', { feeType });
  }

  const allInvoices = await invQb.getMany();
  const allPayments = await payQb.getMany();
  const allLedger = await ledQb.orderBy('l.entryDate', 'ASC').addOrderBy('l.createdAt', 'ASC').getMany();

  let periodInvoices: Invoice[];
  let priorInvoices: Invoice[];
  let periodPayments: Payment[];

  if (termId) {
    periodInvoices = allInvoices.filter((i) => i.termId === termId);
    const periodInvoiceIds = new Set(periodInvoices.map((i) => i.id));
    priorInvoices = allInvoices.filter((i) => !periodInvoiceIds.has(i.id) && invoiceDate(i) < dateFrom);
    const termLedgerPaymentIds = new Set(
      allLedger
        .filter((l) => l.termId === termId && l.referenceType === 'payment' && l.referenceId)
        .map((l) => l.referenceId as string),
    );
    periodPayments = allPayments.filter((p) => {
      if (p.invoiceId && periodInvoiceIds.has(p.invoiceId)) return true;
      if (termLedgerPaymentIds.has(p.id)) return true;
      return inDateRange(paymentDate(p), dateFrom, dateTo);
    });
  } else {
    priorInvoices = allInvoices.filter((i) => invoiceDate(i) < dateFrom);
    periodInvoices = allInvoices.filter((i) => inDateRange(invoiceDate(i), dateFrom, dateTo));
    periodPayments = allPayments.filter((p) => inDateRange(paymentDate(p), dateFrom, dateTo));
  }

  const priorPayments = allPayments.filter((p) => paymentDate(p) < dateFrom);
  const openingBalance = roundMoney(
    priorInvoices.reduce((s, i) => s + Number(i.totalAmount), 0) -
      priorPayments.reduce((s, p) => s + Number(p.amount), 0),
  );

  const periodInvoiceIds = new Set(periodInvoices.map((i) => i.id));
  const periodPaymentIds = new Set(periodPayments.map((p) => p.id));
  const periodLedger = termId
    ? allLedger.filter((l) => {
        if (l.termId && l.termId === termId) return true;
        if (l.referenceType === 'invoice' && l.referenceId && periodInvoiceIds.has(l.referenceId)) return true;
        if (l.referenceType === 'payment' && l.referenceId && periodPaymentIds.has(l.referenceId)) return true;
        return false;
      })
    : allLedger.filter((l) => inDateRange(l.entryDate, dateFrom, dateTo));

  const periodLedgerIds = new Set(periodLedger.map((l) => l.id));
  const priorLedger = allLedger.filter((l) => !periodLedgerIds.has(l.id) && toDateKey(l.entryDate) < dateFrom);
  const ledgerOpening = priorLedger.length
    ? roundMoney(Number(priorLedger[priorLedger.length - 1].balance))
    : 0;

  const totalBilled = roundMoney(periodInvoices.reduce((s, i) => s + Number(i.totalAmount), 0));
  const collectedFromPayments = roundMoney(periodPayments.reduce((s, p) => s + Number(p.amount), 0));
  const collectedFromInvoices = roundMoney(
    periodInvoices.reduce((s, i) => s + Math.max(0, Math.min(Number(i.amountPaid), Number(i.totalAmount))), 0),
  );
  // Some records only update invoice.amountPaid without creating Payment rows.
  // Use the higher figure so collected/closing stay consistent with invoice balances.
  const totalCollected = roundMoney(Math.max(collectedFromPayments, collectedFromInvoices));

  const ledgerDebits = roundMoney(periodLedger.reduce((s, l) => s + Number(l.debit), 0));
  const ledgerCredits = roundMoney(periodLedger.reduce((s, l) => s + Number(l.credit), 0));
  const ledgerClosing = roundMoney(ledgerOpening + ledgerDebits - ledgerCredits);
  const studentClosing = roundMoney(openingBalance + totalBilled - totalCollected);

  const invoicesById = new Map(periodInvoices.map((i) => [i.id, i]));
  const paymentsById = new Map(periodPayments.map((p) => [p.id, p]));
  const matchedInvoiceIds = new Set<string>();
  const matchedPaymentIds = new Set<string>();
  const matchedLedgerIds = new Set<string>();

  for (const le of periodLedger) {
    if (le.referenceType === 'invoice' && le.referenceId && invoicesById.has(le.referenceId)) {
      matchedInvoiceIds.add(le.referenceId);
      matchedLedgerIds.add(le.id);
    }
    if (le.referenceType === 'payment' && le.referenceId && paymentsById.has(le.referenceId)) {
      matchedPaymentIds.add(le.referenceId);
      matchedLedgerIds.add(le.id);
    }
  }

  const adjustments = roundMoney(
    periodLedger
      .filter((l) => !l.referenceType || !['invoice', 'payment'].includes(l.referenceType))
      .reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0),
  );

  const unappliedPayments = roundMoney(
    periodPayments
      .filter((p) => !p.invoiceId)
      .reduce((s, p) => s + Number(p.amount), 0),
  );

  const outstandingBalance = roundMoney(
    allInvoices.reduce((s, i) => s + Math.max(0, Number(i.totalAmount) - Number(i.amountPaid)), 0),
  );

  let financialAidDisbursed = 0;
  let financialAidApplied = 0;
  for (const p of periodPayments) {
    if (AID_FEE_TYPES.has(p.feeType)) financialAidDisbursed += Number(p.amount);
  }
  for (const i of periodInvoices) {
    if (AID_FEE_TYPES.has(i.feeType)) financialAidApplied += Number(i.totalAmount);
  }
  financialAidDisbursed = roundMoney(financialAidDisbursed);
  financialAidApplied = roundMoney(financialAidApplied);

  const billedVsLedgerDebits = roundMoney(totalBilled - ledgerDebits);
  const collectedVsLedgerCredits = roundMoney(totalCollected - ledgerCredits);
  const closingBalanceVariance = roundMoney(studentClosing - ledgerClosing);

  const discrepancies: string[] = [];
  if (Math.abs(billedVsLedgerDebits) > RECON_EPS) {
    discrepancies.push(`Billed amount ($${totalBilled.toFixed(2)}) differs from ledger debits ($${ledgerDebits.toFixed(2)})`);
  }
  if (Math.abs(collectedVsLedgerCredits) > RECON_EPS) {
    discrepancies.push(`Collected amount ($${totalCollected.toFixed(2)}) differs from ledger credits ($${ledgerCredits.toFixed(2)})`);
  }
  if (Math.abs(closingBalanceVariance) > RECON_EPS) {
    discrepancies.push(`Closing balance variance of $${closingBalanceVariance.toFixed(2)} between student and ledger modules`);
  }
  if (unappliedPayments > RECON_EPS) {
    discrepancies.push(`Unapplied payments totalling $${unappliedPayments.toFixed(2)}`);
  }
  const unmatchedInvoices = periodInvoices.filter((i) => !matchedInvoiceIds.has(i.id));
  const unmatchedPayments = periodPayments.filter((p) => !matchedPaymentIds.has(p.id));
  const unmatchedLedger = periodLedger.filter((l) => !matchedLedgerIds.has(l.id));

  if (unmatchedInvoices.length) {
    discrepancies.push(`${unmatchedInvoices.length} invoice(s) not matched in general ledger`);
  }
  if (unmatchedPayments.length) {
    discrepancies.push(`${unmatchedPayments.length} payment(s) not matched in general ledger`);
  }
  if (unmatchedLedger.length) {
    discrepancies.push(`${unmatchedLedger.length} ledger entry(ies) unmatched to student transactions`);
  }

  let status: ReconciliationStatus = 'reconciled';
  const hasVariance =
    Math.abs(billedVsLedgerDebits) > RECON_EPS ||
    Math.abs(collectedVsLedgerCredits) > RECON_EPS ||
    Math.abs(closingBalanceVariance) > RECON_EPS;

  if (hasVariance) status = 'unreconciled';
  else if (unappliedPayments > RECON_EPS || unmatchedInvoices.length || unmatchedPayments.length || unmatchedLedger.length) {
    status = 'pending';
  }

  const transactions: ReconciliationTransaction[] = [];
  if (includeTransactions) {
    for (const inv of periodInvoices) {
      const matched = matchedInvoiceIds.has(inv.id);
      transactions.push({
        id: inv.id,
        date: invoiceDate(inv),
        type: 'charge',
        feeType: inv.feeType || 'other',
        reference: inv.invoiceNumber,
        description: inv.description,
        amount: Number(inv.totalAmount),
        inStudentModule: true,
        inLedger: matched,
        matched,
      });
    }
    for (const pay of periodPayments) {
      const matched = matchedPaymentIds.has(pay.id);
      transactions.push({
        id: pay.id,
        date: paymentDate(pay),
        type: 'payment',
        feeType: pay.feeType || 'other',
        reference: pay.paymentReference,
        description: pay.label || pay.notes || 'Payment received',
        amount: Number(pay.amount),
        inStudentModule: true,
        inLedger: matched,
        matched,
      });
    }
    for (const le of unmatchedLedger) {
      transactions.push({
        id: le.id,
        date: le.entryDate,
        type: le.debit > 0 ? 'adjustment' : 'credit',
        feeType: 'ledger',
        reference: le.referenceType || 'ledger',
        description: le.description,
        amount: roundMoney(Math.abs(Number(le.debit) - Number(le.credit))),
        inStudentModule: false,
        inLedger: true,
        matched: false,
      });
    }
    transactions.sort((a, b) => a.date.localeCompare(b.date) || a.reference.localeCompare(b.reference));
  }

  return {
    student,
    status,
    studentModule: {
      openingBalance,
      totalBilled,
      totalCollected,
      adjustments,
      closingBalance: studentClosing,
      outstandingBalance,
      unappliedPayments,
    },
    ledgerModule: {
      openingBalance: ledgerOpening,
      totalDebits: ledgerDebits,
      totalCredits: ledgerCredits,
      closingBalance: ledgerClosing,
    },
    variance: {
      billedVsLedgerDebits,
      collectedVsLedgerCredits,
      closingBalanceVariance,
    },
    financialAid: {
      disbursed: financialAidDisbursed,
      applied: financialAidApplied,
    },
    discrepancies,
    transactions,
  };
}

export async function buildStudentReconciliationReport(params: {
  dateFrom?: string;
  dateTo?: string;
  termId?: string;
  formId?: string;
  classId?: string;
  studentId?: string;
  q?: string;
  feeType?: string;
  detailed?: boolean;
}): Promise<StudentReconciliationReport | { error: string } | { needsSelection: true; matches: StudentSearchRow[] }> {
  const dates = await resolveReconciliationDates(params.dateFrom, params.dateTo, params.termId);
  if (!dates) {
    return { error: 'Provide a date range or select a term' };
  }

  let studentId = params.studentId;
  if (!studentId && params.q) {
    const matches = await searchStudents(params.q, 20);
    if (!matches.length) return { error: 'No matching student found' };
    if (matches.length > 1 && !params.classId && !params.formId) {
      return { needsSelection: true, matches };
    }
    studentId = matches[0].id;
  }

  const students = await getFilteredStudentIds({
    formId: params.formId,
    classId: params.classId,
    studentId,
    q: studentId ? undefined : params.q,
  });

  if (!students.length) {
    return { error: 'No students match the selected filters' };
  }

  const includeTransactions = params.detailed !== false;
  const rows: StudentReconciliationRow[] = [];
  for (const s of students) {
    rows.push(
      await reconcileStudent(s, dates.dateFrom, dates.dateTo, params.feeType, includeTransactions, params.termId),
    );
  }

  const summary = {
    studentCount: rows.length,
    reconciled: rows.filter((r) => r.status === 'reconciled').length,
    unreconciled: rows.filter((r) => r.status === 'unreconciled').length,
    pending: rows.filter((r) => r.status === 'pending').length,
    totalExpectedRevenue: roundMoney(rows.reduce((s, r) => s + r.studentModule.totalBilled, 0)),
    totalCollected: roundMoney(rows.reduce((s, r) => s + r.studentModule.totalCollected, 0)),
    totalVariance: roundMoney(rows.reduce((s, r) => s + Math.abs(r.variance.closingBalanceVariance), 0)),
    totalOutstanding: roundMoney(rows.reduce((s, r) => s + r.studentModule.outstandingBalance, 0)),
    totalUnappliedPayments: roundMoney(rows.reduce((s, r) => s + r.studentModule.unappliedPayments, 0)),
  };

  return {
    filters: {
      dateFrom: dates.dateFrom,
      dateTo: dates.dateTo,
      termId: params.termId,
      termName: dates.termName,
      formId: params.formId,
      classId: params.classId,
      studentId,
      feeType: params.feeType,
    },
    generatedAt: new Date().toISOString(),
    summary,
    students: rows,
  };
}

export function reconciliationReportToCsv(report: StudentReconciliationReport, detailed: boolean): string {
  const esc = (v: string | number) => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const lines: string[] = [];
  lines.push('Student Reconciliation Report');
  lines.push(`Period,${esc(report.filters.dateFrom)} to ${esc(report.filters.dateTo)}`);
  if (report.filters.termName) lines.push(`Term,${esc(report.filters.termName)}`);
  lines.push(`Generated,${esc(report.generatedAt)}`);
  lines.push('');
  lines.push('Summary');
  lines.push(`Students,${report.summary.studentCount}`);
  lines.push(`Reconciled,${report.summary.reconciled}`);
  lines.push(`Unreconciled,${report.summary.unreconciled}`);
  lines.push(`Pending,${report.summary.pending}`);
  lines.push(`Expected Revenue,${report.summary.totalExpectedRevenue}`);
  lines.push(`Total Collected,${report.summary.totalCollected}`);
  lines.push(`Total Variance,${report.summary.totalVariance}`);
  lines.push(`Outstanding,${report.summary.totalOutstanding}`);
  lines.push(`Unapplied Payments,${report.summary.totalUnappliedPayments}`);
  lines.push('');

  if (detailed) {
    lines.push([
      'Student ID', 'Name', 'Class', 'Status',
      'Opening', 'Billed', 'Collected', 'Adjustments', 'Closing', 'Outstanding', 'Unapplied',
      'Ledger Opening', 'Ledger Debits', 'Ledger Credits', 'Ledger Closing',
      'Billed vs Ledger', 'Collected vs Ledger', 'Closing Variance',
      'Aid Disbursed', 'Aid Applied', 'Discrepancies',
    ].join(','));
    for (const r of report.students) {
      lines.push([
        esc(r.student.admissionNumber),
        esc(`${r.student.firstName} ${r.student.lastName}`),
        esc(`${r.student.formName || ''} ${r.student.className || ''}`.trim()),
        esc(r.status),
        r.studentModule.openingBalance,
        r.studentModule.totalBilled,
        r.studentModule.totalCollected,
        r.studentModule.adjustments,
        r.studentModule.closingBalance,
        r.studentModule.outstandingBalance,
        r.studentModule.unappliedPayments,
        r.ledgerModule.openingBalance,
        r.ledgerModule.totalDebits,
        r.ledgerModule.totalCredits,
        r.ledgerModule.closingBalance,
        r.variance.billedVsLedgerDebits,
        r.variance.collectedVsLedgerCredits,
        r.variance.closingBalanceVariance,
        r.financialAid.disbursed,
        r.financialAid.applied,
        esc(r.discrepancies.join('; ')),
      ].join(','));
    }
    lines.push('');
    lines.push('Transactions');
    lines.push(['Student ID', 'Date', 'Type', 'Fee Type', 'Reference', 'Description', 'Amount', 'Student Module', 'Ledger', 'Matched'].join(','));
    for (const r of report.students) {
      for (const t of r.transactions) {
        lines.push([
          esc(r.student.admissionNumber),
          esc(t.date),
          esc(t.type),
          esc(t.feeType),
          esc(t.reference),
          esc(t.description),
          t.amount,
          t.inStudentModule ? 'Yes' : 'No',
          t.inLedger ? 'Yes' : 'No',
          t.matched ? 'Yes' : 'No',
        ].join(','));
      }
    }
  } else {
    lines.push(['Student ID', 'Name', 'Class', 'Status', 'Billed', 'Collected', 'Closing', 'Outstanding', 'Variance'].join(','));
    for (const r of report.students) {
      lines.push([
        esc(r.student.admissionNumber),
        esc(`${r.student.firstName} ${r.student.lastName}`),
        esc(`${r.student.formName || ''} ${r.student.className || ''}`.trim()),
        esc(r.status),
        r.studentModule.totalBilled,
        r.studentModule.totalCollected,
        r.studentModule.closingBalance,
        r.studentModule.outstandingBalance,
        r.variance.closingBalanceVariance,
      ].join(','));
    }
  }

  return '\uFEFF' + lines.join('\n');
}

export type AgingBucket = 'current' | '31_60' | '61_90' | '91_120' | '120_plus';

export interface DebtorAgingFilters {
  dateFrom?: string;
  dateTo: string;
  termId?: string;
  termName?: string;
  formId?: string;
  classId?: string;
  studentId?: string;
  q?: string;
  feeType?: string;
  agingBucket?: AgingBucket | '90_plus';
  excludeZeroBalances: boolean;
  escalationDays: number;
}

export interface DebtorAgingStudentRow {
  studentId: string;
  admissionNumber: string;
  firstName: string;
  lastName: string;
  formName?: string;
  className?: string;
  guardianName?: string;
  guardianPhone?: string;
  guardianEmail?: string;
  originalCharged: number;
  amountPaid: number;
  outstandingBalance: number;
  aging: Record<AgingBucket, number>;
  lastPaymentDate?: string;
  accountStatus: 'reconciled' | 'unreconciled' | 'pending';
  potentialBadDebt: boolean;
  escalationFlag: boolean;
  maxOverdueDays: number;
}

export interface DebtorAgingReport {
  generatedAt: string;
  filters: DebtorAgingFilters;
  summary: {
    totalDebtors: number;
    totalOutstanding: number;
    totalCharged: number;
    totalPaid: number;
    collectedPct: number;
    outstandingPct: number;
    byBucket: Record<AgingBucket, number>;
  };
  students: DebtorAgingStudentRow[];
}

function bucketForDays(days: number): AgingBucket {
  if (days <= 30) return 'current';
  if (days <= 60) return '31_60';
  if (days <= 90) return '61_90';
  if (days <= 120) return '91_120';
  return '120_plus';
}

function matchesBucket(bucket: AgingBucket, filter?: AgingBucket | '90_plus'): boolean {
  if (!filter) return true;
  if (filter === '90_plus') return bucket === '91_120' || bucket === '120_plus';
  return bucket === filter;
}

export async function buildDebtorAgingReport(params: {
  dateFrom?: string;
  dateTo?: string;
  termId?: string;
  formId?: string;
  classId?: string;
  studentId?: string;
  q?: string;
  feeType?: string;
  agingBucket?: AgingBucket | '90_plus';
  excludeZeroBalances?: boolean;
  escalationDays?: number;
}): Promise<DebtorAgingReport | { error: string } | { needsSelection: true; matches: StudentSearchRow[] }> {
  const dateTo = params.dateTo || new Date().toISOString().slice(0, 10);
  const dateFrom = params.dateFrom || undefined;
  let termName: string | undefined;
  if (params.termId) {
    const term = await AppDataSource.getRepository(Term).findOne({ where: { id: params.termId } });
    if (!term) return { error: 'Term not found' };
    termName = term.name;
  }

  let studentId = params.studentId;
  if (!studentId && params.q) {
    const matches = await searchStudents(params.q, 20);
    if (!matches.length) return { error: 'No matching student found' };
    if (matches.length > 1 && !params.classId && !params.formId) return { needsSelection: true, matches };
    studentId = matches[0].id;
  }

  const filters: DebtorAgingFilters = {
    dateFrom,
    dateTo,
    termId: params.termId,
    termName,
    formId: params.formId,
    classId: params.classId,
    studentId,
    q: params.q,
    feeType: params.feeType,
    agingBucket: params.agingBucket,
    excludeZeroBalances: params.excludeZeroBalances !== false,
    escalationDays: Number(params.escalationDays || 90),
  };

  const students = await getFilteredStudentIds({
    formId: filters.formId,
    classId: filters.classId,
    studentId: filters.studentId,
    q: filters.studentId ? undefined : filters.q,
  });
  if (!students.length) return { error: 'No students match the selected filters' };

  const invoicesQb = AppDataSource.getRepository(Invoice).createQueryBuilder('i')
    .where('i.studentId IN (:...studentIds)', { studentIds: students.map((s) => s.id) });
  if (filters.termId) {
    invoicesQb.andWhere('i.termId = :termId', { termId: filters.termId });
  } else {
    if (filters.dateFrom) {
      invoicesQb.andWhere('COALESCE(i."issuedDate", i."dueDate") >= :dateFrom', { dateFrom: filters.dateFrom });
    }
    invoicesQb.andWhere('COALESCE(i."issuedDate", i."dueDate") <= :dateTo', { dateTo: filters.dateTo });
  }
  if (filters.feeType) invoicesQb.andWhere('i.feeType = :feeType', { feeType: filters.feeType });
  const invoices = await invoicesQb.getMany();

  const payments = await AppDataSource.getRepository(Payment).createQueryBuilder('p')
    .where('p.studentId IN (:...studentIds)', { studentIds: students.map((s) => s.id) })
    .andWhere('p."paidAt"::date <= :dateTo', { dateTo: filters.dateTo })
    .getMany();

  const guardianRows = await AppDataSource.query(
    `
      SELECT g."studentId", COALESCE(g."fullName", CONCAT(u."firstName", ' ', u."lastName")) as "guardianName",
        COALESCE(g.phone, u.phone) as "guardianPhone",
        COALESCE(g.email, u.email) as "guardianEmail"
      FROM guardians g
      LEFT JOIN parents p ON p.id = g."parentId"
      LEFT JOIN users u ON u.id = p."userId"
      WHERE g."studentId" = ANY($1) AND (g."isPrimary" = true OR g."isEmergencyContact" = true)
    `,
    [students.map((s) => s.id)],
  );
  const guardianMap = new Map<string, { guardianName?: string; guardianPhone?: string; guardianEmail?: string }>();
  for (const g of guardianRows) {
    if (!guardianMap.has(g.studentId)) {
      guardianMap.set(g.studentId, {
        guardianName: g.guardianName || undefined,
        guardianPhone: g.guardianPhone || undefined,
        guardianEmail: g.guardianEmail || undefined,
      });
    }
  }

  const invoiceByStudent = new Map<string, Invoice[]>();
  for (const inv of invoices) {
    if (!invoiceByStudent.has(inv.studentId)) invoiceByStudent.set(inv.studentId, []);
    invoiceByStudent.get(inv.studentId)!.push(inv);
  }
  const paymentByStudent = new Map<string, Payment[]>();
  for (const pay of payments) {
    if (!paymentByStudent.has(pay.studentId)) paymentByStudent.set(pay.studentId, []);
    paymentByStudent.get(pay.studentId)!.push(pay);
  }

  const bucketTotals: Record<AgingBucket, number> = {
    current: 0,
    '31_60': 0,
    '61_90': 0,
    '91_120': 0,
    '120_plus': 0,
  };

  const rows: DebtorAgingStudentRow[] = [];
  for (const s of students) {
    const invs = invoiceByStudent.get(s.id) || [];
    const pays = paymentByStudent.get(s.id) || [];
    const aging: Record<AgingBucket, number> = { current: 0, '31_60': 0, '61_90': 0, '91_120': 0, '120_plus': 0 };
    let maxOverdueDays = 0;

    for (const inv of invs) {
      const bal = Math.max(0, Number(inv.totalAmount) - Number(inv.amountPaid));
      if (bal <= 0.005) continue;
      const days = Math.max(0, Math.floor((new Date(filters.dateTo).getTime() - new Date(inv.dueDate).getTime()) / 86400000));
      maxOverdueDays = Math.max(maxOverdueDays, days);
      const b = bucketForDays(days);
      if (matchesBucket(b, filters.agingBucket)) aging[b] += bal;
    }

    const outstandingBalance = roundMoney(Object.values(aging).reduce((x, y) => x + y, 0));
    const originalCharged = roundMoney(invs.reduce((sum, i) => sum + Number(i.totalAmount), 0));
    const amountPaid = roundMoney(invs.reduce((sum, i) => sum + Number(i.amountPaid), 0));
    const lastPayment = pays.sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime())[0];
    const unapplied = pays.filter((p) => !p.invoiceId).reduce((sum, p) => sum + Number(p.amount), 0);

    const accountStatus: 'reconciled' | 'unreconciled' | 'pending' =
      outstandingBalance <= 0.005 ? 'reconciled' : unapplied > 0.005 ? 'pending' : 'unreconciled';

    if (filters.excludeZeroBalances && outstandingBalance <= 0.005) continue;

    const row: DebtorAgingStudentRow = {
      studentId: s.id,
      admissionNumber: s.admissionNumber,
      firstName: s.firstName,
      lastName: s.lastName,
      formName: s.formName,
      className: s.className,
      guardianName: guardianMap.get(s.id)?.guardianName,
      guardianPhone: guardianMap.get(s.id)?.guardianPhone,
      guardianEmail: guardianMap.get(s.id)?.guardianEmail,
      originalCharged,
      amountPaid,
      outstandingBalance,
      aging: {
        current: roundMoney(aging.current),
        '31_60': roundMoney(aging['31_60']),
        '61_90': roundMoney(aging['61_90']),
        '91_120': roundMoney(aging['91_120']),
        '120_plus': roundMoney(aging['120_plus']),
      },
      lastPaymentDate: lastPayment ? (lastPayment.paidAt instanceof Date ? lastPayment.paidAt.toISOString().slice(0, 10) : String(lastPayment.paidAt).slice(0, 10)) : undefined,
      accountStatus,
      potentialBadDebt: aging['120_plus'] > 0.005,
      escalationFlag: maxOverdueDays >= filters.escalationDays,
      maxOverdueDays,
    };
    rows.push(row);
    bucketTotals.current += row.aging.current;
    bucketTotals['31_60'] += row.aging['31_60'];
    bucketTotals['61_90'] += row.aging['61_90'];
    bucketTotals['91_120'] += row.aging['91_120'];
    bucketTotals['120_plus'] += row.aging['120_plus'];
  }

  rows.sort((a, b) => b.outstandingBalance - a.outstandingBalance || a.lastName.localeCompare(b.lastName));

  const totalOutstanding = roundMoney(rows.reduce((s, r) => s + r.outstandingBalance, 0));
  const totalCharged = roundMoney(rows.reduce((s, r) => s + r.originalCharged, 0));
  const totalPaid = roundMoney(rows.reduce((s, r) => s + r.amountPaid, 0));
  const base = totalPaid + totalOutstanding;
  const collectedPct = base > 0 ? roundMoney((totalPaid / base) * 100) : 0;
  const outstandingPct = base > 0 ? roundMoney((totalOutstanding / base) * 100) : 0;

  return {
    generatedAt: new Date().toISOString(),
    filters,
    summary: {
      totalDebtors: rows.length,
      totalOutstanding,
      totalCharged,
      totalPaid,
      collectedPct,
      outstandingPct,
      byBucket: {
        current: roundMoney(bucketTotals.current),
        '31_60': roundMoney(bucketTotals['31_60']),
        '61_90': roundMoney(bucketTotals['61_90']),
        '91_120': roundMoney(bucketTotals['91_120']),
        '120_plus': roundMoney(bucketTotals['120_plus']),
      },
    },
    students: rows,
  };
}

export function debtorAgingToCsv(report: DebtorAgingReport, detailed: boolean): string {
  const esc = (v: string | number) => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines: string[] = [];
  lines.push('Debtor Aging Report');
  lines.push(`Period,${esc(report.filters.dateFrom || 'Start')} to ${esc(report.filters.dateTo)}`);
  if (report.filters.termName) lines.push(`Term,${esc(report.filters.termName)}`);
  lines.push(`Generated,${esc(report.generatedAt)}`);
  lines.push('');
  lines.push('Summary');
  lines.push(`Total Debtors,${report.summary.totalDebtors}`);
  lines.push(`Total Outstanding,${report.summary.totalOutstanding}`);
  lines.push(`Current (0-30),${report.summary.byBucket.current}`);
  lines.push(`31-60,${report.summary.byBucket['31_60']}`);
  lines.push(`61-90,${report.summary.byBucket['61_90']}`);
  lines.push(`91-120,${report.summary.byBucket['91_120']}`);
  lines.push(`120+,${report.summary.byBucket['120_plus']}`);
  lines.push(`Collected %,${report.summary.collectedPct}`);
  lines.push(`Outstanding %,${report.summary.outstandingPct}`);
  lines.push('');

  lines.push([
    'Student ID', 'Student Name', 'Class', 'Guardian', 'Phone',
    'Original Charged', 'Paid', 'Outstanding',
    'Current', '31-60', '61-90', '91-120', '120+',
    'Last Payment', 'Status', 'Escalation', 'Potential Bad Debt',
  ].join(','));
  for (const s of report.students) {
    lines.push([
      esc(s.admissionNumber),
      esc(`${s.firstName} ${s.lastName}`),
      esc(`${s.formName || ''} ${s.className || ''}`.trim()),
      esc(s.guardianName || ''),
      esc(s.guardianPhone || ''),
      s.originalCharged,
      s.amountPaid,
      s.outstandingBalance,
      s.aging.current,
      s.aging['31_60'],
      s.aging['61_90'],
      s.aging['91_120'],
      s.aging['120_plus'],
      esc(s.lastPaymentDate || ''),
      esc(s.accountStatus),
      s.escalationFlag ? 'Yes' : 'No',
      s.potentialBadDebt ? 'Yes' : 'No',
    ].join(','));
    if (detailed) {
      lines.push(`,Notes,,${esc('Add follow-up notes via Debtor Aging notes action')}`);
    }
  }
  return '\uFEFF' + lines.join('\n');
}
