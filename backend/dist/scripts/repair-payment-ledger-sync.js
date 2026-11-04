"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const data_source_1 = require("../config/data-source");
const entities_1 = require("../entities");
const enums_1 = require("../entities/enums");
const helpers_1 = require("../utils/helpers");
function roundMoney(n) {
    return Math.round(n * 100) / 100;
}
async function buildPlan() {
    const paymentRepo = data_source_1.AppDataSource.getRepository(entities_1.Payment);
    const invoiceRepo = data_source_1.AppDataSource.getRepository(entities_1.Invoice);
    const ledgerRepo = data_source_1.AppDataSource.getRepository(entities_1.LedgerEntry);
    const plans = [];
    const payments = await paymentRepo.find();
    for (const p of payments) {
        const hasLedger = await ledgerRepo.findOne({
            where: { referenceType: 'payment', referenceId: p.id },
        });
        if (!hasLedger) {
            plans.push({
                studentId: p.studentId,
                invoiceId: p.invoiceId || undefined,
                amount: roundMoney(Number(p.amount)),
                feeType: p.feeType || 'other',
                label: p.label || 'Payment received',
                reason: 'missing_ledger_for_payment',
                paymentId: p.id,
            });
        }
    }
    const invoices = await invoiceRepo.find();
    for (const inv of invoices) {
        const invoicePaid = roundMoney(Math.max(0, Number(inv.amountPaid)));
        if (invoicePaid <= 0.005)
            continue;
        const invoicePayments = await paymentRepo.find({
            where: { invoiceId: inv.id },
        });
        const allocated = roundMoney(invoicePayments.reduce((s, p) => s + Number(p.amount), 0));
        const gap = roundMoney(invoicePaid - allocated);
        if (gap <= 0.005)
            continue;
        plans.push({
            studentId: inv.studentId,
            invoiceId: inv.id,
            termId: inv.termId || undefined,
            amount: gap,
            feeType: inv.feeType || 'other',
            label: `Backfilled payment for ${inv.invoiceNumber}`,
            reason: 'invoice_paid_gap',
        });
    }
    return plans;
}
async function recomputeLedgerBalances(studentId) {
    const ledgerRepo = data_source_1.AppDataSource.getRepository(entities_1.LedgerEntry);
    const rows = await ledgerRepo.find({
        where: { studentId },
        order: { entryDate: 'ASC', createdAt: 'ASC' },
    });
    let running = 0;
    for (const row of rows) {
        running = roundMoney(running + Number(row.debit) - Number(row.credit));
        row.balance = running;
        await ledgerRepo.save(row);
    }
}
async function applyPlan(plan) {
    await data_source_1.AppDataSource.transaction(async (manager) => {
        const paymentRepo = manager.getRepository(entities_1.Payment);
        const ledgerRepo = manager.getRepository(entities_1.LedgerEntry);
        const touchedStudents = new Set();
        for (const item of plan) {
            let paymentId = item.paymentId;
            if (!paymentId && item.reason === 'invoice_paid_gap') {
                const p = await paymentRepo.save(paymentRepo.create({
                    paymentReference: (0, helpers_1.generateNumber)('PAY'),
                    studentId: item.studentId,
                    invoiceId: item.invoiceId,
                    amount: item.amount,
                    method: enums_1.PaymentMethod.OTHER,
                    feeType: item.feeType,
                    label: item.label,
                    notes: 'Auto-backfill: created from invoice.amountPaid gap repair',
                }));
                paymentId = p.id;
            }
            const last = await ledgerRepo.findOne({
                where: { studentId: item.studentId },
                order: { createdAt: 'DESC' },
            });
            const prev = last ? Number(last.balance) : 0;
            await ledgerRepo.save(ledgerRepo.create({
                studentId: item.studentId,
                termId: item.termId,
                entryDate: (0, helpers_1.today)(),
                description: item.reason === 'missing_ledger_for_payment'
                    ? 'Backfill ledger credit for existing payment'
                    : 'Backfill payment/ledger from invoice paid gap',
                debit: 0,
                credit: item.amount,
                balance: roundMoney(prev - item.amount),
                referenceType: 'payment',
                referenceId: paymentId,
            }));
            touchedStudents.add(item.studentId);
        }
        for (const studentId of touchedStudents) {
            await recomputeLedgerBalances(studentId);
        }
    });
}
async function main() {
    const apply = process.argv.includes('--apply');
    await data_source_1.AppDataSource.initialize();
    const plan = await buildPlan();
    const total = roundMoney(plan.reduce((s, p) => s + p.amount, 0));
    const missingLedger = plan.filter((p) => p.reason === 'missing_ledger_for_payment');
    const invoiceGaps = plan.filter((p) => p.reason === 'invoice_paid_gap');
    console.log(`Planned repairs: ${plan.length}`);
    console.log(`- Missing ledger for existing payments: ${missingLedger.length}`);
    console.log(`- Invoice paid gaps (need synthetic payment+ledger): ${invoiceGaps.length}`);
    console.log(`Total amount affected: ${total.toFixed(2)}`);
    for (const row of plan.slice(0, 20)) {
        console.log(`${row.reason} student=${row.studentId} invoice=${row.invoiceId || '-'} amount=${row.amount.toFixed(2)}`);
    }
    if (!apply) {
        console.log('Dry-run only. Re-run with --apply to persist repairs.');
        await data_source_1.AppDataSource.destroy();
        return;
    }
    await applyPlan(plan);
    console.log('Repair applied successfully.');
    await data_source_1.AppDataSource.destroy();
}
main().catch(async (error) => {
    console.error(error);
    if (data_source_1.AppDataSource.isInitialized)
        await data_source_1.AppDataSource.destroy();
    process.exit(1);
});
