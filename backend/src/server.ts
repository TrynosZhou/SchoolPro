import 'reflect-metadata';
import app from './app';
import { RealAppDataSource, initializeRealAppDataSourceWithSslFallback } from './config/data-source';
import { DemoDataSource } from './config/demo-data-source';
import { ensureDemoSchemaBootstrapped } from './config/bootstrap-demo-schema';
import { env } from './config/env';
import { ensureUploadDirs } from './utils/pdf';

async function startDemoTenant(): Promise<void> {
  if (!env.demo.enabled) {
    console.log('[demo] Feature disabled (DEMO_FEATURE_ENABLED=false) — skipping demo DB & reset job.');
    return;
  }
  try {
    await ensureDemoSchemaBootstrapped();
    await DemoDataSource.initialize();
    console.log('[demo] Demo database connected.');
    const { startDemoResetJob } = await import('./jobs/demo-reset.job');
    startDemoResetJob();
  } catch (err) {
    console.error(
      '[demo] Failed to initialize the demo database — demo login will be unavailable:',
      err,
    );
  }
}

async function runDeferredStartup(): Promise<void> {
  try {
    const { backfillStudentLifecycle } = await import('./services/student-lifecycle.service');
    const lifecycle = await backfillStudentLifecycle();
    if (lifecycle.statusFixed > 0 || lifecycle.snapshotsCreated > 0) {
      console.log(
        `[analytics] Student lifecycle backfill: ${lifecycle.statusFixed} status(es) normalised, ` +
          `${lifecycle.snapshotsCreated} enrollment snapshot(s) created`,
      );
    }
  } catch (err) {
    console.error('[startup] Student lifecycle backfill failed:', err);
  }

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

const _startupState: { ok: boolean; error?: Error; startedAt: number; sslMode?: string } = {
  ok: false,
  error: undefined,
  startedAt: 0,
};

export function getStartupState(): { ok: boolean; error?: Error; startedAt: number; sslMode?: string } {
  return _startupState;
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function initializeServer(): Promise<void> {
  if (_startupState.ok) return;
  try {
    try {
      ensureUploadDirs();
    } catch (err) {
      console.warn('[startup] Could not ensure local upload directories (safe to ignore when using S3 storage):', err);
    }

    console.log(
      `[startup] Connecting to PostgreSQL host=${env.db.host} port=${env.db.port} ` +
        `database=${env.db.database} user=${env.db.username} (nodeEnv=${env.nodeEnv})`,
    );

    let lastDbErr: unknown;
    const attempts = 4;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const { sslMode, ds } = await initializeRealAppDataSourceWithSslFallback();
        try {
          await ds.query('SELECT 1 AS _ping');
        } catch (pingErr) {
          console.warn(`[startup] DB ping failed on attempt ${attempt + 1} — ${pingErr instanceof Error ? pingErr.message : String(pingErr)}`);
          try { if (ds.isInitialized) await ds.destroy(); } catch { /* swallow */ }
          await sleep(500 * (attempt + 1));
          continue;
        }
        _startupState.ok = true;
        _startupState.error = undefined;
        _startupState.sslMode = sslMode;
        _startupState.startedAt = Date.now();
        lastDbErr = undefined;
        break;
      } catch (err) {
        lastDbErr = err;
        console.warn(`[startup] DB initialize attempt ${attempt + 1}/${attempts} failed — ${err instanceof Error ? err.message : String(err)}`);
        if (attempt < attempts - 1) {
          await sleep(500 * (attempt + 1));
        }
      }
    }

    if (!_startupState.ok) {
      const msg = lastDbErr instanceof Error ? lastDbErr.message : String(lastDbErr);
      console.error(
        `[startup] Cannot connect to the database after ${attempts} attempts — continuing in "degraded" mode. ` +
          `Public endpoints (health, branding, password-policy) will return defaults. ` +
          `Authenticated endpoints will return 503 until DB is reachable. Detail: ${msg}`,
      );
      _startupState.ok = false;
      _startupState.error = lastDbErr instanceof Error ? lastDbErr : new Error(msg);
      _startupState.startedAt = Date.now();
      return;
    }

    try {
      const applied = await RealAppDataSource.runMigrations({ transaction: 'each' });
      if (applied.length > 0) {
        console.log(
          `[startup] Applied ${applied.length} migration(s): ` +
            applied.map((m) => (m as { name?: string }).name ?? String(m)).join(', '),
        );
      } else {
        console.log('[startup] Database schema is up to date (no new migrations).');
      }
    } catch (err) {
      console.warn(
        '[startup] Migrations could not be applied — continuing without them. ' +
          'If endpoints later report "relation does not exist", you must run migrations via the CLI first. Detail:',
        err instanceof Error ? err.message : String(err),
      );
    }

    try {
      const { seedDatabase } = await import('./seed');
      await seedDatabase();
    } catch (err) {
      console.warn('[startup] seedDatabase skipped (non-fatal; tables may already have data or schema is still initialising):', err instanceof Error ? err.message : String(err));
    }

    try {
      const { ensureDefaultRoles } = await import('./services/role-permissions.service');
      await ensureDefaultRoles();
    } catch (err) {
      console.warn('[startup] ensureDefaultRoles skipped (non-fatal):', err instanceof Error ? err.message : String(err));
    }

    try {
      const { ensureChartOfAccountsSeeded } = await import('./services/ledger.service');
      await ensureChartOfAccountsSeeded();
    } catch (err) {
      console.warn('[startup] ensureChartOfAccountsSeeded skipped (non-fatal):', err instanceof Error ? err.message : String(err));
    }

    _startupState.startedAt = Date.now();
  } catch (err) {
    console.error('initializeServer failed (continuing in degraded mode):', err);
    _startupState.ok = false;
    _startupState.error = err instanceof Error ? err : new Error(String(err));
    _startupState.startedAt = Date.now();
  }
}

async function bootstrap() {
  try {
    await initializeServer();

    app.listen(env.port, () => {
      console.log(`School Pro API running on http://localhost:${env.port}`);
    });

    const { startScheduler } = await import('./services/scheduler.service');
    startScheduler();

    try {
      const { probeRedis } = await import('./config/redis');
      if (!env.redis.enabled) {
        console.log('[result-notification-queue] Redis disabled (REDIS_ENABLED=false) — background notifications off.');
      } else if (await probeRedis()) {
        const { startResultNotificationWorker } = await import('./queues/result-notification.queue');
        const { processResultNotificationJob } = await import('./services/result-notification.service');
        startResultNotificationWorker(processResultNotificationJob);
      } else {
        console.warn(
          `[result-notification-queue] Redis not reachable at ${env.redis.url} — ` +
            'background WhatsApp/SMS notifications disabled. Start Redis or set REDIS_ENABLED=false.',
        );
      }
    } catch (err) {
      console.error('[startup] Result notification worker failed to start:', err);
    }

    void runDeferredStartup();
    void startDemoTenant();
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  bootstrap();
}

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});
