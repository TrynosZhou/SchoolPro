import { AppDataSource } from '../config/data-source';
import { SchoolSettings } from '../entities';
import { tenantContext } from '../config/tenant-context';
import {
  NotificationSettings,
  normalizeNotificationSettings,
} from '../types/notification-settings';

/** Keyed by tenant so demo and production never share a cached copy. */
const cache = new Map<string, { value: NotificationSettings; at: number }>();
const CACHE_MS = 30_000;

function cacheKey(): string {
  return tenantContext.isDemo() ? 'demo' : 'prod';
}

export async function getNotificationSettings(): Promise<NotificationSettings> {
  const key = cacheKey();
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;
  const settings = await AppDataSource.getRepository(SchoolSettings).findOne({
    where: { id: 'default' },
  });
  const value = normalizeNotificationSettings(settings?.notificationSettings);
  cache.set(key, { value, at: Date.now() });
  return value;
}

export function invalidateNotificationSettingsCache(): void {
  cache.clear();
}

export async function saveNotificationSettings(
  patch: Partial<NotificationSettings>,
): Promise<NotificationSettings> {
  const repo = AppDataSource.getRepository(SchoolSettings);
  let settings = await repo.findOne({ where: { id: 'default' } });
  if (!settings) settings = repo.create({ id: 'default' });

  const base = settings.notificationSettings || ({} as Partial<NotificationSettings>);
  const merged = normalizeNotificationSettings({
    absenceAlerts: { ...(base.absenceAlerts || {}), ...(patch.absenceAlerts || {}) } as never,
    feeReminders: { ...(base.feeReminders || {}), ...(patch.feeReminders || {}) } as never,
    examResults: { ...(base.examResults || {}), ...(patch.examResults || {}) } as never,
    dailyRunHour: patch.dailyRunHour ?? base.dailyRunHour,
  });

  settings.notificationSettings = merged;
  await repo.save(settings);
  invalidateNotificationSettingsCache();
  return merged;
}
