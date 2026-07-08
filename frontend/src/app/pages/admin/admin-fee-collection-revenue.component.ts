import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DecimalPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { AuthService } from '../../core/services/auth.service';
import { NavSection } from '../../shared/portal-layout/portal-layout.component';
import { resolveStaffPortalContext } from '../../core/utils/staff-portal.util';
import { ApiService } from '../../core/services/api.service';
import { formatGenderLabel, formatStudentClassLabel } from '../../core/utils/class-display';

interface TermRow { id: string; name: string; startDate: string; endDate: string; isCurrent: boolean; }
interface SchoolYearRow { id: string; name: string; terms?: TermRow[]; }
interface FormRow { id: string; name: string; level: number; }
interface ClassRow { id: string; name: string; formId: string; form?: { name: string }; }
interface StudentMatch { id: string; admissionNumber: string; firstName: string; lastName: string; gender?: string; className?: string; classLabel?: string; formName?: string; }
interface ChartPoint { label: string; value: number; value2?: number; }

type ReportTab =
  | 'overview'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'category'
  | 'grade'
  | 'methods'
  | 'exceptions'
  | 'projections'
  | 'charts';

interface FeeCollectionReport {
  generatedAt: string;
  accessLevel?: 'full' | 'summary';
  filters: Record<string, string | undefined>;
  overview: {
    totalExpected: number;
    totalCollected: number;
    totalOutstanding: number;
    collectionRatePct: number;
    studentsPaidInFull: number;
    studentsPartial: number;
    studentsUnpaid: number;
  };
  compareOverview?: FeeCollectionReport['overview'];
  daily: { date: string; payments: Record<string, unknown>[]; dayTotal: number; reversedCount: number }[];
  weekly: Record<string, unknown>[];
  monthly: Record<string, unknown>[];
  byCategory: Record<string, unknown>[];
  byGradeClass: Record<string, unknown>[];
  paymentMethods: { key: string; label: string; amount: number; percentage: number; transactionCount: number }[];
  exceptions: { type: string; admissionNumber: string; studentName: string; className?: string; description: string; amount?: number; date?: string }[];
  projections: Record<string, number>;
  charts: {
    dailyCollections: ChartPoint[];
    cumulativeTrend: ChartPoint[];
    feeTypeBreakdown: ChartPoint[];
    gradeClassRates: ChartPoint[];
    monthlyTrend: ChartPoint[];
  };
  auditNote: string;
}

interface ApiResponse extends FeeCollectionReport { needsSelection?: boolean; matches?: StudentMatch[]; }

const FEE_TYPES = [
  { value: '', label: 'All fee types' },
  { value: 'tuition', label: 'Tuition' },
  { value: 'registration', label: 'Registration / admission' },
  { value: 'exam', label: 'Examination' },
  { value: 'boarding', label: 'Boarding' },
  { value: 'bus_levy', label: 'Transport' },
  { value: 'sports', label: 'Extra-curricular' },
  { value: 'other', label: 'Other' },
];

const PAYMENT_METHODS = [
  { value: '', label: 'All methods' },
  { value: 'cash', label: 'Cash' },
  { value: 'bank', label: 'Bank transfer' },
  { value: 'mobile', label: 'Mobile money' },
  { value: 'online', label: 'Online / other' },
];

const COLLECTION_STATUS = [
  { value: '', label: 'All statuses' },
  { value: 'fully_paid', label: 'Fully paid' },
  { value: 'partial', label: 'Partial payment' },
  { value: 'unpaid', label: 'Unpaid' },
];

const ALL_TABS: { id: ReportTab; label: string; summaryOnly?: boolean }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'charts', label: 'Charts' },
  { id: 'daily', label: 'Daily', summaryOnly: true },
  { id: 'weekly', label: 'Weekly', summaryOnly: true },
  { id: 'monthly', label: 'Monthly' },
  { id: 'category', label: 'By category' },
  { id: 'grade', label: 'By grade/class' },
  { id: 'methods', label: 'Payment methods' },
  { id: 'exceptions', label: 'Exceptions', summaryOnly: true },
  { id: 'projections', label: 'Projections' },
];

@Component({
  selector: 'app-admin-fee-collection-revenue',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, DecimalPipe, DatePipe, RouterLink],
  templateUrl: './admin-fee-collection-revenue.component.html',
  styleUrl: './admin-fee-collection-revenue.component.scss',
})
export class AdminFeeCollectionRevenueComponent implements OnInit {
  private api = inject(ApiService);
  private router = inject(Router);
  readonly auth = inject(AuthService);
  portalTitle = 'Admin Portal';
  navSections: NavSection[] = ADMIN_NAV_SECTIONS;
  readonly adminNav = ADMIN_NAV_SECTIONS;
  readonly feeTypes = FEE_TYPES;
  readonly paymentMethods = PAYMENT_METHODS;
  readonly collectionStatuses = COLLECTION_STATUS;

  readonly isSummaryOnly = computed(
    () => this.auth.hasRole('principal') && !this.auth.hasRole('admin', 'director'),
  );

