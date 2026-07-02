import 'reflect-metadata';
import dotenv from 'dotenv';
import { AppDataSource } from '../config/data-source';
import { Invoice, InvoiceLine, LedgerEntry } from '../entities';
import { bulkTuitionInvoiceDescription } from '../services/registration-invoice.service';

dotenv.config();

async function main(): Promise<void> {
  await AppDataSource.initialize();

  const invoiceRepo = AppDataSource.getRepository(Invoice);
  const lineRepo = AppDataSource.getRepository(InvoiceLine);
  const ledgerRepo = AppDataSource.getRepository(LedgerEntry);

  const rows: Array<{ id: string; invoiceNumber: string; description: string; term_name: string }> =
    await AppDataSource.query(
      `SELECT i.id, i."invoiceNumber", i.description, t.name AS term_name
       FROM invoices i
       JOIN terms t ON t.id = i."termId"
       WHERE i.description LIKE 'Tuition fees for%'`,
    );

  let updated = 0;

  for (const row of rows) {
    const newDesc = bulkTuitionInvoiceDescription(row.term_name);
    if (newDesc === row.description) continue;

    await invoiceRepo.update({ id: row.id }, { description: newDesc, pdfPath: null as any });

    await lineRepo
      .createQueryBuilder()
      .update(InvoiceLine)
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
  await AppDataSource.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
