import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DatePipe, DecimalPipe, NgTemplateOutlet } from '@angular/common';
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

type AgingBucket = 'current' | '31_60' | '61_90' | '91_120' | '120_plus';
type AccountStatus = 'reconciled' | 'unreconciled' | 'pending';
type StatusFilter = 'all' | AccountStatus;
type SortOrder = 'outstanding-desc' | 'days-desc' | 'name-asc' | 'bucket-desc';
type DisplayMode = 'table' | 'cards';

interface DebtorRow {
  studentId: string;
  admissionNumber: string;
  firstName: string;
  lastName: string;
  gender?: string;
  formName?: string;
  className?: string;
  classLabel?: string;
  guardianName?: string;
  guardianPhone?: string;
  guardianEmail?: string;
  originalCharged: number;
  amountPaid: number;
  outstandingBalance: number;
  aging: Record<AgingBucket, number>;
  lastPaymentDate?: string;
  accountStatus: AccountStatus;
  potentialBadDebt: boolean;
  escalationFlag: boolean;
  maxOverdueDays: number;
}

interface DebtorReport {
  generatedAt?: string;
  filters: { dateFrom?: string; dateTo: string; termName?: string };
  summary: {
    totalDebtors: number;
    totalOutstanding: number;
    totalCharged: number;
    totalPaid: number;
    collectedPct: number;
    outstandingPct: number;
    byBucket: Record<AgingBucket, number>;
  };
  students: DebtorRow[];
}

interface DebtorApiResponse extends DebtorReport { needsSelection?: boolean; matches?: StudentMatch[]; }
interface NoteRow { id: string; message: string; createdAt: string; metadata?: { createdBy?: string; studentId?: string }; }

const FEE_TYPES = [
  { value: '', label: 'All fee types' },
  { value: 'tuition', label: 'Tuition' },
  { value: 'registration', label: 'Levies / Registration' },
  { value: 'bus_levy', label: 'Transport' },
  { value: 'boarding', label: 'Boarding' },
  { value: 'exam', label: 'Exam' },
  { value: 'other', label: 'Other' },
];

const BUCKETS: { value: '' | AgingBucket | '90_plus'; label: string; short: string }[] = [
  { value: '', label: 'All buckets', short: 'All' },
  { value: 'current', label: 'Current (0–30 days)', short: '0–30' },
  { value: '31_60', label: '31–60 days', short: '31–60' },
  { value: '61_90', label: '61–90 days', short: '61–90' },
  { value: '91_120', label: '91–120 days', short: '91–120' },
  { value: '120_plus', label: '120+ days', short: '120+' },
  { value: '90_plus', label: '90+ days', short: '90+' },
];

const BUCKET_VISUAL: { key: AgingBucket; label: string; tone: string }[] = [
  { key: 'current', label: '0–30 days', tone: 'current' },
  { key: '31_60', label: '31–60 days', tone: 'mid' },
  { key: '61_90', label: '61–90 days', tone: 'warn' },
  { key: '91_120', label: '91–120 days', tone: 'bad' },
  { key: '120_plus', label: '120+ days', tone: 'critical' },
];

@Component({
  selector: 'app-admin-debtor-aging',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, DecimalPipe, DatePipe, RouterLink, NgTemplateOutlet],
  templateUrl: './admin-debtor-aging.component.html',
  styleUrl: './admin-debtor-aging.component.scss',
})
export class AdminDebtorAgingComponent implements OnInit {
  private api = inject(ApiService);
  private router = inject(Router);
  private auth = inject(AuthService);

  portalTitle = 'Admin Portal';
  navSections: NavSection[] = ADMIN_NAV_SECTIONS;
  readonly adminNav = ADMIN_NAV_SECTIONS;
  readonly feeTypes = FEE_TYPES;
  readonly buckets = BUCKETS;
  readonly bucketVisual = BUCKET_VISUAL;

