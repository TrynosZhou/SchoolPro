import 'reflect-metadata';
import app from './app';
import { AppDataSource } from './config/data-source';
import { env } from './config/env';
import { ensureUploadDirs } from './utils/pdf';

async function runDeferredStartup(): Promise<void> {
  try {
    const { backfillGeneralLedgerFromHistory } = await import('./services/gl-backfill.service');
    const backfill = await backfillGeneralLedgerFromHistory();
    const posted =
      backfill.paymentsPosted +
      backfill.cashbookExpensesPosted +
      backfill.cashbookReceiptsPosted +
      backfill.payrollRunsPosted;
    if (posted > 0) {
      console.log(
        `[GL] Backfilled ${posted} journal batches from historical records ` +
          `(payments: ${backfill.paymentsPosted}, expenses: ${backfill.cashbookExpensesPosted}, ` +
          `receipts: ${backfill.cashbookReceiptsPosted}, payroll: ${backfill.payrollRunsPosted})`,
      );
    }
    if (backfill.errors.length) {
      console.warn(`[GL] Backfill warnings: ${backfill.errors.slice(0, 3).join('; ')}`);
    }
    const integrity = await (await import('./services/ledger.service')).checkSystemGlBalance();
    if (!integrity.balanced) {
      console.warn(
        `[GL] System debit/credit imbalance detected: variance $${integrity.variance.toFixed(2)}`,
      );
    }
  } catch (err) {
    console.error('[startup] Deferred GL tasks failed:', err);
  }
}

async function bootstrap() {
  try {
    ensureUploadDirs();
    await AppDataSource.initialize();
    console.log('Database connected');

    const { seedDatabase } = await import('./seed');
    await seedDatabase();
    const { ensureDefaultRoles } = await import('./services/role-permissions.service');
    await ensureDefaultRoles();
    const { ensureChartOfAccountsSeeded } = await import('./services/ledger.service');
    await ensureChartOfAccountsSeeded();

    app.listen(env.port, () => {
      console.log(`School Pro API running on http://localhost:${env.port}`);
    });

    void runDeferredStartup();
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

bootstrap();

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

