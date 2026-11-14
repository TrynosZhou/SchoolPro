import { AppDataSource } from '../config/data-source';
import { LedgerEntry } from '../entities';
import { formatExemptionLabel, getActiveExemptionForStudent } from '../services/tuition-exemption.service';
import { relations } from '../utils/typeorm-helpers';
import { Invoice } from '../entities';

async function main() {
  await AppDataSource.initialize();
  try {
    const ledgerRepo = AppDataSource.getRepository(LedgerEntry);
    const invoiceRepo = AppDataSource.getRepository(Invoice);

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
            relations: relations('lines'),
          })
        : null;

      const exemption = row.studentId ? await getActiveExemptionForStudent(row.studentId) : null;
      const credit = Math.abs(Number(row.credit));
      const invNum = inv?.invoiceNumber || '—';
      const label = exemption
        ? formatExemptionLabel(exemption.exemptionType, Number(exemption.value))
        : 'Tuition exemption';

      row.referenceType = 'tuition_exemption';
      row.description = `${label} — $${credit.toFixed(2)} tuition discount applied on ${invNum}. Gross tuition was invoiced at full amount before this exemption.`;
      await ledgerRepo.save(row);
      updated += 1;
    }

    console.log(`Updated ${updated} tuition exemption ledger entries.`);
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
