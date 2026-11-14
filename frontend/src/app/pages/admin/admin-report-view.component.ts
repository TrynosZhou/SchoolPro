import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';
import { ClassListPdfBranding } from '../../core/utils/class-list-pdf.util';
import { buildReportAccessPdfBlob } from '../../core/utils/report-access-pdf.util';
import { resolveLogoUrl } from '../../core/utils/payslip-print.util';
import { environment } from '../../../environments/environment';

interface ReportAccessChild {
  studentId: string;
  firstName: string;
  lastName: string;
  admissionNumber?: string;
  className?: string;
  formName?: string;
  relationship?: string;
  viewed: boolean;
  viewedAt?: string | null;
}

interface ReportAccessParent {
  parentId: string;
  name: string;
  email?: string;
  phone?: string;
  totalChildren: number;
  viewedChildren: number;
  unviewedChildren: number;
  children: ReportAccessChild[];
}

interface ReportAccessResult {
  term: { id: string; name: string; isCurrent: boolean } | null;
  examType: { id: string; name: string } | null;
  published: boolean;
  totalParents: number;
  parentsPending: number;
  parentsCompleted: number;
  parents: ReportAccessParent[];
}

@Component({
  selector: 'app-admin-report-view',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, RouterLink, DatePipe],
  templateUrl: './admin-report-view.component.html',
  styleUrl: './admin-report-view.component.scss',
})
export class AdminReportViewComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private sanitizer = inject(DomSanitizer);
  private pdfObjectUrl: string | null = null;
  private branding: ClassListPdfBranding | null = null;

  readonly adminNav = ADMIN_NAV_SECTIONS;

  readonly terms = signal<{ id: string; name: string; isCurrent?: boolean }[]>([]);
  readonly examTypes = signal<{ id: string; name: string }[]>([]);
  readonly data = signal<ReportAccessResult | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly expandedParentId = signal<string | null>(null);
  readonly search = signal('');
  readonly pdfLoading = signal(false);
  readonly pdfPreviewOpen = signal(false);
  readonly pdfPreviewUrl = signal<SafeResourceUrl | null>(null);
  readonly toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  /** Parents who still have at least one unviewed report card (the list shown on this page). */
  readonly pendingParents = computed(() =>
    (this.data()?.parents ?? []).filter((p) => p.unviewedChildren > 0 || p.children.some((c) => !c.viewed)),
  );

  readonly canPreviewPdf = computed(() => {
    const d = this.data();
    return !!d && !!d.term && !!d.examType && d.published && this.pendingParents().length > 0;
  });

  selectedTermId = '';
  selectedExamTypeId = '';

  readonly filteredParents = computed(() => {
    const q = this.search().trim().toLowerCase();
    const rows = this.data()?.parents ?? [];
    if (!q) return rows;
    return rows.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.children.some((c) => `${c.firstName} ${c.lastName}`.toLowerCase().includes(q)),
    );
  });

  ngOnInit() {
    this.api.get<{ id: string; name: string; isCurrent?: boolean }[]>('/exams/terms').subscribe({
      next: (terms) => this.terms.set(terms),
    });
    this.api.get<{ id: string; name: string }[]>('/exams/types').subscribe({
      next: (types) => this.examTypes.set(types),
    });
    // No params → server resolves the current term and its current (latest published) exam type.
    this.load();
  }

  ngOnDestroy() {
    this.revokePdfUrl();
  }

  onFilterChange() {
    this.expandedParentId.set(null);
    this.closePdfPreview();
    this.load();
  }

  load() {
    this.loading.set(true);
    this.error.set(null);
    this.api
      .get<ReportAccessResult>('/exams/report-access', {
        termId: this.selectedTermId,
        examTypeId: this.selectedExamTypeId,
      })
      .subscribe({
        next: (res) => {
          this.data.set(res);
          if (!this.selectedTermId && res.term) this.selectedTermId = res.term.id;
          if (!this.selectedExamTypeId && res.examType) this.selectedExamTypeId = res.examType.id;
          this.loading.set(false);
        },
        error: (err) => {
          this.loading.set(false);
          this.error.set(err?.error?.message || 'Could not load report access.');
        },
      });
  }

  toggleParent(parentId: string) {
    this.expandedParentId.set(this.expandedParentId() === parentId ? null : parentId);
  }

  childClass(c: ReportAccessChild): string {
    return [c.formName, c.className].filter(Boolean).join(' ');
  }

  // ── PDF preview ────────────────────────────────────────────────────────────

  /** Builds the PDF of parents yet to view and opens it in a full-screen preview. */
  async previewPdf() {
    const blob = await this.buildPdf();
    if (!blob) return;
    this.revokePdfUrl();
    this.pdfObjectUrl = URL.createObjectURL(blob);
    // Fragment: fit page width, keep the viewer toolbar so every page can be scrolled/paged.
    this.pdfPreviewUrl.set(
      this.sanitizer.bypassSecurityTrustResourceUrl(`${this.pdfObjectUrl}#toolbar=1&navpanes=0&view=FitH`),
    );
    this.pdfPreviewOpen.set(true);
  }

  openPreviewInNewTab() {
    if (!this.pdfObjectUrl) return;
    const w = window.open(this.pdfObjectUrl, '_blank', 'noopener,noreferrer');
    if (!w) this.showToast('error', 'Pop-up blocked. Allow pop-ups to open the PDF in a new tab.');
  }

  async downloadPdf() {
    const blob = await this.buildPdf();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = this.pdfFilename();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    this.showToast('success', 'PDF downloaded.');
  }

  closePdfPreview() {
    this.pdfPreviewOpen.set(false);
    this.revokePdfUrl();
  }

  private async buildPdf(): Promise<Blob | null> {
    const d = this.data();
    if (!d || !this.canPreviewPdf()) {
      this.showToast('error', 'There are no parents yet to view for the selected term and exam type.');
      return null;
    }
    this.pdfLoading.set(true);
    try {
      if (!this.branding) {
        try {
          const b = await firstValueFrom(
            this.api.get<{
              schoolName?: string;
              tagline?: string;
              logoUrl?: string;
              address?: string;
              phone?: string;
              email?: string;
            }>('/exams/school-branding'),
          );
          this.branding = { ...b, logoUrl: resolveLogoUrl(b.logoUrl, environment.apiUrl) };
        } catch {
          // The PDF still renders with the default school name and a monogram crest.
          this.branding = {};
        }
      }
      return await buildReportAccessPdfBlob({
        termName: d.term?.name || 'Term',
        examTypeName: d.examType?.name || 'Exam',
        generatedAt: new Date(),
        pendingParents: this.pendingParents(),
        parentsCompleted: d.parentsCompleted,
        totalParents: d.totalParents,
        branding: this.branding,
      });
    } catch {
      this.showToast('error', 'Could not generate the PDF. Please try again.');
      return null;
    } finally {
      this.pdfLoading.set(false);
    }
  }

  pdfFilename(): string {
    const d = this.data();
    const slug = (v?: string) => (v || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const parts = ['report-access', slug(d?.term?.name), slug(d?.examType?.name)].filter(Boolean);
    return `${parts.join('-')}.pdf`;
  }

  private revokePdfUrl() {
    if (this.pdfObjectUrl) {
      URL.revokeObjectURL(this.pdfObjectUrl);
      this.pdfObjectUrl = null;
    }
    this.pdfPreviewUrl.set(null);
  }

  private showToast(type: 'success' | 'error', msg: string) {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 4500);
  }
}
