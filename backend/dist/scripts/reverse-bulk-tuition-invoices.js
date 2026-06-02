"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const data_source_1 = require("../config/data-source");
const bulk_tuition_invoice_service_1 = require("../services/bulk-tuition-invoice.service");
async function main() {
    const nextTermName = process.argv.slice(2).join(' ').trim() || 'Term 3';
    await data_source_1.AppDataSource.initialize();
    const result = await (0, bulk_tuition_invoice_service_1.reverseBulkTuitionInvoices)(nextTermName);
    console.log(JSON.stringify(result, null, 2));
    await data_source_1.AppDataSource.destroy();
}
main().catch(async (e) => {
    console.error(e instanceof Error ? e.message : e);
    try {
        await data_source_1.AppDataSource.destroy();
    }
    catch {
        // ignore
    }
    process.exit(1);
});
