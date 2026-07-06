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
export const TIMETABLE_MIN_LESSONS_PER_DAY = 1;
export const TIMETABLE_MAX_LESSONS_PER_DAY = 20;
export const TIMETABLE_DEFAULT_LESSONS_PER_DAY = 6;

const STORAGE_KEY = 'school_pro_timetable_periods';
const TEMPLATE_SETTINGS_KEY = 'school_pro_timetable_template_settings';

export interface TimetableTemplateSettings {
  periodsPerDay: number;
  dayStart: string;
  lessonMinutes: number;
  breakCount: number;
  /** Minutes for each break, in schedule order (length matches breakCount). */
  breakMinutes: number[];
}

const DEFAULT_TEMPLATE_SETTINGS: TimetableTemplateSettings = {
  periodsPerDay: TIMETABLE_DEFAULT_LESSONS_PER_DAY,
  dayStart: '08:00',
  lessonMinutes: 40,
  breakCount: TIMETABLE_MIN_BREAKS,
  breakMinutes: [15, 15],
};

export const TIMETABLE_BREAK_NAMES = ['Morning Break', 'Mid-morning Break', 'Lunch Break'];

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

  /** Start time of the first lesson period (Period 1) in HH:mm. */
  periodOneStartTime(): string {
    const lessons = this.loadLessons();
    if (!lessons.length) {
      return DEFAULT_PERIODS.find((p) => p.slotType === 'lesson')?.startTime ?? '08:00';
    }
    return [...lessons].sort((a, b) => a.startTime.localeCompare(b.startTime))[0].startTime;
  }

  save(periods: TimetablePeriod[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(periods));
  }

  resetDefaults(): TimetablePeriod[] {
    const defaults = [...DEFAULT_PERIODS];
    this.save(defaults);
    this.saveTemplateSettings({ ...DEFAULT_TEMPLATE_SETTINGS });
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

  loadTemplateSettings(): TimetableTemplateSettings {
    try {
      const raw = localStorage.getItem(TEMPLATE_SETTINGS_KEY);
      if (!raw) return { ...DEFAULT_TEMPLATE_SETTINGS };
      const parsed = JSON.parse(raw) as Partial<TimetableTemplateSettings>;
      return this.normalizeTemplateSettings(parsed);
    } catch {
      return { ...DEFAULT_TEMPLATE_SETTINGS };
    }
  }

  saveTemplateSettings(settings: TimetableTemplateSettings): void {
    localStorage.setItem(TEMPLATE_SETTINGS_KEY, JSON.stringify(this.normalizeTemplateSettings(settings)));
  }

  /** Build a full-day template with the requested number of lesson periods and breaks. */
  generateTemplate(settings: Partial<TimetableTemplateSettings> = {}): TimetablePeriod[] {
    const cfg = this.normalizeTemplateSettings({ ...this.loadTemplateSettings(), ...settings });
    const breakAfterLessons = this.breakInsertionPoints(cfg.periodsPerDay, cfg.breakCount);
    let cursor = this.timeToMinutes(cfg.dayStart);
    const slots: TimetablePeriod[] = [];
    let breakIndex = 0;

    for (let lesson = 1; lesson <= cfg.periodsPerDay; lesson += 1) {
      const start = this.minutesToTime(cursor);
      cursor += cfg.lessonMinutes;
      slots.push({
        id: this.newId(),
        name: `Period ${lesson}`,
        startTime: start,
        endTime: this.minutesToTime(cursor),
        slotType: 'lesson',
      });

      if (breakAfterLessons.has(lesson) && breakIndex < cfg.breakCount) {
        const breakStart = this.minutesToTime(cursor);
        const breakLen = cfg.breakMinutes[breakIndex] ?? cfg.breakMinutes[0] ?? 15;
        cursor += breakLen;
        slots.push({
          id: this.newId(),
          name: TIMETABLE_BREAK_NAMES[breakIndex] || `Break ${breakIndex + 1}`,
          startTime: breakStart,
          endTime: this.minutesToTime(cursor),
          slotType: 'break',
        });
        breakIndex += 1;
      }
    }

    return slots;
  }

  breakName(index: number): string {
    return TIMETABLE_BREAK_NAMES[index] || `Break ${index + 1}`;
  }

  private normalizeTemplateSettings(raw: Partial<TimetableTemplateSettings> & { breakMinutes?: number | number[] }): TimetableTemplateSettings {
    const periodsPerDay = Math.round(Number(raw.periodsPerDay) || DEFAULT_TEMPLATE_SETTINGS.periodsPerDay);
    const lessonMinutes = Math.round(Number(raw.lessonMinutes) || DEFAULT_TEMPLATE_SETTINGS.lessonMinutes);
    let breakCount = Math.round(Number(raw.breakCount) || DEFAULT_TEMPLATE_SETTINGS.breakCount);
    breakCount = Math.max(TIMETABLE_MIN_BREAKS, Math.min(TIMETABLE_MAX_BREAKS, breakCount));

    let breakMinutes: number[];
    if (Array.isArray(raw.breakMinutes)) {
      breakMinutes = raw.breakMinutes.map((n) => this.clampBreakMinutes(n));
    } else if (typeof raw.breakMinutes === 'number') {
      breakMinutes = Array.from({ length: breakCount }, () => this.clampBreakMinutes(raw.breakMinutes as number));
    } else {
      breakMinutes = [...DEFAULT_TEMPLATE_SETTINGS.breakMinutes];
    }
    breakMinutes = this.fitBreakMinutesArray(breakMinutes, breakCount);

    return {
      periodsPerDay: Math.max(
        TIMETABLE_MIN_LESSONS_PER_DAY,
        Math.min(TIMETABLE_MAX_LESSONS_PER_DAY, periodsPerDay),
      ),
      dayStart: String(raw.dayStart || DEFAULT_TEMPLATE_SETTINGS.dayStart).trim() || DEFAULT_TEMPLATE_SETTINGS.dayStart,
      lessonMinutes: Math.max(15, Math.min(120, lessonMinutes)),
      breakCount,
      breakMinutes,
    };
  }

  private clampBreakMinutes(value: number): number {
    return Math.max(5, Math.min(120, Math.round(Number(value) || 15)));
  }

  private fitBreakMinutesArray(values: number[], breakCount: number): number[] {
    const result = values.slice(0, breakCount).map((n) => this.clampBreakMinutes(n));
    const fallback = result[result.length - 1] ?? DEFAULT_TEMPLATE_SETTINGS.breakMinutes[0] ?? 15;
    while (result.length < breakCount) {
      result.push(fallback);
    }
    return result;
  }

  /** Insert breaks evenly through the day — e.g. 12 lessons → after 4 and 8. */
  private breakInsertionPoints(lessonCount: number, breakCount: number): Set<number> {
    const points = new Set<number>();
    for (let i = 1; i <= breakCount; i += 1) {
      const afterLesson = Math.floor((i * lessonCount) / (breakCount + 1));
      if (afterLesson >= 1 && afterLesson < lessonCount) {
        points.add(afterLesson);
      }
    }
    return points;
  }

  private timeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  }

  private minutesToTime(min: number): string {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  private newId(): string {
    return typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `p-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}
