import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { formatStudentClassLabel } from '../../core/utils/class-display';
import { loadTeacherClassOptions } from '../../core/utils/teacher-classes.util';
import { resolvePortalLayout } from '../../core/utils/portal-layout.util';

interface SubjectOption {
  id: string;
  code: string;
  name: string;
}

interface MarkColumn {
  columnKey: string;
  label: string;
  sortOrder: number;
}

interface RecordBookCell {
  marks: number | null;
  markId: string | null;
  dirty?: boolean;
}

interface RecordBookStudent {
  studentId: string;
  admissionNumber: string;
  lastName: string;
  firstName: string;
  gender: string;
  marksByColumn: Record<string, RecordBookCell>;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
}

interface RecordBookData {
  maxMarks: number;
  term: { id: string; name: string };
  class: { id: string; name: string };
  teacher: { fullName: string };
  subject: SubjectOption;
  columns: MarkColumn[];
  students: Omit<RecordBookStudent, 'saveStatus'>[];
}

interface RecordBookSubjectsResponse {
  teacher: { fullName: string };
  subjects: SubjectOption[];
}

type FixedColumnKey = 'studentId' | 'lastName' | 'firstName' | 'gender';

const DEFAULT_COLUMN_WIDTHS: Record<FixedColumnKey, number> = {
  studentId: 72,
  lastName: 80,
  firstName: 80,
  gender: 52,
};

const DEFAULT_MARK_COL_WIDTH = 56;
const MIN_COL_WIDTH = 36;

