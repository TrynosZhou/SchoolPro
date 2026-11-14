import { AppDataSource } from '../config/data-source';
import { reverseBulkTuitionInvoices } from '../services/bulk-tuition-invoice.service';

async function main() {
  const nextTermName = process.argv.slice(2).join(' ').trim() || 'Term 3';
  await AppDataSource.initialize();
  const result = await reverseBulkTuitionInvoices(nextTermName);
  console.log(JSON.stringify(result, null, 2));
  await AppDataSource.destroy();
}

main().catch(async (e) => {
  console.error(e instanceof Error ? e.message : e);
  try {
    await AppDataSource.destroy();
  } catch {
    // ignore
  }
  process.exit(1);
});
