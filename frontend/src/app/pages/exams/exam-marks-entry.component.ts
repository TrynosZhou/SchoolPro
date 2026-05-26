import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ApiService } from '../../core/services/api.service';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { TEACHER_NAV_SECTIONS } from '../../core/config/teacher-nav';

interface ExamMarkRow {
  studentId: string;
  studentNumber: string;
  lastName: string;
  firstName: string;
  gender: string;
  marks: number | null;
  remarks: string;
  grade: string | null;
  markId: string | null;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
}

interface EntryResponse {
  maxMarks: number;
  examTypeName?: string;
  students: Omit<ExamMarkRow, 'saveStatus'>[];
}

type EntryFilter = 'all' | 'marked' | 'unmarked' | 'unsaved' | 'error';
type SortKey = 'lastName' | 'firstName' | 'studentId' | 'marksDesc' | 'marksAsc';
type ViewMode = 'table' | 'list';

@Component({
  selector: 'app-exam-marks-entry',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, DecimalPipe, RouterLink],
  templateUrl: './exam-marks-entry.component.html',
  styleUrl: './exam-marks-entry.component.scss',
})
export class ExamMarksEntryComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private router = inject(Router);
  private saveTimers = new Map<string, ReturnType<typeof setTimeout>>();

  readonly isAdminPortal = computed(() => {
    const url = this.router.url;
    return url.includes('/admin') || url.includes('/principal');
  });

  examTypes = signal<{ id: string; name: string; maxMarks?: number }[]>([]);
  classes = signal<{ id: string; name: string }[]>([]);
  subjects = signal<{ id: string; name: string }[]>([]);
  terms = signal<{ id: string; name: string; isCurrent?: boolean }[]>([]);
  markRows = signal<ExamMarkRow[]>([]);
  maxMarks = signal(100);
  loading = signal(false);
  hasFetched = signal(false);
  searchQuery = signal('');
  entryFilter = signal<EntryFilter>('all');
  sortBy = signal<SortKey>('lastName');
  viewMode = signal<ViewMode>('table');
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  filters = { examTypeId: '', classId: '', subjectId: '', termId: '' };

  readonly portalTitle = computed(() => {
    if (this.router.url.includes('/principal')) return 'Principal Portal';
    if (this.isAdminPortal()) return 'Admin Portal';
    return 'Teacher Portal';
  });
  readonly pageTitle = 'Exam Marks Entry';
  readonly adminNav = ADMIN_NAV_SECTIONS;
  readonly teacherNav = TEACHER_NAV_SECTIONS;
  readonly isAdminRoute = computed(() => this.router.url.includes('/admin'));
  readonly isPrincipalRoute = computed(() => this.router.url.includes('/principal'));
  readonly principalNav = [
    { label: 'Dashboard', path: '/principal', icon: '🏠' },
    { label: 'Exam Marks', path: '/principal/exams', icon: '📊' },
    { label: 'Finance', path: '/principal/finance', icon: '💰' },
  ];

  private filtersReady(): boolean {
    const f = this.filters;
    return !!(f.examTypeId && f.classId && f.subjectId && f.termId);
  }

  readonly sessionLabels = computed(() => {
    const exam = this.examTypes().find((e) => e.id === this.filters.examTypeId);
    const cls = this.classes().find((c) => c.id === this.filters.classId);
    const sub = this.subjects().find((s) => s.id === this.filters.subjectId);
    const term = this.terms().find((t) => t.id === this.filters.termId);
    return {
      exam: exam?.name || '—',
      class: cls?.name || '—',
      subject: sub?.name || '—',
      term: term?.name || '—',
    };
  });

  readonly stats = computed(() => {
    const rows = this.markRows();
    const withMarks = rows.filter((r) => this.hasMarksValue(r));
    const saved = rows.filter((r) => r.saveStatus === 'saved' || r.markId).length;
    const errors = rows.filter((r) => r.saveStatus === 'error').length;
    const avg = withMarks.length
      ? withMarks.reduce((s, r) => s + Number(r.marks), 0) / withMarks.length
      : 0;
    return {
      total: rows.length,
      saved,
      pending: Math.max(0, rows.length - saved),
      errors,
      withMarks: withMarks.length,
      unmarked: rows.length - withMarks.length,
      completion: rows.length ? Math.round((withMarks.length / rows.length) * 100) : 0,
      average: Math.round(avg * 10) / 10,
    };
  });

  readonly gradeDistribution = computed(() => {
    const counts = new Map<string, number>();
    for (const r of this.markRows()) {
      if (!r.grade) continue;
      const g = r.grade.trim().toUpperCase();
      counts.set(g, (counts.get(g) || 0) + 1);
    }
    return [...counts.entries()]
      .map(([grade, count]) => ({ grade, count }))
      .sort((a, b) => b.count - a.count);
  });

  readonly displayRows = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    let rows = this.markRows();
    if (q) {
      rows = rows.filter(
        (r) =>
          r.studentNumber.toLowerCase().includes(q) ||
          r.lastName.toLowerCase().includes(q) ||
          r.firstName.toLowerCase().includes(q) ||
          r.gender.toLowerCase().includes(q) ||
          (r.grade || '').toLowerCase().includes(q)
      );
    }

    const filter = this.entryFilter();
    if (filter === 'marked') {
      rows = rows.filter((r) => this.hasMarksValue(r));
    } else if (filter === 'unmarked') {
      rows = rows.filter((r) => !this.hasMarksValue(r));
    } else if (filter === 'unsaved') {
      rows = rows.filter((r) => r.saveStatus !== 'saved' && !r.markId);
    } else if (filter === 'error') {
      rows = rows.filter((r) => r.saveStatus === 'error');
    }

    const sort = this.sortBy();
    return [...rows].sort((a, b) => {
      if (sort === 'studentId') return a.studentNumber.localeCompare(b.studentNumber);
      if (sort === 'firstName') return a.firstName.localeCompare(b.firstName);
      if (sort === 'marksDesc') {
        const ma = a.marks ?? -1;
        const mb = b.marks ?? -1;
        return Number(mb) - Number(ma);
      }
      if (sort === 'marksAsc') {
        const ma = a.marks ?? 9999;
        const mb = b.marks ?? 9999;
        return Number(ma) - Number(mb);
      }
      return a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName);
    });
  });

  readonly filterChips = computed(() => [
    { id: 'all' as EntryFilter, label: 'All', count: this.markRows().length },
    { id: 'marked' as EntryFilter, label: 'With marks', count: this.stats().withMarks },
    { id: 'unmarked' as EntryFilter, label: 'No marks', count: this.stats().unmarked },
    { id: 'unsaved' as EntryFilter, label: 'Unsaved', count: this.stats().pending },
    { id: 'error' as EntryFilter, label: 'Errors', count: this.stats().errors },
  ]);

  ngOnInit() {
    this.api.get<{ id: string; name: string }[]>('/exams/types').subscribe((t) => this.examTypes.set(t));
    this.api.get<{ id: string; name: string }[]>('/admin/classes').subscribe((c) => this.classes.set(c));
    this.api.get<{ id: string; name: string; isCurrent?: boolean }[]>('/exams/terms').subscribe((terms) => {
      this.terms.set(terms);
      const current = terms.find((t) => t.isCurrent);
      if (terms.length && !this.filters.termId) {
        this.filters.termId = current?.id || terms[0].id;
      }
    });
  }

  ngOnDestroy() {
    this.saveTimers.forEach((t) => clearTimeout(t));
    this.saveTimers.clear();
  }

  setEntryFilter(id: EntryFilter) {
    this.entryFilter.set(id);
  }

  setViewMode(mode: ViewMode) {
    this.viewMode.set(mode);
  }

  gradeTone(grade: string | null): string {
    if (!grade) return '';
    const g = grade.trim().toUpperCase();
    if (g === 'A' || g.startsWith('A')) return 'grade-a';
    if (g === 'B') return 'grade-b';
    if (g === 'C') return 'grade-c';
    if (g === 'D' || g === 'E') return 'grade-de';
    return 'grade-u';
  }

  exportCsv() {
    const rows = this.markRows();
    if (!rows.length) {
      this.showToast('error', 'No data to export. Fetch students first.');
      return;
    }
    const headers = ['Student ID', 'Last Name', 'First Name', 'Gender', 'Marks', 'Grade', 'Remarks'];
    const lines = rows.map((r) =>
      [
        r.studentNumber,
        r.lastName,
        r.firstName,
        r.gender,
        r.marks ?? '',
        r.grade ?? '',
        (r.remarks || '').replace(/"/g, '""'),
      ]
        .map((v) => `"${v}"`)
        .join(',')
    );
    const csv = [headers.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `exam-marks-${this.sessionLabels().class}-${this.sessionLabels().subject}.csv`.replace(/\s+/g, '-');
    a.click();
    URL.revokeObjectURL(a.href);
    this.showToast('success', 'Marks exported to CSV.');
  }

  onClassChange() {
    this.filters.subjectId = '';
    this.subjects.set([]);
    this.markRows.set([]);
    this.hasFetched.set(false);
    this.searchQuery.set('');
    this.entryFilter.set('all');
    if (!this.filters.classId) return;
    this.api
      .get<{ id: string; name: string }[]>('/exams/class-subjects', { classId: this.filters.classId })
      .subscribe((s) => {
        if (s.length) {
          this.subjects.set(s);
        } else {
          this.api.get<{ id: string; name: string }[]>('/admin/subjects').subscribe((all) => this.subjects.set(all));
        }
      });
  }

  onFilterChange() {
    this.hasFetched.set(false);
    this.markRows.set([]);
    this.searchQuery.set('');
    this.entryFilter.set('all');
  }

  clearFilters() {
    this.filters = { examTypeId: '', classId: '', subjectId: '', termId: '' };
    this.subjects.set([]);
    this.markRows.set([]);
    this.hasFetched.set(false);
    this.searchQuery.set('');
    this.entryFilter.set('all');
  }

  fetchStudents() {
    if (!this.filters.classId) {
      this.showToast('error', 'Select a class first.');
      return;
    }
    if (!this.filtersReady()) {
      this.showToast('error', 'Select exam type, subject, and term before fetching.');
      return;
    }
    this.hasFetched.set(true);
    this.searchQuery.set('');
    this.entryFilter.set('all');
    this.loadEntry();
  }

  loadEntry() {
    const { classId, subjectId, examTypeId, termId } = this.filters;
    if (!classId || !subjectId || !examTypeId || !termId) return;

    this.loading.set(true);
    this.api
      .get<EntryResponse>('/exams/marks/entry', { classId, subjectId, examTypeId, termId })
      .subscribe({
        next: (data) => {
          this.maxMarks.set(data.maxMarks);
          this.markRows.set(
            data.students.map((s) => ({
              ...s,
              marks: s.marks ?? null,
              saveStatus: s.markId ? 'saved' : 'idle',
            }))
          );
          this.loading.set(false);
          if (data.students.length) {
            this.showToast('success', `Loaded ${data.students.length} student(s).`);
          }
        },
        error: () => {
          this.loading.set(false);
          this.hasFetched.set(false);
          this.showToast('error', 'Could not load students for this class.');
        },
      });
  }

  private hasMarksValue(row: ExamMarkRow): boolean {
    return row.marks !== null && row.marks !== undefined;
  }

  onMarksInput(row: ExamMarkRow) {
    this.scheduleSave(row.studentId);
  }

  onRemarksInput(row: ExamMarkRow) {
    if (this.hasMarksValue(row)) this.scheduleSave(row.studentId);
  }

  private scheduleSave(studentId: string) {
    const existing = this.saveTimers.get(studentId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      const row = this.markRows().find((r) => r.studentId === studentId);
      if (row) this.saveRow(row);
    }, 850);
    this.saveTimers.set(studentId, timer);
    this.updateRowStatus(studentId, 'saving');
  }

  private saveRow(row: ExamMarkRow) {
    const { examTypeId, classId, subjectId, termId } = this.filters;
    if (!examTypeId || !classId || !subjectId || !termId) return;
    if (!this.hasMarksValue(row)) {
      this.updateRowStatus(row.studentId, 'idle');
      return;
    }

    const marks = Number(row.marks);
    if (Number.isNaN(marks) || marks < 0 || marks > this.maxMarks()) {
      this.updateRowStatus(row.studentId, 'error');
      this.showToast('error', `Marks must be between 0 and ${this.maxMarks()}.`);
      return;
    }

    this.api
      .post<{ grade?: string }>('/exams/marks/save-one', {
        studentId: row.studentId,
        examTypeId,
        classId,
        subjectId,
        termId,
        marks,
        remarks: row.remarks || '',
      })
      .subscribe({
        next: (saved) => {
          this.markRows.update((rows) =>
            rows.map((r) =>
              r.studentId === row.studentId
                ? { ...r, grade: saved.grade || r.grade, saveStatus: 'saved' as const }
                : r
            )
          );
        },
        error: () => {
          this.updateRowStatus(row.studentId, 'error');
          this.showToast('error', 'Auto-save failed. Check your connection and try again.');
        },
      });
  }

  private updateRowStatus(studentId: string, status: ExamMarkRow['saveStatus']) {
    this.markRows.update((rows) =>
      rows.map((r) => (r.studentId === studentId ? { ...r, saveStatus: status } : r))
    );
  }

  private showToast(type: 'success' | 'error', msg: string) {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 4000);
  }
}
