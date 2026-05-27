import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { environment } from '../../../environments/environment';
import { Student } from '../../core/models';

type Tab = 'payment' | 'invoice' | 'invoices' | 'receipts' | 'debtors';

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

  readonly adminNav = ADMIN_NAV_SECTIONS;

  activeTab = signal<Tab>('payment');
  loading = signal(true);
  submitting = signal(false);
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
    this.loadData();
  }

  setTab(tab: Tab) {
    this.activeTab.set(tab);
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

  downloadInvoice(invoiceId: string, invoiceNumber?: string) {
    this.downloadBillingPdf(
      `/billing/invoices/${invoiceId}/pdf`,
      `invoice-${invoiceNumber || invoiceId}.pdf`,
    );
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
}
