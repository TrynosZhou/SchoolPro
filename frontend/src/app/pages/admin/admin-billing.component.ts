import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe, DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { environment } from '../../../environments/environment';
import { Student } from '../../core/models';

type Tab = 'payment' | 'invoice' | 'invoices' | 'receipts' | 'debtors';
type ViewMode = 'table' | 'cards';

interface BillingSummary {
  totalDebtors: number;
  monthlyCollections: number;
  todayCollections: number;
  todayPaymentCount: number;
  pendingInvoices: number;
}

interface InvoiceRow {
  id: string;
  studentId?: string;
  invoiceNumber: string;
  description: string;
  totalAmount: number;
  amountPaid: number;
  status: string;
  feeType: string;
  dueDate: string;
  student?: { id?: string; firstName: string; lastName: string; admissionNumber: string; schoolClass?: { name: string } };
}

interface SchoolFeeRow {
  id: string;
  code: string;
  name: string;
  description?: string;
  defaultAmount: number;
  icon?: string;
  isActive: boolean;
  sortOrder: number;
}

interface FeePreset {
  type: string;
  label: string;
  icon: string;
  defaultAmount: number;
}

interface PaymentRow {
  id: string;
  paymentReference: string;
  amount: number;
  method: string;
  label: string;
  feeType: string;
  paidAt: string;
  studentId: string;
  invoiceId?: string;
  student?: { firstName: string; lastName: string; admissionNumber: string; schoolClass?: { name: string } };
  receipt?: { id: string; receiptNumber: string };
  invoice?: { invoiceNumber: string; description: string };
}

interface Debtor {
  id: string;
  firstName: string;
  lastName: string;
  admissionNumber?: string;
  className: string;
  owed: number;
  oldestDue?: string;
}

interface Term {
  id: string;
  name: string;
  isCurrent?: boolean;
}

interface BulkTuitionPreview {
  currentTerm: { id: string; name: string };
  nextTerm: { id: string; name: string };
  studentCount: number;
  alreadyInvoicedCount: number;
  pendingCount: number;
  estimatedTotal: number;
}

interface BulkTuitionResult extends BulkTuitionPreview {
  created: number;
  skipped: number;
  skippedStudents: Array<{ id: string; name: string; reason: string }>;
  totalBilled: number;
  message?: string;
}

