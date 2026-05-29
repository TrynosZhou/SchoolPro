import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';
import { classDisplayName } from '../../core/utils/class-display';
import { resolveExecutivePortalLayout } from '../../core/utils/portal-layout.util';

interface ResultsAnalysisPerformer {
  rank: number;
  studentId: string;
  admissionNumber: string;
  lastName: string;
  firstName: string;
  subjectsPassed: number;
  subjectCount: number;
  averagePercent: number;
}

interface ResultsAnalysisData {
  examType: { id: string; name: string; maxMarks: number };
  term: { id: string; name: string };
  class: { id: string; name: string };
  minSubjectsForPass: number;
  summary: {
    totalStudents: number;
    studentsWithExamMarks: number;
    studentsPassedOverall: number;
    overallPassRatePercent: number;
  };
  topPerformers: ResultsAnalysisPerformer[];
  bottomPerformers: ResultsAnalysisPerformer[];
}

@Component({
  selector: 'app-admin-results-analysis',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, DecimalPipe, RouterLink],
  templateUrl: './admin-results-analysis.component.html',
  styleUrl: './admin-results-analysis.component.scss',
})
export class AdminResultsAnalysisComponent implements OnInit {
  private api = inject(ApiService);
  private router = inject(Router);

  readonly portalLayout = resolveExecutivePortalLayout(this.router);
  readonly adminNav = ADMIN_NAV_SECTIONS;
  readonly topCount = 5;

  examTypes = signal<{ id: string; name: string }[]>([]);
  terms = signal<{ id: string; name: string; isCurrent?: boolean }[]>([]);
  classes = signal<{ id: string; name: string }[]>([]);

  filters = { examTypeId: '', termId: '', classId: '' };
  analysis = signal<ResultsAnalysisData | null>(null);
  sessionLabel = signal('');
  loading = signal(false);
  hasAnalyzed = signal(false);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  filtersReady(): boolean {
    return !!(this.filters.examTypeId && this.filters.termId && this.filters.classId);
  }

  ngOnInit(): void {
    this.api.get<{ id: string; name: string }[]>('/exams/types').subscribe({
      next: (t) => this.examTypes.set(t),
      error: () => this.showToast('error', 'Could not load exam types.'),
    });
    this.api.get<{ id: string; name: string; isCurrent?: boolean }[]>('/exams/terms').subscribe({
      next: (t) => {
        this.terms.set(t);
        const current = t.find((x) => x.isCurrent);
        if (current) this.filters.termId = current.id;
      },
      error: () => this.showToast('error', 'Could not load terms.'),
    });
    this.api.get<{ id: string; name: string }[]>('/admin/classes').subscribe({
      next: (c) => this.classes.set(c),
      error: () => this.showToast('error', 'Could not load classes.'),
    });
  }

  onFilterChange(): void {
    this.analysis.set(null);
    this.hasAnalyzed.set(false);
  }

  runAnalysis(): void {
    if (!this.filtersReady()) {
      this.showToast('error', 'Select term, exam type, and class.');
      return;
    }

    this.loading.set(true);
    this.hasAnalyzed.set(false);
    const { examTypeId, termId, classId } = this.filters;

    this.api
      .get<ResultsAnalysisData>('/exams/results-analysis', {
        examTypeId,
        termId,
        classId,
        topN: String(this.topCount),
      })
      .subscribe({
        next: (data) => {
          this.analysis.set(data);
          this.hasAnalyzed.set(true);
          this.loading.set(false);
          const exam = this.examTypes().find((e) => e.id === examTypeId)?.name || '';
          const term = this.terms().find((t) => t.id === termId)?.name || '';
          const cls = classDisplayName(this.classes(), classId);
          this.sessionLabel.set([exam, term, cls].filter(Boolean).join(' · '));
          this.showToast('success', 'Results analysis complete.');
        },
        error: (e) => {
          this.loading.set(false);
          this.showToast('error', e.error?.message || 'Failed to run analysis.');
        },
      });
  }

  private showToast(type: 'success' | 'error', msg: string): void {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 4500);
  }
}
