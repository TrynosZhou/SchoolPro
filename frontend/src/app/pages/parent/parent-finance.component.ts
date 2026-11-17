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

type PaynowMethod = 'ecocash' | 'onemoney' | 'visa';

interface PaynowInitiateResponse {
  intentId: string;
  reference: string;
  method: PaynowMethod;
  browserUrl?: string;
  pollUrl?: string;
  instructions?: string;
}

interface PaynowStatusResponse {
  reference: string;
  status: 'pending' | 'processing' | 'paid' | 'failed' | 'cancelled' | string;
  method: string;
  amount: number;
  paynowReference?: string;
  paymentId?: string;
  receiptId?: string;
  receiptNumber?: string;
}

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

  // ── Online payments (Paynow) ──────────────────────────────
  payNowOpen = signal(false);
  payNowMethod = signal<PaynowMethod>('ecocash');
  payNowAmount = signal<number | null>(null);
  payNowPhone = signal('');
  payNowEmail = signal('');
  payNowInvoiceId = signal('');
  payNowSubmitting = signal(false);
  payNowInstructions = signal<string | null>(null);
  payNowReference = signal<string | null>(null);

  /** Banner shown after Paynow redirects the payer back to the portal. */
  paynowReturn = signal<PaynowStatusResponse | null>(null);
  paynowReturnChecking = signal(false);

  private paynowPollTimer: ReturnType<typeof setTimeout> | null = null;
  private currentPaynowReturn: string | null = null;

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
      const paynowRef = q.get('paynow');
      if (paynowRef && paynowRef !== this.currentPaynowReturn) {
        this.currentPaynowReturn = paynowRef;
        this.watchPaynowReturn(paynowRef);
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
    else if (this.payNowOpen()) this.closePayNow();
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

  // ── Online payments (Paynow) ──────────────────────────────

  /** Outstanding amount on the selected student's account (never negative). */
  outstandingBalance(): number {
    const stmt = this.statement();
    if (!stmt) return 0;
    return Math.max(0, Number(stmt.summary.balance) || 0);
  }

  /** Outstanding invoices that can be paid online. */
  payableInvoices(): InvoiceRow[] {
    const stmt = this.statement();
    if (!stmt) return [];
    return stmt.invoices.filter((inv) => this.invoiceBalance(inv) > 0);
  }

  payNowNeedsPhone(): boolean {
    return this.payNowMethod() !== 'visa';
  }

  openPayNow(invoice?: InvoiceRow) {
    this.payNowInvoiceId.set(invoice?.id || '');
    this.payNowAmount.set(invoice ? this.invoiceBalance(invoice) : this.outstandingBalance());
    this.payNowMethod.set('ecocash');
    this.payNowInstructions.set(null);
    this.payNowReference.set(null);
    this.paynowReturn.set(null);
    this.payNowOpen.set(true);
  }

  closePayNow() {
    if (this.payNowSubmitting()) return;
    this.payNowOpen.set(false);
    this.payNowInstructions.set(null);
  }

  setPayNowAmount(value: string) {
    const n = Number(value);
    this.payNowAmount.set(value === '' || isNaN(n) ? null : n);
  }

  /** Choosing an invoice defaults the amount to what is owed on it. */
  onPayNowInvoiceChange(invoiceId: string) {
    this.payNowInvoiceId.set(invoiceId);
    const inv = this.payableInvoices().find((i) => i.id === invoiceId);
    this.payNowAmount.set(inv ? this.invoiceBalance(inv) : this.outstandingBalance());
  }

  submitPayNow() {
    if (!this.selectedStudentId || this.payNowSubmitting()) return;

    const amount = Number(this.payNowAmount()) || 0;
    if (amount <= 0) {
      this.showToast('error', 'Enter an amount greater than zero');
      return;
    }
    if (this.payNowNeedsPhone() && !String(this.payNowPhone()).trim()) {
      this.showToast('error', 'Enter the mobile number that will authorise this payment');
      return;
    }

    this.payNowSubmitting.set(true);
    this.api
      .post<PaynowInitiateResponse>('/billing/payments/paynow/initiate', {
        studentId: this.selectedStudentId,
        invoiceId: this.payNowInvoiceId() || undefined,
        amount,
        method: this.payNowMethod(),
        phone: this.payNowPhone() || undefined,
        email: this.payNowEmail() || undefined,
        label: this.payNowInvoiceId() ? 'School fees invoice' : 'School fees',
      })
      .subscribe({
        next: (res) => {
          this.payNowSubmitting.set(false);
          this.payNowReference.set(res.reference);

          if (res.browserUrl) {
            // Card checkout: hand off to Paynow's secure page.
            window.location.href = res.browserUrl;
            return;
          }

          this.payNowInstructions.set(
            res.instructions || 'Approve the payment prompt on your handset to complete this payment.',
          );
        },
        error: (e) => {
          this.payNowSubmitting.set(false);
          this.showToast('error', e?.error?.message || 'Could not start the payment. Please try again.');
        },
      });
  }

  /** Manually re-check a mobile-money payment from the instructions panel. */
  checkPayNowStatus() {
    const ref = this.payNowReference();
    if (!ref) return;
    this.fetchPaynowStatus(ref).subscribe((res) => this.applyPaynowReturn(res));
  }

  /** Poll Paynow (via our API) after the payer is redirected back to the portal. */
  private watchPaynowReturn(reference: string) {
    this.paynowReturnChecking.set(true);
    this.paynowReturn.set(null);
    let attempts = 0;

    const poll = () => {
      this.fetchPaynowStatus(reference).subscribe({
        next: (res) => {
          this.applyPaynowReturn(res, attempts);
          const settled = ['paid', 'failed', 'cancelled'].includes(res.status);
          if (settled || attempts >= 20) {
            this.paynowReturnChecking.set(false);
            return;
          }
          attempts += 1;
          this.paynowPollTimer = setTimeout(poll, 3000);
        },
        error: () => {
          this.paynowReturnChecking.set(false);
        },
      });
    };

    poll();
  }

  private fetchPaynowStatus(reference: string) {
    return this.api.get<PaynowStatusResponse>(`/billing/payments/paynow/${encodeURIComponent(reference)}`);
  }

  private applyPaynowReturn(res: PaynowStatusResponse, attempts = 0) {
    this.paynowReturn.set(res);
    if (res.status === 'paid') {
      this.showToast('success', 'Payment received. A receipt has been issued.');
      this.payNowOpen.set(false);
      this.loadFinance();
    } else if (res.status === 'failed' || res.status === 'cancelled') {
      this.showToast('error', 'The payment was not completed.');
    } else if (attempts === 0) {
      // Still awaiting the mobile-money authorisation prompt.
      this.showToast('success', 'Waiting for you to approve the payment on your phone…');
    }
  }

  dismissPaynowReturn() {
    this.paynowReturn.set(null);
  }

  paynowStatusLabel(status: string): string {
    const map: Record<string, string> = {
      pending: 'Awaiting approval',
      processing: 'Processing',
      paid: 'Paid',
      failed: 'Failed',
      cancelled: 'Cancelled',
    };
    return map[status] || status;
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
    if (this.paynowPollTimer) clearTimeout(this.paynowPollTimer);
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