@Component({
  selector: 'app-record-book',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule],
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
  subjects = signal<SubjectOption[]>([]);

  filters = { termId: '', classId: '', subjectId: '' };
  teacherName = signal('');
  activeSubject = signal<SubjectOption | null>(null);
  markColumns = signal<MarkColumn[]>([]);
  students = signal<RecordBookStudent[]>([]);
  columnWidths = signal<Record<string, number>>({ ...DEFAULT_COLUMN_WIDTHS });
  maxMarks = signal(100);
  sessionLabel = signal('');
  loading = signal(false);
  loadingSubjects = signal(false);
  addingColumn = signal(false);
  hasLoaded = signal(false);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  readonly showSubjectPicker = computed(() => this.subjects().length > 1);
  readonly assignedSubjectsLabel = computed(() =>
    this.subjects()
      .map((s) => s.name)
      .join(', '),
  );

  private activeStudentId: string | null = null;
  private dirtyStudents = new Set<string>();
  private savingStudents = new Set<string>();
  private resizeCleanup: (() => void) | null = null;

  ngOnInit(): void {
    this.api.get<{ id: string; name: string; isCurrent?: boolean }[]>('/exams/terms').subscribe({
      next: (t) => {
        this.terms.set(t);
        const current = t.find((x) => x.isCurrent);
        if (current && !this.filters.termId) this.filters.termId = current.id;
      },
      error: () => this.showToast('error', 'Could not load terms.'),
    });
    loadTeacherClassOptions(this.api).subscribe({
      next: (c) => this.classes.set(c),
      error: () => this.showToast('error', 'Could not load classes.'),
    });
  }

  ngOnDestroy(): void {
    this.resizeCleanup?.();
    if (this.activeStudentId) {
      void this.saveStudentRow(this.activeStudentId);
    }
  }

  filtersReady(): boolean {
    return !!(this.filters.termId && this.filters.classId && this.filters.subjectId);
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

    this.loadingSubjects.set(true);
    this.api
      .get<RecordBookSubjectsResponse>('/exams/record-book/subjects', { classId: this.filters.classId })
      .subscribe({
        next: (data) => {
          this.teacherName.set(data.teacher.fullName);
          this.subjects.set(data.subjects);
          if (data.subjects.length === 1) {
            this.filters.subjectId = data.subjects[0].id;
            this.activeSubject.set(data.subjects[0]);
          }
          this.loadingSubjects.set(false);
          if (!data.subjects.length) {
            this.showToast('error', 'No subjects assigned to you for this class.');
          }
        },
        error: (e) => {
          this.loadingSubjects.set(false);
          this.showToast('error', e.error?.message || 'Could not load subjects for this class.');
        },
      });
  }

  onSubjectChange(): void {
    const subject = this.subjects().find((s) => s.id === this.filters.subjectId) || null;
    this.activeSubject.set(subject);
    this.resetLoadedState();
  }

  private resetLoadedState(): void {
    this.hasLoaded.set(false);
    this.students.set([]);
    this.markColumns.set([]);
    this.columnWidths.set({ ...DEFAULT_COLUMN_WIDTHS });
    this.dirtyStudents.clear();
    this.savingStudents.clear();
    this.activeStudentId = null;
  }

  loadClass(): void {
    if (!this.filtersReady()) {
      this.showToast('error', 'Select term, class, and subject.');
      return;
    }

    this.loading.set(true);
    this.hasLoaded.set(false);
    this.dirtyStudents.clear();
    this.savingStudents.clear();
    this.activeStudentId = null;
    this.markColumns.set([]);
    this.columnWidths.set({ ...DEFAULT_COLUMN_WIDTHS });

    const { termId, classId, subjectId } = this.filters;
    this.api
      .get<RecordBookData>('/exams/record-book', { termId, classId, subjectId })
      .subscribe({
        next: (data) => {
          this.teacherName.set(data.teacher.fullName);
          this.activeSubject.set(data.subject);
          this.markColumns.set(data.columns);
          this.columnWidths.set(this.buildColumnWidths(data.columns));
          this.maxMarks.set(data.maxMarks);
          this.students.set(
            data.students.map((s) => ({
              ...s,
              marksByColumn: Object.fromEntries(
                Object.entries(s.marksByColumn).map(([key, cell]) => [
                  key,
                  { ...cell, dirty: false },
                ]),
              ),
              saveStatus: Object.values(s.marksByColumn).some((c) => c.markId) ? 'saved' : 'idle',
            })),
          );
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
    const first = w['firstName'] ?? DEFAULT_COLUMN_WIDTHS.firstName;
    switch (fixed) {
      case 'studentId':
        return 0;
      case 'lastName':
        return id;
      case 'firstName':
        return id + last;
      case 'gender':
        return id + last + first;
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
    if (!this.filtersReady() || this.addingColumn()) return;

    const { termId, classId, subjectId } = this.filters;
    const label = `Test ${this.markColumns().length + 1}`;
    this.addingColumn.set(true);

    this.api
      .post<MarkColumn>('/exams/record-book/add-column', { termId, classId, subjectId, label })
      .subscribe({
        next: (column) => {
          this.markColumns.update((cols) => [...cols, column]);
          this.columnWidths.update((current) => ({
            ...current,
            [column.columnKey]: DEFAULT_MARK_COL_WIDTH,
          }));
          this.students.update((rows) =>
            rows.map((row) => ({
              ...row,
              marksByColumn: {
                ...row.marksByColumn,
                [column.columnKey]: { marks: null, markId: null, dirty: false },
              },
            })),
          );
          this.addingColumn.set(false);
          this.showToast('success', `Added ${column.label}.`);
        },
        error: (e) => {
          this.addingColumn.set(false);
          this.showToast('error', e.error?.message || 'Could not add test column.');
        },
      });
  }

  private buildColumnWidths(columns: MarkColumn[]): Record<string, number> {
    const widths: Record<string, number> = { ...DEFAULT_COLUMN_WIDTHS };
    for (const col of columns) {
      widths[col.columnKey] = DEFAULT_MARK_COL_WIDTH;
    }
    return widths;
  }

  onCellFocus(studentId: string): void {
    if (this.activeStudentId && this.activeStudentId !== studentId) {
      void this.saveStudentRow(this.activeStudentId);
    }
    this.activeStudentId = studentId;
  }

  onMarkInput(studentId: string, columnKey: string, raw: string | number | null): void {
    const text = raw === null || raw === undefined ? '' : String(raw);
    const parsed = text.trim() === '' ? null : Number(text);
    this.students.update((rows) =>
      rows.map((row) => {
        if (row.studentId !== studentId) return row;
        const existing = row.marksByColumn[columnKey];
        const cell = existing ?? { marks: null, markId: null };
        return {
          ...row,
          saveStatus: 'idle',
          marksByColumn: {
            ...row.marksByColumn,
            [columnKey]: { ...cell, marks: parsed, dirty: true },
          },
        };
      }),
    );
    this.dirtyStudents.add(studentId);
  }

  onCellBlur(studentId: string): void {
    setTimeout(() => {
      const active = document.activeElement as HTMLElement | null;
      const row = active?.closest('tr[data-student-id]');
      const nextStudentId = row?.getAttribute('data-student-id');
      if (nextStudentId !== studentId && this.dirtyStudents.has(studentId)) {
        void this.saveStudentRow(studentId);
      }
    }, 0);
  }

  private async saveStudentRow(studentId: string): Promise<void> {
    if (!this.dirtyStudents.has(studentId) || this.savingStudents.has(studentId)) return;
    if (!this.filtersReady()) return;

    const row = this.students().find((s) => s.studentId === studentId);
    if (!row) return;

    const marks = this.markColumns()
      .map((col) => {
        const cell = row.marksByColumn[col.columnKey];
        if (!cell?.dirty || cell.marks === null || cell.marks === undefined) return null;
        const value = Number(cell.marks);
        if (!Number.isFinite(value)) return null;
        return { columnKey: col.columnKey, marks: value };
      })
      .filter((m): m is { columnKey: string; marks: number } => !!m);

    if (!marks.length) {
      this.dirtyStudents.delete(studentId);
      return;
    }

    const max = this.maxMarks();
    if (marks.some((m) => m.marks < 0 || m.marks > max)) {
      this.updateRowStatus(studentId, 'error');
      this.showToast('error', `Marks must be between 0 and ${max}.`);
      return;
    }

    this.savingStudents.add(studentId);
    this.updateRowStatus(studentId, 'saving');
    const { termId, classId, subjectId } = this.filters;

    return new Promise((resolve) => {
      this.api
        .post<{ saved: number }>('/exams/record-book/save-row', {
          classId,
          termId,
          subjectId,
          studentId,
          marks,
        })
        .subscribe({
          next: () => {
            this.students.update((rows) =>
              rows.map((r) => {
                if (r.studentId !== studentId) return r;
                const marksByColumn = { ...r.marksByColumn };
                for (const col of this.markColumns()) {
                  const cell = marksByColumn[col.columnKey];
                  if (cell?.dirty) {
                    marksByColumn[col.columnKey] = {
                      ...cell,
                      dirty: false,
                      markId: cell.markId || 'saved',
                    };
                  }
                }
                return { ...r, marksByColumn, saveStatus: 'saved' };
              }),
            );
            this.dirtyStudents.delete(studentId);
            this.savingStudents.delete(studentId);
            resolve();
          },
          error: (e) => {
            this.updateRowStatus(studentId, 'error');
            this.showToast('error', e.error?.message || 'Auto-save failed.');
            this.savingStudents.delete(studentId);
            resolve();
          },
        });
    });
  }

  private updateRowStatus(studentId: string, status: RecordBookStudent['saveStatus']): void {
    this.students.update((rows) =>
      rows.map((r) => (r.studentId === studentId ? { ...r, saveStatus: status } : r)),
    );
  }

  private showToast(type: 'success' | 'error', msg: string): void {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 4500);
  }
}
