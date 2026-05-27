import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';

interface TermRow {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
}

interface SchoolYearRow {
  id: string;
  name: string;
  terms?: TermRow[];
}

interface FormRow {
  id: string;
  name: string;
  level: number;
}

interface ClassRow {
  id: string;
  name: string;
  formId: string;
  form?: { name: string };
}

interface StudentMatch {
  id: string;
  admissionNumber: string;
  firstName: string;
  lastName: string;
  className?: string;
  formName?: string;
}

interface ReconciliationTransaction {
  id: string;
  date: string;
  type: string;
  feeType: string;
  reference: string;
  description: string;
  amount: number;
  inStudentModule: boolean;
  inLedger: boolean;
  matched: boolean;
}

interface StudentReconciliationRow {
  student: StudentMatch;
  status: 'reconciled' | 'unreconciled' | 'pending';
  studentModule: {
    openingBalance: number;
    totalBilled: number;
    totalCollected: number;
    adjustments: number;
    closingBalance: number;
    outstandingBalance: number;
    unappliedPayments: number;
  };
  ledgerModule: {
    openingBalance: number;
    totalDebits: number;
    totalCredits: number;
    closingBalance: number;
  };
  variance: {
    billedVsLedgerDebits: number;
    collectedVsLedgerCredits: number;
    closingBalanceVariance: number;
  };
  financialAid: { disbursed: number; applied: number };
  discrepancies: string[];
  transactions: ReconciliationTransaction[];
}

interface ReconciliationReport {
  filters: {
    dateFrom: string;
    dateTo: string;
    termId?: string;
    termName?: string;
    formId?: string;
    classId?: string;
    studentId?: string;
    feeType?: string;
  };
  generatedAt: string;
  summary: {
    studentCount: number;
    reconciled: number;
    unreconciled: number;
    pending: number;
    totalExpectedRevenue: number;
    totalCollected: number;
    totalVariance: number;
    totalOutstanding: number;
    totalUnappliedPayments: number;
  };
  students: StudentReconciliationRow[];
}

interface ReconciliationApiResponse extends ReconciliationReport {
  needsSelection?: boolean;
  matches?: StudentMatch[];
}

const FEE_TYPES = [
  { value: '', label: 'All transaction types' },
  { value: 'tuition', label: 'Tuition fees' },
  { value: 'registration', label: 'Registration / levies' },
  { value: 'bus_levy', label: 'Bus levy' },
  { value: 'uniform', label: 'Uniform' },
  { value: 'tuckshop', label: 'Tuckshop' },
  { value: 'exam', label: 'Exam fees' },
  { value: 'sports', label: 'Sports' },
  { value: 'donation', label: 'Donations' },
  { value: 'financial_aid', label: 'Financial aid' },
  { value: 'scholarship', label: 'Scholarship' },
  { value: 'refund', label: 'Refunds' },
  { value: 'other', label: 'Other' },
];

@Component({
  selector: 'app-admin-student-reconciliation',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, DecimalPipe],
  templateUrl: './admin-student-reconciliation.component.html',
  styleUrl: './admin-student-reconciliation.component.scss',
})
export class AdminStudentReconciliationComponent implements OnInit {
  private api = inject(ApiService);

  readonly adminNav = ADMIN_NAV_SECTIONS;
  readonly feeTypes = FEE_TYPES;

  loading = signal(false);
  exporting = signal(false);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  terms = signal<TermRow[]>([]);
  forms = signal<FormRow[]>([]);
  classes = signal<ClassRow[]>([]);

  dateFrom = '';
  dateTo = '';
  selectedTermId = '';
  selectedFormId = '';
  selectedClassId = '';
  selectedFeeType = '';
  query = '';
  selectedStudentId = '';
  viewMode: 'summary' | 'detailed' = 'detailed';

  matches = signal<StudentMatch[]>([]);
  report = signal<ReconciliationReport | null>(null);
  expandedStudentId = signal<string | null>(null);

