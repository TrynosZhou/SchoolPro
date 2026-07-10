"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_NOTIFICATION_SETTINGS = void 0;
exports.normalizeNotificationSettings = normalizeNotificationSettings;
exports.DEFAULT_NOTIFICATION_SETTINGS = {
    absenceAlerts: {
        enabled: true,
        channels: { inApp: true, email: true, sms: false },
        template: '{school}: {student} was marked absent on {date}. If this is unexpected, please contact the school office.',
    },
    feeReminders: {
        enabled: true,
        channels: { inApp: true, email: true, sms: false },
        daysBefore: [7, 3, 1],
        overdueEnabled: true,
        overdueEveryDays: 7,
        template: '{school}: A fee payment of {amount} for {student} is due on {dueDate}. Please arrange payment to avoid disruption.',
        overdueTemplate: '{school}: The fee balance of {amount} for {student} is now overdue (due {dueDate}, {daysOverdue} day(s) ago). Please settle it as soon as possible.',
    },
    examResults: {
        enabled: true,
        channels: { inApp: true, email: true, sms: true },
        template: '{school}: {exam} results for {term} have been published. Sign in to the portal to view the report card.',
    },
    dailyRunHour: 7,
};
/** Deep-merge a stored partial config over the defaults so new keys always exist. */
function normalizeNotificationSettings(stored) {
    const d = exports.DEFAULT_NOTIFICATION_SETTINGS;
    const s = stored || {};
    const mergeChannels = (base, patch) => ({
        inApp: patch?.inApp ?? base.inApp,
        email: patch?.email ?? base.email,
        sms: patch?.sms ?? base.sms,
    });
    return {
        absenceAlerts: {
            enabled: s.absenceAlerts?.enabled ?? d.absenceAlerts.enabled,
            channels: mergeChannels(d.absenceAlerts.channels, s.absenceAlerts?.channels),
            template: s.absenceAlerts?.template || d.absenceAlerts.template,
        },
        feeReminders: {
            enabled: s.feeReminders?.enabled ?? d.feeReminders.enabled,
            channels: mergeChannels(d.feeReminders.channels, s.feeReminders?.channels),
            daysBefore: Array.isArray(s.feeReminders?.daysBefore) && s.feeReminders.daysBefore.length
                ? [...new Set(s.feeReminders.daysBefore.map((n) => Math.max(0, Math.floor(n))))]
                : d.feeReminders.daysBefore,
            overdueEnabled: s.feeReminders?.overdueEnabled ?? d.feeReminders.overdueEnabled,
            overdueEveryDays: s.feeReminders?.overdueEveryDays && s.feeReminders.overdueEveryDays > 0
                ? Math.floor(s.feeReminders.overdueEveryDays)
                : d.feeReminders.overdueEveryDays,
            template: s.feeReminders?.template || d.feeReminders.template,
            overdueTemplate: s.feeReminders?.overdueTemplate || d.feeReminders.overdueTemplate,
        },
        examResults: {
            enabled: s.examResults?.enabled ?? d.examResults.enabled,
            channels: mergeChannels(d.examResults.channels, s.examResults?.channels),
            template: s.examResults?.template || d.examResults.template,
        },
        dailyRunHour: typeof s.dailyRunHour === 'number' && s.dailyRunHour >= 0 && s.dailyRunHour <= 23
            ? Math.floor(s.dailyRunHour)
            : d.dailyRunHour,
    };
}
