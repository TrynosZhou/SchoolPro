import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { RouterLink, Router } from '@angular/router';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';
import { classDisplayName, formatStudentClassLabel } from '../../core/utils/class-display';
import { formatSubjectAbbrev } from '../../core/utils/subject-abbrev';
import { resolveExecutivePortalLayout } from '../../core/utils/portal-layout.util';

interface MarkSheetSubject {
  id: string;
  code: string;
  name: string;
}

interface MarkSheetCell {
  marks: number | null;
}

interface MarkSheetGradeCounts {
  A: number;
  B: number;
  C: number;
  D: number;
  E: number;
  U: number;
}

interface MarkSheetStudent {
  studentId: string;
  admissionNumber: string;
  lastName: string;
  firstName: string;
  gender: string;
  position: number | null;
  subjectCount: number;
  subjectsPassed: number;
  averagePercent: number | null;
  gradeCounts: MarkSheetGradeCounts;
  marksBySubject: Record<string, MarkSheetCell>;
}

interface MarkSheetData {
  schoolName: string;
  tagline?: string;
  examType: { id: string; name: string; maxMarks: number };
  term: { id: string; name: string };
  class: { id: string; name: string };
  subjects: MarkSheetSubject[];
  students: MarkSheetStudent[];
}

@Component({
  selector: 'app-admin-mark-sheet',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, DecimalPipe, RouterLink],
  templateUrl: './admin-mark-sheet.component.html',
  styleUrl: './admin-mark-sheet.component.scss',
})
export class AdminMarkSheetComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private sanitizer = inject(DomSanitizer);
  private router = inject(Router);

  readonly formatStudentClassLabel = formatStudentClassLabel;

  readonly portalLayout = resolveExecutivePortalLayout(this.router);
  readonly adminNav = ADMIN_NAV_SECTIONS;
  readonly gradeLetters: (keyof MarkSheetGradeCounts)[] = ['A', 'B', 'C', 'D', 'E', 'U'];

  examTypes = signal<{ id: string; name: string }[]>([]);
  terms = signal<{ id: string; name: string; isCurrent?: boolean }[]>([]);
  classes = signal<{ id: string; name: string }[]>([]);

  filters = { examTypeId: '', termId: '', classId: '' };
  sheet = signal<MarkSheetData | null>(null);
  sessionLabel = signal('');
  loading = signal(false);
  hasGenerated = signal(false);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);
  search = signal('');

  pdfLoading = signal(false);
  pdfPreviewOpen = signal(false);
  pdfPreviewUrl = signal<SafeResourceUrl | null>(null);
  private pdfObjectUrl: string | null = null;

  filtersReady(): boolean {
    return !!(this.filters.examTypeId && this.filters.termId && this.filters.classId);
  }

  readonly filteredStudents = computed(() => {
    const q = this.search().trim().toLowerCase();
    const rows = this.sheet()?.students || [];
    if (!q) return rows;
    return rows.filter((s) =>
      `${s.admissionNumber} ${s.lastName} ${s.firstName}`.toLowerCase().includes(q),
    );
  });

  readonly pdfFilename = computed(() => {
    const s = this.sheet();
    if (!s) return 'mark-sheet.pdf';
    const label = `${s.class.name}-${s.examType.name}`.replace(/[^\w\-]+/g, '-').replace(/-+/g, '-');
    return `mark-sheet-${label}.pdf`;
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
  }

  ngOnDestroy(): void {
    this.revokePdfUrl();
  }

  onFilterChange(): void {
    this.sheet.set(null);
    this.hasGenerated.set(false);
    this.closePdfPreview();
  }

  generateMarkSheet(): void {
    if (!this.filtersReady()) {
      this.showToast('error', 'Select exam type, term, and class.');
      return;
    }

    this.loading.set(true);
    this.hasGenerated.set(false);
    this.closePdfPreview();

    const { examTypeId, termId, classId } = this.filters;
    this.api
      .get<MarkSheetData>('/exams/mark-sheet', { examTypeId, termId, classId })
      .subscribe({
        next: (data) => {
          this.sheet.set(data);
          this.hasGenerated.set(true);
          this.loading.set(false);
          const exam = this.examTypes().find((e) => e.id === examTypeId)?.name || '';
          const term = this.terms().find((t) => t.id === termId)?.name || '';
          const cls = classDisplayName(this.classes(), classId);
          this.sessionLabel.set([exam, term, cls].filter(Boolean).join(' · '));
          this.showToast('success', `Mark sheet generated for ${data.students.length} students.`);
        },
        error: (e) => {
          this.loading.set(false);
          this.showToast('error', e.error?.message || 'Failed to generate mark sheet.');
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
      this.showToast('success', 'Mark sheet PDF downloaded.');
    });
  }

  closePdfPreview(): void {
    this.pdfPreviewOpen.set(false);
    this.revokePdfUrl();
  }

  markFor(student: MarkSheetStudent, subjectId: string): number | null {
    return student.marksBySubject[subjectId]?.marks ?? null;
  }

  subjectAbbrev(sub: MarkSheetSubject): string {
    return formatSubjectAbbrev(sub.code, sub.name);
  }

  isPassingMark(mark: number): boolean {
    return mark > 49;
  }

  isMale(gender: string): boolean {
    return (gender || '').toLowerCase().startsWith('m');
  }

  isFemale(gender: string): boolean {
    return (gender || '').toLowerCase().startsWith('f');
  }

  private fetchPdfBlob(preview: boolean): Promise<Blob | null> {
    if (!this.hasGenerated() || !this.filtersReady()) {
      this.showToast('error', 'Generate the mark sheet before exporting PDF.');
      return Promise.resolve(null);
    }

    this.pdfLoading.set(true);
    const { examTypeId, termId, classId } = this.filters;
    return new Promise((resolve) => {
      this.api
        .getBlob('/exams/mark-sheet/pdf', {
          examTypeId,
          termId,
          classId,
          ...(preview ? { preview: 'true' } : {}),
        })
        .subscribe({
          next: (blob) => {
            this.pdfLoading.set(false);
            if (blob.type && !blob.type.includes('pdf')) {
              this.showToast('error', 'Could not generate mark sheet PDF.');
              resolve(null);
              return;
            }
            resolve(blob);
          },
          error: async (e) => {
            this.pdfLoading.set(false);
            let msg = 'Could not generate mark sheet PDF.';
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

  private showToast(type: 'success' | 'error', msg: string): void {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 4500);
  }
}
