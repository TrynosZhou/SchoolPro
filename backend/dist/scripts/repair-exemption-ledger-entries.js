"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const data_source_1 = require("../config/data-source");
const entities_1 = require("../entities");
const tuition_exemption_service_1 = require("../services/tuition-exemption.service");
const typeorm_helpers_1 = require("../utils/typeorm-helpers");
const entities_2 = require("../entities");
async function main() {
    await data_source_1.AppDataSource.initialize();
    try {
        const ledgerRepo = data_source_1.AppDataSource.getRepository(entities_1.LedgerEntry);
        const invoiceRepo = data_source_1.AppDataSource.getRepository(entities_2.Invoice);
        const rows = await ledgerRepo
            .createQueryBuilder('l')
            .where('l.credit > 0')
            .andWhere('LOWER(l.description) LIKE :pattern', { pattern: '%tuition exemption%' })
            .getMany();
        let updated = 0;
        for (const row of rows) {
            const inv = row.referenceId
                ? await invoiceRepo.findOne({
                    where: { id: row.referenceId },
                    relations: (0, typeorm_helpers_1.relations)('lines'),
                })
                : null;
            const exemption = row.studentId ? await (0, tuition_exemption_service_1.getActiveExemptionForStudent)(row.studentId) : null;
            const credit = Math.abs(Number(row.credit));
            const invNum = inv?.invoiceNumber || '—';
            const label = exemption
                ? (0, tuition_exemption_service_1.formatExemptionLabel)(exemption.exemptionType, Number(exemption.value))
                : 'Tuition exemption';
            row.referenceType = 'tuition_exemption';
            row.description = `${label} — $${credit.toFixed(2)} tuition discount applied on ${invNum}. Gross tuition was invoiced at full amount before this exemption.`;
            await ledgerRepo.save(row);
            updated += 1;
        }
        console.log(`Updated ${updated} tuition exemption ledger entries.`);
    }
    finally {
        await data_source_1.AppDataSource.destroy();
    }
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
