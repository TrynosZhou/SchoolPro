import { Component, inject, OnInit, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { PARENT_NAV_ITEMS } from '../../core/config/parent-nav';
import { reportCardPdfFilename } from '../../core/utils/report-card-filename';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { environment } from '../../../environments/environment';

interface LinkedChild {
  linkId?: string;
  relationship?: string;
  student: {
    id: string;
    admissionNumber?: string;
    firstName: string;
    lastName: string;
    schoolClass?: { name?: string; form?: { name?: string } };
  };
}

@Component({
  selector: 'app-parent-report-cards',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, RouterLink],
  templateUrl: './parent-report-cards.component.html',
  styleUrl: './parent-report-cards.component.scss',
})
export class ParentReportCardsComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private sanitizer = inject(DomSanitizer);
  private route = inject(ActivatedRoute);

  readonly nav = PARENT_NAV_ITEMS;

  children = signal<LinkedChild[]>([]);
  terms = signal<{ id: string; name: string; isCurrent?: boolean }[]>([]);
  examTypes = signal<{ id: string; name: string }[]>([]);
  loading = signal(true);
  pdfLoading = signal(false);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  selectedStudentId = '';
  selectedTermId = '';
  selectedExamTypeId = '';

  pdfPreviewOpen = signal(false);
  pdfPreviewUrl = signal<SafeResourceUrl | null>(null);
  pdfPreviewTitle = signal('');

  private pdfObjectUrl: string | null = null;

  ngOnInit() {
    this.loadFilters();
  }

  loadFilters() {
    this.loading.set(true);

    const studentUserId = this.auth.user()?.studentId;
    if (this.auth.user()?.role === 'student' && studentUserId) {
      this.api.get<{ id: string; firstName: string; lastName: string; admissionNumber?: string; schoolClass?: LinkedChild['student']['schoolClass'] }>(
        `/students/${studentUserId}`,
      ).subscribe({
        next: (student) => {
          this.children.set([{ student }]);
          this.selectedStudentId = student.id;
          this.finishFilterLoad();
        },
        error: () => {
          this.loading.set(false);
          this.showToast('error', 'Could not load student profile.');
        },
      });
      return;
    }

    this.api.get<LinkedChild[]>('/students/parent/my-children').subscribe({
      next: (rows) => {
        this.children.set(rows);
        const fromQuery = this.route.snapshot.queryParamMap.get('studentId');
        if (fromQuery && rows.some((r) => r.student.id === fromQuery)) {
          this.selectedStudentId = fromQuery;
        } else if (rows.length === 1) {
          this.selectedStudentId = rows[0].student.id;
        }
        this.finishFilterLoad();
      },
      error: () => {
        this.loading.set(false);
        this.showToast('error', 'Could not load linked children.');
      },
    });
  }

  private finishFilterLoad() {
    this.api.get<{ id: string; name: string; isCurrent?: boolean }[]>('/exams/terms').subscribe({
      next: (terms) => {
        const sorted = [...terms].sort((a, b) => {
          if (a.isCurrent && !b.isCurrent) return -1;
          if (!a.isCurrent && b.isCurrent) return 1;
          return a.name.localeCompare(b.name);
        });
        this.terms.set(sorted);
        const current = sorted.find((t) => t.isCurrent);
        this.selectedTermId = current?.id || sorted[0]?.id || '';
        this.loadPublishedExamTypes(this.selectedTermId);
      },
      error: () => {
        this.terms.set([]);
        this.selectedTermId = '';
        this.loading.set(false);
        this.showToast('error', 'Could not load school terms.');
      },
    });
  }

  onTermChange(termId: string) {
    this.selectedTermId = termId;
    this.loadPublishedExamTypes(termId);
  }

  private loadPublishedExamTypes(termId: string) {
    if (!termId) {
      this.examTypes.set([]);
      this.selectedExamTypeId = '';
      this.loading.set(false);
      return;
    }
    this.api.get<{ id: string; name: string }[]>('/exams/types', { termId }).subscribe({
      next: (types) => {
        this.examTypes.set(types);
        this.selectedExamTypeId = types[0]?.id || '';
        this.loading.set(false);
        if (!types.length) {
          this.showToast('error', 'No published results for this term yet.');
        }
      },
      error: () => {
        this.examTypes.set([]);
        this.selectedExamTypeId = '';
        this.loading.set(false);
        this.showToast('error', 'Could not load published exam types.');
      },
    });
  }

  childLabel(child: LinkedChild): string {
    const s = child.student;
    const cls = [s.schoolClass?.form?.name, s.schoolClass?.name].filter(Boolean).join(' ');
    const id = s.admissionNumber ? ` (${s.admissionNumber})` : '';
    return `${s.firstName} ${s.lastName}${id}${cls ? ` — ${cls}` : ''}`;
  }

  canView(): boolean {
    return !!(this.selectedStudentId && this.selectedTermId && this.selectedExamTypeId);
  }

  viewReportCard() {
    if (!this.canView()) {
      this.showToast('error', 'Select a child, term, and exam type.');
      return;
    }

    this.pdfLoading.set(true);
    this.fetchPdfBlob(true).then((blob) => {
      if (!blob) return;
      this.revokePdfUrl();
      this.pdfObjectUrl = URL.createObjectURL(blob);
      this.pdfPreviewUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(this.pdfObjectUrl));

      const child = this.children().find((c) => c.student.id === this.selectedStudentId)?.student;
      const term = this.terms().find((t) => t.id === this.selectedTermId)?.name || 'Report';
      const exam = this.examTypes().find((e) => e.id === this.selectedExamTypeId)?.name || '';
      this.pdfPreviewTitle.set(
        child ? `${child.firstName} ${child.lastName} — ${term}${exam ? ` · ${exam}` : ''}` : 'Report card',
      );
      this.pdfPreviewOpen.set(true);
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
    });
  }

  downloadPdf() {
    if (!this.canView()) return;
    this.fetchPdfBlob(false).then((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const child = this.children().find((c) => c.student.id === this.selectedStudentId)?.student;
      a.download = reportCardPdfFilename(
        child?.firstName,
        child?.lastName,
        child?.admissionNumber || this.selectedStudentId,
      );
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  closePdfPreview() {
    this.pdfPreviewOpen.set(false);
    this.revokePdfUrl();
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
  }

  private fetchPdfBlob(preview: boolean): Promise<Blob | null> {
    this.pdfLoading.set(true);
    const token = this.auth.getToken();
    let url = `${environment.apiUrl}/exams/report-cards/${this.selectedStudentId}/${this.selectedTermId}/pdf`;
    const params = new URLSearchParams();
    params.set('examTypeId', this.selectedExamTypeId);
    if (preview) params.set('preview', 'true');
    url += `?${params.toString()}`;

    return fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(async (r) => {
        this.pdfLoading.set(false);
        if (!r.ok) {
          let msg = 'No report card found for the selected term and exam type.';
          try {
            const body = await r.json();
            if (body.message) msg = body.message;
          } catch {
            /* ignore */
          }
          this.showToast('error', msg);
          return null;
        }
        const blob = await r.blob();
        if (!blob.type.includes('pdf')) {
          this.showToast('error', 'Invalid PDF response.');
          return null;
        }
        return blob;
      })
      .catch(() => {
        this.pdfLoading.set(false);
        this.showToast('error', 'Could not generate report card PDF.');
        return null;
      });
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
