import { Component, inject, OnInit, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import {
  ChartOfAccountRow,
  GeneralLedgerService,
  GlAccountType,
  GlListReport,
  GlReferenceType,
} from '../../core/services/general-ledger.service';

const ACCOUNT_TYPES: { value: '' | GlAccountType; label: string }[] = [
  { value: '', label: 'All account types' },
  { value: 'ASSET', label: 'Asset' },
  { value: 'LIABILITY', label: 'Liability' },
  { value: 'EQUITY', label: 'Equity' },
  { value: 'REVENUE', label: 'Revenue' },
  { value: 'EXPENSE', label: 'Expense' },
];

const REFERENCE_TYPES: { value: '' | GlReferenceType; label: string }[] = [
  { value: '', label: 'All reference types' },
  { value: 'FEE_PAYMENT', label: 'Fee payment' },
  { value: 'SALARY', label: 'Salary' },
  { value: 'EXPENSE', label: 'Expense' },
  { value: 'REFUND', label: 'Refund' },
  { value: 'MANUAL_ADJUSTMENT', label: 'Manual adjustment' },
  { value: 'OTHER', label: 'Other' },
];

@Component({
  selector: 'app-admin-general-ledger',
  standalone: true,
  imports: [PortalLayoutComponent, ReactiveFormsModule, DecimalPipe, RouterLink],
  templateUrl: './admin-general-ledger.component.html',
  styleUrl: './admin-general-ledger.component.scss',
})
export class AdminGeneralLedgerComponent implements OnInit {
  private gl = inject(GeneralLedgerService);
  private fb = inject(FormBuilder);

  readonly adminNav = ADMIN_NAV_SECTIONS;
  readonly accountTypes = ACCOUNT_TYPES;
  readonly referenceTypes = REFERENCE_TYPES;

  loading = signal(false);
  exporting = signal(false);
  pdfPreviewLoading = signal(false);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);
  report = signal<GlListReport | null>(null);
  accounts = signal<ChartOfAccountRow[]>([]);

  filterForm = this.fb.nonNullable.group({
    startDate: [''],
    endDate: [''],
    accountId: [''],
    accountType: ['' as '' | GlAccountType],
    referenceType: ['' as '' | GlReferenceType],
    search: [''],
    page: [1],
    pageSize: [50],
  });

  ngOnInit() {
    this.gl.listAccounts().subscribe({
      next: (rows) => this.accounts.set(rows),
      error: () => this.showToast('error', 'Failed to load chart of accounts'),
    });

    this.loadReport();
  }

  loadReport() {
    this.loading.set(true);
    const v = this.filterForm.getRawValue();
    this.gl.listEntries({
      startDate: v.startDate || undefined,
      endDate: v.endDate || undefined,
      accountId: v.accountId || undefined,
      accountType: v.accountType || undefined,
      referenceType: v.referenceType || undefined,
      search: v.search || undefined,
      page: v.page,
      pageSize: v.pageSize,
    }).subscribe({
      next: (res) => {
        this.loading.set(false);
        this.report.set(res);
      },
      error: (e) => {
        this.loading.set(false);
        this.showToast('error', e.error?.message || 'Failed to load general ledger');
      },
    });
  }

  applyFilters() {
    this.filterForm.patchValue({ page: 1 });
    this.loadReport();
  }

  clearFilters() {
    this.filterForm.reset({
      startDate: '',
      endDate: '',
      accountId: '',
      accountType: '',
      referenceType: '',
      search: '',
      page: 1,
      pageSize: 50,
    });
    this.loadReport();
  }

  goToPage(page: number) {
    const totalPages = this.report()?.pagination.totalPages || 1;
    const next = Math.min(Math.max(1, page), totalPages);
    this.filterForm.patchValue({ page: next });
    this.loadReport();
  }

  export(format: 'pdf' | 'csv') {
    this.exporting.set(true);
    const v = this.filterForm.getRawValue();
    this.gl.exportBlob(this.exportParams(v), format).subscribe({
      next: (blob) => {
        this.exporting.set(false);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `general-ledger.${format === 'pdf' ? 'pdf' : 'csv'}`;
        a.click();
        URL.revokeObjectURL(url);
        this.showToast('success', `${format.toUpperCase()} export downloaded.`);
      },
      error: (e) => {
        this.exporting.set(false);
        this.showToast('error', e.error?.message || `Failed to export ${format.toUpperCase()}`);
      },
    });
  }

  previewPdf() {
    this.pdfPreviewLoading.set(true);
    const v = this.filterForm.getRawValue();
    this.gl.exportBlob(this.exportParams(v), 'pdf', true).subscribe({
      next: (blob) => {
        this.pdfPreviewLoading.set(false);
        if (blob.type && !blob.type.includes('pdf')) {
          this.showToast('error', 'Server did not return a PDF file');
          return;
        }
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank', 'noopener,noreferrer');
        setTimeout(() => URL.revokeObjectURL(url), 90_000);
      },
      error: (e) => {
        this.pdfPreviewLoading.set(false);
        this.showToast('error', e.error?.message || 'Failed to generate PDF preview');
      },
    });
  }

  private exportParams(v: ReturnType<typeof this.filterForm.getRawValue>) {
    return {
      startDate: v.startDate || undefined,
      endDate: v.endDate || undefined,
      accountId: v.accountId || undefined,
      accountType: v.accountType || undefined,
      referenceType: v.referenceType || undefined,
      search: v.search || undefined,
    };
  }

  refLabel(type: string): string {
    return REFERENCE_TYPES.find((r) => r.value === type)?.label || type;
  }

  private showToast(type: 'success' | 'error', msg: string) {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 4500);
  }
}
