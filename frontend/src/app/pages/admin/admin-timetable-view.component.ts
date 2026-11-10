import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';
import { TimetablePeriod, TimetablePeriodsService } from '../../core/services/timetable-periods.service';
import { classHeaderLabel, classHeaderLabelById } from '../../core/utils/class-display';
import { formatTeacherTimetableName } from '../../core/utils/teacher-display';
import { buildTimetableTermVersionLabel } from '../../core/utils/timetable-term-label';
import { environment } from '../../../environments/environment';
import {
  breakPeriodLabel,
  breakColumnVerticalLabel,
  compactClassGridLabel,
  dayGridLabel,
  formatPeriodRange,
  isBreakPeriod,
  lessonPeriodNumber,
  shortClassCode,
  teacherInitials,
  timetableSubjectShort,
} from '../../core/utils/timetable-grid-display';
import { buildZip, downloadBlob } from '../../core/utils/zip.util';
import { buildTimetablePdfBytes, TimetablePdfOptions, downloadTimetablePdf, TimetablePdfCell, TimetablePdfColumn, TimetablePdfRow } from '../../core/utils/timetable-pdf.util';

interface ClassTeacherUser { title?: string | null; firstName?: string | null; lastName?: string | null; }
interface ClassRow {
  id: string;
  name: string;
  form?: { name: string };
  classTeacherId?: string | null;
  classTeacher?: { title?: string | null; user?: ClassTeacherUser | null } | null;
}
interface StaffLookupRow { id: string; title?: string | null; user?: ClassTeacherUser | null; }
interface TimetableEntry {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room?: string;
  subject?: { name: string; code?: string; short?: string | null };
  teacher?: { user?: { firstName: string; lastName: string } };
}

interface SnapshotSlot {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  classId: string;
  className: string;
  subjectName: string;
  subjectCode: string | null;
  subjectShort: string | null;
  room: string | null;
  teacherId: string;
  teacherName: string;
  employeeNumber: string;
}

interface SnapshotTeacher {
  teacherId: string;
  teacherName: string;
  employeeNumber: string;
  slotCount: number;
  classCount: number;
  subjectCount: number;
  slots: SnapshotSlot[];
}

interface SnapshotClass {
  classId: string;
  className: string;
  slotCount: number;
  subjectCount: number;
  slots: SnapshotSlot[];
}

interface TimetableSnapshot {
  success: boolean;
  teachers: SnapshotTeacher[];
  classes: SnapshotClass[];
}

type MainTab = 'class' | 'teacher';
type TeacherView = 'individual' | 'all' | 'summary';
type ViewMode = 'grid' | 'days' | 'table' | 'cards';
type DayFilter = 'all' | number;

