import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';

interface TermRow { id: string; name: string; startDate: string; endDate: string; isCurrent: boolean; }
interface SchoolYearRow { id: string; name: string; terms?: TermRow[]; }
interface FormRow { id: string; name: string; level: number; }
interface ClassRow { id: string; name: string; formId: string; form?: { name: string }; }
interface StudentMatch { id: string; admissionNumber: string; firstName: string; lastName: string; className?: string; formName?: string; }
interface DebtorRow {
  studentId: string; admissionNumber: string; firstName: string; lastName: string;
  formName?: string; className?: string; guardianName?: string; guardianPhone?: string; guardianEmail?: string;
  originalCharged: number; amountPaid: number; outstandingBalance: number;
  aging: { current: number; '31_60': number; '61_90': number; '91_120': number; '120_plus': number };
  lastPaymentDate?: string; accountStatus: 'reconciled' | 'unreconciled' | 'pending';
  potentialBadDebt: boolean; escalationFlag: boolean; maxOverdueDays: number;
}
interface DebtorReport {
  filters: { dateFrom?: string; dateTo: string; termName?: string };
  summary: {
    totalDebtors: number; totalOutstanding: number; totalCharged: number; totalPaid: number;
    collectedPct: number; outstandingPct: number;
    byBucket: { current: number; '31_60': number; '61_90': number; '91_120': number; '120_plus': number };
  };
  students: DebtorRow[];
}
interface DebtorApiResponse extends DebtorReport { needsSelection?: boolean; matches?: StudentMatch[]; }
interface NoteRow { id: string; message: string; createdAt: string; metadata?: { createdBy?: string; studentId?: string }; }

const FEE_TYPES = [
  { value: '', label: 'All fee types' }, { value: 'tuition', label: 'Tuition' }, { value: 'registration', label: 'Levies/Registration' },
  { value: 'bus_levy', label: 'Transport' }, { value: 'boarding', label: 'Boarding' }, { value: 'exam', label: 'Exam' }, { value: 'other', label: 'Other' },
];
const BUCKETS = [
  { value: '', label: 'All buckets' }, { value: 'current', label: 'Current (0-30)' }, { value: '31_60', label: '31-60' },
  { value: '61_90', label: '61-90' }, { value: '91_120', label: '91-120' }, { value: '120_plus', label: '120+' }, { value: '90_plus', label: '90+' },
];

@Component({
  selector: 'app-admin-debtor-aging',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, DecimalPipe],
  templateUrl: './admin-debtor-aging.component.html',
  styleUrl: './admin-debtor-aging.component.scss',
})
export class AdminDebtorAgingComponent implements OnInit {
  private api = inject(ApiService);
  readonly adminNav = ADMIN_NAV_SECTIONS;
  readonly feeTypes = FEE_TYPES;
  readonly buckets = BUCKETS;

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

  dateFrom = ''; dateTo = '';
  termId = ''; formId = ''; classId = '';
  query = ''; studentId = ''; feeType = ''; agingBucket = '';
  excludeZeroBalances = true; escalationDays = 90; viewMode: 'summary' | 'detailed' = 'detailed';
  followupNote = ''; approvedBy = ''; writeoffReason = '';

  filteredClasses = computed(() => (this.formId ? this.classes().filter((c) => c.formId === this.formId) : this.classes()));
  selectedStudentIds = computed(() => Object.entries(this.selectedRows()).filter(([, v]) => v).map(([k]) => k));

  ngOnInit() {
    this.api.get<SchoolYearRow[]>('/admin/school-years').subscribe({
      next: (years) => {
        const list: TermRow[] = [];
        for (const y of years) for (const t of y.terms || []) list.push(t);
        this.terms.set(list);
        const current = list.find((t) => t.isCurrent) || list[0];
        if (current) { this.termId = current.id; this.dateFrom = current.startDate; this.dateTo = current.endDate; }
        else this.dateTo = new Date().toISOString().slice(0, 10);
      },
    });
    this.api.get<FormRow[]>('/admin/forms').subscribe({ next: (rows) => this.forms.set(rows) });
    this.api.get<ClassRow[]>('/admin/classes').subscribe({ next: (rows) => this.classes.set(rows) });
  }

