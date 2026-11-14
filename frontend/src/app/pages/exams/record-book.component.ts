import { Component, computed, HostListener, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { formatStudentClassLabel } from '../../core/utils/class-display';
import { resolvePortalLayout } from '../../core/utils/portal-layout.util';

interface SubjectOption {
  id: string;
  code: string;
  name: string;
}

interface MarkColumn {
  columnKey: string;
  label: string;
}

interface RecordBookStudent {
  studentId: string;
  admissionNumber: string;
  lastName: string;
  firstName: string;
  gender: string;
}

/** Roster response. Only the class, subject and students are used; any marks it carries are ignored. */
interface RecordBookData {
  maxMarks: number;
  term: { id: string; name: string };
  class: { id: string; name: string };
  teacher: { fullName: string };
  subject: SubjectOption;
  students: RecordBookStudent[];
}

/** A class + subject the logged-in teacher is assigned to teach (from /dashboard/teacher). */
interface TeachingAssignment {
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  subjectCode: string;
}

interface TeacherDashboardAssignments {
  assignments?: {
    classId: string;
    className: string;
    subjectId?: string | null;
    subjectName?: string | null;
    subjectCode?: string | null;
  }[];
}

/** Everything the teacher enters, saved as one document per term + class + subject. */
interface StoredRecordBook {
  columns: MarkColumn[];
  topics: Record<string, string>;
  marks: Record<string, Record<string, number | null>>;
  updatedAt: string;
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

type FixedColumnKey = 'studentId' | 'lastName' | 'firstName';

const DEFAULT_COLUMN_WIDTHS: Record<FixedColumnKey, number> = {
  studentId: 72,
  lastName: 80,
  firstName: 80,
};

const DEFAULT_MARK_COL_WIDTH = 56;
const MAX_TOPIC_LENGTH = 60;
const STORAGE_PREFIX = 'school_pro_record_book';
const AUTOSAVE_DELAY_MS = 300;
const MIN_COL_WIDTH = 36;

@Component({
  selector: 'app-record-book',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, DatePipe],
  templateUrl: './record-book.component.html',
  styleUrl: './record-book.component.scss',
})
export class RecordBookComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private router = inject(Router);
  private auth = inject(AuthService);

  readonly formatStudentClassLabel = formatStudentClassLabel;

  readonly portalLayout = resolvePortalLayout(this.router, {
    permissions: this.auth.user()?.permissions,
  });

  terms = signal<{ id: string; name: string; isCurrent?: boolean }[]>([]);
  classes = signal<{ id: string; name: string }[]>([]);
  /** Only the class + subject pairs this teacher teaches. Marks can be entered for nothing else. */
  teachingAssignments = signal<TeachingAssignment[]>([]);
  assignmentsLoading = signal(true);
  assignmentsFailed = signal(false);
  subjects = signal<SubjectOption[]>([]);

  filters = { termId: '', classId: '', subjectId: '' };
  teacherName = signal('');
  activeSubject = signal<SubjectOption | null>(null);
  markColumns = signal<MarkColumn[]>([]);
  /** Topic for each set of marks (e.g. "Algebra"), keyed by columnKey. */
  topics = signal<Record<string, string>>({});
  /** Marks typed by the teacher: studentId -> columnKey -> mark. Never fetched from the server. */
  marks = signal<Record<string, Record<string, number | null>>>({});
  readonly maxTopicLength = MAX_TOPIC_LENGTH;
  students = signal<RecordBookStudent[]>([]);
  columnWidths = signal<Record<string, number>>({ ...DEFAULT_COLUMN_WIDTHS });
  maxMarks = signal(100);
  sessionLabel = signal('');
  loading = signal(false);
  hasLoaded = signal(false);
  saveState = signal<SaveState>('idle');
  lastSavedAt = signal<Date | null>(null);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  readonly showSubjectPicker = computed(() => this.subjects().length > 1);
  readonly assignedSubjectsLabel = computed(() =>
    this.subjects()
      .map((s) => s.name)
      .join(', '),
  );

  private resizeCleanup: (() => void) | null = null;
  private autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingSave = false;
  /** Storage key of the book currently on screen (so a late save never lands in another book). */
  private activeKey: string | null = null;

  ngOnInit(): void {
    const me = this.auth.user();
    if (me) this.teacherName.set(`${me.firstName} ${me.lastName}`.trim());
    this.api.get<{ id: string; name: string; isCurrent?: boolean }[]>('/exams/terms').subscribe({
      next: (t) => {
        this.terms.set(t);
        const current = t.find((x) => x.isCurrent);
        if (current && !this.filters.termId) this.filters.termId = current.id;
      },
      error: () => this.showToast('error', 'Could not load terms.'),
    });
    this.loadTeachingAssignments();
  }

  /**
   * Builds the class and subject choices from the teacher's own teaching assignments.
   * Homeroom-only classes (class teacher, no subject taught there) are not offered.
   */
  private loadTeachingAssignments(): void {
    this.assignmentsLoading.set(true);
    this.assignmentsFailed.set(false);
    this.api.get<TeacherDashboardAssignments>('/dashboard/teacher').subscribe({
      next: (d) => {
        const seen = new Set<string>();
        const rows: TeachingAssignment[] = [];
        for (const a of d.assignments ?? []) {
          if (!a.classId || !a.subjectId) continue;
          const key = `${a.classId}:${a.subjectId}`;
          if (seen.has(key)) continue;
          seen.add(key);
          rows.push({
            classId: a.classId,
            className: a.className,
            subjectId: a.subjectId,
            subjectName: a.subjectName || 'Subject',
            subjectCode: a.subjectCode || '',
          });
        }
        this.teachingAssignments.set(rows);

        const classMap = new Map<string, { id: string; name: string }>();
        for (const r of rows) classMap.set(r.classId, { id: r.classId, name: r.className });
        this.classes.set([...classMap.values()].sort((x, y) => x.name.localeCompare(y.name)));
        this.assignmentsLoading.set(false);
      },
      error: () => {
        this.teachingAssignments.set([]);
        this.classes.set([]);
        this.assignmentsLoading.set(false);
        this.assignmentsFailed.set(true);
        this.showToast('error', 'Could not verify the classes and subjects you teach.');
      },
    });
  }

  /** True only if the teacher is assigned to teach this subject in this class. */
  isAssigned(classId: string, subjectId: string): boolean {
    return this.teachingAssignments().some((a) => a.classId === classId && a.subjectId === subjectId);
  }

  ngOnDestroy(): void {
    this.resizeCleanup?.();
    this.flushSave();
  }

  @HostListener('window:beforeunload')
  onBeforeUnload(): void {
    this.flushSave();
  }

  filtersReady(): boolean {
    const { termId, classId, subjectId } = this.filters;
    return !!(termId && classId && subjectId && this.isAssigned(classId, subjectId));
  }

  onTermChange(): void {
    this.resetLoadedState();
  }

  onClassChange(): void {
    this.filters.subjectId = '';
    this.subjects.set([]);
    this.activeSubject.set(null);
    this.resetLoadedState();

    if (!this.filters.classId) return;

    // Only the subjects this teacher teaches in the selected class.
    const mine: SubjectOption[] = this.teachingAssignments()
      .filter((a) => a.classId === this.filters.classId)
      .map((a) => ({ id: a.subjectId, code: a.subjectCode, name: a.subjectName }))
      .sort((x, y) => x.name.localeCompare(y.name));
    this.subjects.set(mine);

    if (mine.length === 1) {
      this.filters.subjectId = mine[0].id;
      this.activeSubject.set(mine[0]);
    } else if (!mine.length) {
      this.showToast('error', 'You are not assigned to teach any subject in this class.');
    }
  }

  onSubjectChange(): void {
    const subject = this.subjects().find((s) => s.id === this.filters.subjectId) || null;
    this.activeSubject.set(subject);
    this.resetLoadedState();
  }

  private resetLoadedState(): void {
    this.flushSave();
    this.activeKey = null;
    this.hasLoaded.set(false);
    this.students.set([]);
    this.markColumns.set([]);
    this.topics.set({});
    this.marks.set({});
    this.saveState.set('idle');
    this.lastSavedAt.set(null);
    this.columnWidths.set({ ...DEFAULT_COLUMN_WIDTHS });
  }

  /** Loads the class roster, then restores only what this teacher previously typed in. */
  loadClass(): void {
    const { classId: selClass, subjectId: selSubject } = this.filters;
    if (selClass && selSubject && !this.isAssigned(selClass, selSubject)) {
      this.showToast('error', 'You can only record marks for a subject you teach in that class.');
      return;
    }
    if (!this.filtersReady()) {
      this.showToast('error', 'Select term, class, and subject.');
      return;
    }

    this.resetLoadedState();
    this.loading.set(true);

    const { termId, classId, subjectId } = this.filters;
    this.api
      .get<RecordBookData>('/exams/record-book', { termId, classId, subjectId })
      .subscribe({
        next: (data) => {
          if (data.subject?.id && !this.isAssigned(classId, data.subject.id)) {
            this.loading.set(false);
            this.showToast('error', 'You can only record marks for a subject you teach in that class.');
            return;
          }
          this.teacherName.set(data.teacher.fullName);
          this.activeSubject.set(data.subject);
          this.maxMarks.set(data.maxMarks);
          this.students.set(
            data.students.map((s) => ({
              studentId: s.studentId,
              admissionNumber: s.admissionNumber,
              lastName: s.lastName,
              firstName: s.firstName,
              gender: s.gender,
            })),
          );

          // Marks, topics and columns come only from what the teacher entered (saved on this device).
          this.activeKey = this.storageKey();
          const stored = this.readStored(this.activeKey);
          const columns = stored?.columns?.length ? stored.columns : [this.newColumn(1)];
          this.markColumns.set(columns);
          this.topics.set(stored?.topics ?? {});
          this.marks.set(stored?.marks ?? {});
          this.columnWidths.set(this.buildColumnWidths(columns));
          if (!stored) this.persistNow(); // create the book so auto-save state is visible straight away

          this.hasLoaded.set(true);
          this.loading.set(false);
          const cls = this.classes().find((c) => c.id === classId)?.name || data.class.name;
          this.sessionLabel.set(
            [data.term.name, formatStudentClassLabel(cls), data.subject.name].filter(Boolean).join(' · '),
          );
          this.showToast('success', `Loaded ${data.students.length} student(s).`);
        },
        error: (e) => {
          this.loading.set(false);
          this.showToast('error', e.error?.message || 'Failed to load class record book.');
        },
      });
  }

  colWidth(key: string): number {
    return this.columnWidths()[key] ?? DEFAULT_MARK_COL_WIDTH;
  }

  stickyLeft(fixed: FixedColumnKey): number {
    const w = this.columnWidths();
    const id = w['studentId'] ?? DEFAULT_COLUMN_WIDTHS.studentId;
    const last = w['lastName'] ?? DEFAULT_COLUMN_WIDTHS.lastName;
    switch (fixed) {
      case 'studentId':
        return 0;
      case 'lastName':
        return id;
      case 'firstName':
        return id + last;
    }
  }

  startColumnResize(event: MouseEvent, columnKey: string): void {
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startWidth = this.colWidth(columnKey);

    const onMove = (e: MouseEvent) => {
      const width = Math.max(MIN_COL_WIDTH, startWidth + (e.clientX - startX));
      this.columnWidths.update((current) => ({ ...current, [columnKey]: width }));
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      this.resizeCleanup = null;
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    this.resizeCleanup = onUp;
  }

  addMarkColumn(): void {
    if (!this.hasLoaded()) return;
    const column = this.newColumn(this.markColumns().length + 1);
    this.markColumns.update((cols) => [...cols, column]);
    this.columnWidths.update((current) => ({ ...current, [column.columnKey]: DEFAULT_MARK_COL_WIDTH }));
    this.scheduleSave();
    this.showToast('success', 'Mark column added. Enter its topic in the Topic row.');
  }

  /** The record book always keeps at least one mark column. */
  readonly canRemoveColumn = computed(() => this.hasLoaded() && this.markColumns().length > 1);

  /** Removes the last mark column, with its marks and topic. Asks first if it holds any data. */
  removeMarkColumn(): void {
    if (!this.canRemoveColumn()) return;
    const cols = this.markColumns();
    const last = cols[cols.length - 1];
    const hasMarks = Object.values(this.marks()).some((m) => m[last.columnKey] !== null && m[last.columnKey] !== undefined);
    const hasTopic = !!this.topicFor(last.columnKey).trim();
    if (hasMarks || hasTopic) {
      const ok = window.confirm(
        `Remove the last Mark column${hasTopic ? ` ("${this.topicFor(last.columnKey).trim()}")` : ''}? ` +
          'The marks and topic entered in it will be deleted.',
      );
      if (!ok) return;
    }

    this.markColumns.set(cols.slice(0, -1));
    this.marks.update((all) => {
      const next: Record<string, Record<string, number | null>> = {};
      for (const [studentId, m] of Object.entries(all)) {
        const { [last.columnKey]: _removed, ...rest } = m;
        next[studentId] = rest;
      }
      return next;
    });
    this.topics.update((t) => {
      const { [last.columnKey]: _removed, ...rest } = t;
      return rest;
    });
    this.columnWidths.update((w) => {
      const { [last.columnKey]: _removed, ...rest } = w;
      return rest;
    });
    this.scheduleSave();
    this.flushSave();
    this.showToast('success', 'Mark column removed.');
  }

  private newColumn(n: number): MarkColumn {
    const id = `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    return { columnKey: id, label: `Mark ${n}` };
  }

  private buildColumnWidths(columns: MarkColumn[]): Record<string, number> {
    const widths: Record<string, number> = { ...DEFAULT_COLUMN_WIDTHS };
    for (const col of columns) {
      widths[col.columnKey] = DEFAULT_MARK_COL_WIDTH;
    }
    return widths;
  }

  // ── Marks & topics (entered by the teacher) ────────────────────────────────

  markValue(studentId: string, columnKey: string): number | null {
    return this.marks()[studentId]?.[columnKey] ?? null;
  }

  isInvalid(studentId: string, columnKey: string): boolean {
    const v = this.markValue(studentId, columnKey);
    return v !== null && (!Number.isFinite(v) || v < 0 || v > this.maxMarks());
  }

  onMarkInput(studentId: string, columnKey: string, raw: string | number | null): void {
    const text = raw === null || raw === undefined ? '' : String(raw);
    const parsed = text.trim() === '' ? null : Number(text);
    this.marks.update((all) => ({
      ...all,
      [studentId]: { ...(all[studentId] ?? {}), [columnKey]: parsed },
    }));
    if (parsed !== null && this.isInvalid(studentId, columnKey)) {
      this.showToast('error', `Marks must be between 0 and ${this.maxMarks()}. This mark is not saved until corrected.`);
    }
    this.scheduleSave();
  }

  topicFor(columnKey: string): string {
    return this.topics()[columnKey] ?? '';
  }

  onTopicInput(columnKey: string, raw: string): void {
    const value = (raw ?? '').slice(0, MAX_TOPIC_LENGTH);
    this.topics.update((t) => ({ ...t, [columnKey]: value }));
    this.scheduleSave();
  }

  /** Saves immediately when the teacher leaves a cell. */
  onCellBlur(): void {
    this.flushSave();
  }

  // ── Auto-save ──────────────────────────────────────────────────────────────

  private storageKey(): string {
    const { termId, classId, subjectId } = this.filters;
    const user = this.auth.user()?.id ?? 'anon';
    return `${STORAGE_PREFIX}:${user}:${termId}:${classId}:${subjectId}`;
  }

  private readStored(key: string): StoredRecordBook | null {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as StoredRecordBook) : null;
    } catch {
      return null;
    }
  }

  private scheduleSave(): void {
    if (!this.activeKey) return;
    this.pendingSave = true;
    this.saveState.set('saving');
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
    this.autosaveTimer = setTimeout(() => this.flushSave(), AUTOSAVE_DELAY_MS);
  }

  /** Writes any pending change right away (cell blur, switching books, leaving the page). */
  private flushSave(): void {
    if (this.autosaveTimer) {
      clearTimeout(this.autosaveTimer);
      this.autosaveTimer = null;
    }
    if (this.pendingSave) this.persistNow();
  }

  private persistNow(): void {
    if (!this.activeKey) return;
    this.pendingSave = false;

    // Out-of-range marks stay visible (flagged red) but are never written.
    const cleanMarks: Record<string, Record<string, number | null>> = {};
    for (const [studentId, cols] of Object.entries(this.marks())) {
      for (const [columnKey, value] of Object.entries(cols)) {
        if (value === null || !Number.isFinite(value) || value < 0 || value > this.maxMarks()) continue;
        (cleanMarks[studentId] ??= {})[columnKey] = value;
      }
    }

    const doc: StoredRecordBook = {
      columns: this.markColumns(),
      topics: this.topics(),
      marks: cleanMarks,
      updatedAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem(this.activeKey, JSON.stringify(doc));
      this.saveState.set('saved');
      this.lastSavedAt.set(new Date());
    } catch {
      this.saveState.set('error');
      this.showToast('error', 'Auto-save failed: browser storage is full or unavailable.');
    }
  }

  private showToast(type: 'success' | 'error', msg: string): void {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 4500);
  }
}
