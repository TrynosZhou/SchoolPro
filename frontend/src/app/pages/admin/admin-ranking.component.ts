import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { RouterLink, Router } from '@angular/router';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';
import { resolveExecutivePortalLayout } from '../../core/utils/portal-layout.util';

export type RankingType = 'class' | 'form' | 'subject';

interface RankingStudentRow {
  position: number;
  studentId: string;
  admissionNumber: string;
  lastName: string;
  firstName: string;
  gender: string;
  className: string;
  formName: string;
  averagePercent: number | null;
  mark: number | null;
  subjectCount: number;
}

interface RankingsData {
  schoolName: string;
  tagline?: string;
  logoUrl?: string;
  rankingType: RankingType;
  rankingLabel: string;
  examType: { id: string; name: string; maxMarks: number };
  term: { id: string; name: string };
  class?: { id: string; name: string };
  form?: { id: string; name: string };
  subject?: { id: string; name: string; code: string };
  students: RankingStudentRow[];
}

interface FormOption {
  id: string;
  name: string;
}

@Component({
  selector: 'app-admin-ranking',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, DecimalPipe, RouterLink],
  templateUrl: './admin-ranking.component.html',
  styleUrl: './admin-ranking.component.scss',
})
export class AdminRankingComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private sanitizer = inject(DomSanitizer);
  private router = inject(Router);

  readonly portalLayout = resolveExecutivePortalLayout(this.router);
  readonly adminNav = ADMIN_NAV_SECTIONS;
  readonly rankingTypes: { value: RankingType; label: string }[] = [
    { value: 'class', label: 'By Class Position' },
    { value: 'form', label: 'By Form Position' },
    { value: 'subject', label: 'By Subject Position' },
  ];

  examTypes = signal<{ id: string; name: string }[]>([]);
  terms = signal<{ id: string; name: string; isCurrent?: boolean }[]>([]);
  classes = signal<{ id: string; name: string }[]>([]);
  forms = signal<FormOption[]>([]);
  subjects = signal<{ id: string; name: string }[]>([]);

  filters = {
    examTypeId: '',
    termId: '',
    rankingType: '' as RankingType | '',
    classId: '',
    formId: '',
    subjectId: '',
  };

  rankings = signal<RankingsData | null>(null);
  sessionLabel = signal('');
  loading = signal(false);
  hasLoaded = signal(false);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);
  search = signal('');

  pdfLoading = signal(false);
  pdfPreviewOpen = signal(false);
  pdfPreviewUrl = signal<SafeResourceUrl | null>(null);
  private pdfObjectUrl: string | null = null;

  readonly isSubjectRanking = computed(() => this.filters.rankingType === 'subject');

  readonly filteredStudents = computed(() => {
    const q = this.search().trim().toLowerCase();
    const rows = this.rankings()?.students || [];
    if (!q) return rows;
    return rows.filter((s) =>
      `${s.admissionNumber} ${s.lastName} ${s.firstName} ${s.className}`.toLowerCase().includes(q),
    );
  });

  readonly pdfFilename = computed(() => {
    const label = this.sessionLabel().replace(/[^\w\-]+/g, '-').replace(/-+/g, '-');
    return label ? `rankings-${label}.pdf` : 'rankings.pdf';
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
        if (current) this.filters.termId = current.id;
      },
      error: () => this.showToast('error', 'Could not load terms.'),
    });
    this.api.get<{ id: string; name: string }[]>('/admin/classes').subscribe({
      next: (c) => this.classes.set(c),
      error: () => this.showToast('error', 'Could not load classes.'),
    });
    this.api.get<FormOption[]>('/admin/forms').subscribe({
      next: (f) => this.forms.set(f),
      error: () => this.showToast('error', 'Could not load forms.'),
    });
  }

  ngOnDestroy(): void {
    this.revokePdfUrl();
  }

  onRankingTypeChange(): void {
    this.filters.classId = '';
    this.filters.formId = '';
    this.filters.subjectId = '';
    this.subjects.set([]);
    this.closePdfPreview();
    this.clearResults();

    if (this.filters.rankingType === 'subject') {
      this.loadAllSubjects();
    }
  }

  private loadAllSubjects(): void {
    this.api.get<{ id: string; name: string }[]>('/admin/subjects').subscribe({
      next: (s) => this.subjects.set(s),
      error: () => this.showToast('error', 'Could not load subjects.'),
    });
  }

  onFilterChange(): void {
    this.closePdfPreview();
    this.clearResults();
  }

  filtersReady(): boolean {
    if (!this.filters.examTypeId || !this.filters.termId || !this.filters.rankingType) return false;
    if (this.filters.rankingType === 'class') return !!this.filters.classId;
    if (this.filters.rankingType === 'form') return !!this.filters.formId;
    if (this.filters.rankingType === 'subject') return !!this.filters.subjectId;
    return false;
  }

  loadRankings(): void {
    if (!this.filtersReady()) {
      this.showToast('error', 'Complete all required filters for the selected ranking type.');
      return;
    }

    this.loading.set(true);
    this.hasLoaded.set(false);
    this.closePdfPreview();

    const params: Record<string, string> = {
      examTypeId: this.filters.examTypeId,
      termId: this.filters.termId,
      rankingType: this.filters.rankingType,
    };
    if (this.filters.classId) params['classId'] = this.filters.classId;
    if (this.filters.formId) params['formId'] = this.filters.formId;
    if (this.filters.subjectId) params['subjectId'] = this.filters.subjectId;

    this.api.get<RankingsData>('/exams/rankings', params).subscribe({
      next: (data) => {
        this.rankings.set(data);
        this.hasLoaded.set(true);
        this.loading.set(false);
        const exam = this.examTypes().find((e) => e.id === this.filters.examTypeId)?.name || '';
        const term = this.terms().find((t) => t.id === this.filters.termId)?.name || '';
        const parts = [data.rankingLabel, exam, term];
        if (data.class) parts.push(data.class.name);
        if (data.form) parts.push(data.form.name);
        if (data.subject) parts.push(data.subject.name);
        this.sessionLabel.set(parts.filter(Boolean).join(' · '));
        this.showToast('success', `Loaded ${data.students.length} ranked students.`);
      },
      error: (e) => {
        this.loading.set(false);
        this.showToast('error', e.error?.message || 'Failed to load rankings.');
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
      this.showToast('success', 'Rankings PDF downloaded.');
    });
  }

  closePdfPreview(): void {
    this.pdfPreviewOpen.set(false);
    this.revokePdfUrl();
  }

  private fetchPdfBlob(preview: boolean): Promise<Blob | null> {
    if (!this.hasLoaded() || !this.filtersReady()) {
      this.showToast('error', 'Load rankings before exporting PDF.');
      return Promise.resolve(null);
    }

    this.pdfLoading.set(true);
    const params: Record<string, string> = {
      examTypeId: this.filters.examTypeId,
      termId: this.filters.termId,
      rankingType: this.filters.rankingType,
      ...(preview ? { preview: 'true' } : {}),
    };
    if (this.filters.classId) params['classId'] = this.filters.classId;
    if (this.filters.formId) params['formId'] = this.filters.formId;
    if (this.filters.subjectId) params['subjectId'] = this.filters.subjectId;

    return new Promise((resolve) => {
      this.api.getBlob('/exams/rankings/pdf', params).subscribe({
        next: (blob) => {
          this.pdfLoading.set(false);
          if (blob.type && !blob.type.includes('pdf')) {
            this.showToast('error', 'Could not generate rankings PDF.');
            resolve(null);
            return;
          }
          resolve(blob);
        },
        error: async (e) => {
          this.pdfLoading.set(false);
          let msg = 'Could not generate rankings PDF.';
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

  private revokePdfUrl(): void {
    if (this.pdfObjectUrl) {
      URL.revokeObjectURL(this.pdfObjectUrl);
      this.pdfObjectUrl = null;
    }
    this.pdfPreviewUrl.set(null);
  }

  private clearResults(): void {
    this.rankings.set(null);
    this.hasLoaded.set(false);
  }

  private showToast(type: 'success' | 'error', msg: string): void {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 4500);
  }
}