  loading = signal(false);
  exporting = signal(false);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);
  report = signal<DebtorReport | null>(null);
  notes = signal<NoteRow[]>([]);
  matches = signal<StudentMatch[]>([]);
  selectedRows = signal<Record<string, boolean>>({});

  terms = signal<TermRow[]>([]);
  forms = signal<FormRow[]>([]);
  classes = signal<ClassRow[]>([]);

  dateFrom = '';
  dateTo = '';
  termId = '';
  formId = '';
  classId = '';
  query = '';
  studentId = '';
  feeType = '';
  agingBucket = '';
  excludeZeroBalances = true;
  escalationDays = 90;
  viewMode: 'summary' | 'detailed' = 'detailed';

  studentSearch = signal('');
  statusFilter = signal<StatusFilter>('all');
  bucketFilter = signal<'' | AgingBucket | '90_plus'>('');
  issuesOnly = signal(false);
  sortOrder = signal<SortOrder>('outstanding-desc');
  displayMode = signal<DisplayMode>('table');
  activeStudentId = signal<string | null>(null);
  expandedStudentId = signal<string | null>(null);

  followupNote = '';
  approvedBy = '';
  writeoffReason = '';

  sortedTerms = computed(() =>
    [...this.terms()].sort((a, b) => (a.startDate || '').localeCompare(b.startDate || '')),
  );

  filteredClasses = computed(() =>
    this.formId ? this.classes().filter((c) => c.formId === this.formId) : this.classes(),
  );

  selectedStudentIds = computed(() =>
    Object.entries(this.selectedRows())
      .filter(([, v]) => v)
      .map(([k]) => k),
  );

  activeStudent = computed(() => {
    const id = this.activeStudentId();
    if (!id) return null;
    return this.report()?.students.find((s) => s.studentId === id) || null;
  });

  escalationCount = computed(
    () => this.report()?.students.filter((s) => s.escalationFlag).length ?? 0,
  );

  badDebtCount = computed(
    () => this.report()?.students.filter((s) => s.potentialBadDebt).length ?? 0,
  );

  bucketMax = computed(() => {
    const buckets = this.report()?.summary.byBucket;
    if (!buckets) return 1;
    return Math.max(...Object.values(buckets), 1);
  });

  visibleStudents = computed(() => {
    const report = this.report();
    if (!report) return [];

    let rows = [...report.students];
    const q = this.studentSearch().trim().toLowerCase();

    if (q) {
      rows = rows.filter((s) =>
        `${s.admissionNumber} ${s.firstName} ${s.lastName} ${s.guardianName || ''} ${s.guardianPhone || ''} ${this.classLabel(s)}`
          .toLowerCase()
          .includes(q),
      );
    }

    const status = this.statusFilter();
    if (status !== 'all') rows = rows.filter((s) => s.accountStatus === status);

    if (this.issuesOnly()) {
      rows = rows.filter((s) => s.escalationFlag || s.potentialBadDebt || s.accountStatus !== 'reconciled');
    }

    const bucket = this.bucketFilter();
    if (bucket) {
      rows = rows.filter((s) => this.matchesBucketFilter(s, bucket));
    }

    const sort = this.sortOrder();
    if (sort === 'name-asc') {
      rows.sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`));
    } else if (sort === 'days-desc') {
      rows.sort((a, b) => b.maxOverdueDays - a.maxOverdueDays);
    } else if (sort === 'bucket-desc') {
      rows.sort((a, b) => this.dominantBucketRank(b) - this.dominantBucketRank(a));
    } else {
      rows.sort((a, b) => b.outstandingBalance - a.outstandingBalance);
    }

    return rows;
  });

  filteredSummary = computed(() => {
    const rows = this.visibleStudents();
    return {
      count: rows.length,
      outstanding: rows.reduce((sum, s) => sum + s.outstandingBalance, 0),
      escalated: rows.filter((s) => s.escalationFlag).length,
      badDebt: rows.filter((s) => s.potentialBadDebt).length,
    };
  });

  hasActiveFilters = computed(
    () =>
      Boolean(this.studentSearch().trim()) ||
      this.statusFilter() !== 'all' ||
      Boolean(this.bucketFilter()) ||
      this.issuesOnly() ||
      this.sortOrder() !== 'outstanding-desc',
  );

  allVisibleSelected = computed(() => {
    const visible = this.visibleStudents();
    if (!visible.length) return false;
    const selected = this.selectedRows();
    return visible.every((s) => selected[s.studentId]);
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

  private params(extra: Record<string, string> = {}): Record<string, string> {
    const p: Record<string, string> = { ...extra };
    if (this.dateFrom) p['dateFrom'] = this.dateFrom;
    if (this.dateTo) p['dateTo'] = this.dateTo;
    if (this.termId) p['termId'] = this.termId;
    if (this.formId) p['formId'] = this.formId;
    if (this.classId) p['classId'] = this.classId;
    if (this.studentId) p['studentId'] = this.studentId;
    else if (this.query.trim()) p['q'] = this.query.trim();
    if (this.feeType) p['feeType'] = this.feeType;
    if (this.agingBucket) p['agingBucket'] = this.agingBucket;
    p['excludeZeroBalances'] = this.excludeZeroBalances ? 'true' : 'false';
    p['escalationDays'] = String(this.escalationDays || 90);
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
    this.selectedRows.set({});
    this.activeStudentId.set(null);
    this.expandedStudentId.set(null);
    this.notes.set([]);
    this.studentSearch.set('');
    this.statusFilter.set('all');
    this.bucketFilter.set('');
    this.issuesOnly.set(false);
    this.sortOrder.set('outstanding-desc');

    this.api.get<DebtorApiResponse>('/billing/reports/debtor-aging', this.params()).subscribe({
      next: (res) => {
        this.loading.set(false);
        if (res.needsSelection && res.matches?.length) {
          this.matches.set(res.matches);
          this.showToast('error', `${res.matches.length} students found — select one below.`);
          return;
        }
        this.report.set(res);
        this.showToast('success', `Loaded ${res.summary.totalDebtors} debtor(s).`);
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
    this.selectedRows.set({});
    this.activeStudentId.set(null);
    this.expandedStudentId.set(null);
    this.notes.set([]);
  }

  clearFilters() {
    this.studentSearch.set('');
    this.statusFilter.set('all');
    this.bucketFilter.set('');
    this.issuesOnly.set(false);
    this.sortOrder.set('outstanding-desc');
  }

  selectBucketFilter(bucket: '' | AgingBucket | '90_plus') {
    this.bucketFilter.set(this.bucketFilter() === bucket ? '' : bucket);
  }

  selectEscalatedOnly() {
    this.issuesOnly.set(true);
    this.statusFilter.set('all');
    this.bucketFilter.set('');
    this.jumpToFirstEscalated();
  }

  selectBadDebtOnly() {
    this.issuesOnly.set(false);
    this.bucketFilter.set('120_plus');
    this.jumpToFirstEscalated(true);
  }

  jumpToFirstEscalated(badDebtOnly = false) {
    const row = this.visibleStudents().find((s) =>
      badDebtOnly ? s.potentialBadDebt : s.escalationFlag,
    );
    if (row) this.openStudentPanel(row);
  }

  selectEscalatedRows() {
    const next = { ...this.selectedRows() };
    for (const s of this.report()?.students || []) {
      if (s.escalationFlag) next[s.studentId] = true;
    }
    this.selectedRows.set(next);
  }

  toggleRow(id: string, checked: boolean) {
    this.selectedRows.update((prev) => ({ ...prev, [id]: checked }));
  }

  toggleSelectAllVisible(checked: boolean) {
    const next = { ...this.selectedRows() };
    for (const s of this.visibleStudents()) next[s.studentId] = checked;
    this.selectedRows.set(next);
  }

  openStudentPanel(student: DebtorRow) {
    this.activeStudentId.set(student.studentId);
    this.expandedStudentId.set(student.studentId);
    this.loadNotes(student.studentId);
  }

  toggleExpand(id: string) {
    this.expandedStudentId.update((cur) => (cur === id ? null : id));
    if (this.expandedStudentId() === id) {
      this.activeStudentId.set(id);
      this.loadNotes(id);
    } else {
      this.activeStudentId.set(null);
      this.notes.set([]);
    }
  }

  bucketBarWidth(amount: number): string {
    const max = this.bucketMax();
    return `${Math.max(4, (amount / max) * 100)}%`;
  }

  agingBarWidth(row: DebtorRow, bucket: AgingBucket): string {
    const total = row.outstandingBalance || 1;
    return `${Math.max(row.aging[bucket] > 0 ? 6 : 0, (row.aging[bucket] / total) * 100)}%`;
  }

  exportFile(format: 'pdf' | 'xlsx', mode: 'summary' | 'detailed') {
    this.exporting.set(true);
    const path =
      format === 'pdf' ? '/billing/reports/debtor-aging/export.pdf' : '/billing/reports/debtor-aging/export.xlsx';
    this.api.getBlob(path, this.params({ mode })).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `debtor-aging-${mode}.${format === 'pdf' ? 'pdf' : 'csv'}`;
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

  sendReminderLetter(studentId: string) {
    this.api.getBlob('/billing/reports/debtor-aging/reminder-letter.pdf', { studentId }).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `fee-reminder-${studentId}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
        this.showToast('success', 'Reminder letter downloaded.');
      },
      error: () => this.showToast('error', 'Failed to generate reminder letter'),
    });
  }

  addNote(studentId?: string) {
    const id = studentId || this.activeStudentId();
    const note = this.followupNote.trim();
    if (!id) {
      this.showToast('error', 'Select a student first.');
      return;
    }
    if (!note) return;
    this.api.post('/billing/reports/debtor-aging/notes', { studentId: id, note }).subscribe({
      next: () => {
        this.followupNote = '';
        this.loadNotes(id);
        this.showToast('success', 'Follow-up note saved.');
      },
      error: (e) => this.showToast('error', e.error?.message || 'Failed to save note'),
    });
  }

  loadNotes(studentId: string) {
    this.activeStudentId.set(studentId);
    this.api.get<NoteRow[]>(`/billing/reports/debtor-aging/notes/${studentId}`).subscribe({
      next: (rows) => this.notes.set(rows),
      error: () => this.notes.set([]),
    });
  }

  writeOff(studentId?: string) {
    const id = studentId || this.activeStudentId();
    if (!id) {
      this.showToast('error', 'Select a student first.');
      return;
    }
    if (!this.approvedBy.trim() || !this.writeoffReason.trim()) {
      this.showToast('error', 'Approved by and reason are required for write-off.');
      return;
    }
    this.api
      .post('/billing/reports/debtor-aging/write-off', {
        studentId: id,
        approvedBy: this.approvedBy.trim(),
        reason: this.writeoffReason.trim(),
      })
      .subscribe({
        next: () => {
          this.writeoffReason = '';
          this.getReport();
          this.showToast('success', 'Debt write-off posted with audit trail.');
        },
        error: (e) => this.showToast('error', e.error?.message || 'Write-off failed'),
      });
  }

  sendBulkReminders() {
    const ids = this.selectedStudentIds();
    if (!ids.length) {
      this.showToast('error', 'Select at least one student first.');
      return;
    }
    this.api.post<{ sent: number }>('/billing/reminders/send', { studentIds: ids }).subscribe({
      next: (r) => this.showToast('success', `Reminders sent: ${r.sent}`),
      error: () => this.showToast('error', 'Failed to send reminders'),
    });
  }

  initials(student: { firstName: string; lastName: string }): string {
    return `${student.firstName.charAt(0)}${student.lastName.charAt(0)}`.toUpperCase();
  }

  statusLabel(status: AccountStatus): string {
    if (status === 'reconciled') return 'Reconciled';
    if (status === 'pending') return 'Pending';
    return 'Unreconciled';
  }

  classLabel(r: DebtorRow | StudentMatch): string {
    return r.classLabel || formatStudentClassLabel(r.className);
  }

  genderLabel(gender?: string): string {
    return formatGenderLabel(gender);
  }

  bucketShortLabel(key: AgingBucket): string {
    return this.buckets.find((x) => x.value === key)?.short || key;
  }

  private matchesBucketFilter(row: DebtorRow, filter: AgingBucket | '90_plus'): boolean {
    if (filter === '90_plus') {
      return row.aging['91_120'] > 0.005 || row.aging['120_plus'] > 0.005;
    }
    return row.aging[filter] > 0.005;
  }

  private dominantBucketRank(row: DebtorRow): number {
    const order: AgingBucket[] = ['120_plus', '91_120', '61_90', '31_60', 'current'];
    for (const bucket of order) {
      if (row.aging[bucket] > 0.005) return order.length - order.indexOf(bucket);
    }
    return 0;
  }

  private exportPdf(preview: boolean) {
    if (!this.report()) {
      this.showToast('error', 'Load report first.');
      return;
    }
    this.exporting.set(true);
    const mode: 'summary' | 'detailed' = this.viewMode === 'summary' ? 'summary' : 'detailed';
    this.api.getBlob('/billing/reports/debtor-aging/export.pdf', this.params({ mode, ...(preview ? { preview: 'true' } : {}) })).subscribe({
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
        a.download = `debtor-aging-${mode}.pdf`;
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

  private showToast(type: 'success' | 'error', msg: string) {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 4500);
  }
}