  loading = signal(false);
  exporting = signal(false);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);
  report = signal<FeeCollectionReport | null>(null);
  matches = signal<StudentMatch[]>([]);
  activeTab = signal<ReportTab>('overview');
  tableSearch = signal('');

  terms = signal<TermRow[]>([]);
  forms = signal<FormRow[]>([]);
  classes = signal<ClassRow[]>([]);

  dateFrom = '';
  dateTo = '';
  termId = '';
  compareTermId = '';
  formId = '';
  classId = '';
  query = '';
  studentId = '';
  feeType = '';
  paymentMethod = '';
  collectionStatus = '';
  scheduleFrequency = 'weekly';
  scheduleEmails = '';
  scheduleMode: 'summary' | 'detailed' = 'summary';
  viewMode: 'summary' | 'detailed' = 'detailed';

  sortedTerms = computed(() =>
    [...this.terms()].sort((a, b) => (a.startDate || '').localeCompare(b.startDate || '')),
  );

  filteredClasses = computed(() =>
    this.formId ? this.classes().filter((c) => c.formId === this.formId) : this.classes(),
  );

  visibleTabs = computed(() => {
    if (this.isSummaryOnly()) return ALL_TABS.filter((t) => !t.summaryOnly);
    return ALL_TABS;
  });

  chartMaxDaily = computed(() => {
    const pts = this.report()?.charts.dailyCollections || [];
    return Math.max(...pts.map((p) => p.value), 1);
  });

  chartMaxCumulative = computed(() => {
    const pts = this.report()?.charts.cumulativeTrend || [];
    return Math.max(...pts.flatMap((p) => [p.value, p.value2 || 0]), 1);
  });

  pieTotal = computed(() => {
    const pts = this.report()?.charts.feeTypeBreakdown || [];
    return pts.reduce((s, p) => s + p.value, 0) || 1;
  });

  filteredExceptions = computed(() => {
    const list = this.report()?.exceptions || [];
    const q = this.tableSearch().trim().toLowerCase();
    if (!q) return list;
    return list.filter((e) =>
      `${e.studentName} ${e.admissionNumber} ${e.className || ''} ${e.description} ${e.type}`
        .toLowerCase()
        .includes(q),
    );
  });

  filteredGradeRows = computed(() => {
    const list = this.report()?.byGradeClass || [];
    const q = this.tableSearch().trim().toLowerCase();
    if (!q) return list;
    return list.filter((g) => {
      const row = g as Record<string, unknown>;
      return `${row['gradeLabel'] || ''} ${row['classLabel'] || ''}`.toLowerCase().includes(q);
    });
  });

  ngOnInit() {
    const ctx = resolveStaffPortalContext(this.router.url, this.auth.user()?.role);
    this.portalTitle = ctx.portalTitle;
    this.navSections = ctx.navSections;
    this.api.get<SchoolYearRow[]>('/admin/school-years').subscribe({
      next: (years) => {
        const list: TermRow[] = [];
        for (const y of years) for (const t of y.terms || []) list.push(t);
        this.terms.set(list);
        const current = list.find((t) => t.isCurrent) || list[0];
        if (current) {
          this.termId = current.id;
          this.dateFrom = current.startDate;
          this.dateTo = current.endDate;
          this.getReport();
        } else {
          this.dateTo = new Date().toISOString().slice(0, 10);
        }
      },
    });
    this.api.get<FormRow[]>('/admin/forms').subscribe({ next: (rows) => this.forms.set(rows) });
    this.api.get<ClassRow[]>('/admin/classes').subscribe({ next: (rows) => this.classes.set(rows) });
  }

  selectTerm(id: string) {
    this.termId = id;
    this.onTermChange();
    this.getReport();
  }

  onTermChange() {
    const t = this.terms().find((x) => x.id === this.termId);
    if (t) {
      this.dateFrom = t.startDate;
      this.dateTo = t.endDate;
    }
  }

  setTab(tab: ReportTab) {
    this.activeTab.set(tab);
    this.tableSearch.set('');
  }

  private params(extra: Record<string, string> = {}): Record<string, string> {
    const p: Record<string, string> = { ...extra };
    if (this.dateFrom) p['dateFrom'] = this.dateFrom;
    if (this.dateTo) p['dateTo'] = this.dateTo;
    if (this.termId) p['termId'] = this.termId;
    if (this.compareTermId) p['compareTermId'] = this.compareTermId;
    if (this.formId) p['formId'] = this.formId;
    if (this.classId) p['classId'] = this.classId;
    if (this.studentId) p['studentId'] = this.studentId;
    else if (this.query.trim()) p['q'] = this.query.trim();
    if (this.feeType) p['feeType'] = this.feeType;
    if (this.paymentMethod) p['paymentMethod'] = this.paymentMethod;
    if (this.collectionStatus) p['collectionStatus'] = this.collectionStatus;
    return p;
  }

  getReport() {
    if (!this.dateTo) {
      this.showToast('error', 'Choose at least an end date.');
      return;
    }
    this.loading.set(true);
    this.matches.set([]);
    this.report.set(null);
    this.tableSearch.set('');

    this.api.get<ApiResponse>('/billing/reports/fee-collection-revenue', this.params()).subscribe({
      next: (res) => {
        this.loading.set(false);
        if (res.needsSelection && res.matches?.length) {
          this.matches.set(res.matches);
          this.showToast('error', `${res.matches.length} students found — select one below.`);
          return;
        }
        this.matches.set([]);
        this.report.set(res);
        this.activeTab.set('overview');
        if (this.isSummaryOnly() && !this.visibleTabs().some((t) => t.id === this.activeTab())) {
          this.activeTab.set('overview');
        }
        this.showToast('success', 'Fee collection report loaded.');
      },
      error: (e) => {
        this.loading.set(false);
        this.showToast('error', e.error?.message || 'Failed to load report');
      },
    });
  }

  pickStudent(m: StudentMatch) {
    this.studentId = m.id;
    this.query = `${m.firstName} ${m.lastName} (${m.admissionNumber})`;
    this.getReport();
  }

  clearSelection() {
    this.studentId = '';
    this.query = '';
    this.matches.set([]);
    this.report.set(null);
  }

  initials(student: { firstName: string; lastName: string }): string {
    return `${student.firstName.charAt(0)}${student.lastName.charAt(0)}`.toUpperCase();
  }

  exportFile(format: 'pdf' | 'xlsx', mode: 'summary' | 'detailed') {
    this.exporting.set(true);
    const path =
      format === 'pdf'
        ? '/billing/reports/fee-collection-revenue/export.pdf'
        : '/billing/reports/fee-collection-revenue/export.xlsx';
    this.api.getBlob(path, this.params({ mode })).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `fee-collection-revenue-${mode}.${format === 'pdf' ? 'pdf' : 'csv'}`;
        a.click();
        URL.revokeObjectURL(url);
        this.exporting.set(false);
        this.showToast('success', `${format.toUpperCase()} exported.`);
      },
      error: () => {
        this.exporting.set(false);
        this.showToast('error', 'Export failed');
      },
    });
  }

  previewPdf() {
    this.exportPdf(true);
  }

  downloadPdf() {
    this.exportPdf(false);
  }

  print(mode: 'summary' | 'detailed') {
    this.viewMode = mode;
    setTimeout(() => window.print(), 60);
  }

  saveSchedule() {
    if (!this.scheduleEmails.trim()) {
      this.showToast('error', 'Enter at least one email address.');
      return;
    }
    this.api
      .post('/billing/reports/fee-collection-revenue/schedule', {
        frequency: this.scheduleFrequency,
        emails: this.scheduleEmails,
        mode: this.scheduleMode,
      })
      .subscribe({
        next: (res) => {
          const msg = (res as { message?: string })?.message || 'Schedule saved.';
          this.showToast('success', msg);
        },
        error: (e) => this.showToast('error', e.error?.message || 'Failed to save schedule'),
      });
  }

  exceptionLabel(type: string): string {
    const map: Record<string, string> = {
      under_collected: 'Under-collected',
      no_payment: 'No payment',
      reversed: 'Reversed',
      duplicate: 'Duplicate',
      cancelled_invoice: 'Cancelled invoice',
    };
    return map[type] || type;
  }

  barWidth(value: number, max: number): string {
    return `${Math.max(4, (value / max) * 100)}%`;
  }

  collectionRateWidth(pct: number): string {
    return `${Math.min(100, Math.max(0, pct))}%`;
  }

  private exportPdf(preview: boolean) {
    if (!this.report()) {
      this.showToast('error', 'Load report first.');
      return;
    }
    this.exporting.set(true);
    const mode: 'summary' | 'detailed' = this.isSummaryOnly()
      ? 'summary'
      : this.viewMode === 'summary'
        ? 'summary'
        : 'detailed';
    this.api
      .getBlob('/billing/reports/fee-collection-revenue/export.pdf', this.params({ mode, ...(preview ? { preview: 'true' } : {}) }))
      .subscribe({
        next: (blob) => {
          this.exporting.set(false);
          if (blob.type && !blob.type.includes('pdf')) {
            this.showToast('error', 'Server did not return a PDF file');
            return;
          }
          const url = URL.createObjectURL(blob);
          if (preview) {
            window.open(url, '_blank', 'noopener,noreferrer');
            setTimeout(() => URL.revokeObjectURL(url), 90_000);
            return;
          }
          const a = document.createElement('a');
          a.href = url;
          a.download = `fee-collection-revenue-${mode}.pdf`;
          a.click();
          URL.revokeObjectURL(url);
          this.showToast('success', 'PDF downloaded.');
        },
        error: (e) => {
          this.exporting.set(false);
          this.showToast('error', e.error?.message || 'Failed to generate PDF');
        },
      });
  }

  studentClassLabel(row: { classLabel?: string; className?: string }): string {
    return row.classLabel || formatStudentClassLabel(row.className);
  }

  studentGenderLabel(gender?: string): string {
    return formatGenderLabel(gender);
  }

  private showToast(type: 'success' | 'error', msg: string) {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 4500);
  }
}