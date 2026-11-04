import { EntityManager } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import { CashbookEntry, Payment, PayrollRun } from '../entities';
import { GlReferenceType } from '../entities/enums';
import {
  GL_ACCOUNT_CODES,
  postEntry,
  resolveGlAccountIdByCode,
  revenueAccountCodeForFeeType,
} from './ledger.service';

async function alreadyPosted(
  manager: EntityManager | typeof AppDataSource.manager,
  referenceType: GlReferenceType,
  referenceId: string,
): Promise<boolean> {
  const rows = await manager.query(
    `SELECT 1 FROM general_ledger_entries
     WHERE "referenceType" = $1 AND "referenceId" = $2 AND "isReversed" = false
     LIMIT 1`,
    [referenceType, referenceId],
  );
  return rows.length > 0;
}

export async function postFeePaymentToGl(
  manager: EntityManager,
  payment: Payment,
  userId: string,
): Promise<void> {
  if (!userId || !payment?.id) return;
  if (await alreadyPosted(manager, GlReferenceType.FEE_PAYMENT, payment.id)) return;

  const amount = Number(payment.amount);
  if (amount <= 0) return;

  const cashId = await resolveGlAccountIdByCode(GL_ACCOUNT_CODES.CASH_BANK);
  const revenueCode = revenueAccountCodeForFeeType(payment.feeType || payment.label);
  const revenueId = await resolveGlAccountIdByCode(revenueCode);

  await postEntry(
    {
      debitAccountId: cashId,
      creditAccountId: revenueId,
      amount,
      description: `Fee payment ${payment.paymentReference} — ${payment.label || 'School fees'}`,
      referenceType: GlReferenceType.FEE_PAYMENT,
      referenceId: payment.id,
      userId,
      transactionDate: payment.paidAt instanceof Date
        ? payment.paidAt.toISOString().slice(0, 10)
        : String(payment.paidAt).slice(0, 10),
    },
    manager,
  );
}

export async function postPayrollPaymentToGl(run: PayrollRun, userId: string): Promise<void> {
  if (!userId || !run?.id) return;
  if (await alreadyPosted(AppDataSource.manager, GlReferenceType.SALARY, run.id)) return;

  const amount = Number(run.totalNet);
  if (amount <= 0) return;

  const salaryId = await resolveGlAccountIdByCode(GL_ACCOUNT_CODES.SALARY_EXPENSE);
  const cashId = await resolveGlAccountIdByCode(GL_ACCOUNT_CODES.CASH_BANK);

  await postEntry({
    debitAccountId: salaryId,
    creditAccountId: cashId,
    amount,
    description: `Payroll ${run.year}-${String(run.month).padStart(2, '0')} — net salaries paid`,
    referenceType: GlReferenceType.SALARY,
    referenceId: run.id,
    userId,
    transactionDate: run.paidAt
      ? new Date(run.paidAt).toISOString().slice(0, 10)
      : undefined,
  });
}

export async function postCashbookExpenseToGl(entry: CashbookEntry, userId: string): Promise<void> {
  if (!userId || !entry?.id) return;
  if (await alreadyPosted(AppDataSource.manager, GlReferenceType.EXPENSE, entry.id)) return;

  const moneyOut = Number(entry.moneyOut);
  if (moneyOut <= 0) return;

  const expenseCode = /utilit|electric|water/i.test(entry.description)
    ? GL_ACCOUNT_CODES.UTILITY_EXPENSE
    : GL_ACCOUNT_CODES.MAINTENANCE_EXPENSE;
  const expenseId = await resolveGlAccountIdByCode(expenseCode);
  const cashId = await resolveGlAccountIdByCode(GL_ACCOUNT_CODES.CASH_BANK);

  await postEntry({
    debitAccountId: expenseId,
    creditAccountId: cashId,
    amount: moneyOut,
    description: `Expense — ${entry.description}`,
    referenceType: GlReferenceType.EXPENSE,
    referenceId: entry.id,
    userId,
    transactionDate: entry.entryDate,
  });
}

export async function postCashbookReceiptToGl(entry: CashbookEntry, userId: string): Promise<void> {
  if (!userId || !entry?.id || entry.studentId) return;
  if (await alreadyPosted(AppDataSource.manager, GlReferenceType.OTHER, entry.id)) return;

  const moneyIn = Number(entry.moneyIn);
  if (moneyIn <= 0) return;

  const cashId = await resolveGlAccountIdByCode(GL_ACCOUNT_CODES.CASH_BANK);
  const incomeId = await resolveGlAccountIdByCode(GL_ACCOUNT_CODES.OTHER_INCOME);

  await postEntry({
    debitAccountId: cashId,
    creditAccountId: incomeId,
    amount: moneyIn,
    description: `Cash receipt — ${entry.description}`,
    referenceType: GlReferenceType.OTHER,
    referenceId: entry.id,
    userId,
    transactionDate: entry.entryDate,
  });
}
