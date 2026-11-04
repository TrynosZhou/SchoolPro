import { AppDataSource } from '../config/data-source';
import { syncTuitionExemptionToInvoices } from '../services/tuition-exemption.service';

async function main() {
  const studentId = process.argv[2];
  if (!studentId) {
    console.error('Usage: ts-node src/scripts/sync-exemption-invoices.ts <studentId>');
    process.exit(1);
  }

  await AppDataSource.initialize();
  try {
    await syncTuitionExemptionToInvoices(studentId);
    console.log(`Synced tuition exemption invoices for student ${studentId}`);
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