/** Sentinel used by the class/teacher pickers to select "All". */
const ALL_SELECTION = '__all__';

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
  readonly dayGridLabel = dayGridLabel;
  readonly formatPeriodRange = formatPeriodRange;
  readonly shortClassCode = shortClassCode;
  readonly timetableSubjectShort = timetableSubjectShort;
  readonly teacherInitials = teacherInitials;
  readonly isBreakPeriod = isBreakPeriod;
  readonly breakPeriodLabel = breakPeriodLabel;
  readonly breakColumnVerticalLabel = breakColumnVerticalLabel;
  readonly lessonPeriodNumber = lessonPeriodNumber;

  periods = signal<TimetablePeriod[]>([]);
  termVersionLabel = signal(buildTimetableTermVersionLabel());
  schoolName = signal('School Pro Academy');
  schoolLogoUrl = signal<string | null>(null);
  mainTab = signal<MainTab>('class');

  // ── Class schedule ──
  readonly classAllValue = ALL_SELECTION;
  readonly teacherAllValue = ALL_SELECTION;
  classes = signal<ClassRow[]>([]);
  private staffById = signal<Record<string, StaffLookupRow>>({});
  entries = signal<TimetableEntry[]>([]);
  loadingClasses = signal(true);
  loading = signal(false);
  viewMode = signal<ViewMode>('grid');
  dayFilter = signal<DayFilter>('all');
  entriesSearch = signal('');
  classId = signal('');

  allClassesMode = computed(() => this.classId() === ALL_SELECTION);
  classBusy = computed(() => (this.allClassesMode() ? this.loadingSnapshot() : this.loading()));

  selectedClassLabel = computed(() => classHeaderLabelById(this.classes(), this.classId()));

  classLabel = (c: ClassRow) => classHeaderLabel(c);

  /** Display name of the class teacher for a class, or '' when none is assigned. */
  classTeacherNameFor(classId: string | null | undefined): string {
    const c = this.classes().find((row) => row.id === classId);
    if (!c) return '';
    const rel = c.classTeacher;
    const staff = c.classTeacherId ? this.staffById()[c.classTeacherId] : undefined;
    const user = rel?.user ?? staff?.user;
    if (!user) return '';
    return formatTeacherTimetableName({
      title: rel?.title ?? staff?.title,
      firstName: user.firstName,
      lastName: user.lastName,
    });
  }

  selectedClassTeacher = computed(() => this.classTeacherNameFor(this.classId()));

  snapshotClasses = computed(() => this.snapshot()?.classes ?? []);

  classSnapshotStats = computed(() => {
    const rows = this.snapshotClasses();
    const subjects = new Set<string>();
    let slotCount = 0;
    for (const c of rows) {
      for (const s of c.slots) {
        slotCount += 1;
        subjects.add(s.subjectName);
      }
    }
    return { classCount: rows.length, slotCount, subjectCount: subjects.size };
  });

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

  // ── Teacher schedule ──
  teacherView = signal<TeacherView>('individual');
  snapshot = signal<TimetableSnapshot | null>(null);
  loadingSnapshot = signal(false);
  snapshotLoaded = signal(false);
  teacherSearch = signal('');
  teacherId = signal('');

  snapshotTeachers = computed(() => this.snapshot()?.teachers ?? []);

  filteredTeachers = computed(() => {
    const q = this.teacherSearch().trim().toLowerCase();
    const rows = this.snapshotTeachers();
    if (!q) return rows;
    return rows.filter((t) => `${t.teacherName} ${t.employeeNumber}`.toLowerCase().includes(q));
  });

  selectedTeacher = computed(
    () => this.snapshotTeachers().find((t) => t.teacherId === this.teacherId()) || null,
  );

  teacherStats = computed(() => {
    const rows = this.snapshotTeachers();
    const classes = new Set<string>();
    const subjects = new Set<string>();
    const days = new Set<number>();
    let slotCount = 0;
    for (const t of rows) {
      for (const s of t.slots) {
        slotCount += 1;
        classes.add(s.classId);
        subjects.add(s.subjectName);
        days.add(s.dayOfWeek);
      }
    }
    return {
      teacherCount: rows.length,
      slotCount,
      classCount: classes.size,
      subjectCount: subjects.size,
      daysFilled: days.size,
    };
  });

  ngOnInit() {
    this.periods.set(this.periodsSvc.load());
    this.loadTimetableContext();
    this.loadSchoolName();
    const tab = this.route.snapshot.queryParamMap.get('tab');
    if (tab === 'teacher') {
      this.setMainTab('teacher');
    }
    this.api.get<StaffLookupRow[]>('/admin/staff').subscribe({
      next: (rows) => {
        const map: Record<string, StaffLookupRow> = {};
        for (const r of rows || []) map[r.id] = r;
        this.staffById.set(map);
      },
      error: () => this.staffById.set({}),
    });
    this.api.get<ClassRow[]>('/admin/classes').subscribe({
      next: (rows) => {
        this.classes.set(rows);
        this.loadingClasses.set(false);
        const pre = this.route.snapshot.queryParamMap.get('class');
        if (pre && rows.some((c) => c.id === pre)) {
          this.classId.set(pre);
          this.loadTimetable();
        }
      },
      error: () => {
        this.classes.set([]);
        this.loadingClasses.set(false);
      },
    });
  }

  setMainTab(tab: MainTab) {
    this.mainTab.set(tab);
    if (tab === 'teacher') {
      this.loadSnapshot();
    }
  }

  onClassIdChange(value: string) {
    this.classId.set(value);
    this.entriesSearch.set('');
    this.dayFilter.set('all');
    if (value === ALL_SELECTION) {
      this.entries.set([]);
      this.loadSnapshot();
      return;
    }
    this.loadTimetable();
  }

  refreshClasses() {
    if (this.allClassesMode()) {
      this.loadSnapshot(true);
      return;
    }
    this.loadTimetable();
  }

  private loadTimetableContext() {
    this.api.get<{ termVersionLabel?: string }>('/timetable/context').subscribe({
      next: (ctx) => {
        if (ctx.termVersionLabel) {
          this.termVersionLabel.set(ctx.termVersionLabel);
        }
      },
      error: () => {
        this.termVersionLabel.set(buildTimetableTermVersionLabel());
      },
    });
  }

  private loadSchoolName() {
    this.api.get<{ schoolName: string | null; logoUrl: string | null }>('/dashboard/school-links').subscribe({
      next: (data) => {
        if (data.schoolName) this.schoolName.set(data.schoolName);
        this.schoolLogoUrl.set(this.toAssetUrl(data.logoUrl));
      },
      error: () => {
        /* keep default school name */
      },
    });
  }

  private toAssetUrl(path: string | null | undefined): string | null {
    const value = path?.trim();
    if (!value) return null;
    if (/^https?:\/\//i.test(value)) return value;
    const origin = environment.apiUrl.replace(/\/api$/, '');
    return `${origin}${value.startsWith('/') ? value : `/${value}`}`;
  }

  loadTimetable() {
    const classId = this.classId();
    if (!classId || classId === ALL_SELECTION) {
      this.entries.set([]);
      return;
    }
    this.loading.set(true);
    this.api.get<TimetableEntry[]>('/academics/timetable', { classId }).subscribe({
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

  // ── Teacher schedule helpers ──
  loadSnapshot(force = false) {
    if (this.loadingSnapshot()) return;
    if (this.snapshotLoaded() && !force) return;
    this.loadingSnapshot.set(true);
    this.api.get<TimetableSnapshot>('/timetable/generate/snapshot').subscribe({
      next: (data) => {
        this.snapshot.set(data);
        this.loadingSnapshot.set(false);
        this.snapshotLoaded.set(true);
        this.ensureTeacherSelection();
      },
      error: () => {
        this.snapshot.set(null);
        this.loadingSnapshot.set(false);
        this.snapshotLoaded.set(true);
      },
    });
  }

  refreshTeachers() {
    this.loadSnapshot(true);
  }

  onTeacherChange(id: string) {
    if (id === ALL_SELECTION) {
      this.teacherView.set('all');
      return;
    }
    this.teacherView.set('individual');
    this.teacherId.set(id);
  }

  private ensureTeacherSelection() {
    const rows = this.snapshotTeachers();
    if (!rows.length) {
      this.teacherId.set('');
      return;
    }
    if (!rows.some((t) => t.teacherId === this.teacherId())) {
      this.teacherId.set(rows[0].teacherId);
    }
  }

  setTeacherView(view: TeacherView) {
    this.teacherView.set(view);
  }

  clearTeacherSearch() {
    this.teacherSearch.set('');
  }

  teacherSlotAt(teacher: SnapshotTeacher, day: number, period: TimetablePeriod): SnapshotSlot | undefined {
    return teacher.slots.find(
      (s) => s.dayOfWeek === day && s.startTime === period.startTime && s.endTime === period.endTime,
    );
  }

  teacherSlotSubject(slot: SnapshotSlot): string {
    return timetableSubjectShort(slot.subjectCode, slot.subjectName, slot.subjectShort);
  }

  teacherSlotClass(slot: SnapshotSlot): string {
    return compactClassGridLabel(slot.className);
  }

  classSlotAt(klass: SnapshotClass, day: number, period: TimetablePeriod): SnapshotSlot | undefined {
    return klass.slots.find(
      (s) => s.dayOfWeek === day && s.startTime === period.startTime && s.endTime === period.endTime,
    );
  }

  classSlotSubject(slot: SnapshotSlot): string {
    return timetableSubjectShort(slot.subjectCode, slot.subjectName, slot.subjectShort);
  }

  summarySlots(teacher: SnapshotTeacher, day: number): SnapshotSlot[] {
    return teacher.slots
      .filter((s) => s.dayOfWeek === day)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }

  // ── Download (PDF) ──
  private pdfColumns(): TimetablePdfColumn[] {
    const periods = this.periods();
    return periods.map((p, i) => {
      const isBreak = isBreakPeriod(p);
      return {
        header: isBreak ? breakPeriodLabel(p) : String(lessonPeriodNumber(periods, i) ?? ''),
        time: formatPeriodRange(p),
        isBreak,
      };
    });
  }

  private pdfRows(
    cellFor: (day: number, period: TimetablePeriod) => TimetablePdfCell,
  ): TimetablePdfRow[] {
    const periods = this.periods();
    return DAYS.map((d) => ({
      label: dayGridLabel(d.value),
      cells: periods.map((p) => {
        if (isBreakPeriod(p)) {
          return { isBreak: true, breakLabel: breakColumnVerticalLabel(p) };
        }
        return cellFor(d.value, p);
      }),
    }));
  }

  private pdfFileName(label: string, suffix: string): string {
    const slug = String(label || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return `${slug || 'timetable'}-${suffix}.pdf`;
  }

  downloadClassTimetable() {
    const label = this.selectedClassLabel();
    if (!label || !this.periods().length) return;
    const short = this.shortClassCode(label);
    downloadTimetablePdf({
      title: this.schoolName(),
      subtitle: `${this.termVersionLabel()}`,
      heading: label,
      classTeacher: this.classTeacherNameFor(this.classId()),
      columns: this.pdfColumns(),
      rows: this.pdfRows((day, period) => {
        const e = this.entryAt(day, period);
        if (!e) return {};
        return {
          topRight: e.room || 'Boys',
          main: timetableSubjectShort(e.subject?.code, e.subject?.name || 'Subject', e.subject?.short),
          bottomRight: this.teacherName(e)
        };
      }),
      fileName: this.pdfFileName(short, 'class-timetable'),
    });
  }

  private snapshotClassPdfOptions(klass: SnapshotClass): TimetablePdfOptions {
    return {
      title: this.schoolName(),
      subtitle: `${this.termVersionLabel()}`,
      heading: klass.className,
      classTeacher: this.classTeacherNameFor(klass.classId),
      columns: this.pdfColumns(),
      rows: this.pdfRows((day, period) => {
        const s = this.classSlotAt(klass, day, period);
        if (!s) return {};
        return {
          topRight: s.room || 'Boys',
          main: this.classSlotSubject(s),
          bottomRight: s.teacherName,
        };
      }),
      fileName: this.pdfFileName(klass.className, 'class-timetable'),
    };
  }

  private teacherPdfOptions(teacher: SnapshotTeacher): TimetablePdfOptions {
    return {
      title: this.schoolName(),
      subtitle: `${this.termVersionLabel()}`,
      heading: `Teacher: ${teacher.teacherName}`,
      columns: this.pdfColumns(),
      rows: this.pdfRows((day, period) => {
        const s = this.teacherSlotAt(teacher, day, period);
        if (!s) return {};
        return {
          topLeft: this.teacherSlotSubject(s),
          main: this.teacherSlotClass(s),
          bottomCenter: s.room || 'Boys',
        };
      }),
      fileName: this.pdfFileName(teacher.teacherName, 'teacher-timetable'),
    };
  }

  downloadSnapshotClass(klass: SnapshotClass) {
    if (!this.periods().length) return;
    downloadTimetablePdf(this.snapshotClassPdfOptions(klass));
  }

  downloadTeacherTimetable(teacher: SnapshotTeacher) {
    if (!this.periods().length) return;
    downloadTimetablePdf(this.teacherPdfOptions(teacher));
  }

  // ── Bulk (ZIP) downloads ──
  bulkBusy = signal<'classes' | 'teachers' | null>(null);
  bulkProgress = signal('');
  bulkError = signal('');

  /** Make sure the all-classes / all-teachers snapshot is loaded, then return it. */
  private async ensureSnapshot(): Promise<TimetableSnapshot | null> {
    if (!this.snapshotLoaded() || !this.snapshot()) {
      this.loadingSnapshot.set(true);
      try {
        const data = await firstValueFrom(this.api.get<TimetableSnapshot>('/timetable/generate/snapshot'));
        this.snapshot.set(data);
        this.snapshotLoaded.set(true);
        this.ensureTeacherSelection();
      } catch {
        this.snapshot.set(null);
        return null;
      } finally {
        this.loadingSnapshot.set(false);
      }
    }
    return this.snapshot();
  }

  async downloadAllClassTimetablesZip() {
    await this.bulkZip('classes');
  }

  async downloadAllTeacherTimetablesZip() {
    await this.bulkZip('teachers');
  }

  private async bulkZip(kind: 'classes' | 'teachers') {
    if (this.bulkBusy()) return;
    this.bulkError.set('');
    if (!this.periods().length) {
      this.bulkError.set('Configure lesson periods before downloading timetables.');
      return;
    }
    this.bulkBusy.set(kind);
    this.bulkProgress.set('Loading timetables…');
    try {
      const snap = await this.ensureSnapshot();
      const items: TimetablePdfOptions[] = !snap
        ? []
        : kind === 'classes'
          ? snap.classes.map((c) => this.snapshotClassPdfOptions(c))
          : snap.teachers.map((t) => this.teacherPdfOptions(t));
      if (!items.length) {
        this.bulkError.set(
          snap ? `No ${kind === 'classes' ? 'class' : 'teacher'} timetables to download yet.` : 'Could not load timetables. Please try again.',
        );
        return;
      }

      const used = new Set<string>();
      const files: { name: string; data: Uint8Array }[] = [];
      for (let i = 0; i < items.length; i++) {
        this.bulkProgress.set(`Creating PDF ${i + 1} of ${items.length}…`);
        let name = items[i].fileName;
        for (let n = 2; used.has(name); n++) name = items[i].fileName.replace(/\.pdf$/, `-${n}.pdf`);
        used.add(name);
        files.push({ name, data: await buildTimetablePdfBytes(items[i]) });
      }

      this.bulkProgress.set('Zipping…');
      const termSlug = this.termVersionLabel().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      downloadBlob(
        buildZip(files),
        `all-${kind === 'classes' ? 'class' : 'teacher'}-timetables${termSlug ? '-' + termSlug : ''}.zip`,
      );
    } catch {
      this.bulkError.set('Something went wrong while creating the ZIP file. Please try again.');
    } finally {
      this.bulkBusy.set(null);
      this.bulkProgress.set('');
    }
  }
}
