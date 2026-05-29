import { Component, inject, OnInit, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';

interface OutstandingInvoiceRow {
  invoiceId: string;
  invoiceNumber: string;
  description: string;
  issuedDate?: string;
  dueDate: string;
  totalAmount: number;
  amountPaid: number;
  balance: number;
  status: string;
}

interface OutstandingStudentRow {
  id: string;
  admissionNumber: string;
  firstName: string;
  lastName: string;
  className: string;
  formName?: string;
  invoiceBalance: number;
  invoices: OutstandingInvoiceRow[];
}

interface OutstandingInvoicesGroup {
  classId: string;
  className: string;
  formName?: string;
  classTotal: number;
  students: OutstandingStudentRow[];
}

interface OutstandingInvoicesReport {
  groups: OutstandingInvoicesGroup[];
  grandTotal: number;
  studentCount: number;
  invoiceCount: number;
}

@Component({
  selector: 'app-admin-outstanding-invoices',
  standalone: true,
  imports: [PortalLayoutComponent, DecimalPipe],
  templateUrl: './admin-outstanding-invoices.component.html',
  styleUrl: './admin-outstanding-invoices.component.scss',
})
export class AdminOutstandingInvoicesComponent implements OnInit {
  private api = inject(ApiService);

  readonly adminNav = ADMIN_NAV_SECTIONS;

  loading = signal(true);
  pdfLoading = signal(false);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);
  report = signal<OutstandingInvoicesReport | null>(null);

  ngOnInit() {
    this.loadReport();
  }

  loadReport() {
    this.loading.set(true);
    this.api.get<OutstandingInvoicesReport>('/billing/reports/outstanding-invoices').subscribe({
      next: (data) => {
        this.report.set(data);
        this.loading.set(false);
      },
      error: (e) => {
        this.loading.set(false);
        this.showToast('error', e.error?.message || 'Failed to load outstanding invoices report');
      },
    });
  }

  classHeading(group: OutstandingInvoicesGroup): string {
    const className = (group.className || '').trim();
    if (!className) return 'Class —';
    return /^class\s+/i.test(className) ? className : `Class ${className}`;
  }

  previewPdf() {
    this.exportPdf(true);
  }

  downloadPdf() {
    this.exportPdf(false);
  }

  private exportPdf(preview: boolean) {
    this.pdfLoading.set(true);
    const query = preview ? { preview: 'true' } : undefined;
    this.api.getBlob('/billing/reports/outstanding-invoices/export.pdf', query).subscribe({
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
        a.download = 'outstanding-invoices-report.pdf';
        a.click();
        URL.revokeObjectURL(url);
      },
      error: (e) => {
        this.pdfLoading.set(false);
        this.showToast('error', e.error?.message || 'Failed to generate outstanding invoices PDF');
      },
    });
  }

  private showToast(type: 'success' | 'error', msg: string) {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 4500);
  }
}
