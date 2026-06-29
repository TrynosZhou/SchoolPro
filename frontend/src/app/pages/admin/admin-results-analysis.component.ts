import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Router } from '@angular/router';
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

interface SubjectPassRate {
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  passRatePercent: number;
  studentsWithMarks: number;
  studentsPassed: number;
}

interface ResultsAnalysisSubject {
  id: string;
  code: string;
  name: string;
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
  subjects: ResultsAnalysisSubject[];
  subjectPassRates: SubjectPassRate[];
  topPerformers: ResultsAnalysisPerformer[];
  bottomPerformers: ResultsAnalysisPerformer[];
}

interface SubjectAnalysisPerformer {
  rank: number;
  studentId: string;
  firstName: string;
  lastName: string;
  marks: number;
  percent: number;
}

interface SubjectAnalysisData {
  subject: ResultsAnalysisSubject;
  examType: { id: string; name: string; maxMarks: number };
  term: { id: string; name: string };
  class: { id: string; name: string };
  topStudents: SubjectAnalysisPerformer[];
  bottomStudents: SubjectAnalysisPerformer[];
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
  imports: [PortalLayoutComponent, FormsModule, DecimalPipe],
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

  activeTab = signal<'class' | 'individual'>('class');

  readonly analysisTabs: { id: 'class' | 'individual'; label: string; icon: string; desc: string }[] = [
    { id: 'class', label: 'Class analysis', icon: '👥', desc: 'Pass rates & top performers by class' },
    { id: 'individual', label: 'Individual analysis', icon: '👤', desc: 'Subject performance chart for one student' },
  ];

  analysis = signal<ResultsAnalysisData | null>(null);
  sessionLabel = signal('');
  loading = signal(false);
  hasAnalyzed = signal(false);
  selectedSubjectId = signal('');
  subjectAnalysis = signal<SubjectAnalysisData | null>(null);
  subjectAnalysisLoading = signal(false);
  pdfLoading = signal(false);
  pdfPreviewOpen = signal(false);
  pdfPreviewUrl = signal<SafeResourceUrl | null>(null);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  classStudents = signal<ClassStudentRow[]>([]);
  studentsLoading = signal(false);
  selectedStudentId = signal('');
  studentAnalysisLoading = signal(false);
  studentAnalysis = signal<StudentSubjectAnalysis | null>(null);

  readonly chartMinWidth = 900;
  readonly chartWidthPerSubject = 92;
  readonly chartHeight = 500;
  readonly chartPad = { top: 24, right: 48, bottom: 160, left: 56 };
  readonly chartPointInset = 48;

  private pdfObjectUrl: string | null = null;

  filtersReady(): boolean {
    return !!(this.filters.examTypeId && this.filters.termId && this.filters.classId);
  }

  setTab(tab: 'class' | 'individual'): void {
    this.activeTab.set(tab);
    if (tab === 'class') {
      this.clearStudentAnalysis();
    } else {
      this.closePdfPreview();
      this.loadStudentsIfReady();
    }
  }

  isClassTab(): boolean {
    return this.activeTab() === 'class';
  }

