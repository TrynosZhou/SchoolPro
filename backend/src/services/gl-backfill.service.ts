import { AppDataSource } from '../config/data-source';
import { CashbookEntry, Payment, PayrollRun, User } from '../entities';
import { PayrollRunStatus, UserRole } from '../entities/enums';
import { ensureChartOfAccountsSeeded } from './ledger.service';
import {
  postCashbookExpenseToGl,
  postCashbookReceiptToGl,
  postFeePaymentToGl,
  postPayrollPaymentToGl,
} from './gl-posting.service';

export interface GlBackfillResult {
  paymentsPosted: number;
  cashbookExpensesPosted: number;
  cashbookReceiptsPosted: number;
  payrollRunsPosted: number;
  errors: string[];
}

async function resolveBackfillUserId(): Promise<string> {
  const userRepo = AppDataSource.getRepository(User);
  const admin = await userRepo.findOne({
    where: [{ role: UserRole.ADMIN }, { role: UserRole.DIRECTOR }, { role: UserRole.PRINCIPAL }],
    order: { createdAt: 'ASC' },
  });
  if (!admin) throw new Error('No admin user found for GL backfill.');
  return admin.id;
}

/** Post GL entries for financial records created before auto-posting was enabled. Idempotent. */
export async function backfillGeneralLedgerFromHistory(): Promise<GlBackfillResult> {
  await ensureChartOfAccountsSeeded();
  const userId = await resolveBackfillUserId();
  const manager = AppDataSource.manager;

  const result: GlBackfillResult = {
    paymentsPosted: 0,
    cashbookExpensesPosted: 0,
    cashbookReceiptsPosted: 0,
    payrollRunsPosted: 0,
    errors: [],
  };

  const payments = await AppDataSource.getRepository(Payment).find({
    order: { paidAt: 'ASC' },
  });
  for (const payment of payments) {
    try {
      const before = await manager.query(
        `SELECT 1 FROM general_ledger_entries
         WHERE "referenceType" = 'FEE_PAYMENT' AND "referenceId" = $1 AND "isReversed" = false LIMIT 1`,
        [payment.id],
      );
      if (before.length) continue;
      await postFeePaymentToGl(manager, payment, payment.recordedById || userId);
      result.paymentsPosted += 1;
    } catch (err) {
      result.errors.push(`Payment ${payment.paymentReference}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const cashbookEntries = await AppDataSource.getRepository(CashbookEntry).find({
    order: { entryDate: 'ASC', createdAt: 'ASC' },
  });
  for (const entry of cashbookEntries) {
    try {
      if (Number(entry.moneyOut) > 0) {
        const before = await manager.query(
          `SELECT 1 FROM general_ledger_entries
           WHERE "referenceType" = 'EXPENSE' AND "referenceId" = $1 AND "isReversed" = false LIMIT 1`,
          [entry.id],
        );
        if (!before.length) {
          await postCashbookExpenseToGl(entry, entry.recordedById || userId);
          result.cashbookExpensesPosted += 1;
        }
      } else if (Number(entry.moneyIn) > 0 && !entry.studentId) {
        const before = await manager.query(
          `SELECT 1 FROM general_ledger_entries
           WHERE "referenceType" = 'OTHER' AND "referenceId" = $1 AND "isReversed" = false LIMIT 1`,
          [entry.id],
        );
        if (!before.length) {
          await postCashbookReceiptToGl(entry, entry.recordedById || userId);
          result.cashbookReceiptsPosted += 1;
        }
      }
    } catch (err) {
      result.errors.push(`Cashbook ${entry.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const payrollRuns = await AppDataSource.getRepository(PayrollRun).find({
    where: { status: PayrollRunStatus.PAID },
    order: { paidAt: 'ASC', createdAt: 'ASC' },
  });
  for (const run of payrollRuns) {
    try {
      const before = await manager.query(
        `SELECT 1 FROM general_ledger_entries
         WHERE "referenceType" = 'SALARY' AND "referenceId" = $1 AND "isReversed" = false LIMIT 1`,
        [run.id],
      );
      if (before.length) continue;
      await postPayrollPaymentToGl(run, run.paidByUserId || userId);
      result.payrollRunsPosted += 1;
    } catch (err) {
      result.errors.push(`Payroll ${run.year}-${run.month}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}
