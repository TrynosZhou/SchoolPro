import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe, DecimalPipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { PARENT_NAV_ITEMS } from '../../core/config/parent-nav';
import { ApiService } from '../../core/services/api.service';

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
  imports: [PortalLayoutComponent, FormsModule, DecimalPipe, DatePipe, RouterLink],
  templateUrl: './parent-finance.component.html',
  styleUrl: './parent-finance.component.scss',
})
export class ParentFinanceComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private sanitizer = inject(DomSanitizer);

  readonly nav = PARENT_NAV_ITEMS;

  children = signal<LinkedChild[]>([]);
  statement = signal<StatementData | null>(null);
  receipts = signal<ReceiptRow[]>([]);

  selectedStudentId = '';

  loading = signal(true);
  loadingStatement = signal(false);
  loadingReceipts = signal(false);
  pdfLoading = signal(false);
  statementPdfPreviewOpen = signal(false);
  statementPdfPreviewUrl = signal<SafeResourceUrl | null>(null);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  private statementPdfObjectUrl: string | null = null;

  ngOnInit() {
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

  closeStatementPdfPreview() {
    this.statementPdfPreviewOpen.set(false);
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
