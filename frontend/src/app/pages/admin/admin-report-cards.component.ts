import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';
import { classDisplayName } from '../../core/utils/class-display';
import { environment } from '../../../environments/environment';

interface SubjectResult {
  subject: string;
  subjectName?: string;
  subjectCode?: string;
  marks: number;
  grade: string;
  remarks?: string;
}

export interface ReportCardRow {
  id: string;
  studentId: string;
  termId: string;
  examTypeId?: string;
  subjectResults: SubjectResult[];
  averageMark?: number;
  overallGrade?: string;
  classPosition?: number;
  formPosition?: number;
  classTeacherRemarks?: string;
  principalRemarks?: string;
  student?: {
    firstName: string;
    lastName: string;
    admissionNumber: string;
    schoolClass?: { name: string; form?: { name: string } };
  };
  term?: { name: string };
  examType?: { name: string };
}

interface GenerateResponse {
  count: number;
  examType?: { id: string; name: string };
  reports: ReportCardRow[];
}

type ViewMode = 'cards' | 'compact';
type UserRole = 'director' | 'principal' | 'admin' | 'teacher' | 'parent' | 'student';

@Component({
  selector: 'app-admin-report-cards',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, DecimalPipe, RouterLink],
  templateUrl: './admin-report-cards.component.html',
  styleUrl: './admin-report-cards.component.scss',
})
export class AdminReportCardsComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private sanitizer = inject(DomSanitizer);

  readonly adminNav = ADMIN_NAV_SECTIONS;

  examTypes = signal<{ id: string; name: string }[]>([]);
  terms = signal<{ id: string; name: string; isCurrent?: boolean }[]>([]);
  classes = signal<{ id: string; name: string; form?: { name: string } }[]>([]);

  filters = { examTypeId: '', termId: '', classId: '' };
  reports = signal<ReportCardRow[]>([]);
  sessionLabel = signal('');
  loading = signal(false);
  hasLoaded = signal(false);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);
  search = signal('');
  viewMode = signal<ViewMode>('cards');
  expandedIds = signal<Set<string>>(new Set());
  activeStudentId = signal<string | null>(null);

  pdfLoading = signal(false);
  pdfPreviewOpen = signal(false);
  pdfPreviewUrl = signal<SafeResourceUrl | null>(null);
  pdfPreviewTitle = signal('');
  private pdfObjectUrl: string | null = null;
  private currentRole: UserRole | null = null;
  remarkDrafts = signal<Record<string, { classTeacherRemarks: string; principalRemarks: string }>>({});
  savingRemarks = signal<Record<string, boolean>>({});

  filtersReady(): boolean {
    return !!(this.filters.examTypeId && this.filters.termId && this.filters.classId);
  }

  readonly stats = computed(() => {
    const rows = this.reports();
    if (!rows.length) {
      return { count: 0, classAvg: 0, topMark: 0, honourCount: 0 };
    }
    const avgs = rows.map((r) => Number(r.averageMark) || 0);
    const classAvg = avgs.reduce((a, b) => a + b, 0) / avgs.length;
    const topMark = Math.max(...avgs);
    const honourCount = rows.filter((r) => (r.classPosition || 99) <= 3).length;
    return {
      count: rows.length,
      classAvg: Math.round(classAvg * 10) / 10,
      topMark: Math.round(topMark * 10) / 10,
      honourCount,
    };
  });

  readonly gradeDistribution = computed(() => {
    const counts = new Map<string, number>();
    for (const r of this.reports()) {
      const g = (r.overallGrade || '').trim().toUpperCase();
      if (!g) continue;
      counts.set(g, (counts.get(g) || 0) + 1);
    }
    return [...counts.entries()]
      .map(([grade, count]) => ({ grade, count }))
      .sort((a, b) => b.count - a.count);
  });

  readonly filteredReports = computed(() => {
    const q = this.search().trim().toLowerCase();
    let rows = [...this.reports()];
    if (q) {
      rows = rows.filter((r) =>
        `${r.student?.firstName} ${r.student?.lastName} ${r.student?.admissionNumber} ${r.overallGrade}`
          .toLowerCase()
          .includes(q),
      );
    }
    return rows;
  });

  readonly maxGradeCount = computed(() => {
    const dist = this.gradeDistribution();
    return dist.length ? Math.max(...dist.map((d) => d.count)) : 1;
  });

  ngOnInit(): void {
    this.currentRole = this.getCurrentRole();
    this.api.get<{ id: string; name: string }[]>('/exams/types').subscribe((t) => this.examTypes.set(t));
    this.api.get<{ id: string; name: string; isCurrent?: boolean }[]>('/exams/terms').subscribe((terms) => {
      this.terms.set(terms);
      const current = terms.find((t) => t.isCurrent);
      if (current) this.filters.termId = current.id;
    });
    this.api.get<{ id: string; name: string; form?: { name: string } }[]>('/admin/classes').subscribe((c) =>
      this.classes.set(c),
    );
  }

  ngOnDestroy(): void {
    this.revokePdfUrl();
  }

  onFilterChange(): void {
    this.reports.set([]);
    this.hasLoaded.set(false);
    this.sessionLabel.set('');
    this.search.set('');
    this.closePdfPreview();
  }

  loadReportCards(): void {
    if (!this.filtersReady()) {
      this.showToast('error', 'Select exam type, term, and class.');
      return;
    }

    const { examTypeId, termId, classId } = this.filters;
    this.loading.set(true);
    this.hasLoaded.set(false);
    this.closePdfPreview();

    this.api
      .post<GenerateResponse>('/exams/report-cards/generate-class', { examTypeId, termId, classId })
      .subscribe({
        next: (res) => {
          this.reports.set(res.reports || []);
          this.initRemarkDrafts(res.reports || []);
          this.hasLoaded.set(true);
          this.loading.set(false);
          const exam = this.examTypes().find((e) => e.id === examTypeId)?.name || res.examType?.name;
          const term = this.terms().find((t) => t.id === termId)?.name;
          const classLabel = classDisplayName(this.classes(), classId);
          this.sessionLabel.set([exam, term, classLabel].filter(Boolean).join(' · '));
          this.expandedIds.set(new Set(res.reports?.map((r) => r.id) || []));
          this.showToast('success', `Generated ${res.count} report card(s), ranked by class position.`);
        },
        error: (e) => {
          this.loading.set(false);
          this.hasLoaded.set(true);
          this.reports.set([]);
          this.showToast('error', e.error?.message || 'Could not generate report cards.');
        },
      });
  }

  setViewMode(mode: ViewMode): void {
    this.viewMode.set(mode);
  }

  isExpanded(id: string): boolean {
    return this.expandedIds().has(id);
  }

  toggleExpanded(id: string): void {
    this.expandedIds.update((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  expandAll(): void {
    this.expandedIds.set(new Set(this.filteredReports().map((r) => r.id)));
  }

  collapseAll(): void {
    this.expandedIds.set(new Set());
  }

  scrollToReport(studentId: string): void {
    this.activeStudentId.set(studentId);
    const el = document.getElementById(`report-${studentId}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  previewPdf(report: ReportCardRow): void {
    this.fetchPdfBlob(report, true).then((blob) => {
      if (!blob) return;
      this.revokePdfUrl();
      this.pdfObjectUrl = URL.createObjectURL(blob);
      this.pdfPreviewUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(this.pdfObjectUrl));
      this.pdfPreviewTitle.set(
        `${report.student?.firstName} ${report.student?.lastName} — Report Card`,
      );
      this.pdfPreviewOpen.set(true);
    });
  }

  downloadPdf(report: ReportCardRow): void {
    this.fetchPdfBlob(report, false).then((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const id = report.student?.admissionNumber || report.studentId;
      a.download = `report-card-${id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  exportSummaryCsv(): void {
    const rows = this.filteredReports();
    if (!rows.length) return;
    const headers = ['Position', 'Student ID', 'Last Name', 'First Name', 'Average', 'Grade', 'Subjects'];
    const lines = rows.map((r) =>
      [
        r.classPosition ?? '',
        r.student?.admissionNumber ?? '',
        r.student?.lastName ?? '',
        r.student?.firstName ?? '',
        r.averageMark ?? '',
        r.overallGrade ?? '',
        r.subjectResults.length,
      ]
        .map((v) => `"${v}"`)
        .join(','),
    );
    const csv = [headers.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `report-cards-summary.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    this.showToast('success', 'Summary exported to CSV.');
  }

  closePdfPreview(): void {
    this.pdfPreviewOpen.set(false);
    this.revokePdfUrl();
  }

  positionLabel(n?: number): string {
    if (!n) return '—';
    const suffix = n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th';
    return `${n}${suffix}`;
  }

  canEditClassTeacherRemark(): boolean {
    return this.currentRole === 'teacher' || this.currentRole === 'admin' || this.currentRole === 'principal' || this.currentRole === 'director';
  }

  canEditPrincipalRemark(): boolean {
    return this.currentRole === 'principal' || this.currentRole === 'admin' || this.currentRole === 'director';
  }

  remarkDraft(reportId: string): { classTeacherRemarks: string; principalRemarks: string } {
    return this.remarkDrafts()[reportId] || { classTeacherRemarks: '', principalRemarks: '' };
  }

  onClassTeacherRemarkInput(reportId: string, value: string): void {
    this.remarkDrafts.update((drafts) => ({
      ...drafts,
      [reportId]: { ...this.remarkDraft(reportId), classTeacherRemarks: value },
    }));
  }

  onPrincipalRemarkInput(reportId: string, value: string): void {
    this.remarkDrafts.update((drafts) => ({
      ...drafts,
      [reportId]: { ...this.remarkDraft(reportId), principalRemarks: value },
    }));
  }

  saveRemarks(report: ReportCardRow): void {
    const draft = this.remarkDraft(report.id);
    this.savingRemarks.update((state) => ({ ...state, [report.id]: true }));
    this.api
      .patch<ReportCardRow>(`/exams/report-cards/${report.id}/remarks`, {
        classTeacherRemarks: draft.classTeacherRemarks,
        principalRemarks: draft.principalRemarks,
      })
      .subscribe({
        next: (saved) => {
          this.reports.update((rows) => rows.map((r) => (r.id === report.id ? { ...r, ...saved } : r)));
          this.remarkDrafts.update((drafts) => ({
            ...drafts,
            [report.id]: {
              classTeacherRemarks: saved.classTeacherRemarks || '',
              principalRemarks: saved.principalRemarks || '',
            },
          }));
          this.savingRemarks.update((state) => ({ ...state, [report.id]: false }));
          this.showToast('success', 'Remarks saved.');
        },
        error: (e) => {
          this.savingRemarks.update((state) => ({ ...state, [report.id]: false }));
          this.showToast('error', e.error?.message || 'Could not save remarks.');
        },
      });
  }

  private fetchPdfBlob(report: ReportCardRow, preview: boolean): Promise<Blob | null> {
    this.pdfLoading.set(true);
    const token = localStorage.getItem('school_pro_token');
    let url = `${environment.apiUrl}/exams/report-cards/${report.studentId}/${report.termId}/pdf`;
    const params = new URLSearchParams();
    if (report.examTypeId) params.set('examTypeId', report.examTypeId);
    if (preview) params.set('preview', 'true');
    const qs = params.toString();
    if (qs) url += `?${qs}`;

    return fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(async (r) => {
        this.pdfLoading.set(false);
        if (!r.ok) {
          let msg = 'Could not generate PDF.';
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
        this.showToast('error', 'Could not generate PDF.');
        return null;
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

  private initRemarkDrafts(reports: ReportCardRow[]): void {
    const drafts: Record<string, { classTeacherRemarks: string; principalRemarks: string }> = {};
    for (const report of reports) {
      drafts[report.id] = {
        classTeacherRemarks: report.classTeacherRemarks || '',
        principalRemarks: report.principalRemarks || '',
      };
    }
    this.remarkDrafts.set(drafts);
    this.savingRemarks.set({});
  }

  private getCurrentRole(): UserRole | null {
    try {
      const raw = localStorage.getItem('school_pro_user');
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { role?: UserRole };
      return parsed.role || null;
    } catch {
      return null;
    }
  }
}