  filteredClasses = computed(() => {
    const formId = this.selectedFormId;
    const list = this.classes();
    if (!formId) return list;
    return list.filter((c) => c.formId === formId);
  });

  ngOnInit() {
    this.api.get<SchoolYearRow[]>('/admin/school-years').subscribe({
      next: (years) => {
        const list: TermRow[] = [];
        for (const y of years) for (const t of y.terms || []) list.push(t);
        this.terms.set(list);
        const current = list.find((t) => t.isCurrent) || list[0];
        if (current) {
          this.selectedTermId = current.id;
          this.dateFrom = current.startDate;
          this.dateTo = current.endDate;
        }
      },
    });
    this.api.get<FormRow[]>('/admin/forms').subscribe({ next: (f) => this.forms.set(f) });
    this.api.get<ClassRow[]>('/admin/classes').subscribe({ next: (c) => this.classes.set(c) });
  }

  onTermChange() {
    const term = this.terms().find((t) => t.id === this.selectedTermId);
    if (term) {
      this.dateFrom = term.startDate;
      this.dateTo = term.endDate;
    }
  }

  buildParams(extra: Record<string, string> = {}): Record<string, string> {
    const p: Record<string, string> = { ...extra };
    if (this.dateFrom) p['dateFrom'] = this.dateFrom;
    if (this.dateTo) p['dateTo'] = this.dateTo;
    if (this.selectedTermId) p['termId'] = this.selectedTermId;
    if (this.selectedFormId) p['formId'] = this.selectedFormId;
    if (this.selectedClassId) p['classId'] = this.selectedClassId;
    if (this.selectedFeeType) p['feeType'] = this.selectedFeeType;
    if (this.selectedStudentId) p['studentId'] = this.selectedStudentId;
    else if (this.query.trim()) p['q'] = this.query.trim();
    p['detailed'] = this.viewMode === 'detailed' ? 'true' : 'false';
    return p;
  }

  getReport() {
    if (!this.dateFrom || !this.dateTo) {
      this.showToast('error', 'Select a date range or term.');
      return;
    }

    this.loading.set(true);
    this.matches.set([]);
    this.report.set(null);
    this.expandedStudentId.set(null);

    this.api.get<ReconciliationApiResponse>('/billing/reports/student-reconciliation', this.buildParams()).subscribe({
      next: (res) => {
        this.loading.set(false);
        if (res.needsSelection && res.matches?.length) {
          this.matches.set(res.matches);
          this.showToast('error', `${res.matches.length} students found — select one.`);
          return;
        }
        this.report.set(res);
        this.showToast('success', `Reconciliation loaded for ${res.summary.studentCount} student(s).`);
      },
      error: (e) => {
        this.loading.set(false);
        this.showToast('error', e.error?.message || 'Failed to load reconciliation report');
      },
    });
  }

  pickStudent(student: StudentMatch) {
    this.selectedStudentId = student.id;
    this.query = `${student.firstName} ${student.lastName} (${student.admissionNumber})`;
    this.getReport();
  }

  toggleExpand(id: string) {
    this.expandedStudentId.update((cur) => (cur === id ? null : id));
  }

  printReport(mode: 'summary' | 'detailed') {
    this.viewMode = mode;
    setTimeout(() => window.print(), 50);
  }

  exportFile(format: 'pdf' | 'xlsx', mode: 'summary' | 'detailed') {
    this.exporting.set(true);
    const params = this.buildParams({ mode });
    const path =
      format === 'pdf'
        ? '/billing/reports/student-reconciliation/export.pdf'
        : '/billing/reports/student-reconciliation/export.xlsx';

    this.api.getBlob(path, params).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `student-reconciliation-${mode}.${format === 'pdf' ? 'pdf' : 'csv'}`;
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

  statusClass(status: string): string {
    return `status-${status}`;
  }

  classLabel(row: StudentReconciliationRow): string {
    return `${row.student.formName || ''} ${row.student.className || ''}`.trim() || '—';
  }

  private showToast(type: 'success' | 'error', msg: string) {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 4500);
  }
}
