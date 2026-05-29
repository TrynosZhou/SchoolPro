import { Component, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';

interface StudentBalanceRow {
  id: string;
  admissionNumber: string;
  firstName: string;
  lastName: string;
  className?: string;
  totalInvoiced: number;
  totalPaid: number;
  balance: number;
}

@Component({
  selector: 'app-admin-student-balance',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, DecimalPipe],
  templateUrl: './admin-student-balance.component.html',
  styleUrl: './admin-student-balance.component.scss',
})
export class AdminStudentBalanceComponent {
  private api = inject(ApiService);
  private router = inject(Router);

  readonly adminNav = ADMIN_NAV_SECTIONS;
  query = '';
  loading = signal(false);
  pdfLoading = signal(false);
  rows = signal<StudentBalanceRow[]>([]);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  getBalance() {
    const q = this.query.trim();
    if (!q) {
      this.showToast('error', 'Enter Student ID, first name, or last name.');
      return;
    }

    this.loading.set(true);
    this.api.get<StudentBalanceRow[]>('/billing/student-balance', { q }).subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.loading.set(false);
        if (!rows.length) {
          this.showToast('error', 'No matching student found.');
        } else {
          this.showToast('success', `Found ${rows.length} student(s).`);
        }
      },
      error: (e) => {
        this.loading.set(false);
        this.rows.set([]);
        this.showToast('error', e.error?.message || 'Failed to fetch student balance.');
      },
    });
  }

  private showToast(type: 'success' | 'error', msg: string) {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 4000);
  }

  previewPdf() {
    this.exportPdf(true);
  }

  downloadPdf() {
    this.exportPdf(false);
  }

  private exportPdf(preview: boolean) {
    const q = this.query.trim();
    if (!q) {
      this.showToast('error', 'Enter a search term before exporting PDF.');
      return;
    }
    if (!this.rows().length) {
      this.showToast('error', 'Load student balance results first.');
      return;
    }

    this.pdfLoading.set(true);
    const params: Record<string, string> = { q };
    if (preview) params['preview'] = 'true';

    this.api.getBlob('/billing/student-balance/export.pdf', params).subscribe({
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
        a.download = 'student-balance-report.pdf';
        a.click();
        URL.revokeObjectURL(url);
      },
      error: (e) => {
        this.pdfLoading.set(false);
        this.showToast('error', e.error?.message || 'Failed to generate PDF');
      },
    });
  }

  payBalance(row: StudentBalanceRow): void {
    if (Number(row.balance) <= 0) {
      this.showToast('error', 'This student has no outstanding balance to pay.');
      return;
    }
    this.router.navigate(['/admin/billing'], {
      queryParams: {
        studentId: row.id,
        amount: Number(row.balance).toFixed(2),
      },
    });
  }
}

