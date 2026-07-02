import { AppDataSource } from '../config/data-source';
import { Form, Invoice, LedgerEntry, SchoolFee, Student, Term } from '../entities';
import { InvoiceStatus } from '../entities/enums';
import { generateNumber, today, invoiceDescriptionWithTerm } from '../utils/helpers';
import { generateInvoicePdf } from '../utils/pdf';
import {
  applyAvailablePrepaidToInvoice,
  ensureTermBalanceInitialized,
  refreshTermClosingBalance,
  roundMoney,
} from './term-balance.service';
import { ensureDefaultSchoolFees } from './fee-catalog.service';
import { loadSchoolBranding } from './school-branding.service';
import { relations } from '../utils/typeorm-helpers';
import {
  buildFeeInvoiceLines,
  buildTuitionInvoiceLines,
  getActiveExemptionForStudent,
} from './tuition-exemption.service';

export const REGISTRATION_FEE_CODES = {
  desk: 'desk_fee',
  registration: 'registration_fee',
  tuitionOrdinary: 'ordinary_level_tuition',
  tuitionAdvanced: 'advanced_level_tuition',
} as const;

export const REGISTRATION_FEE_DEFINITIONS: Partial<SchoolFee>[] = [
  {
    code: REGISTRATION_FEE_CODES.desk,
    name: 'Desk Fee',
    icon: '🪑',
    sortOrder: 10,
    defaultAmount: 0,
    isActive: true,
  },
  {
    code: REGISTRATION_FEE_CODES.registration,
    name: 'Registration Fee',
    icon: '📝',
    sortOrder: 11,
    defaultAmount: 0,
    isActive: true,
  },
  {
    code: REGISTRATION_FEE_CODES.tuitionOrdinary,
    name: 'Ordinary Level Tuition',
    icon: '📚',
    sortOrder: 12,
    defaultAmount: 0,
    isActive: true,
  },
  {
    code: REGISTRATION_FEE_CODES.tuitionAdvanced,
    name: 'Advanced Level Tuition',
    icon: '🎓',
    sortOrder: 13,
    defaultAmount: 0,
    isActive: true,
  },
];

export async function ensureRegistrationSchoolFees(): Promise<void> {
  await ensureDefaultSchoolFees();
  const repo = AppDataSource.getRepository(SchoolFee);
  for (const def of REGISTRATION_FEE_DEFINITIONS) {
    const existing = await repo.findOne({ where: { code: def.code! } });
    if (!existing) {
      await repo.save(repo.create(def));
    }
  }
}

export function resolveFormLevel(form: Form): number {
  if (form.level >= 1 && form.level <= 6) return form.level;
  const match = form.name.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 1;
}

export function tuitionFeeCodeForFormLevel(level: number): string {
  return level >= 5
    ? REGISTRATION_FEE_CODES.tuitionAdvanced
    : REGISTRATION_FEE_CODES.tuitionOrdinary;
}

export async function getCurrentTermId(): Promise<string | undefined> {
  const term = await AppDataSource.getRepository(Term).findOne({
    where: { isCurrent: true },
  });
  return term?.id;
}

