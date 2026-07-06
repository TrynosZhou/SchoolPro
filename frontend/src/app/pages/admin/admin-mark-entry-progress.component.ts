import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { Router } from '@angular/router';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { formatStudentClassLabel } from '../../core/utils/class-display';
import { loadTeacherClassOptions } from '../../core/utils/teacher-classes.util';
import { resolvePortalLayout } from '../../core/utils/portal-layout.util';

interface ProgressRow {
  classId: string;
  className: string;
  formName?: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  teacherName?: string;
  totalStudents: number;
  markedStudents: number;
  progressPercent: number;
}

interface ProgressData {
  examType: { id: string; name: string; maxMarks: number };
  term: { id: string; name: string };
  rows: ProgressRow[];
  summary: {
    totalExpected: number;
    totalMarked: number;
    overallProgressPercent: number;
    completeSubjects: number;
    totalSubjects: number;
  };
}

interface ClassGroup {
  classId: string;
  className: string;
  formName?: string;
  subjects: ProgressRow[];
  averageProgress: number;
}

@Component({
  selector: 'app-admin-mark-entry-progress',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, DecimalPipe],
  templateUrl: './admin-mark-entry-progress.component.html',
  styleUrl: './admin-mark-entry-progress.component.scss',
})
export class AdminMarkEntryProgressComponent implements OnInit {
  private api = inject(ApiService);
  private router = inject(Router);
  private auth = inject(AuthService);

  readonly portalLayout = resolvePortalLayout(this.router, {
    permissions: this.auth.user()?.permissions,
  });
  readonly isTeacherPortal = this.router.url.includes('/teacher');

  examTypes = signal<{ id: string; name: string }[]>([]);
  terms = signal<{ id: string; name: string; isCurrent?: boolean }[]>([]);
  classes = signal<{ id: string; name: string }[]>([]);
  forms = signal<{ id: string; name: string }[]>([]);

  filters = { examTypeId: '', termId: '', classId: '', formId: '' };
  data = signal<ProgressData | null>(null);
  loading = signal(false);
  hasLoaded = signal(false);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);
  search = signal('');

  readonly classGroups = computed(() => {
    const rows = this.data()?.rows ?? [];
    const q = this.search().trim().toLowerCase();
    const filtered = q
      ? rows.filter((r) =>
          `${r.className} ${r.subjectName} ${r.subjectCode} ${r.teacherName ?? ''}`.toLowerCase().includes(q),
        )
      : rows;

    const map = new Map<string, ClassGroup>();
    for (const row of filtered) {
      let group = map.get(row.classId);
      if (!group) {
        group = {
          classId: row.classId,
          className: row.className,
          formName: row.formName,
          subjects: [],
          averageProgress: 0,
        };
        map.set(row.classId, group);
      }
      group.subjects.push(row);
    }

    return [...map.values()]
      .map((g) => ({
        ...g,
        averageProgress: g.subjects.length
          ? Math.round(
              (g.subjects.reduce((sum, s) => sum + s.progressPercent, 0) / g.subjects.length) * 10,
            ) / 10
          : 0,
      }))
      .sort((a, b) => a.className.localeCompare(b.className));
  });

  ngOnInit(): void {
    this.api.get<{ id: string; name: string }[]>('/exams/types').subscribe({
      next: (t) => this.examTypes.set(t),
      error: () => this.showToast('error', 'Could not load exam types.'),
    });
    this.api.get<{ id: string; name: string; isCurrent?: boolean }[]>('/exams/terms').subscribe({
      next: (t) => {
        this.terms.set(t);
        const current = t.find((x) => x.isCurrent);
        if (current && !this.filters.termId) this.filters.termId = current.id;
      },
      error: () => this.showToast('error', 'Could not load terms.'),
    });
    this.api.get<{ id: string; name: string }[]>('/admin/forms').subscribe({
      next: (f) => this.forms.set(f),
      error: () => {},
    });

    if (this.isTeacherPortal) {
      loadTeacherClassOptions(this.api).subscribe({
        next: (c) => this.classes.set(c.map((x) => ({ id: x.id, name: formatStudentClassLabel(x.name) }))),
        error: () => this.showToast('error', 'Could not load classes.'),
      });
    } else {
      this.api.get<{ id: string; name: string }[]>('/admin/classes').subscribe({
        next: (c) =>
          this.classes.set(c.map((x) => ({ id: x.id, name: formatStudentClassLabel(x.name) }))),
        error: () => this.showToast('error', 'Could not load classes.'),
      });
    }
  }

  filtersReady(): boolean {
    return !!(this.filters.examTypeId && this.filters.termId);
  }

  loadProgress(): void {
    if (!this.filtersReady()) {
      this.showToast('error', 'Select exam type and term.');
      return;
    }

    this.loading.set(true);
    const params: Record<string, string> = {
      examTypeId: this.filters.examTypeId,
      termId: this.filters.termId,
    };
    if (this.filters.classId) params['classId'] = this.filters.classId;
    if (this.filters.formId) params['formId'] = this.filters.formId;

    this.api.get<ProgressData>('/exams/mark-entry-progress', params).subscribe({
      next: (d) => {
        this.data.set(d);
        this.hasLoaded.set(true);
        this.loading.set(false);
      },
      error: (e) => {
        this.loading.set(false);
        this.showToast('error', e.error?.message || 'Failed to load mark entry progress.');
      },
    });
  }

  onFilterChange(): void {
    this.data.set(null);
    this.hasLoaded.set(false);
  }

  progressTone(percent: number): string {
    if (percent >= 100) return 'complete';
    if (percent >= 75) return 'good';
    if (percent >= 40) return 'mid';
    return 'low';
  }

  private showToast(type: 'success' | 'error', msg: string): void {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 4500);
  }
}
