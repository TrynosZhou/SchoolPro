import { Component, inject, signal, computed, viewChild, ElementRef, AfterViewInit } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';
import { formatGenderLabel, formatStudentClassLabel } from '../../core/utils/class-display';

interface StudentBalanceRow {
  id: string;
  admissionNumber: string;
  firstName: string;
  lastName: string;
  gender?: string;
  className?: string;
  classLabel?: string;
  totalInvoiced: number;
  totalPaid: number;
  balance: number;
}

type ViewMode = 'table' | 'cards';
type BalanceFilter = 'all' | 'owing' | 'clear';
type SortOrder = 'name-asc' | 'name-desc' | 'balance-desc' | 'balance-asc';

@Component({
  selector: 'app-admin-student-balance',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, DecimalPipe, RouterLink],
  templateUrl: './admin-student-balance.component.html',
  styleUrl: './admin-student-balance.component.scss',
})
export class AdminStudentBalanceComponent implements AfterViewInit {
  private api = inject(ApiService);
  private router = inject(Router);

  readonly adminNav = ADMIN_NAV_SECTIONS;
  readonly balanceSearchInput = viewChild<ElementRef<HTMLInputElement>>('balanceSearchInput');

  query = '';
  loading = signal(false);
  pdfLoading = signal(false);
  rows = signal<StudentBalanceRow[]>([]);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);
  hasSearched = signal(false);

  balanceFilter = signal<BalanceFilter>('all');
  sortOrder = signal<SortOrder>('balance-desc');
  viewMode = signal<ViewMode>('table');

  stats = computed(() => {
    const list = this.rows();
    return {
      count: list.length,
      owing: list.filter((r) => r.balance > 0).length,
      clear: list.filter((r) => r.balance <= 0).length,
      totalInvoiced: list.reduce((s, r) => s + Number(r.totalInvoiced), 0),
      totalPaid: list.reduce((s, r) => s + Number(r.totalPaid), 0),
      totalOwing: list.reduce((s, r) => s + Math.max(0, Number(r.balance)), 0),
    };
  });

  visibleRows = computed(() => {
    let list = [...this.rows()];
    const filter = this.balanceFilter();

    if (filter === 'owing') list = list.filter((r) => r.balance > 0);
    if (filter === 'clear') list = list.filter((r) => r.balance <= 0);

    const sort = this.sortOrder();
    list.sort((a, b) => {
      if (sort === 'balance-desc') return Number(b.balance) - Number(a.balance);
      if (sort === 'balance-asc') return Number(a.balance) - Number(b.balance);
      const nameA = `${a.lastName} ${a.firstName}`.toLowerCase();
      const nameB = `${b.lastName} ${b.firstName}`.toLowerCase();
      if (sort === 'name-desc') return nameB.localeCompare(nameA);
      return nameA.localeCompare(nameB);
    });

    return list;
  });

  hasActiveFilters = computed(() => this.balanceFilter() !== 'all');

  ngAfterViewInit(): void {
    this.scheduleSearchFocus();
  }

  getBalance() {
    const q = this.query.trim();
    if (!q) {
      this.showToast('error', 'Enter Student ID, first name, or last name.');
      return;
    }

    this.loading.set(true);
    this.hasSearched.set(true);
    this.balanceFilter.set('all');

    this.api.get<StudentBalanceRow[]>('/billing/student-balance', { q }).subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.loading.set(false);
        if (!rows.length) {
          this.showToast('error', 'No matching student found.');
        }
      },
      error: (e) => {
        this.loading.set(false);
        this.rows.set([]);
        this.showToast('error', e.error?.message || 'Failed to fetch student balance.');
      },
    });
  }

  clearSearch() {
    this.query = '';
    this.rows.set([]);
    this.hasSearched.set(false);
    this.balanceFilter.set('all');
    this.scheduleSearchFocus();
  }

  clearFilters() {
    this.balanceFilter.set('all');
  }

  filterOwingOnly() {
    this.balanceFilter.set('owing');
  }

  initials(row: StudentBalanceRow): string {
    return `${row.firstName.charAt(0)}${row.lastName.charAt(0)}`.toUpperCase();
  }

  paidPct(row: StudentBalanceRow): number {
    const invoiced = Number(row.totalInvoiced);
    if (!invoiced) return row.totalPaid > 0 ? 100 : 0;
    return Math.min(100, Math.round((Number(row.totalPaid) / invoiced) * 100));
  }

  collectionWidth(row: StudentBalanceRow): string {
    return `${this.paidPct(row)}%`;
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

  classLabel(row: StudentBalanceRow): string {
    return row.classLabel || formatStudentClassLabel(row.className);
  }

  genderLabel(gender?: string): string {
    return formatGenderLabel(gender);
  }

  payBalance(row: StudentBalanceRow): void {
    if (Number(row.balance) <= 0) {
      this.showToast('error', 'This student has no outstanding balance to pay.');
      return;
    }
    this.router.navigate(['/admin/payment'], {
      queryParams: {
        studentId: row.id,
        amount: Number(row.balance).toFixed(2),
      },
    });
  }

  private scheduleSearchFocus(): void {
    setTimeout(() => this.balanceSearchInput()?.nativeElement?.focus());
  }

  private showToast(type: 'success' | 'error', msg: string) {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 4500);
  }
}
