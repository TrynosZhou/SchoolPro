import { DayOfWeek } from '../entities/enums';

const DAY_ORDER: DayOfWeek[] = [
  DayOfWeek.MONDAY,
  DayOfWeek.TUESDAY,
  DayOfWeek.WEDNESDAY,
  DayOfWeek.THURSDAY,
  DayOfWeek.FRIDAY,
  DayOfWeek.SATURDAY,
  DayOfWeek.SUNDAY,
];

/** Timetable convention: 1 = Monday … 7 = Sunday. */
export function dayIntToEnum(day: number): DayOfWeek {
  const idx = Math.max(1, Math.min(7, Number(day))) - 1;
  return DAY_ORDER[idx] || DayOfWeek.MONDAY;
}

export function dayEnumToInt(day: DayOfWeek): number {
  const idx = DAY_ORDER.indexOf(day);
  return idx >= 0 ? idx + 1 : 1;
}

export function dayEnumLabel(day: DayOfWeek): string {
  const labels: Record<DayOfWeek, string> = {
    [DayOfWeek.MONDAY]: 'Monday',
    [DayOfWeek.TUESDAY]: 'Tuesday',
    [DayOfWeek.WEDNESDAY]: 'Wednesday',
    [DayOfWeek.THURSDAY]: 'Thursday',
    [DayOfWeek.FRIDAY]: 'Friday',
    [DayOfWeek.SATURDAY]: 'Saturday',
    [DayOfWeek.SUNDAY]: 'Sunday',
  };
  return labels[day] || day;
}