/** Resolve the tuition fee catalog row for a student's form level (O-Level vs A-Level). */
export async function resolveTuitionFeeForFormLevel(level: number): Promise<SchoolFee | null> {
  await ensureRegistrationSchoolFees();

  const feeRepo = AppDataSource.getRepository(SchoolFee);
  const fees = await feeRepo.find({ order: { sortOrder: 'ASC', name: 'ASC' } });
  const activeFees = fees.filter((f) => f.isActive);

  const norm = (v: string) => String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const byCode = (pool: SchoolFee[], code: string) => pool.find((f) => norm(f.code) === norm(code));
  const byNameHint = (pool: SchoolFee[], hints: string[]) =>
    pool.find((f) => hints.some((h) => norm(f.name).includes(norm(h)) || norm(f.code).includes(norm(h))));

  const resolveFee = (
    preferredCode: string,
    aliases: string[],
    opts?: { preferNonZeroAmount?: boolean; rejectHints?: string[] },
  ): SchoolFee | undefined => {
    let candidates = [
      byCode(activeFees, preferredCode),
      byNameHint(activeFees, aliases),
      byCode(fees, preferredCode),
      byNameHint(fees, aliases),
    ].filter(Boolean) as SchoolFee[];

    if (!candidates.length) return undefined;
    if (opts?.rejectHints?.length) {
      const rejects = opts.rejectHints.map((h) => norm(h));
      const filtered = candidates.filter((f) => {
        const text = `${norm(f.code)} ${norm(f.name)}`;
        return !rejects.some((r) => text.includes(r));
      });
      if (filtered.length) candidates = filtered;
    }
    if (opts?.preferNonZeroAmount) {
      const nonZero = candidates.find((f) => Number(f.defaultAmount) > 0);
      if (nonZero) return nonZero;
    }
    return candidates[0];
  };

  const tuitionCode = tuitionFeeCodeForFormLevel(level);
  let tuitionFee = resolveFee(
    tuitionCode,
    level >= 5
      ? ['advanced level tuition', 'a level tuition', 'advanced tuition', 'tuition fees', 'tuition']
      : ['ordinary level tuition', 'o level tuition', 'ordinary tuition', 'tuition fees', 'tuition'],
    {
      preferNonZeroAmount: true,
      rejectHints: level >= 5 ? ['ordinary', 'o level', 'olevel'] : ['advanced', 'a level', 'alevel'],
    },
  );
  if (level < 5 && (!tuitionFee || Number(tuitionFee.defaultAmount) <= 0)) {
    const ordinaryFallback = resolveFee(
      'tuition',
      ['ordinary level tuition fees', 'ordinary tuition', 'tuition fees', 'tuition'],
      { preferNonZeroAmount: true, rejectHints: ['advanced', 'a level', 'alevel'] },
    );
    if (ordinaryFallback) tuitionFee = ordinaryFallback;
  }

  if (!tuitionFee) {
    const def = REGISTRATION_FEE_DEFINITIONS.find((d) => d.code === tuitionCode);
    if (def) {
      tuitionFee = await feeRepo.save(
        feeRepo.create({
          ...def,
          isActive: true,
          defaultAmount: Number(def.defaultAmount || 0),
        }),
      );
    }
  }

  return tuitionFee || null;
}

export function bulkTuitionInvoiceDescription(termName: string): string {
  return `Tuition fees for ${termName}`;
}

