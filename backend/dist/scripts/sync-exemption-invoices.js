"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const data_source_1 = require("../config/data-source");
const tuition_exemption_service_1 = require("../services/tuition-exemption.service");
async function main() {
    const studentId = process.argv[2];
    if (!studentId) {
        console.error('Usage: ts-node src/scripts/sync-exemption-invoices.ts <studentId>');
        process.exit(1);
    }
    await data_source_1.AppDataSource.initialize();
    try {
        await (0, tuition_exemption_service_1.syncTuitionExemptionToInvoices)(studentId);
        console.log(`Synced tuition exemption invoices for student ${studentId}`);
    }
    finally {
        await data_source_1.AppDataSource.destroy();
    }
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
