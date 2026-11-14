import { AppDataSource } from '../config/data-source';
import { Invoice, Payment, Student, Term } from '../entities';
import { InvoiceStatus, PaymentMethod } from '../entities/enums';
import { searchStudents, StudentSearchRow } from './fin-reports.service';

const EPS = 0.005;

export const FEE_CATEGORY_LABELS: Record<string, string> = {
  tuition: 'Tuition fees',
  registration: 'Registration / admission fees',
  exam: 'Examination fees',
  boarding: 'Boarding & accommodation',
  bus_levy: 'Transport fees',
  uniform: 'Levies & sundry',
  tuckshop: 'Levies & sundry',
  sports: 'Extra-curricular',
  other: 'Other fees',
};

export const PAYMENT_METHOD_GROUPS: { key: string; label: string; methods: PaymentMethod[] }[] = [
  { key: 'cash', label: 'Cash', methods: [PaymentMethod.CASH] },
  { key: 'bank', label: 'Bank transfer / deposit', methods: [PaymentMethod.BANK] },
  {
    key: 'mobile',
    label: 'Mobile money',
    methods: [PaymentMethod.ECOCASH, PaymentMethod.ONEMONEY, PaymentMethod.INNBUCKS],
  },
  { key: 'cheque', label: 'Cheque', methods: [] },
  { key: 'online', label: 'Online payment', methods: [PaymentMethod.OTHER] },
];

export interface FeeCollectionQueryParams {
  dateFrom?: string;
  dateTo?: string;
  termId?: string;
  formId?: string;
  classId?: string;
  studentId?: string;
  q?: string;
  feeType?: string;
  paymentMethod?: string;
  collectionStatus?: 'fully_paid' | 'partial' | 'unpaid' | '';
  compareDateFrom?: string;
  compareDateTo?: string;
  compareTermId?: string;
  summaryOnly?: boolean;
}

export interface FeeCollectionOverview {
  totalExpected: number;
  totalCollected: number;
  totalOutstanding: number;
  collectionRatePct: number;
  studentsPaidInFull: number;
  studentsPartial: number;
  studentsUnpaid: number;
}

export interface DailyPaymentRow {
  paymentId: string;
  date: string;
  studentId: string;
  admissionNumber: string;
  studentName: string;
  formName?: string;
  className?: string;
  feeType: string;
  feeTypeLabel: string;
  amountExpected: number;
  amountPaid: number;
  paymentMethod: string;
  receiptNumber?: string;
  cashierName?: string;
  outstandingAfter: number;
  reversed: boolean;
  flagReason?: string;
}

export interface DailyCollectionDay {
  date: string;
  payments: DailyPaymentRow[];
  dayTotal: number;
  reversedCount: number;
}

export interface WeeklyCollectionRow {
  weekKey: string;
  weekLabel: string;
  weekStart: string;
  weekEnd: string;
  totalExpected: number;
  totalCollected: number;
  totalOutstanding: number;
  collectionRatePct: number;
  previousWeekCollected?: number;
  weekOverWeekChangePct?: number;
  cumulativeCollected: number;
  cumulativeExpected: number;
}

export interface MonthlyCollectionRow {
  monthKey: string;
  monthLabel: string;
  totalExpected: number;
  totalCollected: number;
  totalOutstanding: number;
  collectionRatePct: number;
  previousMonthRatePct?: number;
  variance: number;
}

export interface FeeCategoryRow {
  feeType: string;
  label: string;
  expected: number;
  collected: number;
  outstanding: number;
  collectionRatePct: number;
}

export interface GradeClassCollectionRow {
  gradeKey: string;
  gradeLabel: string;
  classKey?: string;
  classLabel?: string;
  studentCount: number;
  totalExpected: number;
  totalCollected: number;
  outstanding: number;
  collectionRatePct: number;
  lowCollection: boolean;
}

export interface PaymentMethodRow {
  key: string;
  label: string;
  amount: number;
  percentage: number;
  transactionCount: number;
}

export interface ExceptionRow {
  type: 'under_collected' | 'no_payment' | 'reversed' | 'duplicate' | 'cancelled_invoice';
  studentId: string;
  admissionNumber: string;
  studentName: string;
  className?: string;
  description: string;
  amount?: number;
  date?: string;
}

export interface ProjectionSummary {
  projectedEndOfTermCollection: number;
  budgetedExpected: number;
  projectedShortfall: number;
  projectedSurplus: number;
  estimatedRemainingCashFlow: number;
  daysElapsed: number;
  daysRemaining: number;
  dailyRunRate: number;
}

