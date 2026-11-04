/** Monday–Friday are school days; Saturday and Sunday are not. */
export function isSchoolDay(dateStr: string): boolean {
  const d = new Date(`${dateStr}T12:00:00`);
  const day = d.getDay();
  return day >= 1 && day <= 5;
}

export function isWeekend(dateStr: string): boolean {
  return !isSchoolDay(dateStr);
}

export function weekendDayName(dateStr: string): string {
  const day = new Date(`${dateStr}T12:00:00`).getDay();
  return day === 0 ? 'Sunday' : day === 6 ? 'Saturday' : '';
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** True when the current clock time is at or after HH:mm (local time). */
export function hasTimeOfDayStarted(time: string, now = new Date()): boolean {
  return now.getHours() * 60 + now.getMinutes() >= timeToMinutes(time);
}

/** Milliseconds until HH:mm today; 0 if that time has already passed. */
export function msUntilTimeOfDay(time: string, now = new Date()): number {
  const [h, m] = time.split(':').map(Number);
  const target = new Date(now);
  target.setHours(h || 0, m || 0, 0, 0);
  return Math.max(0, target.getTime() - now.getTime());
}
