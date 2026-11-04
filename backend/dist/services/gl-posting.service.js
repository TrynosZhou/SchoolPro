"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.postFeePaymentToGl = postFeePaymentToGl;
exports.postPayrollPaymentToGl = postPayrollPaymentToGl;
exports.postCashbookExpenseToGl = postCashbookExpenseToGl;
exports.postCashbookReceiptToGl = postCashbookReceiptToGl;
const data_source_1 = require("../config/data-source");
const enums_1 = require("../entities/enums");
const ledger_service_1 = require("./ledger.service");
async function alreadyPosted(manager, referenceType, referenceId) {
    const rows = await manager.query(`SELECT 1 FROM general_ledger_entries
     WHERE "referenceType" = $1 AND "referenceId" = $2 AND "isReversed" = false
     LIMIT 1`, [referenceType, referenceId]);
    return rows.length > 0;
}
async function postFeePaymentToGl(manager, payment, userId) {
    if (!userId || !payment?.id)
        return;
    if (await alreadyPosted(manager, enums_1.GlReferenceType.FEE_PAYMENT, payment.id))
        return;
    const amount = Number(payment.amount);
    if (amount <= 0)
        return;
    const cashId = await (0, ledger_service_1.resolveGlAccountIdByCode)(ledger_service_1.GL_ACCOUNT_CODES.CASH_BANK);
    const revenueCode = (0, ledger_service_1.revenueAccountCodeForFeeType)(payment.feeType || payment.label);
    const revenueId = await (0, ledger_service_1.resolveGlAccountIdByCode)(revenueCode);
    await (0, ledger_service_1.postEntry)({
        debitAccountId: cashId,
        creditAccountId: revenueId,
        amount,
        description: `Fee payment ${payment.paymentReference} — ${payment.label || 'School fees'}`,
        referenceType: enums_1.GlReferenceType.FEE_PAYMENT,
        referenceId: payment.id,
        userId,
        transactionDate: payment.paidAt instanceof Date
            ? payment.paidAt.toISOString().slice(0, 10)
            : String(payment.paidAt).slice(0, 10),
    }, manager);
}
async function postPayrollPaymentToGl(run, userId) {
    if (!userId || !run?.id)
        return;
    if (await alreadyPosted(data_source_1.AppDataSource.manager, enums_1.GlReferenceType.SALARY, run.id))
        return;
    const amount = Number(run.totalNet);
    if (amount <= 0)
        return;
    const salaryId = await (0, ledger_service_1.resolveGlAccountIdByCode)(ledger_service_1.GL_ACCOUNT_CODES.SALARY_EXPENSE);
    const cashId = await (0, ledger_service_1.resolveGlAccountIdByCode)(ledger_service_1.GL_ACCOUNT_CODES.CASH_BANK);
    await (0, ledger_service_1.postEntry)({
        debitAccountId: salaryId,
        creditAccountId: cashId,
        amount,
        description: `Payroll ${run.year}-${String(run.month).padStart(2, '0')} — net salaries paid`,
        referenceType: enums_1.GlReferenceType.SALARY,
        referenceId: run.id,
        userId,
        transactionDate: run.paidAt
            ? new Date(run.paidAt).toISOString().slice(0, 10)
            : undefined,
    });
}
async function postCashbookExpenseToGl(entry, userId) {
    if (!userId || !entry?.id)
        return;
    if (await alreadyPosted(data_source_1.AppDataSource.manager, enums_1.GlReferenceType.EXPENSE, entry.id))
        return;
    const moneyOut = Number(entry.moneyOut);
    if (moneyOut <= 0)
        return;
    const expenseCode = /utilit|electric|water/i.test(entry.description)
        ? ledger_service_1.GL_ACCOUNT_CODES.UTILITY_EXPENSE
        : ledger_service_1.GL_ACCOUNT_CODES.MAINTENANCE_EXPENSE;
    const expenseId = await (0, ledger_service_1.resolveGlAccountIdByCode)(expenseCode);
    const cashId = await (0, ledger_service_1.resolveGlAccountIdByCode)(ledger_service_1.GL_ACCOUNT_CODES.CASH_BANK);
    await (0, ledger_service_1.postEntry)({
        debitAccountId: expenseId,
        creditAccountId: cashId,
        amount: moneyOut,
        description: `Expense — ${entry.description}`,
        referenceType: enums_1.GlReferenceType.EXPENSE,
        referenceId: entry.id,
        userId,
        transactionDate: entry.entryDate,
    });
}
async function postCashbookReceiptToGl(entry, userId) {
    if (!userId || !entry?.id || entry.studentId)
        return;
    if (await alreadyPosted(data_source_1.AppDataSource.manager, enums_1.GlReferenceType.OTHER, entry.id))
        return;
    const moneyIn = Number(entry.moneyIn);
    if (moneyIn <= 0)
        return;
    const cashId = await (0, ledger_service_1.resolveGlAccountIdByCode)(ledger_service_1.GL_ACCOUNT_CODES.CASH_BANK);
    const incomeId = await (0, ledger_service_1.resolveGlAccountIdByCode)(ledger_service_1.GL_ACCOUNT_CODES.OTHER_INCOME);
    await (0, ledger_service_1.postEntry)({
        debitAccountId: cashId,
        creditAccountId: incomeId,
        amount: moneyIn,
        description: `Cash receipt — ${entry.description}`,
        referenceType: enums_1.GlReferenceType.OTHER,
        referenceId: entry.id,
        userId,
        transactionDate: entry.entryDate,
    });
}