export interface ChartSeriesPoint {
  label: string;
  value: number;
  value2?: number;
}

export interface FeeCollectionRevenueReport {
  generatedAt: string;
  filters: {
    dateFrom: string;
    dateTo: string;
    termId?: string;
    termName?: string;
    formId?: string;
    classId?: string;
    studentId?: string;
    feeType?: string;
    paymentMethod?: string;
    collectionStatus?: string;
    compareDateFrom?: string;
    compareDateTo?: string;
    compareTermName?: string;
  };
  overview: FeeCollectionOverview;
  compareOverview?: FeeCollectionOverview;
  daily: DailyCollectionDay[];
  weekly: WeeklyCollectionRow[];
  monthly: MonthlyCollectionRow[];
  byCategory: FeeCategoryRow[];
  byGradeClass: GradeClassCollectionRow[];
  paymentMethods: PaymentMethodRow[];
  exceptions: ExceptionRow[];
  projections: ProjectionSummary;
  charts: {
    dailyCollections: ChartSeriesPoint[];
    cumulativeTrend: ChartSeriesPoint[];
    feeTypeBreakdown: ChartSeriesPoint[];
    gradeClassRates: ChartSeriesPoint[];
    monthlyTrend: ChartSeriesPoint[];
  };
  auditNote: string;
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function toDateKey(value: string | Date | null | undefined): string {
  if (value == null || value === '') return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function feeLabel(feeType: string): string {
  return FEE_CATEGORY_LABELS[feeType] || feeType.replace(/_/g, ' ');
}

function methodLabel(method: string): string {
  const m = String(method || '').toLowerCase();
  if (m === 'cash') return 'Cash';
  if (m === 'bank') return 'Bank transfer';
  if (['ecocash', 'onemoney', 'innbucks'].includes(m)) return 'Mobile money';
  if (m === 'other') return 'Online / other';
  return m;
}

function paymentMatchesMethodFilter(method: string, filter: string): boolean {
  if (!filter) return true;
  const m = String(method || '').toLowerCase();
  const f = filter.toLowerCase();
  if (f === 'cash') return m === 'cash';
  if (f === 'bank') return m === 'bank';
  if (f === 'mobile') return ['ecocash', 'onemoney', 'innbucks'].includes(m);
  if (f === 'cheque') return m.includes('cheque') || m.includes('check');
  if (f === 'online') return m === 'other';
  return m === f;
}

function isReversedPayment(notes?: string | null): boolean {
  const n = String(notes || '').toLowerCase();
  return /revers|cancel|refund|void/.test(n);
}

async function resolvePeriodDates(
  dateFrom?: string,
  dateTo?: string,
  termId?: string,
): Promise<{ dateFrom: string; dateTo: string; termName?: string; term?: Term } | { error: string }> {
  if (termId) {
    const term = await AppDataSource.getRepository(Term).findOne({ where: { id: termId } });
    if (!term) return { error: 'Term not found' };
    return {
      dateFrom: dateFrom || term.startDate,
      dateTo: dateTo || term.endDate,
      termName: term.name,
      term,
    };
  }
  if (dateFrom && dateTo) return { dateFrom, dateTo };
  return { error: 'Select a term or provide date from and date to' };
}

async function getFilteredStudents(params: {
  formId?: string;
  classId?: string;
  studentId?: string;
  q?: string;
}): Promise<StudentSearchRow[]> {
  const clauses = ['s."isActive" = true'];
  const sqlParams: unknown[] = [];
  let idx = 1;

  if (params.studentId) {
    clauses.push(`s.id = $${idx++}`);
    sqlParams.push(params.studentId);
  } else if (params.q) {
    const rawQ = params.q.trim();
    const pattern = `%${rawQ.replace(/\s+/g, '%')}%`;
    clauses.push(`(
      s.id::text = $${idx}
      OR s."admissionNumber" ILIKE $${idx + 1}
      OR s."firstName" ILIKE $${idx + 1}
      OR s."lastName" ILIKE $${idx + 1}
      OR CONCAT(s."firstName", ' ', s."lastName") ILIKE $${idx + 1}
    )`);
    sqlParams.push(rawQ, pattern);
    idx += 2;
  }
  if (params.classId) {
    clauses.push(`s."classId" = $${idx++}`);
    sqlParams.push(params.classId);
  }
  if (params.formId) {
    clauses.push(`s."formId" = $${idx++}`);
    sqlParams.push(params.formId);
  }

  const rows = await AppDataSource.query(
    `
      SELECT s.id, s."admissionNumber", s."firstName", s."lastName",
        c.name as "className", f.name as "formName", s."classId", s."formId"
      FROM students s
      LEFT JOIN classes c ON c.id = s."classId"
      LEFT JOIN forms f ON f.id = s."formId"
      WHERE ${clauses.join(' AND ')}
      ORDER BY f.level ASC NULLS LAST, c.name ASC NULLS LAST, s."lastName" ASC
      LIMIT 500
    `,
    sqlParams,
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

function isoWeekKey(dateStr: string): { key: string; label: string; start: string; end: string } {
  const d = new Date(`${dateStr}T12:00:00Z`);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  const weekStart = new Date(d);
  weekStart.setUTCDate(d.getUTCDate() - 3);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
  const start = weekStart.toISOString().slice(0, 10);
  const end = weekEnd.toISOString().slice(0, 10);
  return {
    key: `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`,
    label: `Week ${weekNo} (${start})`,
    start,
    end,
  };
}

type StudentAgg = {
  student: StudentSearchRow;
  expected: number;
  collected: number;
  outstanding: number;
  status: 'fully_paid' | 'partial' | 'unpaid';
};

export async function buildFeeCollectionRevenueReport(
  params: FeeCollectionQueryParams,
): Promise<
  | FeeCollectionRevenueReport
  | { error: string }
  | { needsSelection: true; matches: StudentSearchRow[] }
> {
  const period = await resolvePeriodDates(params.dateFrom, params.dateTo, params.termId);
  if ('error' in period) return { error: period.error };

  let studentId = params.studentId;
  if (!studentId && params.q) {
    const matches = await searchStudents(params.q, 20);
    if (!matches.length) return { error: 'No matching student found' };
    if (matches.length > 1 && !params.classId && !params.formId) {
      return { needsSelection: true, matches };
    }
    studentId = matches[0].id;
  }

  const students = await getFilteredStudents({
    formId: params.formId,
    classId: params.classId,
    studentId,
    q: studentId ? undefined : params.q,
  });
  if (!students.length) return { error: 'No students match the selected filters' };

  const studentIds = students.map((s) => s.id);
  const studentMap = new Map(students.map((s) => [s.id, s]));

  const invoiceRepo = AppDataSource.getRepository(Invoice);
  const invQb = invoiceRepo
    .createQueryBuilder('i')
    .where('i.studentId IN (:...studentIds)', { studentIds })
    .andWhere('i.status != :cancelled', { cancelled: InvoiceStatus.CANCELLED });

  if (params.termId) {
    invQb.andWhere('i.termId = :termId', { termId: params.termId });
  } else {
    invQb.andWhere(
      'COALESCE(i."issuedDate", i."dueDate") >= :dateFrom AND COALESCE(i."issuedDate", i."dueDate") <= :dateTo',
      { dateFrom: period.dateFrom, dateTo: period.dateTo },
    );
  }
  if (params.feeType) invQb.andWhere('i.feeType = :feeType', { feeType: params.feeType });

  const invoices = await invQb.getMany();

  const paymentRows = await AppDataSource.query(
    `
      SELECT
        p.id as "paymentId",
        p."paidAt",
        p.amount,
        p.method,
        p."feeType",
        p.notes,
        p."paymentReference",
        p."studentId",
        p."invoiceId",
        r."receiptNumber",
        COALESCE(u."firstName" || ' ' || u."lastName", 'System') as "cashierName",
        i."totalAmount" as "invoiceTotal",
        i."amountPaid" as "invoicePaid"
      FROM payments p
      JOIN students s ON s.id = p."studentId"
      LEFT JOIN receipts r ON r."paymentId" = p.id
      LEFT JOIN users u ON u.id = p."recordedById"
      LEFT JOIN invoices i ON i.id = p."invoiceId"
      WHERE p."studentId" = ANY($1::uuid[])
        AND p."paidAt"::date >= $2::date
        AND p."paidAt"::date <= $3::date
      ORDER BY p."paidAt" ASC
    `,
    [studentIds, period.dateFrom, period.dateTo],
  );

  const filteredPayments = paymentRows.filter((p: Record<string, unknown>) =>
    paymentMatchesMethodFilter(String(p.method), params.paymentMethod || ''),
  );

  const studentAgg = new Map<string, StudentAgg>();
  for (const s of students) {
    studentAgg.set(s.id, {
      student: s,
      expected: 0,
      collected: 0,
      outstanding: 0,
      status: 'unpaid',
    });
  }

  for (const inv of invoices) {
    const agg = studentAgg.get(inv.studentId);
    if (!agg) continue;
    agg.expected += Number(inv.totalAmount);
    agg.collected += Number(inv.amountPaid);
  }

  const paymentCollectedByStudent = new Map<string, number>();
  for (const p of filteredPayments) {
    if (isReversedPayment(p.notes as string)) continue;
    const sid = String(p.studentId);
    paymentCollectedByStudent.set(sid, (paymentCollectedByStudent.get(sid) || 0) + Number(p.amount));
  }
  for (const [sid, payTotal] of paymentCollectedByStudent) {
    const agg = studentAgg.get(sid);
    if (agg) agg.collected = Math.max(agg.collected, payTotal);
  }

  for (const [, agg] of studentAgg) {
    agg.outstanding = roundMoney(Math.max(0, agg.expected - agg.collected));
    if (agg.expected <= EPS) {
      agg.status = agg.collected > EPS ? 'fully_paid' : 'unpaid';
    } else if (agg.outstanding <= EPS) {
      agg.status = 'fully_paid';
    } else if (agg.collected <= EPS) {
      agg.status = 'unpaid';
    } else {
      agg.status = 'partial';
    }
  }

  let aggList = [...studentAgg.values()];
  if (params.collectionStatus) {
    aggList = aggList.filter((a) => a.status === params.collectionStatus);
  }
  const allowedStudentIds = new Set(aggList.map((a) => a.student.id));

  const overview: FeeCollectionOverview = {
    totalExpected: roundMoney(aggList.reduce((s, a) => s + a.expected, 0)),
    totalCollected: roundMoney(aggList.reduce((s, a) => s + a.collected, 0)),
    totalOutstanding: roundMoney(aggList.reduce((s, a) => s + a.outstanding, 0)),
    collectionRatePct: 0,
    studentsPaidInFull: aggList.filter((a) => a.status === 'fully_paid').length,
    studentsPartial: aggList.filter((a) => a.status === 'partial').length,
    studentsUnpaid: aggList.filter((a) => a.status === 'unpaid').length,
  };
  overview.collectionRatePct =
    overview.totalExpected > EPS
      ? roundMoney((overview.totalCollected / overview.totalExpected) * 100)
      : overview.totalCollected > EPS
        ? 100
        : 0;

  const dailyMap = new Map<string, DailyCollectionDay>();
  const paymentMethodTotals = new Map<string, { amount: number; count: number }>();
  const categoryMap = new Map<string, FeeCategoryRow>();
  const gradeClassMap = new Map<string, GradeClassCollectionRow>();
  const exceptions: ExceptionRow[] = [];
  const duplicateKeys = new Map<string, number>();

  for (const inv of invoices) {
    if (!allowedStudentIds.has(inv.studentId)) continue;
    const ft = inv.feeType || 'other';
    const row = categoryMap.get(ft) || {
      feeType: ft,
      label: feeLabel(ft),
      expected: 0,
      collected: 0,
      outstanding: 0,
      collectionRatePct: 0,
    };
    row.expected += Number(inv.totalAmount);
    row.collected += Number(inv.amountPaid);
    categoryMap.set(ft, row);

    if (inv.status === InvoiceStatus.CANCELLED) {
      const st = studentMap.get(inv.studentId);
      if (st) {
        exceptions.push({
          type: 'cancelled_invoice',
          studentId: st.id,
          admissionNumber: st.admissionNumber,
          studentName: `${st.firstName} ${st.lastName}`,
          className: st.className,
          description: `Cancelled invoice ${inv.invoiceNumber}`,
          amount: Number(inv.totalAmount),
          date: toDateKey(inv.issuedDate || inv.dueDate),
        });
      }
    }
  }

  for (const p of filteredPayments) {
    if (!allowedStudentIds.has(String(p.studentId))) continue;
    const date = toDateKey(p.paidAt as string);
    const st = studentMap.get(String(p.studentId));
    if (!st) continue;

    const amt = Number(p.amount);
    const reversed = isReversedPayment(p.notes as string);
    const method = methodLabel(String(p.method));
    const ft = String(p.feeType || 'other');

    if (!dailyMap.has(date)) {
      dailyMap.set(date, { date, payments: [], dayTotal: 0, reversedCount: 0 });
    }
    const day = dailyMap.get(date)!;

    const invExpected = p.invoiceTotal != null ? Number(p.invoiceTotal) : 0;
    const invPaid = p.invoicePaid != null ? Number(p.invoicePaid) : 0;
    const outstandingAfter = invExpected > 0 ? roundMoney(Math.max(0, invExpected - invPaid)) : 0;

    const row: DailyPaymentRow = {
      paymentId: String(p.paymentId),
      date,
      studentId: st.id,
      admissionNumber: st.admissionNumber,
      studentName: `${st.firstName} ${st.lastName}`,
      formName: st.formName,
      className: st.className,
      feeType: ft,
      feeTypeLabel: feeLabel(ft),
      amountExpected: invExpected,
      amountPaid: amt,
      paymentMethod: method,
      receiptNumber: (p.receiptNumber as string) || undefined,
      cashierName: (p.cashierName as string) || undefined,
      outstandingAfter,
      reversed,
      flagReason: reversed ? String(p.notes || 'Reversed / cancelled') : undefined,
    };
    day.payments.push(row);
    if (!reversed) day.dayTotal = roundMoney(day.dayTotal + amt);
    else {
      day.reversedCount += 1;
      exceptions.push({
        type: 'reversed',
        studentId: st.id,
        admissionNumber: st.admissionNumber,
        studentName: row.studentName,
        className: st.className,
        description: `Reversed payment ${p.paymentReference} — ${p.notes || ''}`,
        amount: amt,
        date,
      });
    }

    const mKey = String(p.method).toLowerCase();
    let groupKey = 'online';
    if (mKey === 'cash') groupKey = 'cash';
    else if (mKey === 'bank') groupKey = 'bank';
    else if (['ecocash', 'onemoney', 'innbucks'].includes(mKey)) groupKey = 'mobile';
    const pm = paymentMethodTotals.get(groupKey) || { amount: 0, count: 0 };
    if (!reversed) {
      pm.amount += amt;
      pm.count += 1;
    }
    paymentMethodTotals.set(groupKey, pm);

    const dupKey = `${st.id}|${date}|${amt}|${mKey}`;
    duplicateKeys.set(dupKey, (duplicateKeys.get(dupKey) || 0) + 1);
  }

  for (const [key, count] of duplicateKeys) {
    if (count < 2) continue;
    const [sid, date, amt] = key.split('|');
    const st = studentMap.get(sid);
    if (!st) continue;
    exceptions.push({
      type: 'duplicate',
      studentId: sid,
      admissionNumber: st.admissionNumber,
      studentName: `${st.firstName} ${st.lastName}`,
      className: st.className,
      description: `Possible duplicate: ${count} payments of $${amt} on ${date}`,
      amount: Number(amt),
      date,
    });
  }

  for (const a of aggList) {
    const st = a.student;
    const gradeKey = st.formName || 'Unassigned';
    const classKey = `${gradeKey}|${st.className || '—'}`;
    const gc = gradeClassMap.get(classKey) || {
      gradeKey,
      gradeLabel: gradeKey,
      classKey: st.className,
      classLabel: st.className || '—',
      studentCount: 0,
      totalExpected: 0,
      totalCollected: 0,
      outstanding: 0,
      collectionRatePct: 0,
      lowCollection: false,
    };
    gc.studentCount += 1;
    gc.totalExpected += a.expected;
    gc.totalCollected += a.collected;
    gradeClassMap.set(classKey, gc);

    if (a.status === 'unpaid' && a.expected > EPS) {
      exceptions.push({
        type: 'no_payment',
        studentId: st.id,
        admissionNumber: st.admissionNumber,
        studentName: `${st.firstName} ${st.lastName}`,
        className: st.className,
        description: 'No payment recorded for the current period',
        amount: a.expected,
      });
    } else if (a.expected > EPS && a.collected / a.expected < 0.5) {
      exceptions.push({
        type: 'under_collected',
        studentId: st.id,
        admissionNumber: st.admissionNumber,
        studentName: `${st.firstName} ${st.lastName}`,
        className: st.className,
        description: `Collected $${a.collected.toFixed(2)} vs expected $${a.expected.toFixed(2)} (${roundMoney((a.collected / a.expected) * 100)}%)`,
        amount: a.outstanding,
      });
    }
  }

  for (const [, row] of categoryMap) {
    row.outstanding = roundMoney(Math.max(0, row.expected - row.collected));
    row.collectionRatePct =
      row.expected > EPS ? roundMoney((row.collected / row.expected) * 100) : 0;
  }

  const byGradeClass = [...gradeClassMap.values()].map((gc) => {
    gc.outstanding = roundMoney(Math.max(0, gc.totalExpected - gc.totalCollected));
    gc.collectionRatePct =
      gc.totalExpected > EPS ? roundMoney((gc.totalCollected / gc.totalExpected) * 100) : 0;
    gc.lowCollection = gc.collectionRatePct < 60 && gc.totalExpected > EPS;
    return gc;
  });
  byGradeClass.sort((a, b) => a.collectionRatePct - b.collectionRatePct);

  const daily = [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date));
  for (const d of daily) d.dayTotal = roundMoney(d.dayTotal);

  const weekMap = new Map<string, WeeklyCollectionRow>();
  let cumulativeCollected = 0;
  let cumulativeExpected = 0;

  const addToWeek = (dateStr: string, expected: number, collected: number) => {
    const wk = isoWeekKey(dateStr);
    const row =
      weekMap.get(wk.key) ||
      ({
        weekKey: wk.key,
        weekLabel: wk.label,
        weekStart: wk.start,
        weekEnd: wk.end,
        totalExpected: 0,
        totalCollected: 0,
        totalOutstanding: 0,
        collectionRatePct: 0,
        cumulativeCollected: 0,
        cumulativeExpected: 0,
      } as WeeklyCollectionRow);
    row.totalExpected += expected;
    row.totalCollected += collected;
    weekMap.set(wk.key, row);
  };

  for (const inv of invoices) {
    if (!allowedStudentIds.has(inv.studentId)) continue;
    addToWeek(toDateKey(inv.issuedDate || inv.dueDate), Number(inv.totalAmount), 0);
  }
  for (const p of filteredPayments) {
    if (!allowedStudentIds.has(String(p.studentId))) continue;
    if (isReversedPayment(p.notes as string)) continue;
    addToWeek(toDateKey(p.paidAt as string), 0, Number(p.amount));
  }

  const weeklySorted = [...weekMap.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  let prevCollected = 0;
  for (const w of weeklySorted) {
    cumulativeExpected += w.totalExpected;
    cumulativeCollected += w.totalCollected;
    w.totalOutstanding = roundMoney(Math.max(0, w.totalExpected - w.totalCollected));
    w.collectionRatePct =
      w.totalExpected > EPS ? roundMoney((w.totalCollected / w.totalExpected) * 100) : 0;
    w.cumulativeCollected = roundMoney(cumulativeCollected);
    w.cumulativeExpected = roundMoney(cumulativeExpected);
    if (prevCollected > 0) {
      w.previousWeekCollected = prevCollected;
      w.weekOverWeekChangePct = roundMoney(((w.totalCollected - prevCollected) / prevCollected) * 100);
    }
    prevCollected = w.totalCollected;
  }

  const monthMap = new Map<string, MonthlyCollectionRow>();
  for (const inv of invoices) {
    if (!allowedStudentIds.has(inv.studentId)) continue;
    const mk = toDateKey(inv.issuedDate || inv.dueDate).slice(0, 7);
    const m =
      monthMap.get(mk) ||
      ({
        monthKey: mk,
        monthLabel: mk,
        totalExpected: 0,
        totalCollected: 0,
        totalOutstanding: 0,
        collectionRatePct: 0,
        variance: 0,
      } as MonthlyCollectionRow);
    m.totalExpected += Number(inv.totalAmount);
    monthMap.set(mk, m);
  }
  for (const p of filteredPayments) {
    if (!allowedStudentIds.has(String(p.studentId))) continue;
    if (isReversedPayment(p.notes as string)) continue;
    const mk = toDateKey(p.paidAt as string).slice(0, 7);
    const m =
      monthMap.get(mk) ||
      ({
        monthKey: mk,
        monthLabel: mk,
        totalExpected: 0,
        totalCollected: 0,
        totalOutstanding: 0,
        collectionRatePct: 0,
        variance: 0,
      } as MonthlyCollectionRow);
    m.totalCollected += Number(p.amount);
    monthMap.set(mk, m);
  }

  const monthly = [...monthMap.values()].sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  let prevRate = 0;
  for (const m of monthly) {
    m.totalOutstanding = roundMoney(Math.max(0, m.totalExpected - m.totalCollected));
    m.collectionRatePct =
      m.totalExpected > EPS ? roundMoney((m.totalCollected / m.totalExpected) * 100) : 0;
    m.variance = roundMoney(m.totalExpected - m.totalCollected);
    m.previousMonthRatePct = prevRate;
    prevRate = m.collectionRatePct;
  }

  const totalPaymentAmount = [...paymentMethodTotals.values()].reduce((s, v) => s + v.amount, 0);
  const paymentMethods: PaymentMethodRow[] = PAYMENT_METHOD_GROUPS.map((g) => {
    const t = paymentMethodTotals.get(g.key) || { amount: 0, count: 0 };
    return {
      key: g.key,
      label: g.label,
      amount: roundMoney(t.amount),
      percentage: totalPaymentAmount > EPS ? roundMoney((t.amount / totalPaymentAmount) * 100) : 0,
      transactionCount: t.count,
    };
  }).filter((r) => r.amount > 0 || r.transactionCount > 0);

  const today = toDateKey(new Date());
  const rangeStart = new Date(`${period.dateFrom}T12:00:00Z`);
  const rangeEnd = new Date(`${period.dateTo}T12:00:00Z`);
  const asOf = new Date(`${today}T12:00:00Z`);
  const endRef = asOf < rangeEnd ? asOf : rangeEnd;
  const daysElapsed = Math.max(1, Math.ceil((endRef.getTime() - rangeStart.getTime()) / 86400000) + 1);
  const daysTotal = Math.max(daysElapsed, Math.ceil((rangeEnd.getTime() - rangeStart.getTime()) / 86400000) + 1);
  const daysRemaining = Math.max(0, daysTotal - daysElapsed);
  const dailyRunRate = overview.totalCollected / daysElapsed;
  const projectedEndOfTermCollection = roundMoney(dailyRunRate * daysTotal);
  const budgetedExpected = overview.totalExpected;
  const projectedShortfall = roundMoney(Math.max(0, budgetedExpected - projectedEndOfTermCollection));
  const projectedSurplus = roundMoney(Math.max(0, projectedEndOfTermCollection - budgetedExpected));

  const projections: ProjectionSummary = {
    projectedEndOfTermCollection,
    budgetedExpected,
    projectedShortfall,
    projectedSurplus,
    estimatedRemainingCashFlow: roundMoney(overview.totalOutstanding * 0.65),
    daysElapsed,
    daysRemaining,
    dailyRunRate: roundMoney(dailyRunRate),
  };

  const dailyCollections: ChartSeriesPoint[] = daily.map((d) => ({
    label: d.date,
    value: d.dayTotal,
  }));

  let runCollected = 0;
  const cumulativeTrend: ChartSeriesPoint[] = [];
  const expectedPerDay = overview.totalExpected / Math.max(1, daysTotal);
  for (let i = 0; i < daysTotal; i++) {
    const d = new Date(rangeStart);
    d.setUTCDate(d.getUTCDate() + i);
    const key = d.toISOString().slice(0, 10);
    const dayPay = daily.find((x) => x.date === key);
    if (dayPay) runCollected += dayPay.dayTotal;
    if (key <= today) {
      cumulativeTrend.push({
        label: key,
        value: roundMoney(runCollected),
        value2: roundMoney(expectedPerDay * (i + 1)),
      });
    }
  }

  const feeTypeBreakdown: ChartSeriesPoint[] = [...categoryMap.values()]
    .filter((c) => c.collected > 0)
    .map((c) => ({ label: c.label, value: c.collected }));

  const gradeClassRates: ChartSeriesPoint[] = byGradeClass.slice(0, 12).map((g) => ({
    label: `${g.gradeLabel} ${g.classLabel}`.trim(),
    value: g.collectionRatePct,
  }));

  const monthlyTrend: ChartSeriesPoint[] = monthly.map((m) => ({
    label: m.monthLabel,
    value: m.collectionRatePct,
    value2: m.totalCollected,
  }));

  let compareOverview: FeeCollectionOverview | undefined;
  let compareTermName: string | undefined;
  if (params.compareTermId || (params.compareDateFrom && params.compareDateTo)) {
    const cmp = await buildFeeCollectionRevenueReport({
      ...params,
      termId: params.compareTermId || undefined,
      dateFrom: params.compareDateFrom,
      dateTo: params.compareDateTo,
      compareTermId: undefined,
      compareDateFrom: undefined,
      compareDateTo: undefined,
    });
    if (!('error' in cmp) && !('needsSelection' in cmp)) {
      compareOverview = cmp.overview;
      compareTermName = cmp.filters.termName;
    }
  }

  const report: FeeCollectionRevenueReport = {
    generatedAt: new Date().toISOString(),
    filters: {
      dateFrom: period.dateFrom,
      dateTo: period.dateTo,
      termId: params.termId,
      termName: period.termName,
      formId: params.formId,
      classId: params.classId,
      studentId,
      feeType: params.feeType,
      paymentMethod: params.paymentMethod,
      collectionStatus: params.collectionStatus,
      compareDateFrom: params.compareDateFrom,
      compareDateTo: params.compareDateTo,
      compareTermName,
    },
    overview,
    compareOverview,
    daily: params.summaryOnly ? [] : daily,
    weekly: params.summaryOnly ? [] : weeklySorted,
    monthly,
    byCategory: [...categoryMap.values()].sort((a, b) => b.expected - a.expected),
    byGradeClass,
    paymentMethods,
    exceptions: params.summaryOnly ? exceptions.slice(0, 20) : exceptions,
    projections,
    charts: {
      dailyCollections,
      cumulativeTrend,
      feeTypeBreakdown,
      gradeClassRates,
      monthlyTrend,
    },
    auditNote:
      'All payment transactions are recorded with cashier and receipt. Reversals and write-offs above threshold require dual authorization per school policy.',
  };

  return report;
}

export function feeCollectionReportToCsv(report: FeeCollectionRevenueReport, detailed: boolean): string {
  const esc = (v: string | number) => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines: string[] = [];
  lines.push('Fee Collection & Revenue Report');
  lines.push(`Period,${esc(report.filters.dateFrom)} to ${esc(report.filters.dateTo)}`);
  if (report.filters.termName) lines.push(`Term,${esc(report.filters.termName)}`);
  lines.push(`Generated,${esc(report.generatedAt)}`);
  lines.push('');
  lines.push('Revenue Overview');
  const o = report.overview;
  lines.push(`Expected,${o.totalExpected}`);
  lines.push(`Collected,${o.totalCollected}`);
  lines.push(`Outstanding,${o.totalOutstanding}`);
  lines.push(`Collection Rate %,${o.collectionRatePct}`);
  lines.push(`Paid in Full,${o.studentsPaidInFull}`);
  lines.push(`Partial,${o.studentsPartial}`);
  lines.push(`Unpaid,${o.studentsUnpaid}`);
  lines.push('');

  if (detailed) {
    lines.push('Daily Collections');
    lines.push(
      'Date,Student ID,Name,Class,Fee Type,Expected,Paid,Method,Receipt,Cashier,Outstanding After,Reversed',
    );
    for (const day of report.daily) {
      for (const p of day.payments) {
        lines.push(
          [
            esc(p.date),
            esc(p.admissionNumber),
            esc(p.studentName),
            esc(p.className || ''),
            esc(p.feeTypeLabel),
            p.amountExpected,
            p.amountPaid,
            esc(p.paymentMethod),
            esc(p.receiptNumber || ''),
            esc(p.cashierName || ''),
            p.outstandingAfter,
            p.reversed ? 'Yes' : 'No',
          ].join(','),
        );
      }
      lines.push(`Day Total ${day.date},,,,,,${day.dayTotal}`);
    }
    lines.push('');
    lines.push('Weekly Summary');
    lines.push('Week,Expected,Collected,Outstanding,Rate %,Cumulative Collected,WoW Change %');
    for (const w of report.weekly) {
      lines.push(
        [
          esc(w.weekLabel),
          w.totalExpected,
          w.totalCollected,
          w.totalOutstanding,
          w.collectionRatePct,
          w.cumulativeCollected,
          w.weekOverWeekChangePct ?? '',
        ].join(','),
      );
    }
    lines.push('');
    lines.push('By Grade/Class');
    lines.push('Grade,Class,Students,Expected,Collected,Outstanding,Rate %');
    for (const g of report.byGradeClass) {
      lines.push(
        [
          esc(g.gradeLabel),
          esc(g.classLabel || ''),
          g.studentCount,
          g.totalExpected,
          g.totalCollected,
          g.outstanding,
          g.collectionRatePct,
        ].join(','),
      );
    }
  } else {
    lines.push('Monthly Summary');
    lines.push('Month,Expected,Collected,Outstanding,Rate %,Variance');
    for (const m of report.monthly) {
      lines.push([m.monthLabel, m.totalExpected, m.totalCollected, m.totalOutstanding, m.collectionRatePct, m.variance].join(','));
    }
    lines.push('');
    lines.push('By Fee Category');
    lines.push('Category,Expected,Collected,Outstanding,Rate %');
    for (const c of report.byCategory) {
      lines.push([esc(c.label), c.expected, c.collected, c.outstanding, c.collectionRatePct].join(','));
    }
  }

  return '\uFEFF' + lines.join('\n');
}
