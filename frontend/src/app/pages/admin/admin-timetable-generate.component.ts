import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';
import { TimetablePeriod, TimetablePeriodsService } from '../../core/services/timetable-periods.service';

interface ClassRow { id: string; name: string; form?: { name: string }; }
interface SubjectRow { id: string; name: string; code?: string; }
interface StaffRow { id: string; user?: { firstName: string; lastName: string }; }

const DAYS = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
];

@Component({
  selector: 'app-admin-timetable-generate',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, RouterLink],
  templateUrl: './admin-timetable-generate.component.html',
  styleUrl: './admin-timetable-periods.component.scss',
})
export class AdminTimetableGenerateComponent implements OnInit {
  private api = inject(ApiService);
  private periodsSvc = inject(TimetablePeriodsService);
  readonly adminNav = ADMIN_NAV_SECTIONS;
  readonly days = DAYS;

  periods = signal<TimetablePeriod[]>([]);
  classes = signal<ClassRow[]>([]);
  subjects = signal<SubjectRow[]>([]);
  staff = signal<StaffRow[]>([]);
  saving = signal(false);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  classId = '';
  subjectId = '';
  teacherId = '';
  dayOfWeek = 1;
  periodId = '';
  room = '';

  ngOnInit() {
    this.periods.set(this.periodsSvc.loadLessons());
    this.api.get<ClassRow[]>('/admin/classes').subscribe({ next: (rows) => this.classes.set(rows) });
    this.api.get<SubjectRow[]>('/admin/subjects').subscribe({
      next: (rows) => this.subjects.set(rows),
      error: () => this.subjects.set([]),
    });
    this.api.get<StaffRow[]>('/admin/staff').subscribe({ next: (rows) => this.staff.set(rows) });
  }

  selectedPeriod(): TimetablePeriod | undefined {
    return this.periods().find((p) => p.id === this.periodId);
  }

  staffName(s: StaffRow): string {
    return s.user ? `${s.user.firstName} ${s.user.lastName}` : s.id;
  }

  addSlot() {
    const period = this.selectedPeriod();
    if (!this.classId || !this.subjectId || !period) {
      this.showToast('error', 'Select class, subject, and period.');
      return;
    }
    this.saving.set(true);
    const body = {
      classId: this.classId,
      subjectId: this.subjectId,
      teacherId: this.teacherId || undefined,
      dayOfWeek: this.dayOfWeek,
      startTime: period.startTime,
      endTime: period.endTime,
      room: this.room.trim() || undefined,
    };
    this.api.post('/academics/timetable', body).subscribe({
      next: () => {
        this.saving.set(false);
        this.showToast('success', 'Timetable slot added.');
        this.room = '';
      },
      error: (e) => {
        this.saving.set(false);
        this.showToast('error', e.error?.message || 'Failed to add slot');
      },
    });
  }

  private showToast(type: 'success' | 'error', msg: string) {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 4000);
  }
}
