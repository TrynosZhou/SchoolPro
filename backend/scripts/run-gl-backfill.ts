import 'reflect-metadata';
import { AppDataSource } from '../src/config/data-source';
import { backfillGeneralLedgerFromHistory } from '../src/services/gl-backfill.service';

async function main() {
  await AppDataSource.initialize();
  const result = await backfillGeneralLedgerFromHistory();
  console.log(JSON.stringify(result, null, 2));
  const count = await AppDataSource.query('SELECT COUNT(*)::int as n FROM general_ledger_entries');
  console.log('GL_ENTRIES:', count[0]);
  await AppDataSource.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
