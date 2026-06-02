import { AppDataSource } from '../config/data-source';
import { Invoice, InvoiceLine, LedgerEntry, Student, StudentTermBalance, Term } from '../entities';
import { InvoiceStatus } from '../entities/enums';
import { relations } from '../utils/typeorm-helpers';
import { generateNumber } from '../utils/helpers';

export const BALANCE_FORWARD_FEE_TYPE = 'balance_forward';

const EPS = 0.005;

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function findPreviousTerm(term: Term): Promise<Term | null> {
  const termRepo = AppDataSource.getRepository(Term);

  if (term.termNumber > 1) {
    const priorInYear = await termRepo.findOne({
      where: { schoolYearId: term.schoolYearId, termNumber: term.termNumber - 1 },
    });
    if (priorInYear) return priorInYear;
  }

  const rows = await AppDataSource.query(
    `
      SELECT t.*
      FROM terms t
      INNER JOIN school_years y ON y.id = t."schoolYearId"
      WHERE y."startDate" < (
        SELECT y2."startDate" FROM school_years y2 WHERE y2.id = $1
      )
      ORDER BY y."startDate" DESC, t."termNumber" DESC
      LIMIT 1
    `,
    [term.schoolYearId],
  );

  return rows[0] || null;
}

export async function findNextTerm(term: Term): Promise<Term | null> {
  const termRepo = AppDataSource.getRepository(Term);

  const nextInYear = await termRepo.findOne({
    where: { schoolYearId: term.schoolYearId, termNumber: term.termNumber + 1 },
  });
  if (nextInYear) return nextInYear;

  const rows = await AppDataSource.query(
    `
      SELECT t.*
      FROM terms t
      INNER JOIN school_years y ON y.id = t."schoolYearId"
      WHERE y."startDate" > (
        SELECT y2."startDate" FROM school_years y2 WHERE y2.id = $1
      )
      ORDER BY y."startDate" ASC, t."termNumber" ASC
      LIMIT 1
    `,
    [term.schoolYearId],
  );

  return rows[0] || null;
}

export async function getAvailablePrepaidCredit(tb: StudentTermBalance): Promise<number> {
  const openingCredit =
    Number(tb.openingBalance) < 0
      ? Math.max(0, Math.abs(Number(tb.openingBalance)) - Number(tb.prepaidApplied))
      : 0;
  const overpayCredit = Math.max(
    0,
    Number(tb.overpaymentPrepaid) - Number(tb.overpaymentPrepaidApplied),
  );
  return roundMoney(openingCredit + overpayCredit);
}

/** Net invoice balance for a term: positive = owes, negative = prepaid credit remaining. */
export async function computeTermNetBalance(studentId: string, termId: string): Promise<number> {
  const invoiceRepo = AppDataSource.getRepository(Invoice);
  const tbRepo = AppDataSource.getRepository(StudentTermBalance);

  const invoices = await invoiceRepo.find({ where: { studentId, termId } });
  const invoiceDue = roundMoney(
    invoices.reduce(
      (sum, inv) => sum + Math.max(0, Number(inv.totalAmount) - Number(inv.amountPaid)),
      0,
    ),
  );

  const tb = await tbRepo.findOne({ where: { studentId, termId } });
  if (!tb) return invoiceDue;

  const prepaidAvailable = await getAvailablePrepaidCredit(tb);
  return roundMoney(invoiceDue - prepaidAvailable);
}

