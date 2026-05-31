import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';
import { TimetablePeriod, TimetablePeriodsService } from '../../core/services/timetable-periods.service';
import { classHeaderLabel, classHeaderLabelById } from '../../core/utils/class-display';

interface ClassRow { id: string; name: string; form?: { name: string }; }
interface TimetableEntry {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room?: string;
  subject?: { name: string; code?: string };
  teacher?: { user?: { firstName: string; lastName: string } };
}

type ViewMode = 'grid' | 'days' | 'table' | 'cards';
type DayFilter = 'all' | number;

const DAYS = [
  { value: 1, label: 'Monday', short: 'Mon' },
  { value: 2, label: 'Tuesday', short: 'Tue' },
  { value: 3, label: 'Wednesday', short: 'Wed' },
  { value: 4, label: 'Thursday', short: 'Thu' },
  { value: 5, label: 'Friday', short: 'Fri' },
];

@Component({
  selector: 'app-admin-timetable-view',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, RouterLink],
  templateUrl: './admin-timetable-view.component.html',
  styleUrl: './admin-timetable-view.component.scss',
})
export class AdminTimetableViewComponent implements OnInit {
  private api = inject(ApiService);
  private periodsSvc = inject(TimetablePeriodsService);
  private route = inject(ActivatedRoute);
  readonly adminNav = ADMIN_NAV_SECTIONS;
  readonly days = DAYS;

  periods = signal<TimetablePeriod[]>([]);
  classes = signal<ClassRow[]>([]);
  entries = signal<TimetableEntry[]>([]);
  loadingClasses = signal(true);
  loading = signal(false);
  viewMode = signal<ViewMode>('grid');
  dayFilter = signal<DayFilter>('all');
  entriesSearch = signal('');
  classSearch = signal('');

  classId = '';

  filteredClasses = computed(() => {
    const q = this.classSearch().trim().toLowerCase();
    if (!q) return this.classes();
    return this.classes().filter((c) =>
      `${classHeaderLabel(c)} ${c.name} ${c.form?.name || ''}`.toLowerCase().includes(q)
    );
  });

  selectedClassLabel = computed(() => classHeaderLabelById(this.classes(), this.classId));

  classLabel = (c: ClassRow) => classHeaderLabel(c);

  stats = computed(() => {
    const entries = this.entries();
    const days = new Set(entries.map((e) => e.dayOfWeek));
    const subjects = new Set(entries.map((e) => e.subject?.name).filter(Boolean));
    const withTeacher = entries.filter((e) => e.teacher?.user).length;
    const maxSlots = this.periods().length * 5;
    return {
      slotCount: entries.length,
      daysFilled: days.size,
      subjectCount: subjects.size,
      withTeacher,
      coverage: maxSlots ? Math.round((entries.length / maxSlots) * 100) : 0,
    };
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

  ngOnInit() {
    this.periods.set(this.periodsSvc.loadLessons());
    this.api.get<ClassRow[]>('/admin/classes').subscribe({
      next: (rows) => {
        this.classes.set(rows);
        this.loadingClasses.set(false);
        const pre = this.route.snapshot.queryParamMap.get('class');
        if (pre && rows.some((c) => c.id === pre)) {
          this.classId = pre;
          this.loadTimetable();
        }
      },
      error: () => {
        this.classes.set([]);
        this.loadingClasses.set(false);
      },
    });
  }

  onClassChange() {
    this.entriesSearch.set('');
    this.dayFilter.set('all');
    this.loadTimetable();
  }

  loadTimetable() {
    if (!this.classId) {
      this.entries.set([]);
      return;
    }
    this.loading.set(true);
    this.api.get<TimetableEntry[]>('/academics/timetable', { classId: this.classId }).subscribe({
      next: (rows) => {
        this.entries.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.entries.set([]);
        this.loading.set(false);
      },
    });
  }

  entriesForDay(day: number): TimetableEntry[] {
    const q = this.entriesSearch().trim().toLowerCase();
    return this.entries()
      .filter((e) => {
        if (e.dayOfWeek !== day) return false;
        if (!q) return true;
        const teacher = this.teacherName(e);
        return `${e.startTime} ${e.endTime} ${e.subject?.name || ''} ${teacher} ${e.room || ''}`
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }

  entryAt(day: number, period: TimetablePeriod): TimetableEntry | undefined {
    return this.entries().find(
      (e) =>
        e.dayOfWeek === day &&
        e.startTime === period.startTime &&
        e.endTime === period.endTime
    );
  }

  dayLabel(day: number): string {
    return DAYS.find((d) => d.value === day)?.label || `Day ${day}`;
  }

  dayShort(day: number): string {
    return DAYS.find((d) => d.value === day)?.short || `${day}`;
  }

  teacherName(e: TimetableEntry): string {
    const u = e.teacher?.user;
    return u ? `${u.firstName} ${u.lastName}` : '—';
  }

  initials(name: string): string {
    if (name === '—') return '?';
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() || '')
      .join('');
  }

  clearEntriesSearch() {
    this.entriesSearch.set('');
  }

  clearClassSearch() {
    this.classSearch.set('');
  }
}
