import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';
import { Student } from '../../core/models';

interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  description: string;
  totalAmount: number;
  amountPaid: number;
  status: string;
  feeType: string;
  dueDate: string;
}

interface TermBalanceSummary {
  termId: string;
  termName?: string;
  previousTermName?: string;
  openingBalance: number;
  prepaidApplied: number;
  overpaymentPrepaid: number;
  overpaymentPrepaidApplied: number;
  prepaidCreditAvailable: number;
  closingBalance: number;
}

interface TermRow {
  id: string;
  name: string;
  isCurrent: boolean;
}

interface SchoolFeeRow {
  code: string;
  name: string;
  icon?: string;
  isActive: boolean;
}

@Component({
  selector: 'app-admin-record-payment',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, DecimalPipe, RouterLink],
  templateUrl: './admin-record-payment.component.html',
  styleUrl: './admin-record-payment.component.scss',
})
export class AdminRecordPaymentComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  readonly adminNav = ADMIN_NAV_SECTIONS;

  loading = signal(true);
  submitting = signal(false);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  student = signal<Student | null>(null);
  unpaidInvoices = signal<InvoiceRow[]>([]);
  termBalance = signal<TermBalanceSummary | null>(null);
  lastReceipt = signal<{ receiptNumber: string; receiptId?: string; amount: number } | null>(null);

  payment = {
    amount: 0,
    method: 'cash',
    feeType: 'tuition',
    label: 'Tuition Fees',
    notes: '',
    invoiceId: '',
  };

  invoiceBalance = computed(() =>
    this.unpaidInvoices().reduce(
      (sum, inv) => sum + Math.max(0, Number(inv.totalAmount) - Number(inv.amountPaid)),
      0,
    ),
  );

  effectiveBalance = computed(() => {
    const tb = this.termBalance();
    if (tb && Number.isFinite(tb.closingBalance)) {
      return Math.max(0, Number(tb.closingBalance));
    }
    return this.invoiceBalance();
  });

  studentFullName = computed(() => {
    const s = this.student();
    return s ? `${s.firstName} ${s.lastName}`.trim() : '';
  });

  classLabel = computed(() => {
    const s = this.student();
    if (!s?.schoolClass) return '—';
    const form = s.schoolClass.form?.name;
    return form ? `${form} · ${s.schoolClass.name}` : s.schoolClass.name;
  });

  ngOnInit(): void {
    const studentId = this.route.snapshot.paramMap.get('studentId')?.trim();
    if (!studentId) {
      void this.router.navigate(['/admin/fin-reports/outstanding-invoices']);
      return;
    }

    const invoiceId = this.route.snapshot.queryParamMap.get('invoiceId')?.trim() || '';
    this.loadStudentContext(studentId, invoiceId);
  }

  selectInvoice(inv: InvoiceRow): void {
    this.payment.invoiceId = inv.id;
    this.payment.amount = Math.max(0, Number(inv.totalAmount) - Number(inv.amountPaid));
    this.payment.label = inv.description;
    this.payment.feeType = inv.feeType || this.payment.feeType;
  }

  payFullBalance(): void {
    this.payment.invoiceId = '';
    this.payment.amount = Number(this.effectiveBalance().toFixed(2));
  }

  recordPayment(): void {
    const studentId = this.student()?.id;
    if (!studentId) return;
    if (!this.payment.amount || this.payment.amount <= 0) {
      this.showToast('error', 'Enter a payment amount greater than zero.');
      return;
    }

    this.submitting.set(true);
    this.api
      .post<{ payment: unknown; receipt: { id: string; receiptNumber: string } }>('/billing/payments', {
        studentId,
        invoiceId: this.payment.invoiceId || undefined,
        amount: Number(this.payment.amount),
        method: this.payment.method,
        feeType: this.payment.feeType,
        label: this.payment.label,
        notes: this.payment.notes,
      })
      .subscribe({
        next: (res) => {
          this.submitting.set(false);
          this.lastReceipt.set({
            receiptNumber: res.receipt?.receiptNumber || 'Recorded',
            receiptId: res.receipt?.id,
            amount: Number(this.payment.amount),
          });
          this.showToast('success', `Payment recorded — Receipt ${res.receipt?.receiptNumber}`);
          this.reloadInvoices(studentId);
          this.payment.amount = 0;
          this.payment.invoiceId = '';
          this.payment.notes = '';
        },
        error: (e) => {
          this.submitting.set(false);
          this.showToast('error', e.error?.message || 'Payment failed');
        },
      });
  }

  downloadReceipt(receiptId: string): void {
    this.api.getBlob(`/billing/receipts/${receiptId}/pdf`).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `receipt-${receiptId}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => this.showToast('error', 'Could not download receipt PDF'),
    });
  }

  private loadStudentContext(studentId: string, preselectInvoiceId: string): void {
    this.loading.set(true);
    forkJoin({
      student: this.api.get<Student>(`/students/${studentId}`),
      invoices: this.api.get<InvoiceRow[]>('/billing/invoices', { studentId }),
      fees: this.api.get<SchoolFeeRow[]>('/billing/fees', { active: 'true' }),
      terms: this.api.get<TermRow[]>('/exams/terms'),
    }).subscribe({
      next: ({ student, invoices, fees, terms }) => {
        this.student.set(student);
        const unpaid = invoices.filter(
          (i) => Number(i.totalAmount) - Number(i.amountPaid) > 0.005,
        );
        this.unpaidInvoices.set(unpaid);

        const currentTerm = terms.find((t) => t.isCurrent) || terms[0];
        if (currentTerm) {
          this.api
            .get<TermBalanceSummary>(`/billing/students/${studentId}/term-balance/${currentTerm.id}`)
            .subscribe({
              next: (summary) => this.termBalance.set(summary),
              error: () => this.termBalance.set(null),
            });
        }

        const firstFee = fees.find((f) => f.isActive);
        if (firstFee) {
          this.payment.feeType = firstFee.code;
          this.payment.label = firstFee.name;
        }

        if (preselectInvoiceId) {
          const inv = unpaid.find((i) => i.id === preselectInvoiceId);
          if (inv) this.selectInvoice(inv);
          else this.payFullBalance();
        } else {
          this.payFullBalance();
        }

        this.loading.set(false);
      },
      error: (e) => {
        this.loading.set(false);
        this.showToast('error', e.error?.message || 'Could not load student billing details');
        setTimeout(() => void this.router.navigate(['/admin/fin-reports/outstanding-invoices']), 1500);
      },
    });
  }

  private reloadInvoices(studentId: string): void {
    forkJoin({
      invoices: this.api.get<InvoiceRow[]>('/billing/invoices', { studentId }),
      terms: this.api.get<TermRow[]>('/exams/terms'),
    }).subscribe({
      next: ({ invoices, terms }) => {
        const unpaid = invoices.filter(
          (i) => Number(i.totalAmount) - Number(i.amountPaid) > 0.005,
        );
        this.unpaidInvoices.set(unpaid);
        if (unpaid.length) this.payFullBalance();

        const currentTerm = terms.find((t) => t.isCurrent) || terms[0];
        if (currentTerm) {
          this.api
            .get<TermBalanceSummary>(`/billing/students/${studentId}/term-balance/${currentTerm.id}`)
            .subscribe({
              next: (summary) => this.termBalance.set(summary),
              error: () => this.termBalance.set(null),
            });
        }
      },
    });
  }

  private showToast(type: 'success' | 'error', msg: string): void {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 4500);
  }
}