@Component({
  selector: 'app-admin-billing',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, DecimalPipe, DatePipe, RouterLink],
  templateUrl: './admin-billing.component.html',
  styleUrl: './admin-billing.component.scss',
})
export class AdminBillingComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private route = inject(ActivatedRoute);

  readonly adminNav = ADMIN_NAV_SECTIONS;

  activeTab = signal<Tab>('payment');
  loading = signal(true);
  submitting = signal(false);
  bulkSubmitting = signal(false);
  bulkModalOpen = signal(false);
  bulkPreview = signal<BulkTuitionPreview | null>(null);
  bulkPreviewLoading = signal(false);
  bulkLastResult = signal<BulkTuitionResult | null>(null);
  pdfLoading = signal(false);
  previewingReceiptId = signal<string | null>(null);
  previewingInvoiceId = signal<string | null>(null);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  summary = signal<BillingSummary | null>(null);
  students = signal<Student[]>([]);
  terms = signal<Term[]>([]);
  debtors = signal<Debtor[]>([]);
  invoices = signal<InvoiceRow[]>([]);
  payments = signal<PaymentRow[]>([]);

  studentSearch = signal('');
  filteredStudents = computed(() => {
    const q = this.studentSearch().toLowerCase();
    if (!q) return this.students();
    return this.students().filter((s) =>
      `${s.firstName} ${s.lastName} ${s.admissionNumber}`.toLowerCase().includes(q)
    );
  });

  debtorSearch = signal('');
  filteredDebtors = computed(() => {
    const q = this.debtorSearch().toLowerCase();
    if (!q) return this.debtors();
    return this.debtors().filter((d) =>
      `${d.firstName} ${d.lastName} ${d.className} ${d.admissionNumber}`.toLowerCase().includes(q)
    );
  });

  totalDebtorsOwed = computed(() =>
    this.debtors().reduce((sum, d) => sum + Number(d.owed), 0)
  );

  invoiceFilter = signal('all');
  invoiceSearch = signal('');
  receiptSearch = signal('');
  viewMode = signal<ViewMode>('table');
  filteredInvoices = computed(() => {
    let list = this.invoices();
    const status = this.invoiceFilter();
    if (status !== 'all') list = list.filter((i) => i.status === status);
    const q = this.invoiceSearch().toLowerCase();
    if (q) {
      list = list.filter((i) =>
        `${i.invoiceNumber} ${i.description} ${i.student?.firstName} ${i.student?.lastName}`.toLowerCase().includes(q)
      );
    }
    return list;
  });

  filteredPayments = computed(() => {
    const q = this.receiptSearch().trim().toLowerCase();
    if (!q) return this.payments();
    return this.payments().filter((p) =>
      `${p.receipt?.receiptNumber ?? ''} ${p.student?.firstName ?? ''} ${p.student?.lastName ?? ''} ${p.label} ${p.paymentReference}`
        .toLowerCase()
        .includes(q),
    );
  });

  invoiceStatusCounts = computed(() => {
    const list = this.invoices();
    return {
      all: list.length,
      sent: list.filter((i) => i.status === 'sent').length,
      partial: list.filter((i) => i.status === 'partial').length,
      paid: list.filter((i) => i.status === 'paid').length,
      overdue: list.filter((i) => i.status === 'overdue').length,
    };
  });

  hasActiveInvoiceFilters = computed(
    () => Boolean(this.invoiceSearch().trim()) || this.invoiceFilter() !== 'all',
  );

  sortedTerms = computed(() =>
    [...this.terms()].sort((a, b) => (a.isCurrent === b.isCurrent ? 0 : a.isCurrent ? -1 : 1)),
  );

  studentUnpaidInvoices = signal<InvoiceRow[]>([]);

  payment = {
    studentId: '',
    invoiceId: '',
    amount: 0,
    method: 'cash',
    feeType: 'tuition',
    label: 'Tuition Fees',
    notes: '',
  };

  lastReceipt = signal<{ receiptNumber: string; receiptId?: string; amount: number } | null>(null);

  newInvoice = {
    studentId: '',
    termId: '',
    feeType: 'tuition',
    description: 'Term fees',
    totalAmount: 0,
    dueDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
    lines: [{ description: 'Tuition', quantity: 1, unitPrice: 0, amount: 0 }],
  };

  fees = signal<SchoolFeeRow[]>([]);
  private prefillStudentId = '';
  private prefillAmount: number | null = null;

  feePresets = computed<FeePreset[]>(() =>
    this.fees()
      .filter((f) => f.isActive)
      .map((f) => ({
        type: f.code,
        label: f.name,
        icon: f.icon || '📋',
        defaultAmount: Number(f.defaultAmount) || 0,
      })),
  );

  ngOnInit() {
    this.prefillStudentId = this.route.snapshot.queryParamMap.get('studentId') || '';
    const amountParam = this.route.snapshot.queryParamMap.get('amount');
    this.prefillAmount = amountParam ? Number(amountParam) : null;
    this.loadData();
  }

  setTab(tab: Tab) {
    this.activeTab.set(tab);
  }

  selectTermForInvoice(termId: string) {
    this.newInvoice.termId = termId;
  }

  clearInvoiceFilters() {
    this.invoiceSearch.set('');
    this.invoiceFilter.set('all');
  }

  pickStudentForPayment(studentId: string) {
    this.payment.studentId = studentId;
    this.studentSearch.set('');
    this.onStudentChange();
  }

  initials(first: string, last: string): string {
    return `${(first || '').charAt(0)}${(last || '').charAt(0)}`.toUpperCase() || '?';
  }

  statusLabel(status: string): string {
    const map: Record<string, string> = {
      sent: 'Sent',
      partial: 'Partial',
      paid: 'Paid',
      overdue: 'Overdue',
    };
    return map[status] || status;
  }

  loadData() {
    this.loading.set(true);
    forkJoin({
      summary: this.api.get<BillingSummary>('/billing/summary'),
      students: this.api.get<Student[]>('/students'),
      debtors: this.api.get<Debtor[]>('/billing/debtors'),
      invoices: this.api.get<InvoiceRow[]>('/billing/invoices'),
      payments: this.api.get<PaymentRow[]>('/billing/payments', { limit: '40' }),
      years: this.api.get<{ terms: Term[] }[]>('/admin/school-years'),
      fees: this.api.get<SchoolFeeRow[]>('/billing/fees', { active: 'true' }),
    }).subscribe({
      next: (data) => {
        this.summary.set(data.summary);
        this.students.set(data.students);
        this.debtors.set(data.debtors);
        this.invoices.set(data.invoices);
        this.payments.set(data.payments);
        this.fees.set(data.fees);
        const terms = data.years.flatMap((y) => y.terms || []);
        this.terms.set(terms);
        const current = terms.find((t) => t.isCurrent);
        if (current) this.newInvoice.termId = current.id;
        const firstFee = data.fees[0];
        if (firstFee) {
          this.payment.feeType = firstFee.code;
          this.payment.label = firstFee.name;
          this.newInvoice.feeType = firstFee.code;
        }
        this.applyPaymentPrefill();
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.showToast('error', 'Failed to load billing data');
      },
    });
  }

  onStudentChange() {
    this.payment.invoiceId = '';
    if (!this.payment.studentId) {
      this.studentUnpaidInvoices.set([]);
      return;
    }
    this.api.get<InvoiceRow[]>('/billing/invoices', { studentId: this.payment.studentId }).subscribe({
      next: (allInv) => {
        const unpaid = allInv.filter(
          (i) => ['sent', 'partial', 'overdue'].includes(i.status) &&
            Number(i.totalAmount) > Number(i.amountPaid)
        );
        this.studentUnpaidInvoices.set(unpaid);
      },
    });
  }

  selectInvoiceForPayment(inv: InvoiceRow) {
    this.payment.invoiceId = inv.id;
    this.payment.amount = Number(inv.totalAmount) - Number(inv.amountPaid);
    this.payment.label = inv.description;
    this.payment.feeType = inv.feeType;
  }

  applyFeePreset(preset: FeePreset) {
    this.payment.feeType = preset.type;
    this.payment.label = preset.label;
    if (preset.defaultAmount > 0) {
      this.payment.amount = preset.defaultAmount;
      this.newInvoice.totalAmount = preset.defaultAmount;
    }
    this.newInvoice.feeType = preset.type;
    this.newInvoice.description = preset.label;
  }

  recordPayment() {
    if (!this.payment.studentId || !this.payment.amount) {
      this.showToast('error', 'Select a student and enter an amount');
      return;
    }
    this.submitting.set(true);
    const body = {
      ...this.payment,
      invoiceId: this.payment.invoiceId || undefined,
      amount: Number(this.payment.amount),
    };
    this.api.post<{ payment: PaymentRow; receipt: { id: string; receiptNumber: string } }>(
      '/billing/payments', body
    ).subscribe({
      next: (res) => {
        this.submitting.set(false);
        this.lastReceipt.set({
          receiptNumber: res.receipt?.receiptNumber || 'Recorded',
          receiptId: res.receipt?.id,
          amount: Number(this.payment.amount),
        });
        this.showToast('success', `Payment recorded — Receipt ${res.receipt?.receiptNumber}`);
        this.payment = {
          studentId: '',
          invoiceId: '',
          amount: 0,
          method: 'cash',
          feeType: 'tuition',
          label: 'Tuition Fees',
          notes: '',
        };
        this.studentUnpaidInvoices.set([]);
        this.refreshAfterPayment();
      },
      error: (e) => {
        this.submitting.set(false);
        this.showToast('error', e.error?.message || 'Payment failed');
      },
    });
  }

  createInvoice() {
    if (!this.newInvoice.studentId || !this.newInvoice.totalAmount) {
      this.showToast('error', 'Select student and enter amount');
      return;
    }
    this.submitting.set(true);
    const lines = this.newInvoice.lines.length && this.newInvoice.lines[0].amount
      ? this.newInvoice.lines
      : [{
          description: this.newInvoice.description,
          quantity: 1,
          unitPrice: this.newInvoice.totalAmount,
          amount: this.newInvoice.totalAmount,
        }];
    this.api.post<InvoiceRow>('/billing/invoices', {
      studentId: this.newInvoice.studentId,
      termId: this.newInvoice.termId || undefined,
      feeType: this.newInvoice.feeType,
      description: this.newInvoice.description,
      totalAmount: Number(this.newInvoice.totalAmount),
      dueDate: this.newInvoice.dueDate,
      lines,
    }).subscribe({
      next: (inv) => {
        this.submitting.set(false);
        this.showToast('success', `Invoice ${inv.invoiceNumber} created`);
        this.newInvoice = {
          studentId: '',
          termId: this.terms().find((t) => t.isCurrent)?.id || '',
          feeType: 'tuition',
          description: 'Term fees',
          totalAmount: 0,
          dueDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
          lines: [{ description: 'Tuition', quantity: 1, unitPrice: 0, amount: 0 }],
        };
        this.api.get<InvoiceRow[]>('/billing/invoices').subscribe((i) => this.invoices.set(i));
        this.api.get<BillingSummary>('/billing/summary').subscribe((s) => this.summary.set(s));
      },
      error: () => {
        this.submitting.set(false);
        this.showToast('error', 'Failed to create invoice');
      },
    });
  }

  refreshAfterPayment() {
    forkJoin({
      summary: this.api.get<BillingSummary>('/billing/summary'),
      debtors: this.api.get<Debtor[]>('/billing/debtors'),
      payments: this.api.get<PaymentRow[]>('/billing/payments', { limit: '40' }),
      invoices: this.api.get<InvoiceRow[]>('/billing/invoices'),
    }).subscribe((data) => {
      this.summary.set(data.summary);
      this.debtors.set(data.debtors);
      this.payments.set(data.payments);
      this.invoices.set(data.invoices);
    });
  }

  openBulkInvoiceModal() {
    this.bulkLastResult.set(null);
    this.bulkModalOpen.set(true);
    this.loadBulkPreview();
  }

  closeBulkInvoiceModal() {
    this.bulkModalOpen.set(false);
    this.bulkPreview.set(null);
  }

  loadBulkPreview() {
    this.bulkPreviewLoading.set(true);
    this.api.get<BulkTuitionPreview>('/billing/invoices/bulk-tuition/preview').subscribe({
      next: (preview) => {
        this.bulkPreview.set(preview);
        this.bulkPreviewLoading.set(false);
      },
      error: (e) => {
        this.bulkPreviewLoading.set(false);
        this.showToast('error', e.error?.message || 'Could not load bulk billing preview');
        this.closeBulkInvoiceModal();
      },
    });
  }

  runBulkInvoicing() {
    const preview = this.bulkPreview();
    if (!preview?.pendingCount) {
      this.showToast('error', 'No students are pending bulk tuition billing.');
      return;
    }

    this.bulkSubmitting.set(true);
    this.api.post<BulkTuitionResult>('/billing/invoices/bulk-tuition', {}).subscribe({
      next: (result) => {
        this.bulkSubmitting.set(false);
        this.bulkLastResult.set(result);
        this.bulkPreview.set({
          currentTerm: result.currentTerm,
          nextTerm: result.nextTerm,
          studentCount: result.studentCount,
          alreadyInvoicedCount: result.alreadyInvoicedCount + result.created,
          pendingCount: 0,
          estimatedTotal: 0,
        });
        this.showToast(
          'success',
          result.message || `Created ${result.created} tuition invoices for ${result.nextTerm.name}.`,
        );
        forkJoin({
          summary: this.api.get<BillingSummary>('/billing/summary'),
          debtors: this.api.get<Debtor[]>('/billing/debtors'),
          invoices: this.api.get<InvoiceRow[]>('/billing/invoices'),
        }).subscribe((data) => {
          this.summary.set(data.summary);
          this.debtors.set(data.debtors);
          this.invoices.set(data.invoices);
        });
      },
      error: (e) => {
        this.bulkSubmitting.set(false);
        this.showToast('error', e.error?.message || 'Bulk invoicing failed');
      },
    });
  }

  previewPdf() {
    this.exportPdf(true);
  }

  downloadPdf() {
    this.exportPdf(false);
  }

  private exportPdf(preview: boolean) {
    if (this.loading()) {
      this.showToast('error', 'Wait for billing data to finish loading.');
      return;
    }

    this.pdfLoading.set(true);
    const params: Record<string, string> = { tab: this.activeTab() };
    if (preview) params['preview'] = 'true';
    const debtorQ = this.debtorSearch().trim();
    const invoiceQ = this.invoiceSearch().trim();
    const invoiceStatus = this.invoiceFilter();
    if (debtorQ) params['debtorQ'] = debtorQ;
    if (invoiceQ) params['invoiceQ'] = invoiceQ;
    if (invoiceStatus !== 'all') params['invoiceStatus'] = invoiceStatus;

    this.api.getBlob('/billing/overview/export.pdf', params).subscribe({
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
        const a = document.createElement('a');
        a.href = url;
        a.download = 'billing-overview.pdf';
        a.click();
        URL.revokeObjectURL(url);
      },
      error: (e) => {
        this.pdfLoading.set(false);
        this.showToast('error', e.error?.message || 'Failed to generate PDF');
      },
    });
  }

  sendReminders() {
    const ids = this.debtors().map((d) => d.id);
    if (!ids.length) {
      this.showToast('error', 'No debtors to remind');
      return;
    }
    this.api.post<{ sent: number }>('/billing/reminders/send', { studentIds: ids }).subscribe({
      next: (r) => this.showToast('success', `WhatsApp reminders sent to ${r.sent} families`),
      error: () => this.showToast('error', 'Failed to send reminders'),
    });
  }

  payDebtor(debtor: Debtor) {
    this.payment.studentId = debtor.id;
    this.payment.amount = Number(debtor.owed);
    this.setTab('payment');
    this.onStudentChange();
  }

  payDebtorFromInvoice(inv: InvoiceRow) {
    const studentId = inv.studentId || inv.student?.id;
    if (!studentId) {
      this.showToast('error', 'Student not linked to this invoice');
      return;
    }
    this.payment.studentId = studentId;
    this.selectInvoiceForPayment(inv);
    this.setTab('payment');
  }

  private downloadBillingPdf(path: string, filename: string) {
    const token = this.auth.getToken();
    fetch(`${environment.apiUrl}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error('Download failed');
        return r.blob();
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch(() => this.showToast('error', 'Could not download PDF'));
  }

  downloadReceipt(receiptId: string) {
    this.downloadBillingPdf(`/billing/receipts/${receiptId}/pdf`, `receipt-${receiptId}.pdf`);
  }

  previewReceipt(receiptId: string) {
    this.previewingReceiptId.set(receiptId);
    this.api.getBlob(`/billing/receipts/${receiptId}/pdf`, { preview: 'true' }).subscribe({
      next: (blob) => {
        this.previewingReceiptId.set(null);
        if (blob.type && !blob.type.includes('pdf')) {
          this.showToast('error', 'Server did not return a PDF file');
          return;
        }
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank', 'noopener,noreferrer');
        setTimeout(() => URL.revokeObjectURL(url), 90_000);
      },
      error: (e) => {
        this.previewingReceiptId.set(null);
        this.showToast('error', e.error?.message || 'Could not preview receipt PDF');
      },
    });
  }

  downloadInvoice(invoiceId: string, invoiceNumber?: string) {
    this.downloadBillingPdf(
      `/billing/invoices/${invoiceId}/pdf`,
      `invoice-${invoiceNumber || invoiceId}.pdf`,
    );
  }

  previewInvoice(invoiceId: string) {
    this.previewingInvoiceId.set(invoiceId);
    this.api.getBlob(`/billing/invoices/${invoiceId}/pdf`, { preview: 'true' }).subscribe({
      next: (blob) => {
        this.previewingInvoiceId.set(null);
        if (blob.type && !blob.type.includes('pdf')) {
          this.showToast('error', 'Server did not return a PDF file');
          return;
        }
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank', 'noopener,noreferrer');
        setTimeout(() => URL.revokeObjectURL(url), 90_000);
      },
      error: (e) => {
        this.previewingInvoiceId.set(null);
        this.showToast('error', e.error?.message || 'Could not preview invoice PDF');
      },
    });
  }

  formatMethod(m: string): string {
    const map: Record<string, string> = {
      cash: 'Cash', bank: 'Bank', ecocash: 'EcoCash', onemoney: 'OneMoney', innbucks: 'InnBucks', other: 'Other',
    };
    return map[m] || m;
  }

  formatFee(f: string): string {
    return this.feePresets().find((p) => p.type === f)?.label || f;
  }

  private showToast(type: 'success' | 'error', msg: string) {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 4500);
  }

  private applyPaymentPrefill(): void {
    if (!this.prefillStudentId) return;
    this.payment.studentId = this.prefillStudentId;
    if (this.prefillAmount && this.prefillAmount > 0) {
      this.payment.amount = Number(this.prefillAmount.toFixed(2));
    }
    this.setTab('payment');
    this.onStudentChange();
    this.prefillStudentId = '';
    this.prefillAmount = null;
  }
}
