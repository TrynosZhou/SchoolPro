"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const dotenv_1 = __importDefault(require("dotenv"));
const data_source_1 = require("../config/data-source");
const entities_1 = require("../entities");
const term_balance_service_1 = require("../services/term-balance.service");
const enums_1 = require("../entities/enums");
const typeorm_1 = require("typeorm");
dotenv_1.default.config();
const EPS = 0.005;
async function recomputeLedgerBalances(studentId) {
    const ledgerRepo = data_source_1.AppDataSource.getRepository(entities_1.LedgerEntry);
    const rows = await ledgerRepo.find({
        where: { studentId },
        order: { entryDate: 'ASC', createdAt: 'ASC' },
    });
    let running = 0;
    for (const row of rows) {
        running = (0, term_balance_service_1.roundMoney)(running + Number(row.debit) - Number(row.credit));
        row.balance = running;
        await ledgerRepo.save(row);
    }
}
async function supersedePriorTermInvoicesForCarryForward(studentId, prevTermId) {
    const invoiceRepo = data_source_1.AppDataSource.getRepository(entities_1.Invoice);
    const invoices = await invoiceRepo.find({
        where: {
            studentId,
            termId: prevTermId,
            feeType: (0, typeorm_1.Not)(term_balance_service_1.BALANCE_FORWARD_FEE_TYPE),
        },
    });
    let superseded = 0;
    for (const inv of invoices) {
        if (inv.status === enums_1.InvoiceStatus.CANCELLED || inv.status === enums_1.InvoiceStatus.DRAFT)
            continue;
        const remaining = (0, term_balance_service_1.roundMoney)(Number(inv.totalAmount) - Number(inv.amountPaid));
        if (remaining <= EPS && inv.status === enums_1.InvoiceStatus.PAID)
            continue;
        inv.amountPaid = Number(inv.totalAmount);
        inv.status = enums_1.InvoiceStatus.PAID;
        await invoiceRepo.save(inv);
        superseded += 1;
    }
    return superseded;
}
async function main() {
    await data_source_1.AppDataSource.initialize();
    const termRepo = data_source_1.AppDataSource.getRepository(entities_1.Term);
    const invoiceRepo = data_source_1.AppDataSource.getRepository(entities_1.Invoice);
    const lineRepo = data_source_1.AppDataSource.getRepository(entities_1.InvoiceLine);
    const ledgerRepo = data_source_1.AppDataSource.getRepository(entities_1.LedgerEntry);
    const tbRepo = data_source_1.AppDataSource.getRepository(entities_1.StudentTermBalance);
    const duplicateGroups = await data_source_1.AppDataSource.query(`
      SELECT "schoolYearId", "termNumber", array_agg(id ORDER BY "isCurrent" DESC, "createdAt" DESC) AS ids
      FROM terms
      GROUP BY "schoolYearId", "termNumber"
      HAVING COUNT(*) > 1
    `);
    if (!duplicateGroups.length) {
        console.log('No duplicate terms found.');
        await data_source_1.AppDataSource.destroy();
        return;
    }
    const affectedStudents = new Set();
    let removedInvoices = 0;
    let supersededInvoices = 0;
    for (const group of duplicateGroups) {
        const ids = group.ids;
        const canonicalId = ids[0];
        const duplicateIds = ids.slice(1);
        const canonical = await termRepo.findOne({ where: { id: canonicalId } });
        console.log(`Repairing duplicate term ${canonical?.name} (${canonicalId}); removing ${duplicateIds.length} duplicate term record(s).`);
        for (const duplicateTermId of duplicateIds) {
            const dupCarryForwards = await invoiceRepo.find({
                where: { termId: duplicateTermId, feeType: term_balance_service_1.BALANCE_FORWARD_FEE_TYPE },
            });
            for (const invoice of dupCarryForwards) {
                affectedStudents.add(invoice.studentId);
                await data_source_1.AppDataSource.query(`UPDATE payments SET "invoiceId" = NULL WHERE "invoiceId" = $1`, [invoice.id]);
                await ledgerRepo.delete({ referenceType: 'invoice', referenceId: invoice.id });
                await lineRepo.delete({ invoiceId: invoice.id });
                await tbRepo.update({ carryForwardInvoiceId: invoice.id }, { carryForwardInvoiceId: null });
                await invoiceRepo.remove(invoice);
                removedInvoices += 1;
            }
            await tbRepo.delete({ termId: duplicateTermId });
            await ledgerRepo.delete({ termId: duplicateTermId });
            await termRepo.delete({ id: duplicateTermId });
        }
        const canonicalCarryForwards = await invoiceRepo.find({
            where: { termId: canonicalId, feeType: term_balance_service_1.BALANCE_FORWARD_FEE_TYPE },
        });
        for (const invoice of canonicalCarryForwards) {
            affectedStudents.add(invoice.studentId);
            const prevTerm = await data_source_1.AppDataSource.query(`
          SELECT id FROM terms
          WHERE "schoolYearId" = $1 AND "termNumber" = $2
          ORDER BY "isCurrent" DESC, "createdAt" DESC
          LIMIT 1
        `, [canonical.schoolYearId, canonical.termNumber - 1]);
            const prevTermId = prevTerm[0]?.id;
            if (prevTermId) {
                supersededInvoices += await supersedePriorTermInvoicesForCarryForward(invoice.studentId, prevTermId);
            }
        }
    }
    for (const studentId of affectedStudents) {
        await recomputeLedgerBalances(studentId);
        const terms = await termRepo.find({ order: { termNumber: 'ASC' } });
        for (const term of terms) {
            const tb = await tbRepo.findOne({ where: { studentId, termId: term.id } });
            if (tb?.initialized) {
                await (0, term_balance_service_1.refreshTermClosingBalance)(studentId, term.id);
            }
        }
    }
    console.log(`Removed ${removedInvoices} duplicate carry-forward invoice(s).`);
    console.log(`Superseded ${supersededInvoices} prior-term invoice(s) already represented by carry-forward.`);
    console.log(`Recomputed balances for ${affectedStudents.size} student(s).`);
    await data_source_1.AppDataSource.destroy();
}
main().catch(async (error) => {
    console.error(error);
    try {
        await data_source_1.AppDataSource.destroy();
    }
    catch {
        // ignore
    }
    process.exit(1);
});
