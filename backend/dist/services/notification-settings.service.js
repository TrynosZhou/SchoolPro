"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getNotificationSettings = getNotificationSettings;
exports.invalidateNotificationSettingsCache = invalidateNotificationSettingsCache;
exports.saveNotificationSettings = saveNotificationSettings;
const data_source_1 = require("../config/data-source");
const entities_1 = require("../entities");
const tenant_context_1 = require("../config/tenant-context");
const notification_settings_1 = require("../types/notification-settings");
/** Keyed by tenant so demo and production never share a cached copy. */
const cache = new Map();
const CACHE_MS = 30000;
function cacheKey() {
    return tenant_context_1.tenantContext.isDemo() ? 'demo' : 'prod';
}
async function getNotificationSettings() {
    const key = cacheKey();
    const cached = cache.get(key);
    if (cached && Date.now() - cached.at < CACHE_MS)
        return cached.value;
    const settings = await data_source_1.AppDataSource.getRepository(entities_1.SchoolSettings).findOne({
        where: { id: 'default' },
    });
    const value = (0, notification_settings_1.normalizeNotificationSettings)(settings?.notificationSettings);
    cache.set(key, { value, at: Date.now() });
    return value;
}
function invalidateNotificationSettingsCache() {
    cache.clear();
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
