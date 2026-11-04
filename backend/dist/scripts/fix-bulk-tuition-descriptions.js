"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const dotenv_1 = __importDefault(require("dotenv"));
const data_source_1 = require("../config/data-source");
const entities_1 = require("../entities");
const registration_invoice_service_1 = require("../services/registration-invoice.service");
dotenv_1.default.config();
async function main() {
    await data_source_1.AppDataSource.initialize();
    const invoiceRepo = data_source_1.AppDataSource.getRepository(entities_1.Invoice);
    const lineRepo = data_source_1.AppDataSource.getRepository(entities_1.InvoiceLine);
    const ledgerRepo = data_source_1.AppDataSource.getRepository(entities_1.LedgerEntry);
    const rows = await data_source_1.AppDataSource.query(`SELECT i.id, i."invoiceNumber", i.description, t.name AS term_name
       FROM invoices i
       JOIN terms t ON t.id = i."termId"
       WHERE i.description LIKE 'Tuition fees for%'`);
    let updated = 0;
    for (const row of rows) {
        const newDesc = (0, registration_invoice_service_1.bulkTuitionInvoiceDescription)(row.term_name);
        if (newDesc === row.description)
            continue;
        await invoiceRepo.update({ id: row.id }, { description: newDesc, pdfPath: null });
        await lineRepo
            .createQueryBuilder()
            .update(entities_1.InvoiceLine)
            .set({ description: newDesc })
            .where('"invoiceId" = :invoiceId', { invoiceId: row.id })
            .andWhere('description = :oldDesc', { oldDesc: row.description })
            .execute();
        const ledgerRows = await ledgerRepo.find({
            where: { referenceType: 'invoice', referenceId: row.id },
        });
        for (const le of ledgerRows) {
            const prefix = `Invoice ${row.invoiceNumber} - `;
            if (le.description?.startsWith(prefix)) {
                le.description = `${prefix}${newDesc}`;
                await ledgerRepo.save(le);
            }
        }
        console.log(`${row.invoiceNumber}: "${row.description}" -> "${newDesc}"`);
        updated += 1;
    }
    console.log(updated ? `Updated ${updated} bulk tuition invoice(s).` : 'All bulk tuition descriptions already correct.');
    await data_source_1.AppDataSource.destroy();
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
