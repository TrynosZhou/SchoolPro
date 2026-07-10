"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getNotificationSettings = getNotificationSettings;
exports.invalidateNotificationSettingsCache = invalidateNotificationSettingsCache;
exports.saveNotificationSettings = saveNotificationSettings;
const data_source_1 = require("../config/data-source");
const entities_1 = require("../entities");
const notification_settings_1 = require("../types/notification-settings");
let cache = null;
const CACHE_MS = 30000;
async function getNotificationSettings() {
    if (cache && Date.now() - cache.at < CACHE_MS)
        return cache.value;
    const settings = await data_source_1.AppDataSource.getRepository(entities_1.SchoolSettings).findOne({
        where: { id: 'default' },
    });
    const value = (0, notification_settings_1.normalizeNotificationSettings)(settings?.notificationSettings);
    cache = { value, at: Date.now() };
    return value;
}
function invalidateNotificationSettingsCache() {
    cache = null;
}
async function saveNotificationSettings(patch) {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.SchoolSettings);
    let settings = await repo.findOne({ where: { id: 'default' } });
    if (!settings)
        settings = repo.create({ id: 'default' });
    const base = settings.notificationSettings || {};
    const merged = (0, notification_settings_1.normalizeNotificationSettings)({
        absenceAlerts: { ...(base.absenceAlerts || {}), ...(patch.absenceAlerts || {}) },
        feeReminders: { ...(base.feeReminders || {}), ...(patch.feeReminders || {}) },
        examResults: { ...(base.examResults || {}), ...(patch.examResults || {}) },
        dailyRunHour: patch.dailyRunHour ?? base.dailyRunHour,
    });
    settings.notificationSettings = merged;
    await repo.save(settings);
    invalidateNotificationSettingsCache();
    return merged;
}
