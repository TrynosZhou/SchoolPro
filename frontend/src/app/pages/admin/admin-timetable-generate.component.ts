import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';
import { TimetablePeriod, TimetablePeriodsService } from '../../core/services/timetable-periods.service';

interface ClassRow { id: string; name: string; form?: { name: string }; }
interface SubjectRow { id: string; name: string; code?: string; }
interface StaffRow { id: string; user?: { firstName: string; lastName: string }; }
interface TimetableEntry {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room?: string;
  subject?: { name: string; code?: string };
  teacher?: { user?: { firstName: string; lastName: string } };
}

type ViewMode = 'table' | 'cards';
type DayFilter = 'all' | number;

const DAYS = [
  { value: 1, label: 'Monday', short: 'Mon' },
  { value: 2, label: 'Tuesday', short: 'Tue' },
  { value: 3, label: 'Wednesday', short: 'Wed' },
  { value: 4, label: 'Thursday', short: 'Thu' },
  { value: 5, label: 'Friday', short: 'Fri' },
];

@Component({
  selector: 'app-admin-timetable-generate',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, RouterLink],
  templateUrl: './admin-timetable-generate.component.html',
  styleUrl: './admin-timetable-generate.component.scss',
})
export class AdminTimetableGenerateComponent implements OnInit {
  private api = inject(ApiService);
  private periodsSvc = inject(TimetablePeriodsService);
  private route = inject(ActivatedRoute);
  readonly adminNav = ADMIN_NAV_SECTIONS;
  readonly days = DAYS;

  periods = signal<TimetablePeriod[]>([]);
  classes = signal<ClassRow[]>([]);
  subjects = signal<SubjectRow[]>([]);
  staff = signal<StaffRow[]>([]);
  entries = signal<TimetableEntry[]>([]);
  loading = signal(true);
  loadingEntries = signal(false);
  saving = signal(false);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);
  viewMode = signal<ViewMode>('table');
  dayFilter = signal<DayFilter>('all');
  entriesSearch = signal('');

  classId = '';
  subjectId = '';
  teacherId = '';
  dayOfWeek = 1;
  periodId = '';
  room = '';

  stats = computed(() => {
    const entries = this.entries();
    const days = new Set(entries.map((e) => e.dayOfWeek));
    const withTeacher = entries.filter((e) => e.teacher?.user).length;
    const maxSlots = this.periods().length * 5;
    return {
      slotCount: entries.length,
      daysFilled: days.size,
      withTeacher,
      coverage: maxSlots ? Math.round((entries.length / maxSlots) * 100) : 0,
    };
  });

  selectedClassLabel = computed(() => {
    const c = this.classes().find((x) => x.id === this.classId);
    if (!c) return '';
    return `${c.form?.name || ''} ${c.name}`.trim();
  });

  filteredEntries = computed(() => {
    const q = this.entriesSearch().trim().toLowerCase();
    const day = this.dayFilter();
    return this.entries().filter((e) => {
      if (day !== 'all' && e.dayOfWeek !== day) return false;
      if (!q) return true;
      const teacher = this.teacherName(e);
      return `${this.dayLabel(e.dayOfWeek)} ${e.startTime} ${e.endTime} ${e.subject?.name || ''} ${teacher} ${e.room || ''}`
        .toLowerCase()
        .includes(q);
    });
  });

  formReady = computed(() => !!(this.classId && this.subjectId && this.periodId && this.periods().length));

  hasConflict = computed(() => {
    const period = this.selectedPeriod();
    if (!period || !this.classId) return false;
    return this.entries().some(
      (e) =>
        e.dayOfWeek === this.dayOfWeek &&
        e.startTime === period.startTime &&
        e.endTime === period.endTime
    );
  });

  slotPreview = computed(() => {
    const period = this.selectedPeriod();
    const subject = this.subjects().find((s) => s.id === this.subjectId);
    const teacher = this.staff().find((s) => s.id === this.teacherId);
    return {
      day: this.dayLabel(this.dayOfWeek),
      period: period ? `${period.name} (${period.startTime}–${period.endTime})` : '—',
      subject: subject?.name || '—',
      teacher: teacher ? this.staffName(teacher) : 'Unassigned',
      room: this.room.trim() || '—',
    };
  });

  ngOnInit() {
    this.periods.set(this.periodsSvc.loadLessons());
    let pending = 3;
    const done = () => {
      pending -= 1;
      if (pending <= 0) this.loading.set(false);
    };
    this.api.get<ClassRow[]>('/admin/classes').subscribe({
      next: (rows) => {
        this.classes.set(rows);
        const pre = this.route.snapshot.queryParamMap.get('class');
        if (pre && rows.some((c) => c.id === pre)) {
          this.classId = pre;
          this.loadEntries();
        }
      },
      error: () => this.classes.set([]),
      complete: done,
    });
    this.api.get<SubjectRow[]>('/admin/subjects').subscribe({
      next: (rows) => this.subjects.set(rows),
      error: () => this.subjects.set([]),
      complete: done,
    });
    this.api.get<StaffRow[]>('/admin/staff').subscribe({
      next: (rows) => this.staff.set(rows),
      error: () => this.staff.set([]),
      complete: done,
    });
  }

  onClassChange() {
    this.loadEntries();
  }

  loadEntries() {
    if (!this.classId) {
      this.entries.set([]);
      return;
    }
    this.loadingEntries.set(true);
    this.api.get<TimetableEntry[]>('/academics/timetable', { classId: this.classId }).subscribe({
      next: (rows) => {
        this.entries.set(rows);
        this.loadingEntries.set(false);
      },
      error: () => {
        this.entries.set([]);
        this.loadingEntries.set(false);
      },
    });
  }

  selectedPeriod(): TimetablePeriod | undefined {
    return this.periods().find((p) => p.id === this.periodId);
  }

  dayLabel(day: number): string {
    return DAYS.find((d) => d.value === day)?.label || `Day ${day}`;
  }

  dayShort(day: number): string {
    return DAYS.find((d) => d.value === day)?.short || `${day}`;
  }

  staffName(s: StaffRow): string {
    return s.user ? `${s.user.firstName} ${s.user.lastName}` : s.id;
  }

  teacherName(e: TimetableEntry): string {
    const u = e.teacher?.user;
    return u ? `${u.firstName} ${u.lastName}` : '—';
  }

  initials(name: string): string {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() || '')
      .join('');
  }

  setDay(day: number) {
    this.dayOfWeek = day;
  }

  clearEntriesSearch() {
    this.entriesSearch.set('');
  }

  resetForm() {
    this.subjectId = '';
    this.teacherId = '';
    this.periodId = '';
    this.room = '';
  }

  addSlot() {
    const period = this.selectedPeriod();
    if (!this.classId || !this.subjectId || !period) {
      this.showToast('error', 'Select class, subject, and period.');
      return;
    }
    if (this.hasConflict()) {
      this.showToast('error', 'This class already has a slot at that day and period.');
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
        this.loadEntries();
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
