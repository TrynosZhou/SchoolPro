import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe, NgClass } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { RouterLink, Router } from '@angular/router';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { buildTeacherNavSections } from '../../core/config/teacher-nav';
import { DIRECTOR_NAV_ITEMS } from '../../core/config/director-nav';
import { PRINCIPAL_NAV_ITEMS } from '../../core/config/principal-nav';
import { reportCardPdfFilename } from '../../core/utils/report-card-filename';
import { appendHeadmasterToPrincipalRemarks } from '../../core/utils/principal-remarks.util';
import { CONDUCT_RATING_OPTIONS, conductRatingLabel, type ConductRating } from '../../core/utils/conduct-ratings.util';
import type { NavItem, NavSection } from '../../shared/portal-layout/portal-layout.component';
import { ApiService } from '../../core/services/api.service';
import { classDisplayName, formatStudentClassLabel, isALevelForm, reportCardClassValue } from '../../core/utils/class-display';
import { environment } from '../../../environments/environment';

interface StudentTermAttendance {
  daysMarked: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  attendancePercent: number | null;
}

interface SchoolBranding {
  schoolName?: string;
  tagline?: string;
  logoUrl?: string;
  address?: string;
  email?: string;
  website?: string;
  headmasterName?: string;
}

interface GradeBoundaryRow {
  grade: string;
  label?: string;
  minPercent: number;
  points?: number;
}

interface SubjectResult {
  subject: string;
  subjectName?: string;
  subjectCode?: string;
  marks: number;
  grade: string;
  remarks?: string;
  mean?: number;
  subjectPosition?: number;
  subjectPositionTotal?: number;
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
  classTotal?: number;
  formTotal?: number;
  subjectsPassed?: number;
  totalSubjects?: number;
  classTeacherRemarks?: string;
  principalRemarks?: string;
  behaviorRating?: ConductRating | string;
  attitudeRating?: ConductRating | string;
  student?: {
    firstName: string;
    lastName: string;
    admissionNumber: string;
    schoolClass?: { name: string; form?: { name: string; level?: number } };
  };
  term?: { name: string };
  examType?: { name: string };
  attendance?: StudentTermAttendance;
}

interface GenerateResponse {
  count: number;
  examType?: { id: string; name: string };
  reports: ReportCardRow[];
}

type ViewMode = 'cards' | 'compact' | 'table';
type PerformanceFilter = 'all' | 'honour' | 'high' | 'atRisk' | 'needsRemarks';
type SortKey = 'position' | 'avgDesc' | 'avgAsc' | 'name';
type UserRole = 'director' | 'principal' | 'admin' | 'teacher' | 'parent' | 'student';

