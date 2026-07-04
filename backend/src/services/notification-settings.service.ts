import { AppDataSource } from '../config/data-source';
import { SchoolSettings } from '../entities';
import {
  NotificationSettings,
  normalizeNotificationSettings,
} from '../types/notification-settings';

let cache: { value: NotificationSettings; at: number } | null = null;
const CACHE_MS = 30_000;

export async function getNotificationSettings(): Promise<NotificationSettings> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  const settings = await AppDataSource.getRepository(SchoolSettings).findOne({
    where: { id: 'default' },
  });
  const value = normalizeNotificationSettings(settings?.notificationSettings);
  cache = { value, at: Date.now() };
  return value;
}

export function invalidateNotificationSettingsCache(): void {
  cache = null;
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
