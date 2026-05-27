import { Injectable } from '@angular/core';

export type TimetableSlotType = 'lesson' | 'break';

export interface TimetablePeriod {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  slotType: TimetableSlotType;
}

export const TIMETABLE_MIN_BREAKS = 2;
export const TIMETABLE_MAX_BREAKS = 3;

const STORAGE_KEY = 'school_pro_timetable_periods';

const DEFAULT_PERIODS: TimetablePeriod[] = [
  { id: '1', name: 'Period 1', startTime: '08:00', endTime: '08:40', slotType: 'lesson' },
  { id: '2', name: 'Period 2', startTime: '08:40', endTime: '09:20', slotType: 'lesson' },
  { id: 'b1', name: 'Morning Break', startTime: '09:20', endTime: '09:35', slotType: 'break' },
  { id: '3', name: 'Period 3', startTime: '09:35', endTime: '10:15', slotType: 'lesson' },
  { id: '4', name: 'Period 4', startTime: '10:15', endTime: '10:55', slotType: 'lesson' },
  { id: 'b2', name: 'Mid-morning Break', startTime: '10:55', endTime: '11:10', slotType: 'break' },
  { id: '5', name: 'Period 5', startTime: '11:10', endTime: '11:50', slotType: 'lesson' },
  { id: '6', name: 'Period 6', startTime: '11:50', endTime: '12:30', slotType: 'lesson' },
];

@Injectable({ providedIn: 'root' })
export class TimetablePeriodsService {
  load(): TimetablePeriod[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [...DEFAULT_PERIODS];
      const parsed = JSON.parse(raw) as Partial<TimetablePeriod>[];
      if (!parsed.length) return [...DEFAULT_PERIODS];
      return parsed.map((p) => ({
        id: p.id!,
        name: p.name!,
        startTime: p.startTime!,
        endTime: p.endTime!,
        slotType: p.slotType === 'break' ? 'break' : 'lesson',
      }));
    } catch {
      return [...DEFAULT_PERIODS];
    }
  }

  loadLessons(): TimetablePeriod[] {
    return this.load().filter((p) => p.slotType === 'lesson');
  }

  loadBreaks(): TimetablePeriod[] {
    return this.load().filter((p) => p.slotType === 'break');
  }

  save(periods: TimetablePeriod[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(periods));
  }

  resetDefaults(): TimetablePeriod[] {
    const defaults = [...DEFAULT_PERIODS];
    this.save(defaults);
    return defaults;
  }

  countBreaks(periods: TimetablePeriod[]): number {
    return periods.filter((p) => p.slotType === 'break').length;
  }

  validateBreakCount(periods: TimetablePeriod[]): string | null {
    const breaks = this.countBreaks(periods);
    if (breaks < TIMETABLE_MIN_BREAKS) {
      return `Add at least ${TIMETABLE_MIN_BREAKS} breaks between lessons (currently ${breaks}).`;
    }
    if (breaks > TIMETABLE_MAX_BREAKS) {
      return `Maximum ${TIMETABLE_MAX_BREAKS} breaks allowed (currently ${breaks}).`;
    }
    return null;
  }
}
