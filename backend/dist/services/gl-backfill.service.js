"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.backfillGeneralLedgerFromHistory = backfillGeneralLedgerFromHistory;
const data_source_1 = require("../config/data-source");
const entities_1 = require("../entities");
const enums_1 = require("../entities/enums");
const ledger_service_1 = require("./ledger.service");
const gl_posting_service_1 = require("./gl-posting.service");
async function resolveBackfillUserId() {
    const userRepo = data_source_1.AppDataSource.getRepository(entities_1.User);
    const admin = await userRepo.findOne({
        where: [{ role: enums_1.UserRole.ADMIN }, { role: enums_1.UserRole.DIRECTOR }, { role: enums_1.UserRole.PRINCIPAL }],
        order: { createdAt: 'ASC' },
    });
    if (!admin)
        throw new Error('No admin user found for GL backfill.');
    return admin.id;
}
/** Post GL entries for financial records created before auto-posting was enabled. Idempotent. */
async function backfillGeneralLedgerFromHistory() {
    await (0, ledger_service_1.ensureChartOfAccountsSeeded)();
    const userId = await resolveBackfillUserId();
    const manager = data_source_1.AppDataSource.manager;
    const result = {
        paymentsPosted: 0,
        cashbookExpensesPosted: 0,
        cashbookReceiptsPosted: 0,
        payrollRunsPosted: 0,
        errors: [],
    };
    const payments = await data_source_1.AppDataSource.getRepository(entities_1.Payment).find({
        order: { paidAt: 'ASC' },
    });
    for (const payment of payments) {
        try {
            const before = await manager.query(`SELECT 1 FROM general_ledger_entries
         WHERE "referenceType" = 'FEE_PAYMENT' AND "referenceId" = $1 AND "isReversed" = false LIMIT 1`, [payment.id]);
            if (before.length)
                continue;
            await (0, gl_posting_service_1.postFeePaymentToGl)(manager, payment, payment.recordedById || userId);
            result.paymentsPosted += 1;
        }
        catch (err) {
            result.errors.push(`Payment ${payment.paymentReference}: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    const cashbookEntries = await data_source_1.AppDataSource.getRepository(entities_1.CashbookEntry).find({
        order: { entryDate: 'ASC', createdAt: 'ASC' },
    });
    for (const entry of cashbookEntries) {
        try {
            if (Number(entry.moneyOut) > 0) {
                const before = await manager.query(`SELECT 1 FROM general_ledger_entries
           WHERE "referenceType" = 'EXPENSE' AND "referenceId" = $1 AND "isReversed" = false LIMIT 1`, [entry.id]);
                if (!before.length) {
                    await (0, gl_posting_service_1.postCashbookExpenseToGl)(entry, entry.recordedById || userId);
                    result.cashbookExpensesPosted += 1;
                }
            }
            else if (Number(entry.moneyIn) > 0 && !entry.studentId) {
                const before = await manager.query(`SELECT 1 FROM general_ledger_entries
           WHERE "referenceType" = 'OTHER' AND "referenceId" = $1 AND "isReversed" = false LIMIT 1`, [entry.id]);
                if (!before.length) {
                    await (0, gl_posting_service_1.postCashbookReceiptToGl)(entry, entry.recordedById || userId);
                    result.cashbookReceiptsPosted += 1;
                }
            }
        }
        catch (err) {
            result.errors.push(`Cashbook ${entry.id}: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    const payrollRuns = await data_source_1.AppDataSource.getRepository(entities_1.PayrollRun).find({
        where: { status: enums_1.PayrollRunStatus.PAID },
        order: { paidAt: 'ASC', createdAt: 'ASC' },
    });
    for (const run of payrollRuns) {
        try {
            const before = await manager.query(`SELECT 1 FROM general_ledger_entries
         WHERE "referenceType" = 'SALARY' AND "referenceId" = $1 AND "isReversed" = false LIMIT 1`, [run.id]);
            if (before.length)
                continue;
            await (0, gl_posting_service_1.postPayrollPaymentToGl)(run, run.paidByUserId || userId);
            result.payrollRunsPosted += 1;
        }
        catch (err) {
            result.errors.push(`Payroll ${run.year}-${run.month}: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    return result;
}
