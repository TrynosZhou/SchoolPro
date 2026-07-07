import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { TimetablePeriodsService } from './timetable-periods.service';
import type { UserRole } from '../models';
import {
  hasTimeOfDayStarted,
  isSchoolDay as isSchoolDayDate,
  msUntilTimeOfDay,
} from '../utils/school-day.util';

export interface UnmarkedClassRow {
  classId: string;
  className: string;
  formName?: string | null;
  classTeacherName?: string | null;
  classTeacherPhone?: string | null;
  studentCount: number;
  markedCount: number;
}

export interface AttendanceRegisterReminderState {
  date: string;
  unmarkedClasses: UnmarkedClassRow[];
}

const REMINDER_INTERVAL_MS = 10 * 60 * 1000;
const ADMIN_ROLES: UserRole[] = ['admin', 'director', 'principal'];
const REMINDER_ROLES: UserRole[] = [...ADMIN_ROLES, 'teacher'];

@Injectable({ providedIn: 'root' })
export class AttendanceRegisterReminderService {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private periodsSvc = inject(TimetablePeriodsService);

  readonly visible = signal(false);
  readonly loading = signal(false);
  readonly reminder = signal<AttendanceRegisterReminderState | null>(null);

  private intervalId: ReturnType<typeof setInterval> | null = null;
  private periodOneTimeoutId: ReturnType<typeof setTimeout> | null = null;

  start(): void {
    this.stop();
    if (!this.isEligibleUser()) return;
    this.scheduleChecks();
  }

  stop(): void {
    if (this.periodOneTimeoutId != null) {
      clearTimeout(this.periodOneTimeoutId);
      this.periodOneTimeoutId = null;
    }
    if (this.intervalId != null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.visible.set(false);
    this.reminder.set(null);
  }

  dismiss(): void {
    this.visible.set(false);
  }

  classLabel(row: UnmarkedClassRow): string {
    return row.formName ? `${row.formName} · ${row.className}` : row.className;
  }

  private isEligibleUser(): boolean {
    const role = this.auth.user()?.role;
    return !!role && REMINDER_ROLES.includes(role);
  }

  isAdminView(): boolean {
    const role = this.auth.user()?.role;
    return !!role && ADMIN_ROLES.includes(role);
  }

  private isSchoolDay(): boolean {
    return isSchoolDayDate(new Date().toISOString().split('T')[0]);
  }

  private hasPeriodOneStarted(): boolean {
    return hasTimeOfDayStarted(this.periodsSvc.periodOneStartTime());
  }

  /** Wait until Period 1 starts, then poll for unmarked registers. */
  private scheduleChecks(): void {
    if (!this.isSchoolDay()) return;

    const beginPolling = () => {
      this.check();
      this.intervalId = setInterval(() => this.check(), REMINDER_INTERVAL_MS);
    };

    const periodOneStart = this.periodsSvc.periodOneStartTime();
    const waitMs = msUntilTimeOfDay(periodOneStart);

    if (waitMs > 0) {
      this.periodOneTimeoutId = setTimeout(beginPolling, waitMs);
      return;
    }

    if (this.hasPeriodOneStarted()) {
      beginPolling();
    }
  }

  private check(): void {
    if (
      !this.auth.isLoggedIn() ||
      !this.isEligibleUser() ||
      !this.isSchoolDay() ||
      !this.hasPeriodOneStarted()
    ) {
      this.visible.set(false);
      return;
    }

    this.loading.set(true);
    this.api
      .get<{
        date: string;
        isSchoolDay: boolean;
        lessonsStarted?: boolean;
        unmarkedClasses: UnmarkedClassRow[];
      }>('/attendance/unmarked-classes')
      .subscribe({
        next: (res) => {
          this.loading.set(false);
          if (
            !res.isSchoolDay ||
            res.lessonsStarted === false ||
            !res.unmarkedClasses.length
          ) {
            this.reminder.set(null);
            this.visible.set(false);
            return;
          }
          this.reminder.set({ date: res.date, unmarkedClasses: res.unmarkedClasses });
          this.visible.set(true);
        },
        error: () => {
          this.loading.set(false);
        },
      });
  }
}
