import { Component, computed, HostListener, inject, OnInit, signal, OnDestroy } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { PARENT_NAV_ITEMS } from '../../core/config/parent-nav';
import { STUDENT_NAV_SECTIONS } from '../../core/config/student-nav';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';

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

interface LedgerRow {
  id?: string;
  entryDate: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  description: string;
  totalAmount: number;
  amountPaid: number;
  status: string;
  issuedDate?: string;
  dueDate?: string;
}

interface PaymentRow {
  id: string;
  paymentReference: string;
  label: string;
  method: string;
  amount: number;
  paidAt?: string;
}

interface StatementData {
  ledger: LedgerRow[];
  invoices: InvoiceRow[];
  payments: PaymentRow[];
  summary: { totalInvoiced: number; totalPaid: number; balance: number };
}

type FinanceTab = 'statement' | 'invoices' | 'receipts';

interface ReceiptRow {
  id: string;
  receiptNumber: string;
  payment?: {
    amount: number;
    paidAt?: string;
    method?: string;
    label?: string;
    paymentReference?: string;
  };
}

@Component({
  selector: 'app-parent-finance',
  standalone: true,
  imports: [PortalLayoutComponent, DatePipe, RouterLink],
  templateUrl: './parent-finance.component.html',
  styleUrl: './parent-finance.component.scss',
})
export class ParentFinanceComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private route = inject(ActivatedRoute);
  private sanitizer = inject(DomSanitizer);

  readonly isStudent = computed(() => this.auth.user()?.role === 'student');
  readonly portalTitle = computed(() => (this.isStudent() ? 'Student Portal' : 'Parent Portal'));
  readonly navSections = computed(() => (this.isStudent() ? STUDENT_NAV_SECTIONS : []));
  readonly navItems = computed(() => (this.isStudent() ? [] : PARENT_NAV_ITEMS));
  readonly homeLink = computed(() => (this.isStudent() ? '/student' : '/parent'));

  children = signal<LinkedChild[]>([]);
  statement = signal<StatementData | null>(null);
  receipts = signal<ReceiptRow[]>([]);

  selectedStudentId = '';

  currencySymbol = signal('$');
  activeTab = signal<FinanceTab>('statement');

  loading = signal(true);
  loadingStatement = signal(false);
  loadingReceipts = signal(false);
  pdfLoading = signal(false);
  statementPdfPreviewOpen = signal(false);
  statementPdfPreviewUrl = signal<SafeResourceUrl | null>(null);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  private statementPdfObjectUrl: string | null = null;

  ngOnInit() {
    this.api.get<{ currency?: string }>('/dashboard/school-links').subscribe({
      next: (data) => {
        if (data.currency) {
          const c = data.currency;
          this.currencySymbol.set(c === 'INR' ? '₹' : c === 'GBP' ? '£' : c === 'EUR' ? '€' : '$');
        }
      },
    });

    this.route.queryParamMap.subscribe((q) => {
      const fromQuery = q.get('studentId');
      if (fromQuery) {
        this.selectedStudentId = fromQuery;
        this.loadFinance();
      }
    });

    this.route.paramMap.subscribe((params) => {
      const fromRoute = params.get('studentId');
      if (fromRoute) {
        this.selectedStudentId = fromRoute;
        this.loadFinance();
      }
    });

    this.loadChildren();
  }

  private loadChildren() {
    const studentUserId = this.auth.user()?.studentId;
    if (this.isStudent() && studentUserId) {
      this.api.get<LinkedChild['student']>(`/students/${studentUserId}`).subscribe({
        next: (student) => {
          this.children.set([{ student }]);
          this.selectedStudentId = student.id;
          this.loading.set(false);
          this.loadFinance();
        },
        error: () => {
          this.loading.set(false);
          this.showToast('error', 'Could not load student profile');
        },
      });
      return;
    }

    this.api.get<LinkedChild[]>('/students/parent/my-children').subscribe({
      next: (kids) => {
        this.children.set(kids);
        this.loading.set(false);
        if (!this.selectedStudentId && kids[0]?.student?.id) {
          this.selectedStudentId = kids[0].student.id;
          this.loadFinance();
        } else if (this.selectedStudentId) {
          this.loadFinance();
        }
      },
      error: () => {
        this.loading.set(false);
        this.showToast('error', 'Could not load linked students');
      },
    });
  }

  childLabel(c: LinkedChild): string {
    const s = c.student;
    const cls = s.schoolClass?.name || s.schoolClass?.form?.name;
    const parts = [`${s.firstName} ${s.lastName}`];
    if (s.admissionNumber) parts.push(s.admissionNumber);
    if (cls) parts.push(cls);
    return parts.join(' — ');
  }

  selectChild(id: string) {
    if (!id || id === this.selectedStudentId) return;
    this.selectedStudentId = id;
    this.onStudentChange();
  }

  setTab(tab: FinanceTab) {
    this.activeTab.set(tab);
  }

  selectedChild(): LinkedChild | undefined {
    return this.children().find((c) => c.student.id === this.selectedStudentId);
  }

  classOf(c: LinkedChild): string {
    return c.student.schoolClass?.name || c.student.schoolClass?.form?.name || '';
  }

  initials(c: LinkedChild): string {
    return `${c.student.firstName?.charAt(0) || ''}${c.student.lastName?.charAt(0) || ''}`.toUpperCase();
  }

  /** Currency text with a proper minus sign: −$12.00 rather than $-12.00. */
  money(value: number | string | null | undefined): string {
    const n = Number(value) || 0;
    const body = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${n < 0 ? '−' : ''}${this.currencySymbol()}${body}`;
  }

  /** Share of invoiced fees already paid, 0–100. */
  paidPercent(summary: StatementData['summary']): number {
    const invoiced = Number(summary.totalInvoiced) || 0;
    if (invoiced <= 0) return 0;
    return Math.max(0, Math.min(100, ((Number(summary.totalPaid) || 0) / invoiced) * 100));
  }

  balanceLabel(balance: number): string {
    if (balance > 0) return 'Balance due';
    if (balance < 0) return 'Credit balance';
    return 'Fully paid';
  }

  invoiceBalance(inv: InvoiceRow): number {
    return Math.max(0, (Number(inv.totalAmount) || 0) - (Number(inv.amountPaid) || 0));
  }

  isOverdue(inv: InvoiceRow): boolean {
    if (!inv.dueDate || this.invoiceBalance(inv) <= 0) return false;
    const due = new Date(inv.dueDate);
    return !isNaN(due.getTime()) && due.getTime() < Date.now();
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.statementPdfPreviewOpen()) this.closeStatementPdfPreview();
  }

  onStudentChange() {
    this.closeStatementPdfPreview();
    this.loadFinance();
  }

  loadFinance() {
    if (!this.selectedStudentId) {
      this.statement.set(null);
      this.receipts.set([]);
      return;
    }

    this.loadingStatement.set(true);
    this.loadingReceipts.set(true);

    this.api.get<StatementData>(`/billing/statement/${this.selectedStudentId}`).subscribe({
      next: (s) => {
        this.statement.set(s);
        this.loadingStatement.set(false);
      },
      error: async (e) => {
        this.loadingStatement.set(false);
        this.statement.set(null);
        this.showToast('error', e?.error?.message || 'Could not load statement of account');
      },
    });

    this.api.get<ReceiptRow[]>(`/billing/receipts/student/${this.selectedStudentId}`).subscribe({
      next: (r) => {
        this.receipts.set(r);
        this.loadingReceipts.set(false);
      },
      error: async (e) => {
        this.loadingReceipts.set(false);
        this.receipts.set([]);
        this.showToast('error', e?.error?.message || 'Could not load receipts');
      },
    });
  }

  previewStatementPdf() {
    if (!this.selectedStudentId) return;
    this.pdfLoading.set(true);
    this.api.getBlob(`/billing/statement/${this.selectedStudentId}/pdf`, { preview: 'true' }).subscribe({
      next: (blob) => {
        this.pdfLoading.set(false);
        if (!blob.type.includes('pdf')) {
          this.showToast('error', 'Invalid PDF response');
          return;
        }
        this.closeStatementPdfPreview();
        this.statementPdfObjectUrl = URL.createObjectURL(blob);
        this.statementPdfPreviewUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(this.statementPdfObjectUrl));
        this.statementPdfPreviewOpen.set(true);
        this.lockPageScroll(true);
      },
      error: async (e) => {
        this.pdfLoading.set(false);
        this.showToast('error', await this.extractBlobErrorMessage(e, 'Could not generate statement PDF'));
      },
    });
  }

  downloadStatementPdf() {
    if (!this.selectedStudentId) return;
    this.pdfLoading.set(true);
    this.api.getBlob(`/billing/statement/${this.selectedStudentId}/pdf`).subscribe({
      next: (blob) => {
        this.pdfLoading.set(false);
        const child = this.children().find((c) => c.student.id === this.selectedStudentId)?.student;
        const name = (child?.admissionNumber || `${child?.firstName}-${child?.lastName}` || this.selectedStudentId)
          .replace(/[^\w-]+/g, '-');
        this.downloadBlob(blob, `student-statement-${name}.pdf`);
      },
      error: async (e) => {
        this.pdfLoading.set(false);
        this.showToast('error', await this.extractBlobErrorMessage(e, 'Could not download statement PDF'));
      },
    });
  }

  downloadInvoicePdf(invoice: InvoiceRow) {
    this.api.getBlob(`/billing/invoices/${invoice.id}/pdf`).subscribe({
      next: (blob) => this.downloadBlob(blob, `invoice-${invoice.invoiceNumber}.pdf`),
      error: async (e) => {
        this.showToast('error', await this.extractBlobErrorMessage(e, 'Could not download invoice PDF'));
      },
    });
  }

  downloadReceiptPdf(receipt: ReceiptRow) {
    this.api.getBlob(`/billing/receipts/${receipt.id}/pdf`).subscribe({
      next: (blob) => this.downloadBlob(blob, `receipt-${receipt.receiptNumber}.pdf`),
      error: async (e) => {
        this.showToast('error', await this.extractBlobErrorMessage(e, 'Could not download receipt PDF'));
      },
    });
  }

  ngOnDestroy() {
    this.closeStatementPdfPreview();
  }

  /** Stops the page behind the full-screen preview from scrolling. */
  private lockPageScroll(lock: boolean) {
    const overflow = lock ? 'hidden' : '';
    document.documentElement.style.overflow = overflow;
    document.body.style.overflow = overflow;
  }

  closeStatementPdfPreview() {
    this.statementPdfPreviewOpen.set(false);
    this.lockPageScroll(false);
    if (this.statementPdfObjectUrl) {
      URL.revokeObjectURL(this.statementPdfObjectUrl);
      this.statementPdfObjectUrl = null;
    }
    this.statementPdfPreviewUrl.set(null);
  }

  formatMethod(m?: string): string {
    if (!m) return '—';
    const map: Record<string, string> = {
      cash: 'Cash',
      bank: 'Bank',
      ecocash: 'EcoCash',
      onemoney: 'OneMoney',
      innbucks: 'InnBucks',
      other: 'Other',
    };
    return map[m] || m;
  }

  private downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  private showToast(type: 'success' | 'error', msg: string) {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 4500);
  }

  private async extractBlobErrorMessage(error: unknown, fallback: string): Promise<string> {
    const e = error as { error?: Blob | { message?: string } };
    if (e?.error instanceof Blob) {
      try {
        const text = await e.error.text();
        const parsed = JSON.parse(text) as { message?: string };
        if (parsed?.message) return parsed.message;
      } catch {
        return fallback;
      }
    }
    return (e?.error as { message?: string })?.message || fallback;
  }
}
