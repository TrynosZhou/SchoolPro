import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CurrencyPipe, NgIf } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { NavSection } from '../../shared/portal-layout/portal-layout.component';
import { portalLink, resolveStaffPortalContext } from '../../core/utils/staff-portal.util';
import { UnlessDemoDirective } from '../../core/directives/unless-demo.directive';

interface InvoiceRow {
  id: string;
  studentId?: string;
  invoiceNumber: string;
  description: string;
  totalAmount: number;
  amountPaid: number;
  status: string;
  feeType?: string;
  dueDate: string;
  student?: {
    id?: string;
    firstName: string;
    lastName: string;
    admissionNumber: string;
    schoolClass?: { name: string } | null;
  };
}

interface PaymentRow {
  id: string;
  amount: number;
  label: string;
  feeType: string;
  paidAt: string;
  firstName: string;
  lastName: string;
}

interface CategoryCollection {
  label: string;
  collected: number;
  total: number;
  pct: number;
}

type InvoiceDisplayStatus = 'paid' | 'partial' | 'unpaid';

export interface SchoolFeeRow {
  id: string;
  code: string;
  name: string;
  description?: string;
  defaultAmount: number;
  icon?: string;
  isActive: boolean;
  sortOrder: number;
  chargeCount?: number;
}

type FeeTab = 'overview' | 'records' | 'structure' | 'invoices';

interface CategoryMeta {
  label: string;
  tone: string;
}

@Component({
  selector: 'app-admin-manage-fees',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, NgIf, CurrencyPipe, RouterLink, UnlessDemoDirective],
  templateUrl: './admin-manage-fees.component.html',
  styleUrl: './admin-manage-fees.component.scss',
})
export class AdminManageFeesComponent implements OnInit {
  private api = inject(ApiService);
  private router = inject(Router);
  private auth = inject(AuthService);

  portalTitle = 'Admin Portal';
  navSections: NavSection[] = ADMIN_NAV_SECTIONS;
  basePath = '/admin';

