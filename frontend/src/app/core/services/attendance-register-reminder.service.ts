import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import type { UserRole } from '../models';
import { isSchoolDay as isSchoolDayDate } from '../utils/school-day.util';

export interface UnmarkedClassRow {
  classId: string;
  className: string;
  formName?: string | null;
  studentCount: number;
  markedCount: number;
}

export interface AttendanceRegisterReminderState {
  date: string;
  unmarkedClasses: UnmarkedClassRow[];
}

const REMINDER_INTERVAL_MS = 10 * 60 * 1000;
const ADMIN_ROLES: UserRole[] = ['admin', 'director', 'principal'];

@Injectable({ providedIn: 'root' })
export class AttendanceRegisterReminderService {
  private api = inject(ApiService);
  private auth = inject(AuthService);

  readonly visible = signal(false);
  readonly loading = signal(false);
  readonly reminder = signal<AttendanceRegisterReminderState | null>(null);

  private intervalId: ReturnType<typeof setInterval> | null = null;
  private initialTimeoutId: ReturnType<typeof setTimeout> | null = null;

  start(): void {
    this.stop();
    if (!this.isEligibleUser()) return;

    this.initialTimeoutId = setTimeout(() => {
      this.check();
      this.intervalId = setInterval(() => this.check(), REMINDER_INTERVAL_MS);
    }, REMINDER_INTERVAL_MS);
  }

  stop(): void {
    if (this.initialTimeoutId != null) {
      clearTimeout(this.initialTimeoutId);
      this.initialTimeoutId = null;
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
    return !!role && ADMIN_ROLES.includes(role);
  }

  private isSchoolDay(): boolean {
    return isSchoolDayDate(new Date().toISOString().split('T')[0]);
  }

  private check(): void {
    if (!this.auth.isLoggedIn() || !this.isEligibleUser() || !this.isSchoolDay()) {
      this.visible.set(false);
      return;
    }

    this.loading.set(true);
    this.api.get<{
      date: string;
      isSchoolDay: boolean;
      unmarkedClasses: UnmarkedClassRow[];
    }>('/attendance/unmarked-classes').subscribe({
      next: (res) => {
        this.loading.set(false);
        if (!res.isSchoolDay || !res.unmarkedClasses.length) {
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
