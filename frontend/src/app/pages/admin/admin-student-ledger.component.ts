import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';

interface TermRow {
  id: string;
  name: string;
  termNumber: number;
  isCurrent: boolean;
  schoolYearId: string;
}

interface SchoolYearRow {
  id: string;
  name: string;
  terms?: TermRow[];
}

interface StudentMatch {
  id: string;
  admissionNumber: string;
  firstName: string;
  lastName: string;
  className?: string;
  formName?: string;
}

interface LedgerLine {
  date: string;
  type: 'invoice' | 'payment' | 'opening';
  reference: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

interface StudentLedgerReport {
  student: StudentMatch;
  term: { id: string; name: string; startDate: string; endDate: string };
  lines: LedgerLine[];
  summary: {
    openingBalance: number;
    totalDebits: number;
    totalCredits: number;
    closingBalance: number;
  };
}

interface LedgerApiResponse {
  needsSelection: boolean;
  matches?: StudentMatch[];
  report?: StudentLedgerReport;
  term?: { id: string; name: string };
}

type LineTypeFilter = 'all' | LedgerLine['type'];

@Component({
  selector: 'app-admin-student-ledger',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, DecimalPipe, RouterLink],
  templateUrl: './admin-student-ledger.component.html',
  styleUrl: './admin-student-ledger.component.scss',
})
export class AdminStudentLedgerComponent implements OnInit {
  private api = inject(ApiService);

  readonly adminNav = ADMIN_NAV_SECTIONS;

  loading = signal(false);
  pdfLoading = signal(false);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  terms = signal<TermRow[]>([]);
  selectedTermId = '';
  query = '';
  selectedStudentId = '';

  matches = signal<StudentMatch[]>([]);
  report = signal<StudentLedgerReport | null>(null);
  lineSearch = signal('');
  typeFilter = signal<LineTypeFilter>('all');

  sortedTerms = computed(() =>
    [...this.terms()].sort((a, b) => (a.termNumber || 0) - (b.termNumber || 0)),
  );

  filteredLines = computed(() => {
    const r = this.report();
    if (!r) return [];
    let lines = [...r.lines];
    const q = this.lineSearch().trim().toLowerCase();
    if (q) {
      lines = lines.filter((l) =>
        `${l.reference} ${l.description} ${l.type} ${l.date}`.toLowerCase().includes(q),
      );
    }
    const type = this.typeFilter();
    if (type !== 'all') lines = lines.filter((l) => l.type === type);
    return lines;
  });

  balanceStatus = computed(() => {
    const closing = this.report()?.summary.closingBalance ?? 0;
    if (closing > 0) return { label: 'Amount owed', tone: 'owed' as const };
    if (closing < 0) return { label: 'Credit balance', tone: 'credit' as const };
    return { label: 'Settled', tone: 'clear' as const };
  });

  hasLineFilters = computed(
    () => Boolean(this.lineSearch().trim()) || this.typeFilter() !== 'all',
  );

  ngOnInit() {
    this.api.get<SchoolYearRow[]>('/admin/school-years').subscribe({
      next: (years) => {
        const list: TermRow[] = [];
        for (const y of years) for (const t of y.terms || []) list.push(t);
        this.terms.set(list);
        const current = list.find((t) => t.isCurrent) || list[0];
        if (current) this.selectedTermId = current.id;
      },
      error: () => this.showToast('error', 'Failed to load terms'),
    });
  }

  selectTerm(termId: string) {
    this.selectedTermId = termId;
    if (this.selectedStudentId || this.query.trim()) this.getReport();
  }

  getReport() {
    if (!this.selectedTermId) {
      this.showToast('error', 'Select a term.');
      return;
    }
    if (!this.query.trim() && !this.selectedStudentId) {
      this.showToast('error', 'Enter Student ID, first name, or last name.');
      return;
    }

    this.loading.set(true);
    this.matches.set([]);
    this.report.set(null);
    this.lineSearch.set('');
    this.typeFilter.set('all');

    const params: Record<string, string> = { termId: this.selectedTermId };
    if (this.selectedStudentId) params['studentId'] = this.selectedStudentId;
    else params['q'] = this.query.trim();

    this.api.get<LedgerApiResponse>('/billing/reports/student-ledger', params).subscribe({
      next: (res) => {
        this.loading.set(false);
        if (res.needsSelection && res.matches?.length) {
          this.matches.set(res.matches);
          this.showToast('error', `${res.matches.length} students found — select one below.`);
          return;
        }
        if (res.report) {
          this.selectedStudentId = res.report.student.id;
          this.report.set(res.report);
          this.matches.set([]);
          this.showToast('success', 'Ledger report loaded.');
        }
      },
      error: (e) => {
        this.loading.set(false);
        this.showToast('error', e.error?.message || 'Failed to load ledger report');
      },
    });
  }

  pickStudent(student: StudentMatch) {
    this.selectedStudentId = student.id;
    this.query = `${student.firstName} ${student.lastName} (${student.admissionNumber})`;
    this.getReport();
  }

  clearSelection() {
    this.selectedStudentId = '';
    this.query = '';
    this.matches.set([]);
    this.report.set(null);
    this.lineSearch.set('');
    this.typeFilter.set('all');
  }

  clearLineFilters() {
    this.lineSearch.set('');
    this.typeFilter.set('all');
  }

  previewPdf() {
    this.exportPdf(true);
  }

  downloadPdf() {
    this.exportPdf(false);
  }

  typeLabel(type: LedgerLine['type']): string {
    if (type === 'invoice') return 'Invoice';
    if (type === 'payment') return 'Payment';
    return 'Opening';
  }

  initials(student: { firstName: string; lastName: string }): string {
    return `${student.firstName.charAt(0)}${student.lastName.charAt(0)}`.toUpperCase();
  }

  private exportPdf(preview: boolean) {
    if (!this.selectedTermId) {
      this.showToast('error', 'Select a term.');
      return;
    }
    if (!this.selectedStudentId && !this.query.trim()) {
      this.showToast('error', 'Search and load a student ledger first.');
      return;
    }

    this.pdfLoading.set(true);
    const params: Record<string, string> = { termId: this.selectedTermId };
    if (this.selectedStudentId) params['studentId'] = this.selectedStudentId;
    else params['q'] = this.query.trim();
    if (preview) params['preview'] = 'true';

    this.api.getBlob('/billing/reports/student-ledger/export.pdf', params).subscribe({
      next: (blob) => {
        this.pdfLoading.set(false);
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
        const report = this.report();
        const idPart = report?.student?.admissionNumber || this.selectedStudentId || 'student-ledger';
        const a = document.createElement('a');
        a.href = url;
        a.download = `student-ledger-${idPart}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: (e) => {
        this.pdfLoading.set(false);
        this.showToast('error', e.error?.message || 'Failed to generate student ledger PDF');
      },
    });
  }

  private showToast(type: 'success' | 'error', msg: string) {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 4500);
  }
}
