import cron, { ScheduledTask } from 'node-cron';
import { env } from '../config/env';
import { seedDemoDatabase } from '../seed/demo/seedDemo';

let task: ScheduledTask | null = null;
let running = false;

async function runReset(reason: string): Promise<void> {
  if (running) {
    console.log(`[demo-reset] Skipped (${reason}) — a reset is already in progress.`);
    return;
  }
  running = true;
  const startedAt = Date.now();
  try {
    console.log(`[demo-reset] Starting demo data reset (${reason})...`);
    await seedDemoDatabase({ force: true });
    console.log(`[demo-reset] Completed in ${Date.now() - startedAt}ms.`);
  } catch (err) {
    console.error('[demo-reset] Failed:', err);
  } finally {
    running = false;
  }
}

/**
 * Starts the recurring demo-data reset job. No-op unless the demo feature is
 * enabled. Schedule is controlled by `DEMO_RESET_CRON`; an immediate reseed
 * can also be forced on boot via `DEMO_RESET_ON_BOOT=true` (handy in dev so
 * every restart gives you a clean, known demo dataset).
 */
export function startDemoResetJob(): void {
  if (!env.demo.enabled) return;

  if (env.demo.resetOnBoot) {
    void runReset('boot');
  } else {
    // Even without a forced reset, make sure the demo DB has *something* in it
    // the first time the app ever boots against a fresh database.
    void seedDemoDatabase({ force: false }).catch((err) =>
      console.error('[demo-reset] Initial seed check failed:', err),
    );
  }

  if (task) {
    task.stop();
  }
  task = cron.schedule(env.demo.resetCron, () => {
    void runReset('scheduled');
  });
  console.log(`[demo-reset] Scheduled demo reset job with cron "${env.demo.resetCron}".`);
}

export function stopDemoResetJob(): void {
  task?.stop();
  task = null;
}