@Component({
  selector: 'app-admin-report-cards',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, DecimalPipe, NgClass, RouterLink],
  templateUrl: './admin-report-cards.component.html',
  styleUrl: './admin-report-cards.component.scss',
})
export class AdminReportCardsComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private sanitizer = inject(DomSanitizer);
  private router = inject(Router);

  readonly formatStudentClassLabel = formatStudentClassLabel;
  readonly reportCardClassValue = reportCardClassValue;
  readonly conductRatingOptions = CONDUCT_RATING_OPTIONS;
  readonly conductRatingLabel = conductRatingLabel;

  portalTitle = signal('Admin Portal');
  navSections = signal<NavSection[]>(ADMIN_NAV_SECTIONS);
  navItems = signal<NavItem[]>([]);

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
  performanceFilter = signal<PerformanceFilter>('all');
  sortBy = signal<SortKey>('position');
  viewMode = signal<ViewMode>('cards');
  expandedIds = signal<Set<string>>(new Set());
  bulkDownloading = signal(false);
  activeStudentId = signal<string | null>(null);

  pdfLoading = signal(false);
  pdfPreviewOpen = signal(false);
  pdfPreviewUrl = signal<SafeResourceUrl | null>(null);
  pdfPreviewTitle = signal('');
  private pdfObjectUrl: string | null = null;
  private currentRole: UserRole | null = null;
  remarkDrafts = signal<Record<string, { classTeacherRemarks: string; principalRemarks: string }>>({});
  savingRemarks = signal<Record<string, boolean>>({});
  remarksSavedIds = signal<Set<string>>(new Set());

  schoolBranding = signal<SchoolBranding | null>(null);
  gradeBoundaries = signal<GradeBoundaryRow[]>([]);

  readonly sortOptions: { value: SortKey; label: string }[] = [
    { value: 'position', label: 'Class position' },
    { value: 'avgDesc', label: 'Average % (high → low)' },
    { value: 'avgAsc', label: 'Average % (low → high)' },
    { value: 'name', label: 'Name (A–Z)' },
  ];

  readonly isTeacherPortal = this.router.url.includes('/teacher');
  readonly isAdminPortal = this.router.url.includes('/admin');
  readonly examsLink = this.portalPath('exams');
  readonly settingsLink = '/admin/settings';
  readonly markSheetLink = this.portalPath('mark-sheet');

  filtersReady(): boolean {
    return !!(this.filters.examTypeId && this.filters.termId && this.filters.classId);
  }

  readonly stats = computed(() => {
    const rows = this.reports();
    if (!rows.length) {
      return {
        count: 0,
        classAvg: 0,
        topMark: 0,
        honourCount: 0,
        fullPassCount: 0,
        passRate: 0,
        remarksComplete: 0,
        atRiskCount: 0,
      };
    }
    const avgs = rows.map((r) => Number(r.averageMark) || 0);
    const classAvg = avgs.reduce((a, b) => a + b, 0) / avgs.length;
    const topMark = Math.max(...avgs);
    const honourCount = rows.filter((r) => (r.classPosition || 99) <= 3).length;
    const fullPassCount = rows.filter(
      (r) => r.subjectsPassed != null && r.totalSubjects && r.subjectsPassed === r.totalSubjects,
    ).length;
    const passRate = Math.round((fullPassCount / rows.length) * 1000) / 10;
    const remarksComplete = rows.filter(
      (r) => (r.classTeacherRemarks || '').trim() && (r.principalRemarks || '').trim(),
    ).length;
    const atRiskCount = rows.filter((r) => (Number(r.averageMark) || 0) < 50).length;
    return {
      count: rows.length,
      classAvg: Math.round(classAvg * 10) / 10,
      topMark: Math.round(topMark * 10) / 10,
      honourCount,
      fullPassCount,
      passRate,
      remarksComplete,
      atRiskCount,
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

  readonly filterCounts = computed(() => {
    const rows = this.reports();
    return {
      all: rows.length,
      honour: rows.filter((r) => (r.classPosition || 99) <= 3).length,
      high: rows.filter((r) => (Number(r.averageMark) || 0) >= 80).length,
      atRisk: rows.filter((r) => (Number(r.averageMark) || 0) < 50).length,
      needsRemarks: rows.filter(
        (r) => !(r.classTeacherRemarks || '').trim() || !(r.principalRemarks || '').trim(),
      ).length,
    };
  });

  readonly hasActiveFilters = computed(
    () => !!this.search().trim() || this.performanceFilter() !== 'all' || this.sortBy() !== 'position',
  );

  readonly filteredReports = computed(() => {
    const q = this.search().trim().toLowerCase();
    const filter = this.performanceFilter();
    let rows = [...this.reports()];

    if (q) {
      rows = rows.filter((r) =>
        `${r.student?.firstName} ${r.student?.lastName} ${r.student?.admissionNumber} ${r.overallGrade}`
          .toLowerCase()
          .includes(q),
      );
    }

    rows = rows.filter((r) => {
      const avg = Number(r.averageMark) || 0;
      switch (filter) {
        case 'honour':
          return (r.classPosition || 99) <= 3;
        case 'high':
          return avg >= 80;
        case 'atRisk':
          return avg < 50;
        case 'needsRemarks':
          return !(r.classTeacherRemarks || '').trim() || !(r.principalRemarks || '').trim();
        default:
          return true;
      }
    });

    const sort = this.sortBy();
    rows.sort((a, b) => {
      if (sort === 'avgDesc') {
        return (Number(b.averageMark) || 0) - (Number(a.averageMark) || 0);
      }
      if (sort === 'avgAsc') {
        return (Number(a.averageMark) || 0) - (Number(b.averageMark) || 0);
      }
      if (sort === 'name') {
        const an = `${a.student?.lastName} ${a.student?.firstName}`;
        const bn = `${b.student?.lastName} ${b.student?.firstName}`;
        return an.localeCompare(bn);
      }
      return (a.classPosition || 999) - (b.classPosition || 999);
    });

    return rows;
  });

  readonly maxGradeCount = computed(() => {
    const dist = this.gradeDistribution();
    return dist.length ? Math.max(...dist.map((d) => d.count)) : 1;
  });

  ngOnInit(): void {
    this.currentRole = this.getCurrentRole();
    this.applyPortalForRole();
    this.api.get<{ id: string; name: string }[]>('/exams/types').subscribe((t) => this.examTypes.set(t));
    this.api.get<{ id: string; name: string; isCurrent?: boolean }[]>('/exams/terms').subscribe((terms) => {
      this.terms.set(terms);
      const current = terms.find((t) => t.isCurrent);
      if (current) this.filters.termId = current.id;
    });
    if (this.isTeacherPortal) {
      this.api.get<{ assignedClasses: { id: string; name: string; form?: { name: string } }[] }>('/dashboard/teacher').subscribe({
        next: (d) => this.classes.set(d.assignedClasses || []),
        error: () => this.showToast('error', 'Could not load your classes.'),
      });
    } else {
      this.api.get<{ id: string; name: string; form?: { name: string } }[]>('/admin/classes').subscribe((c) =>
        this.classes.set(c),
      );
    }
    this.api.get<SchoolBranding>('/exams/school-branding').subscribe({
      next: (b) => this.schoolBranding.set(b),
      error: () => this.schoolBranding.set({ schoolName: 'School Pro Academy' }),
    });
    this.api.get<GradeBoundaryRow[]>('/exams/grade-boundaries').subscribe((b) => this.gradeBoundaries.set(b));
  }

  schoolName(): string {
    return this.schoolBranding()?.schoolName || 'School Pro Academy';
  }

  headmasterName(): string {
    return (this.schoolBranding()?.headmasterName || '').trim();
  }

  principalRemarksForDisplay(remarks?: string | null): string {
    return appendHeadmasterToPrincipalRemarks(remarks, this.headmasterName());
  }

  logoFullUrl(): string | null {
    const url = this.schoolBranding()?.logoUrl;
    if (!url) return null;
    const origin = environment.apiUrl.replace(/\/api$/, '');
    return `${origin}${url}`;
  }

  websiteDisplay(): string {
    const url = this.schoolBranding()?.website?.trim();
    if (!url) return '';
    return url.replace(/^https?:\/\//i, '').replace(/\/$/, '');
  }

  ngOnDestroy(): void {
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
    this.revokePdfUrl();
  }

  onFilterChange(): void {
    this.reports.set([]);
    this.hasLoaded.set(false);
    this.sessionLabel.set('');
    this.search.set('');
    this.performanceFilter.set('all');
    this.sortBy.set('position');
    this.closePdfPreview();
  }

  clearFilters(): void {
    this.search.set('');
    this.performanceFilter.set('all');
    this.sortBy.set('position');
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
      this.pdfPreviewUrl.set(
        this.sanitizer.bypassSecurityTrustResourceUrl(`${this.pdfObjectUrl}#zoom=100`),
      );
      this.pdfPreviewTitle.set(
        `${report.student?.firstName} ${report.student?.lastName} — Report Card`,
      );
      this.pdfPreviewOpen.set(true);
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
    });
  }

  downloadPdf(report: ReportCardRow): void {
    this.fetchPdfBlob(report, false).then((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const student = report.student;
      a.download = reportCardPdfFilename(
        student?.firstName,
        student?.lastName,
        student?.admissionNumber || report.studentId,
      );
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  printClassSummary(): void {
    const rows = this.filteredReports();
    if (!rows.length) return;

    const stats = this.stats();
    const session = this.sessionLabel();
    const tableRows = rows
      .map(
        (r) => `
      <tr>
        <td class="num">${r.classPosition ?? '—'}</td>
        <td>${r.student?.admissionNumber ?? ''}</td>
        <td>${r.student?.lastName ?? ''}</td>
        <td>${r.student?.firstName ?? ''}</td>
        <td class="num">${r.averageMark != null ? `${r.averageMark}%` : '—'}</td>
        <td>${r.overallGrade ?? '—'}</td>
        <td class="num">${r.subjectsPassed != null && r.totalSubjects ? `${r.subjectsPassed}/${r.totalSubjects}` : '—'}</td>
        <td class="num">${r.attendance?.attendancePercent != null ? `${r.attendance.attendancePercent}%` : '—'}</td>
      </tr>`,
      )
      .join('');

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Report Cards — ${session}</title>
<style>
  body { font-family: system-ui, sans-serif; color: #0f172a; margin: 24px; }
  h1 { margin: 0 0 4px; font-size: 1.25rem; }
  .meta { color: #64748b; font-size: 0.88rem; margin-bottom: 16px; }
  .summary { display: flex; gap: 20px; flex-wrap: wrap; margin-bottom: 18px; font-size: 0.85rem; }
  .summary strong { display: block; font-size: 1rem; }
  table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
  th, td { border: 1px solid #e2e8f0; padding: 7px 9px; text-align: left; }
  th { background: #f8fafc; font-size: 0.68rem; text-transform: uppercase; color: #64748b; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
</style></head><body>
  <h1>Class Report Cards Summary</h1>
  <p class="meta">${session} · ${this.schoolName()}</p>
  <div class="summary">
    <div><span>Students</span><strong>${stats.count}</strong></div>
    <div><span>Class average</span><strong>${stats.classAvg}%</strong></div>
    <div><span>Full pass rate</span><strong>${stats.passRate}%</strong></div>
    <div><span>Top 3</span><strong>${stats.honourCount}</strong></div>
  </div>
  <table>
    <thead><tr>
      <th>Pos</th><th>ID</th><th>Last</th><th>First</th><th>Avg</th><th>Grade</th><th>Subjects</th><th>Attend.</th>
    </tr></thead>
    <tbody>${tableRows}</tbody>
  </table>
  <script>window.onload = () => { window.print(); window.onafterprint = () => window.close(); };</script>
</body></html>`;

    const win = window.open('', '_blank', 'noopener,noreferrer,width=900,height=700');
    if (!win) {
      this.showToast('error', 'Allow pop-ups to print the summary.');
      return;
    }
    win.document.write(html);
    win.document.close();
  }

  async downloadAllPdfs(): Promise<void> {
    const rows = this.filteredReports();
    if (!rows.length || this.bulkDownloading()) return;

    this.bulkDownloading.set(true);
    let done = 0;
    for (const report of rows) {
      const blob = await this.fetchPdfBlob(report, false);
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const student = report.student;
        a.download = reportCardPdfFilename(
          student?.firstName,
          student?.lastName,
          student?.admissionNumber || report.studentId,
        );
        a.click();
        URL.revokeObjectURL(url);
        done += 1;
      }
      await new Promise((r) => setTimeout(r, 400));
    }
    this.bulkDownloading.set(false);
    this.showToast('success', `Downloaded ${done} PDF(s).`);
  }

  gradePillClass(grade?: string): string {
    const g = (grade || '').trim().toUpperCase().charAt(0);
    if (g === 'A') return 'grade-a';
    if (g === 'B') return 'grade-b';
    if (g === 'C') return 'grade-c';
    if (g === 'D') return 'grade-d';
    if (g === 'E' || g === 'F') return 'grade-f';
    return 'grade-default';
  }

  averageTier(avg?: number): 'excellent' | 'good' | 'atRisk' | 'none' {
    if (avg == null) return 'none';
    if (avg >= 80) return 'excellent';
    if (avg >= 50) return 'good';
    return 'atRisk';
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
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
  }

  positionLabel(n?: number): string {
    if (!n) return '—';
    const suffix = n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th';
    return `${n}${suffix}`;
  }

  positionOutOfLabel(position?: number, total?: number): string {
    if (!position || !total) return '—';
    return `${position} Out Of ${total}`;
  }

  subjectsPassedLabel(passed?: number, total?: number): string {
    if (passed == null || !total) return '—';
    return `${passed}/${total}`;
  }

  subjectPositionLabel(pos?: number, total?: number): string {
    if (!pos || !total) return '—';
    return `${pos}/${total}`;
  }

  classPositionSlash(position?: number, total?: number): string {
    if (!position || !total) return '—';
    return `${position} / ${total}`;
  }

  isALevelReport(report: ReportCardRow): boolean {
    return isALevelForm(report.student?.schoolClass?.form);
  }

  pointsForGrade(grade?: string | null): string {
    if (!grade?.trim()) return '—';
    const key = grade.trim().toUpperCase();
    const row = this.gradeBoundaries().find((b) => b.grade.trim().toUpperCase() === key);
    if (row?.points == null || Number.isNaN(Number(row.points))) return '—';
    return String(row.points);
  }

  totalPointsForReport(report: ReportCardRow): string {
    if (!this.isALevelReport(report)) return '—';
    let total = 0;
    let hasAny = false;
    for (const row of report.subjectResults) {
      const pts = this.pointsForGrade(row.grade);
      if (pts !== '—') {
        total += Number(pts);
        hasAny = true;
      }
    }
    return hasAny ? String(total) : '—';
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
    this.clearRemarksSaved(reportId);
  }

  onPrincipalRemarkInput(reportId: string, value: string): void {
    this.remarkDrafts.update((drafts) => ({
      ...drafts,
      [reportId]: { ...this.remarkDraft(reportId), principalRemarks: value },
    }));
    this.clearRemarksSaved(reportId);
  }

  onConductRatingChange(
    report: ReportCardRow,
    field: 'behaviorRating' | 'attitudeRating',
    value: string,
  ): void {
    if (!this.canEditClassTeacherRemark() || !value) return;
    const payload: Record<string, string> = { [field]: value };
    this.savingRemarks.update((state) => ({ ...state, [report.id]: true }));
    this.api.patch<ReportCardRow>(`/exams/report-cards/${report.id}/remarks`, payload).subscribe({
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
        this.remarksSavedIds.update((set) => new Set(set).add(report.id));
        setTimeout(() => {
          this.remarksSavedIds.update((set) => {
            const next = new Set(set);
            next.delete(report.id);
            return next;
          });
        }, 2000);
      },
      error: (e) => {
        this.savingRemarks.update((state) => ({ ...state, [report.id]: false }));
        this.showToast('error', e.error?.message || 'Could not update conduct ratings.');
      },
    });
  }

  onRemarksBlur(report: ReportCardRow): void {
    this.saveRemarks(report, { silent: true, onlyIfChanged: true });
  }

  saveRemarks(
    report: ReportCardRow,
    opts?: { silent?: boolean; onlyIfChanged?: boolean },
  ): void {
    const draft = this.remarkDraft(report.id);
    const payload: { classTeacherRemarks?: string; principalRemarks?: string } = {};
    if (this.canEditClassTeacherRemark()) {
      payload.classTeacherRemarks = draft.classTeacherRemarks;
    }
    if (this.canEditPrincipalRemark()) {
      payload.principalRemarks = draft.principalRemarks;
    }
    if (!Object.keys(payload).length) return;

    if (opts?.onlyIfChanged) {
      const classUnchanged =
        payload.classTeacherRemarks === undefined ||
        (report.classTeacherRemarks || '') === payload.classTeacherRemarks;
      const principalUnchanged =
        payload.principalRemarks === undefined ||
        (report.principalRemarks || '') === payload.principalRemarks;
      if (classUnchanged && principalUnchanged) {
        return;
      }
    }

    this.savingRemarks.update((state) => ({ ...state, [report.id]: true }));
    this.api
      .patch<ReportCardRow>(`/exams/report-cards/${report.id}/remarks`, payload)
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
          if (opts?.silent) {
            this.remarksSavedIds.update((set) => new Set(set).add(report.id));
            setTimeout(() => {
              this.remarksSavedIds.update((set) => {
                const next = new Set(set);
                next.delete(report.id);
                return next;
              });
            }, 2000);
          } else {
            this.showToast('success', 'Remarks saved.');
          }
        },
        error: (e) => {
          this.savingRemarks.update((state) => ({ ...state, [report.id]: false }));
          this.showToast('error', e.error?.message || 'Could not save remarks.');
        },
      });
  }

  remarksJustSaved(reportId: string): boolean {
    return this.remarksSavedIds().has(reportId);
  }

  private clearRemarksSaved(reportId: string): void {
    this.remarksSavedIds.update((set) => {
      if (!set.has(reportId)) return set;
      const next = new Set(set);
      next.delete(reportId);
      return next;
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
    this.remarksSavedIds.set(new Set());
  }

  private applyPortalForRole(): void {
    if (this.router.url.includes('/director')) {
      this.portalTitle.set('Director Portal');
      this.navSections.set([]);
      this.navItems.set(DIRECTOR_NAV_ITEMS);
      return;
    }
    if (this.router.url.includes('/principal')) {
      this.portalTitle.set('Principal Portal');
      this.navSections.set([]);
      this.navItems.set(PRINCIPAL_NAV_ITEMS);
      return;
    }
    if (this.currentRole === 'teacher') {
      this.portalTitle.set('Teacher Portal');
      this.navSections.set(buildTeacherNavSections(this.getUserPermissions()));
      this.navItems.set([]);
      return;
    }
    this.portalTitle.set('Admin Portal');
    this.navSections.set(ADMIN_NAV_SECTIONS);
    this.navItems.set([]);
  }

  private portalPath(segment: string): string {
    if (this.router.url.includes('/director')) return `/director/${segment}`;
    if (this.router.url.includes('/principal')) return `/principal/${segment}`;
    if (this.router.url.includes('/teacher')) return `/teacher/${segment}`;
    return `/admin/${segment}`;
  }

  private getUserPermissions(): string[] | undefined {
    try {
      const raw = localStorage.getItem('school_pro_user');
      if (!raw) return undefined;
      const parsed = JSON.parse(raw) as { permissions?: string[] };
      return parsed.permissions;
    } catch {
      return undefined;
    }
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