async function syncCarryForwardInvoice(
  studentId: string,
  termId: string,
  term: Term,
  openingArrears: number,
  tb: StudentTermBalance,
): Promise<void> {
  const invoiceRepo = AppDataSource.getRepository(Invoice);
  const ledgerRepo = AppDataSource.getRepository(LedgerEntry);
  const prevTerm = await findPreviousTerm(term);
  const prevLabel = prevTerm?.name || 'previous term';
  const description = `Balance brought forward from ${prevLabel}`;
  const amount = roundMoney(openingArrears);

  let invoice = tb.carryForwardInvoiceId
    ? await invoiceRepo.findOne({ where: { id: tb.carryForwardInvoiceId, studentId } })
    : null;

  if (!invoice) {
    invoice = await invoiceRepo.findOne({
      where: { studentId, termId, feeType: BALANCE_FORWARD_FEE_TYPE },
    });
  }

  if (invoice) {
    const prevTotal = Number(invoice.totalAmount);
    invoice.totalAmount = amount;
    invoice.description = description;
    invoice.dueDate = term.startDate;
    invoice.issuedDate = term.startDate;
    if (Number(invoice.amountPaid) > amount) {
      invoice.amountPaid = amount;
    }
    invoice.status =
      Number(invoice.amountPaid) >= amount
        ? InvoiceStatus.PAID
        : Number(invoice.amountPaid) > 0
          ? InvoiceStatus.PARTIAL
          : InvoiceStatus.SENT;
    await invoiceRepo.save(invoice);

    if (Math.abs(prevTotal - amount) > EPS) {
      const lastLedger = await ledgerRepo.findOne({
        where: { studentId, referenceType: 'invoice', referenceId: invoice.id },
        order: { createdAt: 'DESC' },
      });
      if (lastLedger) {
        const delta = amount - prevTotal;
        const prevBalance = lastLedger ? Number(lastLedger.balance) : 0;
        await ledgerRepo.save(
          ledgerRepo.create({
            studentId,
            termId,
            entryDate: today(),
            description: `Carry-forward adjustment — ${invoice.invoiceNumber}`,
            debit: delta > 0 ? delta : 0,
            credit: delta < 0 ? Math.abs(delta) : 0,
            balance: prevBalance + delta,
            referenceType: 'invoice',
            referenceId: invoice.id,
          }),
        );
      }
    }
  } else {
    invoice = await invoiceRepo.save(
      invoiceRepo.create({
        invoiceNumber: generateNumber('INV'),
        studentId,
        termId,
        feeType: BALANCE_FORWARD_FEE_TYPE,
        description,
        totalAmount: amount,
        amountPaid: 0,
        status: InvoiceStatus.SENT,
        dueDate: term.startDate,
        issuedDate: term.startDate,
      }),
    );

    const lineRepo = AppDataSource.getRepository(InvoiceLine);
    await lineRepo.save(
      lineRepo.create({
        invoiceId: invoice.id,
        description,
        quantity: 1,
        unitPrice: amount,
        amount,
      }),
    );

    const lastLedger = await ledgerRepo.findOne({
      where: { studentId },
      order: { createdAt: 'DESC' },
    });
    const prevBalance = lastLedger ? Number(lastLedger.balance) : 0;
    await ledgerRepo.save(
      ledgerRepo.create({
        studentId,
        termId,
        entryDate: today(),
        description: `Invoice ${invoice.invoiceNumber} - ${description}`,
        debit: amount,
        credit: 0,
        balance: prevBalance + amount,
        referenceType: 'invoice',
        referenceId: invoice.id,
      }),
    );
  }

  tb.carryForwardInvoiceId = invoice.id;
}

export async function ensureTermBalanceInitialized(
  studentId: string,
  termId: string,
): Promise<StudentTermBalance> {
  const tbRepo = AppDataSource.getRepository(StudentTermBalance);
  const termRepo = AppDataSource.getRepository(Term);

  let tb = await tbRepo.findOne({ where: { studentId, termId } });
  if (tb?.initialized) {
    tb.closingBalance = await computeTermNetBalance(studentId, termId);
    return tbRepo.save(tb);
  }

  const term = await termRepo.findOne({ where: { id: termId } });
  if (!term) throw new Error('Term not found');

  const prevTerm = await findPreviousTerm(term);
  let openingBalance = 0;
  if (prevTerm) {
    await ensureTermBalanceInitialized(studentId, prevTerm.id);
    openingBalance = await computeTermNetBalance(studentId, prevTerm.id);
  }

  if (!tb) {
    tb = tbRepo.create({
      studentId,
      termId,
      openingBalance,
      prepaidApplied: 0,
      overpaymentPrepaid: 0,
      overpaymentPrepaidApplied: 0,
      initialized: false,
    });
  } else {
    tb.openingBalance = openingBalance;
  }

  if (openingBalance > EPS) {
    await syncCarryForwardInvoice(studentId, termId, term, openingBalance, tb);
  } else if (tb.carryForwardInvoiceId) {
    const invoiceRepo = AppDataSource.getRepository(Invoice);
    const existing = await invoiceRepo.findOne({ where: { id: tb.carryForwardInvoiceId } });
    if (existing && Number(existing.amountPaid) <= EPS) {
      await invoiceRepo.remove(existing);
      tb.carryForwardInvoiceId = null;
    }
  }

  tb.initialized = true;
  tb.closingBalance = await computeTermNetBalance(studentId, termId);
  return tbRepo.save(tb);
}

