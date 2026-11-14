import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'school_pro_timetable_display_settings';

export const TT_SCALE_MIN = 50;
export const TT_SCALE_MAX = 200;
export const TT_SCALE_STEP = 10;
export const TT_SCALE_DEFAULT = 100;

/**
 * Font-size preferences for names printed inside timetable cells.
 * Values are percentages of the default size (100 = default).
 *  - teacherScale: teacher names (shown in class timetables)
 *  - classScale:   class names (shown in teacher timetables)
 */
@Injectable({ providedIn: 'root' })
export class TimetableDisplaySettingsService {
  readonly teacherScale = signal(TT_SCALE_DEFAULT);
  readonly classScale = signal(TT_SCALE_DEFAULT);

  constructor() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const p = JSON.parse(raw) as { teacherScale?: number; classScale?: number };
        this.teacherScale.set(this.clamp(p.teacherScale));
        this.classScale.set(this.clamp(p.classScale));
      }
    } catch {
      /* keep defaults */
    }
  }

  adjustTeacher(delta: number): void {
    this.teacherScale.set(this.clamp(this.teacherScale() + delta));
    this.persist();
  }

  adjustClass(delta: number): void {
    this.classScale.set(this.clamp(this.classScale() + delta));
    this.persist();
  }

  reset(): void {
    this.teacherScale.set(TT_SCALE_DEFAULT);
    this.classScale.set(TT_SCALE_DEFAULT);
    this.persist();
  }

  /** Multiplier (1 = default) for teacher-name text. */
  teacherFactor(): number {
    return this.teacherScale() / 100;
  }

  /** Multiplier (1 = default) for class-name text. */
  classFactor(): number {
    return this.classScale() / 100;
  }

  private clamp(v: unknown): number {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n) || n <= 0) return TT_SCALE_DEFAULT;
    return Math.max(TT_SCALE_MIN, Math.min(TT_SCALE_MAX, n));
  }

  private persist(): void {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ teacherScale: this.teacherScale(), classScale: this.classScale() }),
      );
    } catch {
      /* storage unavailable */
    }
  }
}