  isIndividualTab(): boolean {
    return this.activeTab() === 'individual';
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

  onParametersChange(): void {
    this.analysis.set(null);
    this.hasAnalyzed.set(false);
    this.selectedSubjectId.set('');
    this.subjectAnalysis.set(null);
    this.classStudents.set([]);
    this.clearStudentAnalysis();
    this.closePdfPreview();
    this.loadStudentsIfReady();
  }

  studentOptionLabel(student: ClassStudentRow): string {
    return `${student.firstName} ${student.lastName} (${student.admissionNumber})`;
  }

  onStudentSelect(studentId: string): void {
    this.selectedStudentId.set(studentId);
    this.studentAnalysis.set(null);
    if (!studentId || !this.filtersReady()) return;

    this.studentAnalysisLoading.set(true);
    const { termId, classId, examTypeId } = this.filters;
    this.api
      .get<StudentSubjectAnalysis>('/exams/results-analysis/student', {
        examTypeId,
        termId,
        classId,
        studentId,
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

  studentChartTitle(): string {
    const profile = this.studentAnalysis();
    if (!profile) return 'Subject Performance';
    return `${this.performerName(profile.student.firstName, profile.student.lastName)} — Subject Performance`;
  }

  chartYTicks(): number[] {
    return Array.from({ length: 11 }, (_, i) => i * 10);
  }

  chartRenderWidth(): number {
    const count = this.studentChartSubjects().length;
    return Math.max(this.chartMinWidth, count * this.chartWidthPerSubject);
  }

  studentChartSubjects(): { label: string; percent: number }[] {
    const profile = this.studentAnalysis();
    if (!profile) return [];
    return profile.subjects
      .filter((s) => s.percentOfMax != null)
      .map((s) => ({ label: s.subjectName, percent: s.percentOfMax! }));
  }

  studentChartCoords(): { x: number; y: number }[] {
    const subjects = this.studentChartSubjects();
    const { top, left, bottom, right } = this.chartPad;
    const width = this.chartRenderWidth();
    const plotW = width - left - right;
    const plotH = this.chartHeight - top - bottom;
    if (!subjects.length) return [];

    const usableW = Math.max(0, plotW - this.chartPointInset * 2);
    return subjects.map((subject, index) => ({
      x:
        left +
        this.chartPointInset +
        (subjects.length === 1 ? usableW / 2 : (index / (subjects.length - 1)) * usableW),
      y: top + plotH - (subject.percent / 100) * plotH,
    }));
  }

  studentChartBaselineY(): number {
    return this.chartHeight - this.chartPad.bottom;
  }

  studentChartLinePath(): string {
    return this.smoothLinePath(this.studentChartCoords());
  }

  studentChartAreaPath(): string {
    const points = this.studentChartCoords();
    const line = this.studentChartLinePath();
    if (!points.length || !line) return '';
    const baseline = this.studentChartBaselineY();
    const first = points[0];
    const last = points[points.length - 1];
    return `${line} L ${last.x} ${baseline} L ${first.x} ${baseline} Z`;
  }

  studentChartLabelY(): number {
    return this.chartHeight - this.chartPad.bottom + 18;
  }

  chartPlotTop(): number {
    return this.chartPad.top;
  }

  chartXAxisTitleX(): number {
    return this.chartRenderWidth() / 2;
  }

  chartXAxisTitleY(): number {
    return this.chartHeight - 14;
  }

  studentChartLabelTransform(index: number): string {
    const points = this.studentChartCoords();
    const point = points[index];
    if (!point) return '';
    return `translate(${point.x}, ${this.studentChartLabelY()}) rotate(-35)`;
  }

  private loadStudentsIfReady(): void {
    if (!this.isIndividualTab() || !this.filtersReady()) return;

    this.studentsLoading.set(true);
    const { classId } = this.filters;
    this.api
      .get<ClassStudentRow[]>('/students', { classId, enrolled: 'true' })
      .subscribe({
        next: (rows) => {
          this.classStudents.set(rows);
          this.studentsLoading.set(false);
          if (!rows.length) {
            this.showToast('error', 'No active students found in this class.');
          }
        },
        error: (e) => {
          this.studentsLoading.set(false);
          this.showToast('error', e.error?.message || 'Failed to load students.');
        },
      });
  }

  private clearStudentAnalysis(): void {
    this.selectedStudentId.set('');
    this.studentAnalysis.set(null);
    this.studentAnalysisLoading.set(false);
  }

  private smoothLinePath(points: { x: number; y: number }[]): string {
    if (!points.length) return '';
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

    let path = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i - 1] ?? points[i];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2] ?? p2;
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }
    return path;
  }

  performerName(firstName: string, lastName: string): string {
    return `${firstName} ${lastName}`.trim();
  }

  onSubjectSelect(subjectId: string): void {
    this.selectedSubjectId.set(subjectId);
    this.subjectAnalysis.set(null);
    if (!subjectId || !this.filtersReady()) return;

    this.subjectAnalysisLoading.set(true);
    const { examTypeId, termId, classId } = this.filters;
    this.api
      .get<SubjectAnalysisData>('/exams/results-analysis/subject', {
        examTypeId,
        termId,
        classId,
        subjectId,
        topN: String(this.topCount),
      })
      .subscribe({
        next: (data) => {
          this.subjectAnalysis.set(data);
          this.subjectAnalysisLoading.set(false);
        },
        error: (e) => {
          this.subjectAnalysisLoading.set(false);
          this.showToast('error', e.error?.message || 'Failed to load subject analysis.');
        },
      });
  }

  runAnalysis(): void {
    if (!this.filtersReady()) {
      this.showToast('error', 'Select term, exam type, and class.');
      return;
    }

    this.loading.set(true);
    this.hasAnalyzed.set(false);
    this.selectedSubjectId.set('');
    this.subjectAnalysis.set(null);
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