export async function applyAvailablePrepaidToInvoice(invoice: Invoice): Promise<Invoice> {
  if (!invoice.termId || invoice.feeType === BALANCE_FORWARD_FEE_TYPE) return invoice;

  const tbRepo = AppDataSource.getRepository(StudentTermBalance);
  const invoiceRepo = AppDataSource.getRepository(Invoice);

  const tb = await ensureTermBalanceInitialized(invoice.studentId, invoice.termId);
  let available = await getAvailablePrepaidCredit(tb);
  if (available <= EPS) return invoice;

  const due = Math.max(0, Number(invoice.totalAmount) - Number(invoice.amountPaid));
  const apply = roundMoney(Math.min(available, due));
  if (apply <= EPS) return invoice;

  invoice.amountPaid = roundMoney(Number(invoice.amountPaid) + apply);
  invoice.status =
    Number(invoice.amountPaid) >= Number(invoice.totalAmount)
      ? InvoiceStatus.PAID
      : InvoiceStatus.PARTIAL;

  let remaining = apply;
  const openingCreditRemaining = Math.max(
    0,
    (Number(tb.openingBalance) < 0 ? Math.abs(Number(tb.openingBalance)) : 0) - Number(tb.prepaidApplied),
  );
  const fromOpening = Math.min(remaining, openingCreditRemaining);
  tb.prepaidApplied = roundMoney(Number(tb.prepaidApplied) + fromOpening);
  remaining = roundMoney(remaining - fromOpening);
  if (remaining > EPS) {
    tb.overpaymentPrepaidApplied = roundMoney(Number(tb.overpaymentPrepaidApplied) + remaining);
  }

  tb.closingBalance = await computeTermNetBalance(invoice.studentId, invoice.termId);
  await tbRepo.save(tb);
  return invoiceRepo.save(invoice);
}

export async function recordOverpaymentPrepaid(
  studentId: string,
  termId: string | undefined,
  amount: number,
): Promise<void> {
  const credit = roundMoney(amount);
  if (credit <= EPS) return;

  const resolvedTermId = termId || (await resolveCurrentTermId());
  if (!resolvedTermId) return;

  const tbRepo = AppDataSource.getRepository(StudentTermBalance);
  const tb = await ensureTermBalanceInitialized(studentId, resolvedTermId);
  tb.overpaymentPrepaid = roundMoney(Number(tb.overpaymentPrepaid) + credit);
  tb.closingBalance = await computeTermNetBalance(studentId, resolvedTermId);
  await tbRepo.save(tb);
}

async function resolveCurrentTermId(): Promise<string | undefined> {
  const termRepo = AppDataSource.getRepository(Term);
  const current = await termRepo.findOne({ where: { isCurrent: true } });
  return current?.id;
}

export async function refreshTermClosingBalance(studentId: string, termId: string): Promise<number> {
  const tbRepo = AppDataSource.getRepository(StudentTermBalance);
  const tb = await ensureTermBalanceInitialized(studentId, termId);
  const closing = await computeTermNetBalance(studentId, termId);
  tb.closingBalance = closing;
  await tbRepo.save(tb);
  return closing;
}

export async function carryForwardBalancesForTerm(termId: string): Promise<{ studentsProcessed: number }> {
  const studentRepo = AppDataSource.getRepository(Student);
  const students = await studentRepo.find({ where: { isActive: true } });
  for (const student of students) {
    await ensureTermBalanceInitialized(student.id, termId);
  }
  return { studentsProcessed: students.length };
}

export async function getTermBalanceSummary(studentId: string, termId: string) {
  const termRepo = AppDataSource.getRepository(Term);
  const tb = await ensureTermBalanceInitialized(studentId, termId);
  const term = await termRepo.findOne({ where: { id: termId } });
  const prevTerm = term ? await findPreviousTerm(term) : null;
  const prepaidAvailable = await getAvailablePrepaidCredit(tb);
  const netBalance = await computeTermNetBalance(studentId, termId);

  return {
    termId,
    termName: term?.name,
    previousTermName: prevTerm?.name,
    openingBalance: Number(tb.openingBalance),
    prepaidApplied: Number(tb.prepaidApplied),
    overpaymentPrepaid: Number(tb.overpaymentPrepaid),
    overpaymentPrepaidApplied: Number(tb.overpaymentPrepaidApplied),
    prepaidCreditAvailable: prepaidAvailable,
    closingBalance: netBalance,
    carryForwardInvoiceId: tb.carryForwardInvoiceId,
  };
}

export async function resolvePaymentTermId(
  studentId: string,
  invoiceId?: string,
): Promise<string | undefined> {
  if (invoiceId) {
    const invoice = await AppDataSource.getRepository(Invoice).findOne({ where: { id: invoiceId, studentId } });
    if (invoice?.termId) return invoice.termId;
  }
  return resolveCurrentTermId();
}