  fees = signal<SchoolFeeRow[]>([]);
  invoices = signal<InvoiceRow[]>([]);
  recentPayments = signal<PaymentRow[]>([]);
  loading = signal(true);
  overviewLoading = signal(false);
  invoicesLoading = signal(false);
  submitting = signal(false);
  sendingReminders = signal(false);
  previewingInvoiceId = signal<string | null>(null);
  openInvoiceMenuId = signal<string | null>(null);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);
  activeTab = signal<FeeTab>('overview');
  showCategoryModal = signal(false);
  editingId = signal<string | null>(null);

  recordSearch = signal('');
  recordStatus = signal<'all' | 'paid' | 'unpaid' | 'partial' | 'cancelled'>('all');
  recordCategory = signal<'all' | 'uncategorized' | string>('all');

  categoryForm = {
    code: '',
    name: '',
    description: '',
    defaultAmount: 0,
    icon: '📋',
    isActive: true,
    sortOrder: 0,
  };

  activeCount = computed(() => this.fees().filter((f) => f.isActive).length);
  totalCharges = computed(() => this.fees().reduce((sum, f) => sum + (f.chargeCount ?? 0), 0));
  configuredTotal = computed(() =>
    this.fees().filter((f) => f.isActive).reduce((sum, f) => sum + Number(f.defaultAmount || 0), 0),
  );

  overviewStats = computed(() => {
    const invs = this.invoices();
    const totalCollectable = invs.reduce((sum, inv) => sum + Number(inv.totalAmount || 0), 0);
    const collected = invs.reduce((sum, inv) => sum + Number(inv.amountPaid || 0), 0);
    const unpaid = Math.max(0, totalCollectable - collected);
    const unpaidCharges = invs.filter((inv) => Number(inv.totalAmount) - Number(inv.amountPaid) > 0.005).length;
    const unpaidStudents = new Set(
      invs
        .filter((inv) => Number(inv.totalAmount) - Number(inv.amountPaid) > 0.005)
        .map((inv) => inv.studentId || inv.student?.id)
        .filter(Boolean),
    ).size;
    const collectionRate = totalCollectable > 0 ? Math.round((collected / totalCollectable) * 100) : 0;
    return { totalCollectable, collected, unpaid, unpaidCharges, unpaidStudents, collectionRate };
  });

  categoryCollections = computed((): CategoryCollection[] => {
    const invs = this.invoices();
    const feeList = this.fees().length
      ? this.fees().filter((f) => f.isActive)
      : [];

    if (!feeList.length) {
      const byType = new Map<string, { collected: number; total: number }>();
      for (const inv of invs) {
        const key = inv.feeType || 'other';
        const row = byType.get(key) || { collected: 0, total: 0 };
        row.total += Number(inv.totalAmount || 0);
        row.collected += Number(inv.amountPaid || 0);
        byType.set(key, row);
      }
      return [...byType.entries()].map(([key, row]) => ({
        label: this.formatFeeTypeLabel(key),
        collected: row.collected,
        total: row.total,
        pct: row.total > 0 ? Math.min(100, (row.collected / row.total) * 100) : 0,
      }));
    }

    return feeList
      .map((fee) => {
        const matching = invs.filter(
          (inv) =>
            inv.feeType === fee.code ||
            inv.description?.toLowerCase().includes(fee.name.toLowerCase()),
        );
        const total = matching.reduce((sum, inv) => sum + Number(inv.totalAmount || 0), 0);
        const collected = matching.reduce((sum, inv) => sum + Number(inv.amountPaid || 0), 0);
        return {
          label: this.categoryMeta(fee).label,
          collected,
          total,
          pct: total > 0 ? Math.min(100, (collected / total) * 100) : 0,
        };
      })
      .sort((a, b) => b.total - a.total);
  });

  unpaidFeeRows = computed(() =>
    this.invoices()
      .filter((inv) => Number(inv.totalAmount) - Number(inv.amountPaid) > 0.005)
      .map((inv) => ({
        ...inv,
        balance: Number(inv.totalAmount) - Number(inv.amountPaid),
      }))
      .sort((a, b) => String(a.dueDate || '').localeCompare(String(b.dueDate || ''))),
  );

  feeRecordRows = computed(() => {
    const q = this.recordSearch().trim().toLowerCase();
    const statusFilter = this.recordStatus();
    const categoryFilter = this.recordCategory();

    return this.invoices()
      .map((inv) => {
        const balance = Number(inv.totalAmount) - Number(inv.amountPaid);
        const displayStatus = this.invoiceDisplayStatus(inv.status);
        const feeCategory = this.fees().find((f) => f.code === inv.feeType);
        const categoryCode = feeCategory?.code || 'uncategorized';
        const categoryLabel = feeCategory ? this.categoryMeta(feeCategory).label : 'Uncategorized';
        return { ...inv, balance, displayStatus, categoryCode, categoryLabel };
      })
      .filter((row) => {
        if (statusFilter === 'paid' && row.displayStatus !== 'paid') return false;
        if (statusFilter === 'partial' && row.displayStatus !== 'partial') return false;
        if (statusFilter === 'unpaid' && row.displayStatus !== 'unpaid') return false;
        if (statusFilter === 'cancelled' && row.status !== 'cancelled') return false;

        if (categoryFilter !== 'all') {
          if (categoryFilter === 'uncategorized' && row.categoryCode !== 'uncategorized') return false;
          if (categoryFilter !== 'uncategorized' && row.categoryCode !== categoryFilter) return false;
        }

        if (!q) return true;
        const haystack = `${row.student?.firstName || ''} ${row.student?.lastName || ''} ${
          row.student?.admissionNumber || ''
        } ${row.invoiceNumber || ''} ${row.description || ''}`.toLowerCase();
        return haystack.includes(q);
      });
  });

  readonly tabs: { id: FeeTab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'records', label: 'Fee Records' },
    { id: 'structure', label: 'Fee Structure' },
    { id: 'invoices', label: 'Invoices' },
  ];

  ngOnInit() {
    const ctx = resolveStaffPortalContext(this.router.url, this.auth.user()?.role);
    this.portalTitle = ctx.portalTitle;
    this.navSections = ctx.navSections;
    this.basePath = ctx.basePath;
    this.loadFees();
    this.loadOverview();
  }

  setTab(tab: FeeTab) {
    this.activeTab.set(tab);
    if (tab === 'overview') {
      this.loadOverview();
    } else if (tab === 'records' || tab === 'invoices') {
      this.loadInvoices();
    }
  }

  loadOverview() {
    this.overviewLoading.set(true);
    forkJoin({
      invoices: this.api.get<InvoiceRow[]>('/billing/invoices'),
      payments: this.api.get<PaymentRow[]>('/finance/recent-payments', { limit: '8' }),
    }).subscribe({
      next: (data) => {
        this.invoices.set(data.invoices);
        this.recentPayments.set(data.payments);
        this.overviewLoading.set(false);
      },
      error: () => {
        this.overviewLoading.set(false);
        this.showToast('error', 'Failed to load overview');
      },
    });
  }

  loadInvoices() {
    this.invoicesLoading.set(true);
    this.api.get<InvoiceRow[]>('/billing/invoices').subscribe({
      next: (list) => {
        this.invoices.set(list);
        this.invoicesLoading.set(false);
      },
      error: () => {
        this.invoicesLoading.set(false);
        this.showToast('error', 'Failed to load invoices');
      },
    });
  }

  invoiceDisplayStatus(status: string): InvoiceDisplayStatus {
    if (status === 'paid') return 'paid';
    if (status === 'partial') return 'partial';
    return 'unpaid';
  }

  invoiceStatusLabel(status: string): string {
    const display = this.invoiceDisplayStatus(status);
    if (display === 'paid') return 'Paid';
    if (display === 'partial') return 'Partial';
    return 'Unpaid';
  }

  previewInvoice(invoiceId: string) {
    this.openInvoiceMenuId.set(null);
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

  payFromInvoice(inv: InvoiceRow) {
    this.openInvoiceMenuId.set(null);
    const studentId = inv.studentId || inv.student?.id;
    if (!studentId) {
      this.showToast('error', 'Student not linked to this invoice');
      return;
    }
    const balance = Number(inv.totalAmount) - Number(inv.amountPaid);
    void this.router.navigate([portalLink(this.basePath, 'payment')], {
      queryParams: {
        studentId,
        invoiceId: inv.id,
        amount: balance > 0 ? balance : undefined,
        tab: 'payment',
      },
    });
  }

  toggleInvoiceMenu(invoiceId: string) {
    this.openInvoiceMenuId.update((current) => (current === invoiceId ? null : invoiceId));
  }

  closeInvoiceMenu() {
    this.openInvoiceMenuId.set(null);
  }

  downloadInvoice(inv: InvoiceRow) {
    this.openInvoiceMenuId.set(null);
    this.api.getBlob(`/billing/invoices/${inv.id}/pdf`).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `invoice-${inv.invoiceNumber || inv.id}.pdf`;
        link.click();
        URL.revokeObjectURL(url);
      },
      error: () => this.showToast('error', 'Could not download invoice PDF'),
    });
  }

  sendBulkReminders() {
    const studentIds = [
      ...new Set(
        this.unpaidFeeRows()
          .map((inv) => inv.studentId || inv.student?.id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    if (!studentIds.length) {
      this.showToast('error', 'No unpaid invoices to remind');
      return;
    }
    this.sendingReminders.set(true);
    this.api.post<{ sent: number }>('/billing/reminders/send', { studentIds }).subscribe({
      next: (r) => {
        this.sendingReminders.set(false);
        this.showToast('success', `Reminders sent to ${r.sent} families`);
      },
      error: () => {
        this.sendingReminders.set(false);
        this.showToast('error', 'Failed to send reminders');
      },
    });
  }

  loadFees() {
    this.loading.set(true);
    this.api.get<SchoolFeeRow[]>('/billing/fees', { includeUsage: 'true' }).subscribe({
      next: (list) => {
        this.fees.set(list);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.showToast('error', 'Failed to load fees');
      },
    });
  }

  openAddCategory() {
    this.editingId.set(null);
    this.categoryForm = {
      code: '',
      name: '',
      description: '',
      defaultAmount: 0,
      icon: '📋',
      isActive: true,
      sortOrder: this.fees().length,
    };
    this.showCategoryModal.set(true);
  }

  openEditCategory(fee: SchoolFeeRow) {
    this.editingId.set(fee.id);
    this.categoryForm = {
      code: fee.code,
      name: fee.name,
      description: fee.description || '',
      defaultAmount: Number(fee.defaultAmount),
      icon: fee.icon || '📋',
      isActive: fee.isActive,
      sortOrder: fee.sortOrder,
    };
    this.showCategoryModal.set(true);
  }

  closeCategoryModal() {
    this.showCategoryModal.set(false);
    this.editingId.set(null);
  }

  saveCategory() {
    if (!this.categoryForm.name.trim()) {
      this.showToast('error', 'Enter a category name');
      return;
    }

    this.submitting.set(true);
    const id = this.editingId();
    const payload = {
      ...this.categoryForm,
      name: this.categoryForm.name.trim(),
      code: this.categoryForm.code.trim() || undefined,
    };

    const request = id
      ? this.api.patch<SchoolFeeRow>(`/billing/fees/${id}`, payload)
      : this.api.post<SchoolFeeRow>('/billing/fees', payload);

    request.subscribe({
      next: () => {
        this.submitting.set(false);
        this.closeCategoryModal();
        this.showToast('success', id ? 'Category updated' : 'Category added');
        this.loadFees();
      },
      error: (err) => {
        this.submitting.set(false);
        this.showToast('error', err.error?.message || 'Failed to save category');
      },
    });
  }

  deleteFee(fee: SchoolFeeRow) {
    if (this.auth.isDemoSession()) {
      this.showToast('error', "This action isn't available in demo mode.");
      return;
    }
    if (!confirm(`Delete fee category "${fee.name}"? This cannot be undone.`)) return;
    this.api.delete<{ message: string; forced?: boolean }>(`/billing/fees/${fee.id}`).subscribe({
      next: (res) => {
        this.showToast('success', res.message || 'Category deleted');
        this.loadFees();
      },
      error: (err) => {
        if (err.status === 400 && err.error?.linked) {
          const usage = err.error.usage as { invoices: number; payments: number } | undefined;
          const linkedMsg = usage
            ? `${usage.invoices} invoice(s) and ${usage.payments} payment(s)`
            : 'other records';
          const forceMsg =
            `This fee is linked to ${linkedMsg}.\n\n` +
            'Force delete anyway? Existing invoices and payments will keep their fee code for history.';
          if (!confirm(forceMsg)) return;
          this.api.delete<{ message: string }>(`/billing/fees/${fee.id}`, { force: 'true' }).subscribe({
            next: (res) => {
              this.showToast('success', res.message || 'Category force-deleted');
              this.loadFees();
            },
            error: (forceErr) => {
              this.showToast('error', forceErr.error?.message || 'Cannot delete this category');
            },
          });
          return;
        }
        this.showToast('error', err.error?.message || 'Cannot delete this category');
      },
    });
  }

  exportFees() {
    if (this.auth.isDemoSession()) {
      this.showToast('error', "This action isn't available in demo mode.");
      return;
    }
    const rows = this.fees();
    if (!rows.length) {
      this.showToast('error', 'No fee categories to export');
      return;
    }
    const header = 'Name,Code,Default Amount,Active,Charges';
    const body = rows
      .map((f) =>
        [
          `"${f.name.replace(/"/g, '""')}"`,
          f.code,
          Number(f.defaultAmount).toFixed(2),
          f.isActive ? 'Yes' : 'No',
          f.chargeCount ?? 0,
        ].join(','),
      )
      .join('\n');
    const blob = new Blob([`${header}\n${body}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'fee-categories.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  categoryMeta(fee: SchoolFeeRow): CategoryMeta {
    const key = `${fee.code} ${fee.name}`.toLowerCase();
    if (key.includes('tuition')) return { label: 'Tuition', tone: 'tuition' };
    if (key.includes('bus') || key.includes('transport')) return { label: 'Transport', tone: 'transport' };
    if (key.includes('lab')) return { label: 'Lab', tone: 'lab' };
    if (key.includes('library')) return { label: 'Library', tone: 'library' };
    if (key.includes('sport')) return { label: 'Sports', tone: 'sports' };
    if (key.includes('trip')) return { label: 'School Trip', tone: 'trip' };
    if (key.includes('exam')) return { label: 'Exam', tone: 'exam' };
    if (key.includes('uniform')) return { label: 'Uniform', tone: 'uniform' };
    const label = fee.name.split(' ').slice(0, 2).join(' ') || 'Fee';
    return { label, tone: 'default' };
  }

  displayAmount(fee: SchoolFeeRow): string {
    const amount = Number(fee.defaultAmount);
    return amount > 0 ? `$${amount.toFixed(0)}` : '—';
  }

  chargeLabel(count?: number): string {
    const n = count ?? 0;
    return `${n} charge${n === 1 ? '' : 's'}`;
  }

  initials(first: string, last: string): string {
    return `${(first || '').charAt(0)}${(last || '').charAt(0)}`.toUpperCase() || '?';
  }

  studentSubLabel(student?: InvoiceRow['student']): string {
    if (!student) return '';
    const parts = [student.schoolClass?.name, student.admissionNumber].filter(Boolean);
    return parts.join(' · ');
  }

  paymentLabel(payment: PaymentRow): string {
    return payment.label?.trim() || this.formatFeeTypeLabel(payment.feeType);
  }

  private formatFeeTypeLabel(feeType: string): string {
    const fee = this.fees().find((f) => f.code === feeType);
    if (fee) return this.categoryMeta(fee).label;
    return feeType
      .split(/[_-]/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  private showToast(type: 'success' | 'error', msg: string) {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 4000);
  }
}