  onTermChange() {
    const t = this.terms().find((x) => x.id === this.termId);
    if (t) { this.dateFrom = t.startDate; this.dateTo = t.endDate; }
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
    if (!this.dateTo) { this.showToast('error', 'Choose at least an end date.'); return; }
    this.loading.set(true);
    this.api.get<DebtorApiResponse>('/billing/reports/debtor-aging', this.params()).subscribe({
      next: (res) => {
        this.loading.set(false);
        if (res.needsSelection && res.matches?.length) {
          this.matches.set(res.matches);
          this.report.set(null);
          this.showToast('error', `${res.matches.length} students found. Select one.`);
          return;
        }
        this.matches.set([]);
        this.report.set(res);
        this.selectedRows.set({});
        this.showToast('success', `Loaded ${res.summary.totalDebtors} debtors.`);
      },
      error: (e) => { this.loading.set(false); this.showToast('error', e.error?.message || 'Failed to load report'); },
    });
  }

  pickStudent(m: StudentMatch) {
    this.studentId = m.id;
    this.query = `${m.firstName} ${m.lastName} (${m.admissionNumber})`;
    this.getReport();
  }

  toggleRow(id: string, checked: boolean) {
    this.selectedRows.update((prev) => ({ ...prev, [id]: checked }));
  }

  exportFile(format: 'pdf' | 'xlsx', mode: 'summary' | 'detailed') {
    this.exporting.set(true);
    const path = format === 'pdf' ? '/billing/reports/debtor-aging/export.pdf' : '/billing/reports/debtor-aging/export.xlsx';
    this.api.getBlob(path, this.params({ mode })).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `debtor-aging-${mode}.${format === 'pdf' ? 'pdf' : 'csv'}`;
        a.click();
        URL.revokeObjectURL(url);
        this.exporting.set(false);
      },
      error: () => { this.exporting.set(false); this.showToast('error', 'Export failed'); },
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
      },
      error: () => this.showToast('error', 'Failed to generate reminder letter'),
    });
  }

  addNote(studentId: string) {
    const note = this.followupNote.trim();
    if (!note) return;
    this.api.post('/billing/reports/debtor-aging/notes', { studentId, note }).subscribe({
      next: () => {
        this.followupNote = '';
        this.loadNotes(studentId);
        this.showToast('success', 'Follow-up note saved.');
      },
      error: (e) => this.showToast('error', e.error?.message || 'Failed to save note'),
    });
  }

  loadNotes(studentId: string) {
    this.api.get<NoteRow[]>(`/billing/reports/debtor-aging/notes/${studentId}`).subscribe({
      next: (rows) => this.notes.set(rows),
      error: () => this.notes.set([]),
    });
  }

  writeOff(studentId: string) {
    if (!this.approvedBy.trim() || !this.writeoffReason.trim()) {
      this.showToast('error', 'Approved By and Reason are required for write-off.');
      return;
    }
    this.api.post('/billing/reports/debtor-aging/write-off', {
      studentId,
      approvedBy: this.approvedBy.trim(),
      reason: this.writeoffReason.trim(),
    }).subscribe({
      next: () => { this.getReport(); this.showToast('success', 'Debt write-off posted with audit trail.'); },
      error: (e) => this.showToast('error', e.error?.message || 'Write-off failed'),
    });
  }

  sendBulkReminders() {
    const ids = this.selectedStudentIds();
    if (!ids.length) { this.showToast('error', 'Select at least one student first.'); return; }
    this.api.post<{ sent: number }>('/billing/reminders/send', { studentIds: ids }).subscribe({
      next: (r) => this.showToast('success', `Reminders sent: ${r.sent}`),
      error: () => this.showToast('error', 'Failed to send reminders'),
    });
  }

  classLabel(r: DebtorRow): string {
    const className = (r.className || '').trim();
    if (!className) return 'Class —';
    return /^class\s+/i.test(className) ? className : `Class ${className}`;
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