export async function createRegistrationInvoiceForStudent(
  student: Student,
  form: Form,
): Promise<Invoice> {
  await ensureRegistrationSchoolFees();

  const invoiceRepo = AppDataSource.getRepository(Invoice);
  const existing = await invoiceRepo.findOne({
    where: {
      studentId: student.id,
      feeType: REGISTRATION_FEE_CODES.registration,
    },
    relations: relations('lines'),
    order: { createdAt: 'DESC' },
  });

  const level = resolveFormLevel(form);
  const tuitionCode = tuitionFeeCodeForFormLevel(level);

  const feeRepo = AppDataSource.getRepository(SchoolFee);
  const fees = await feeRepo.find({ order: { sortOrder: 'ASC', name: 'ASC' } });
  const activeFees = fees.filter((f) => f.isActive);

  const norm = (v: string) => String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const byCode = (pool: SchoolFee[], code: string) => pool.find((f) => norm(f.code) === norm(code));
  const byNameHint = (pool: SchoolFee[], hints: string[]) =>
    pool.find((f) => hints.some((h) => norm(f.name).includes(norm(h)) || norm(f.code).includes(norm(h))));

  const resolveFee = (
    preferredCode: string,
    aliases: string[],
    opts?: { preferNonZeroAmount?: boolean; rejectHints?: string[] },
  ): SchoolFee | undefined => {
    let candidates = [
      byCode(activeFees, preferredCode),
      byNameHint(activeFees, aliases),
      byCode(fees, preferredCode),
      byNameHint(fees, aliases),
    ].filter(Boolean) as SchoolFee[];

    if (!candidates.length) return undefined;
    if (opts?.rejectHints?.length) {
      const rejects = opts.rejectHints.map((h) => norm(h));
      const filtered = candidates.filter((f) => {
        const text = `${norm(f.code)} ${norm(f.name)}`;
        return !rejects.some((r) => text.includes(r));
      });
      if (filtered.length) candidates = filtered;
    }
    if (opts?.preferNonZeroAmount) {
      const nonZero = candidates.find((f) => Number(f.defaultAmount) > 0);
      if (nonZero) return nonZero;
    }
    return candidates[0];
  };

  let deskFee = resolveFee(REGISTRATION_FEE_CODES.desk, ['desk fee', 'desk']);
  let registrationFee = resolveFee(REGISTRATION_FEE_CODES.registration, ['registration fee', 'registration']);
  let tuitionFee = resolveFee(
    tuitionCode,
    level >= 5
      ? ['advanced level tuition', 'a level tuition', 'advanced tuition', 'tuition fees', 'tuition']
      : ['ordinary level tuition', 'o level tuition', 'ordinary tuition', 'tuition fees', 'tuition'],
    {
      preferNonZeroAmount: true,
      rejectHints: level >= 5 ? ['ordinary', 'o level', 'olevel'] : ['advanced', 'a level', 'alevel'],
    },
  );
  if (level < 5 && (!tuitionFee || Number(tuitionFee.defaultAmount) <= 0)) {
    const ordinaryFallback = resolveFee(
      'tuition',
      ['ordinary level tuition fees', 'ordinary tuition', 'tuition fees', 'tuition'],
      { preferNonZeroAmount: true, rejectHints: ['advanced', 'a level', 'alevel'] },
    );
    if (ordinaryFallback) tuitionFee = ordinaryFallback;
  }

  // Ensure required registration fee rows exist if still unresolved.
  const missingCodes: string[] = [];
  if (!deskFee) missingCodes.push(REGISTRATION_FEE_CODES.desk);
  if (!registrationFee) missingCodes.push(REGISTRATION_FEE_CODES.registration);
  if (!tuitionFee) missingCodes.push(tuitionCode);

  if (missingCodes.length > 0) {
    const byCode = new Map(REGISTRATION_FEE_DEFINITIONS.map((d) => [d.code!, d]));
    for (const code of missingCodes) {
      const def = byCode.get(code);
      if (!def) continue;
      const created = await feeRepo.save(
        feeRepo.create({
          ...def,
          isActive: true,
          defaultAmount: Number(def.defaultAmount || 0),
        }),
      );
      fees.push(created);
      if (code === REGISTRATION_FEE_CODES.desk) deskFee = created;
      if (code === REGISTRATION_FEE_CODES.registration) registrationFee = created;
      if (code === tuitionCode) tuitionFee = created;
    }
  }
  if (!deskFee || !registrationFee || !tuitionFee) {
    throw new Error('Unable to resolve registration fees (desk, registration, tuition) from Manage Fees.');
  }

  const termId = await getCurrentTermId();
  const termRepo = AppDataSource.getRepository(Term);
  const term = termId ? await termRepo.findOne({ where: { id: termId } }) : null;
  const tuitionExemption = await getActiveExemptionForStudent(student.id);
  const tuitionLines = buildTuitionInvoiceLines(
    tuitionFee.name,
    term?.name || 'Current term',
    Number(tuitionFee.defaultAmount),
    tuitionExemption,
  );

  const lines = [
    ...buildFeeInvoiceLines(deskFee.name, Number(deskFee.defaultAmount), tuitionExemption),
    ...buildFeeInvoiceLines(registrationFee.name, Number(registrationFee.defaultAmount), tuitionExemption),
    ...tuitionLines,
  ];

  const totalAmount = roundMoney(lines.reduce((s, l) => s + l.amount, 0));
  const due = new Date();
  due.setDate(due.getDate() + 30);
  const dueDate = due.toISOString().split('T')[0];
  const description = invoiceDescriptionWithTerm(
    `New student registration — ${form.name} (${student.admissionNumber})`,
    term?.name,
  );

  const ledgerRepo = AppDataSource.getRepository(LedgerEntry);
  let invoice: Invoice;
  if (existing) {
    const oldTotal = Number(existing.totalAmount || 0);
    const paid = Number(existing.amountPaid || 0);
    existing.termId = termId;
    existing.feeType = REGISTRATION_FEE_CODES.registration;
    existing.description = description;
    existing.totalAmount = totalAmount;
    existing.issuedDate = today();
    existing.dueDate = dueDate;
    existing.lines = lines as any;
    existing.status =
      paid >= totalAmount
        ? InvoiceStatus.PAID
        : paid > 0
          ? InvoiceStatus.PARTIAL
          : InvoiceStatus.SENT;
    invoice = await invoiceRepo.save(existing);

    const delta = totalAmount - oldTotal;
    if (delta !== 0) {
      const lastLedger = await ledgerRepo.findOne({
        where: { studentId: student.id },
        order: { createdAt: 'DESC' },
      });
      const prevBalance = lastLedger ? Number(lastLedger.balance) : 0;
      await ledgerRepo.save(
        ledgerRepo.create({
          studentId: student.id,
          termId,
          entryDate: today(),
          description: `Registration invoice adjustment ${invoice.invoiceNumber}`,
          debit: delta > 0 ? delta : 0,
          credit: delta < 0 ? Math.abs(delta) : 0,
          balance: prevBalance + delta,
          referenceType: 'invoice',
          referenceId: invoice.id,
        }),
      );
    }
  } else {
    const created = invoiceRepo.create({
      invoiceNumber: generateNumber('INV'),
      studentId: student.id,
      termId,
      feeType: REGISTRATION_FEE_CODES.registration,
      description,
      totalAmount,
      amountPaid: 0,
      issuedDate: today(),
      dueDate,
      status: InvoiceStatus.SENT,
      lines,
    });
    invoice = await invoiceRepo.save(Array.isArray(created) ? created[0] : created);

    const lastLedger = await ledgerRepo.findOne({
      where: { studentId: student.id },
      order: { createdAt: 'DESC' },
    });
    const prevBalance = lastLedger ? Number(lastLedger.balance) : 0;
    await ledgerRepo.save(
      ledgerRepo.create({
        studentId: student.id,
        termId,
        entryDate: today(),
        description: `Invoice ${invoice.invoiceNumber} - ${description}`,
        debit: totalAmount,
        credit: 0,
        balance: prevBalance + totalAmount,
        referenceType: 'invoice',
        referenceId: invoice.id,
      }),
    );
  }

  const branding = await loadSchoolBranding();
  let termName: string | undefined;
  if (termId) {
    const term = await AppDataSource.getRepository(Term).findOne({ where: { id: termId } });
    termName = term?.name;
  }

  const studentRepo = AppDataSource.getRepository(Student);
  const fullStudent = await studentRepo.findOne({
    where: { id: student.id },
    relations: relations('schoolClass', 'form'),
  });

  const pdfPath = await generateInvoicePdf({
    invoiceNumber: invoice.invoiceNumber,
    studentName: `${student.firstName} ${student.lastName}`,
    admissionNumber: student.admissionNumber,
    className: fullStudent?.schoolClass?.name || form.name,
    description,
    feeType: invoice.feeType,
    issuedDate: invoice.issuedDate || today(),
    dueDate,
    status: invoice.status,
    totalAmount,
    amountPaid: 0,
    termName,
    lines,
    ...branding,
  });
  invoice.pdfPath = pdfPath;
  await invoiceRepo.save(invoice);

  if (termId) {
    await ensureTermBalanceInitialized(student.id, termId);
    await applyAvailablePrepaidToInvoice(invoice);
    await refreshTermClosingBalance(student.id, termId);
  }

  return invoiceRepo.findOne({
    where: { id: invoice.id },
    relations: relations('lines'),
  }) as Promise<Invoice>;
}
