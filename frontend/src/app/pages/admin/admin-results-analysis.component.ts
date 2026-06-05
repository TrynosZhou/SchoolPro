import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
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

interface ClassStudentRow {
  id: string;
  admissionNumber: string;
  firstName: string;
  lastName: string;
  gender?: string;
}

interface StudentSubjectMark {
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  marks: number | null;
  grade: string | null;
  passed: boolean;
  percentOfMax: number | null;
}

interface StudentSubjectAnalysis {
  student: {
    id: string;
    admissionNumber: string;
    firstName: string;
    lastName: string;
    gender: string;
  };
  examType: { id: string; name: string; maxMarks: number };
  term: { id: string; name: string };
  class: { id: string; name: string };
  summary: {
    subjectCount: number;
    subjectsWithMarks: number;
    subjectsPassed: number;
    averagePercent: number | null;
    classPosition: number | null;
  };
  subjects: StudentSubjectMark[];
}

@Component({
  selector: 'app-admin-results-analysis',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, DecimalPipe, RouterLink],
  templateUrl: './admin-results-analysis.component.html',
  styleUrl: './admin-results-analysis.component.scss',
})
export class AdminResultsAnalysisComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private router = inject(Router);
  private sanitizer = inject(DomSanitizer);

  readonly portalLayout = resolveExecutivePortalLayout(this.router);
  readonly adminNav = ADMIN_NAV_SECTIONS;
  readonly topCount = 5;

  examTypes = signal<{ id: string; name: string }[]>([]);
  terms = signal<{ id: string; name: string; isCurrent?: boolean }[]>([]);
  classes = signal<{ id: string; name: string }[]>([]);

  filters = { examTypeId: '', termId: '', classId: '' };
  studentFilters = { termId: '', classId: '' };

  analysis = signal<ResultsAnalysisData | null>(null);
  sessionLabel = signal('');
  loading = signal(false);
  hasAnalyzed = signal(false);
  pdfLoading = signal(false);
  pdfPreviewOpen = signal(false);
  pdfPreviewUrl = signal<SafeResourceUrl | null>(null);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  classStudents = signal<ClassStudentRow[]>([]);
  studentsLoaded = signal(false);
  studentsLoading = signal(false);
  studentSessionLabel = signal('');

  studentModalOpen = signal(false);
  studentAnalysisLoading = signal(false);
  studentAnalysis = signal<StudentSubjectAnalysis | null>(null);
  selectedStudent = signal<ClassStudentRow | null>(null);

  private pdfObjectUrl: string | null = null;

  filtersReady(): boolean {
    return !!(this.filters.examTypeId && this.filters.termId && this.filters.classId);
  }

  studentFiltersReady(): boolean {
    return !!(this.studentFilters.termId && this.studentFilters.classId);
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
        if (current) {
          this.filters.termId = current.id;
          this.studentFilters.termId = current.id;
        }
      },
      error: () => this.showToast('error', 'Could not load terms.'),
    });
    this.api.get<{ id: string; name: string }[]>('/admin/classes').subscribe({
      next: (c) => this.classes.set(c),
      error: () => this.showToast('error', 'Could not load classes.'),
    });
  }

  ngOnDestroy(): void {
    this.revokePdfUrl();
  }

  onFilterChange(): void {
    this.analysis.set(null);
    this.hasAnalyzed.set(false);
    this.closePdfPreview();
  }

  onStudentFilterChange(): void {
    this.classStudents.set([]);
    this.studentsLoaded.set(false);
    this.closeStudentModal();
  }

  loadStudents(): void {
    if (!this.studentFiltersReady()) {
      this.showToast('error', 'Select term and class.');
      return;
    }

    this.studentsLoading.set(true);
    this.studentsLoaded.set(false);
    this.closeStudentModal();

    const { termId, classId } = this.studentFilters;
    this.api
      .get<ClassStudentRow[]>('/students', { classId, enrolled: 'true' })
      .subscribe({
        next: (rows) => {
          this.classStudents.set(rows);
          this.studentsLoaded.set(true);
          this.studentsLoading.set(false);
          const term = this.terms().find((t) => t.id === termId)?.name || '';
          const cls = classDisplayName(this.classes(), classId);
          this.studentSessionLabel.set([term, cls].filter(Boolean).join(' · '));
          if (!rows.length) {
            this.showToast('error', 'No active students found in this class.');
          } else {
            this.showToast('success', `${rows.length} student(s) loaded. Click a row to view marks.`);
          }
        },
        error: (e) => {
          this.studentsLoading.set(false);
          this.showToast('error', e.error?.message || 'Failed to load students.');
        },
      });
  }

  openStudentAnalysis(student: ClassStudentRow): void {
    if (!this.filters.examTypeId) {
      this.showToast('error', 'Select an exam type above to view mark distribution.');
      return;
    }
    if (!this.studentFiltersReady()) {
      this.showToast('error', 'Select term and class, then load students.');
      return;
    }

    this.selectedStudent.set(student);
    this.studentModalOpen.set(true);
    this.studentAnalysis.set(null);
    this.studentAnalysisLoading.set(true);

    const { termId, classId } = this.studentFilters;
    this.api
      .get<StudentSubjectAnalysis>('/exams/results-analysis/student', {
        examTypeId: this.filters.examTypeId,
        termId,
        classId,
        studentId: student.id,
      })
      .subscribe({
        next: (data) => {
          this.studentAnalysis.set(data);
          this.studentAnalysisLoading.set(false);
        },
        error: (e) => {
          this.studentAnalysisLoading.set(false);
          this.showToast('error', e.error?.message || 'Failed to load student analysis.');
        },
      });
  }

  closeStudentModal(): void {
    this.studentModalOpen.set(false);
    this.studentAnalysis.set(null);
    this.selectedStudent.set(null);
    this.studentAnalysisLoading.set(false);
  }

  subjectBarWidth(percent: number | null): string {
    if (percent == null) return '0%';
    return `${Math.max(0, Math.min(100, percent))}%`;
  }

  runAnalysis(): void {
    if (!this.filtersReady()) {
      this.showToast('error', 'Select term, exam type, and class.');
      return;
    }

    this.loading.set(true);
    this.hasAnalyzed.set(false);
    this.closePdfPreview();
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

  previewPdf(): void {
    this.fetchPdfBlob(true).then((blob) => {
      if (!blob) return;
      this.revokePdfUrl();
      this.pdfObjectUrl = URL.createObjectURL(blob);
      this.pdfPreviewUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(this.pdfObjectUrl));
      this.pdfPreviewOpen.set(true);
    });
  }

  downloadPdf(): void {
    this.fetchPdfBlob(false).then((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = this.pdfFilename();
      a.click();
      URL.revokeObjectURL(url);
      this.showToast('success', 'Results analysis PDF downloaded.');
    });
  }

  closePdfPreview(): void {
    this.pdfPreviewOpen.set(false);
    this.revokePdfUrl();
  }

  private fetchPdfBlob(preview: boolean): Promise<Blob | null> {
    if (!this.hasAnalyzed() || !this.filtersReady()) {
      this.showToast('error', 'Run analysis before exporting PDF.');
      return Promise.resolve(null);
    }

    this.pdfLoading.set(true);
    const params: Record<string, string> = {
      examTypeId: this.filters.examTypeId,
      termId: this.filters.termId,
      classId: this.filters.classId,
      topN: String(this.topCount),
      ...(preview ? { preview: 'true' } : {}),
    };

    return new Promise((resolve) => {
      this.api.getBlob('/exams/results-analysis/pdf', params).subscribe({
        next: (blob) => {
          this.pdfLoading.set(false);
          if (blob.type && !blob.type.includes('pdf')) {
            this.showToast('error', 'Could not generate results analysis PDF.');
            resolve(null);
            return;
          }
          resolve(blob);
        },
        error: async (e) => {
          this.pdfLoading.set(false);
          let msg = 'Could not generate results analysis PDF.';
          if (e.error instanceof Blob) {
            try {
              const body = JSON.parse(await e.error.text());
              if (body.message) msg = body.message;
            } catch {
              /* ignore */
            }
          } else if (e.error?.message) {
            msg = e.error.message;
          }
          this.showToast('error', msg);
          resolve(null);
        },
      });
    });
  }

  private pdfFilename(): string {
    const data = this.analysis();
    const cls = data?.class.name || 'class';
    const exam = data?.examType.name || 'exam';
    const safe = `${cls}-${exam}`.replace(/[^\w\-]+/g, '-').replace(/-+/g, '-');
    return `results-analysis-${safe}.pdf`;
  }

  private revokePdfUrl(): void {
    if (this.pdfObjectUrl) {
      URL.revokeObjectURL(this.pdfObjectUrl);
      this.pdfObjectUrl = null;
    }
    this.pdfPreviewUrl.set(null);
  }

  private showToast(type: 'success' | 'error', msg: string): void {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 4500);
  }
}
