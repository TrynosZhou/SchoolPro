export type DayOfWeekApi =
  | 'MONDAY'
  | 'TUESDAY'
  | 'WEDNESDAY'
  | 'THURSDAY'
  | 'FRIDAY'
  | 'SATURDAY'
  | 'SUNDAY';

const DAY_ENUMS: DayOfWeekApi[] = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
];

/** Timetable UI uses 1=Monday … 5=Friday (matches backend int convention). */
export function dayIntToApiEnum(day: number): DayOfWeekApi {
  return DAY_ENUMS[Math.max(1, Math.min(7, day)) - 1] || 'MONDAY';
}

export interface TeacherAvailabilityRow {
  teacherId: string;
  firstName: string;
  lastName: string;
  available: boolean;
  conflict?: {
    className: string;
    subjectName: string;
    dayOfWeek: DayOfWeekApi;
    startTime: string;
    endTime: string;
  };
}

export interface TeacherAllocationRow {
  id: string;
  timetableEntryId: string;
  teacherId: string;
  subjectId: string;
  classId: string;
  dayOfWeek: DayOfWeekApi;
  dayOfWeekInt: number;
  startTime: string;
  endTime: string;
  subject?: { id: string; name: string; code?: string; short?: string | null };
  schoolClass?: { id: string; name: string; form?: { name: string } };
  timetableEntry?: { id: string; room?: string };
}

export interface TeacherWeeklySchedule {
  teacher: {
    id: string;
    employeeNumber?: string;
    user?: { firstName: string; lastName: string };
  };
  allocations: TeacherAllocationRow[];
  summary: {
    slotCount: number;
    classCount: number;
    subjectCount: number;
  };
}

export const TIMETABLE_DAYS = [
  { value: 1, label: 'Monday', short: 'Mon', enum: 'MONDAY' as DayOfWeekApi },
  { value: 2, label: 'Tuesday', short: 'Tue', enum: 'TUESDAY' as DayOfWeekApi },
  { value: 3, label: 'Wednesday', short: 'Wed', enum: 'WEDNESDAY' as DayOfWeekApi },
  { value: 4, label: 'Thursday', short: 'Thu', enum: 'THURSDAY' as DayOfWeekApi },
  { value: 5, label: 'Friday', short: 'Fri', enum: 'FRIDAY' as DayOfWeekApi },
];

export function dayLabelFromEnum(day: DayOfWeekApi): string {
  return TIMETABLE_DAYS.find((d) => d.enum === day)?.label || day;
}

export function dayShortFromEnum(day: DayOfWeekApi): string {
  return TIMETABLE_DAYS.find((d) => d.enum === day)?.short || day.slice(0, 3);
}

export function dayIntFromEnum(day: DayOfWeekApi): number {
  return TIMETABLE_DAYS.find((d) => d.enum === day)?.value || 1;
}

export function classLabelFromAllocation(row: TeacherAllocationRow): string {
  const name = row.schoolClass?.name || '';
  if (!name) return '—';
  return /^class\s+/i.test(name) ? name : `Class ${name}`;
}
