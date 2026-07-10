"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startScheduler = startScheduler;
exports.stopScheduler = stopScheduler;
const notification_settings_service_1 = require("./notification-settings.service");
const auto_notify_service_1 = require("./auto-notify.service");
let timer = null;
let lastRunDate = '';
/** Runs the daily notification jobs once per day at the configured hour. */
async function tick() {
    try {
        const settings = await (0, notification_settings_service_1.getNotificationSettings)();
        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10);
        if (now.getHours() === settings.dailyRunHour && lastRunDate !== dateStr) {
            lastRunDate = dateStr;
            console.log('[scheduler] Running daily fee-reminder job...');
            const result = await (0, auto_notify_service_1.runFeeReminderJob)();
            console.log(`[scheduler] Fee reminders sent: ${result.reminders} (invoices scanned: ${result.processed})`);
        }
    }
    catch (err) {
        console.error('[scheduler] tick failed:', err);
    }
}
function startScheduler() {
    if (timer)
        return;
    // Poll every 15 minutes; the daily job fires once when the configured hour is reached.
    timer = setInterval(() => void tick(), 15 * 60 * 1000);
    console.log('[scheduler] Notification scheduler started.');
    // A short delayed first check covers the case where the server boots during the run hour.
    setTimeout(() => void tick(), 30 * 1000);
}
function stopScheduler() {
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
}
