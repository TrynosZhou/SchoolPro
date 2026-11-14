import { getNotificationSettings } from './notification-settings.service';
import { runFeeReminderJob } from './auto-notify.service';

let timer: NodeJS.Timeout | null = null;
let lastRunDate = '';

/** Runs the daily notification jobs once per day at the configured hour. */
async function tick(): Promise<void> {
  try {
    const settings = await getNotificationSettings();
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    if (now.getHours() === settings.dailyRunHour && lastRunDate !== dateStr) {
      lastRunDate = dateStr;
      console.log('[scheduler] Running daily fee-reminder job...');
      const result = await runFeeReminderJob();
      console.log(
        `[scheduler] Fee reminders sent: ${result.reminders} (invoices scanned: ${result.processed})`,
      );
    }
  } catch (err) {
    console.error('[scheduler] tick failed:', err);
  }
}

export function startScheduler(): void {
  if (timer) return;
  // Poll every 15 minutes; the daily job fires once when the configured hour is reached.
  timer = setInterval(() => void tick(), 15 * 60 * 1000);
  console.log('[scheduler] Notification scheduler started.');
  // A short delayed first check covers the case where the server boots during the run hour.
  setTimeout(() => void tick(), 30 * 1000);
}

export function stopScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
