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
