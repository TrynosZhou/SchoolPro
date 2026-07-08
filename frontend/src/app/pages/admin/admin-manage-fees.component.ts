import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { NavSection } from '../../shared/portal-layout/portal-layout.component';
import { resolveStaffPortalContext } from '../../core/utils/staff-portal.util';

export interface SchoolFeeRow {
  id: string;
  code: string;
  name: string;
  description?: string;
  defaultAmount: number;
  icon?: string;
  isActive: boolean;
  sortOrder: number;
}

@Component({
  selector: 'app-admin-manage-fees',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, DecimalPipe, RouterLink],
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

  readonly adminNav = ADMIN_NAV_SECTIONS;
  fees = signal<SchoolFeeRow[]>([]);
  loading = signal(true);
  submitting = signal(false);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);
  editingId = signal<string | null>(null);

  newFee = {
    code: '',
    name: '',
    description: '',
    defaultAmount: 0,
    icon: '📋',
    isActive: true,
    sortOrder: 0,
  };

  editFee = {
    code: '',
    name: '',
    description: '',
    defaultAmount: 0,
    icon: '',
    isActive: true,
    sortOrder: 0,
  };

  activeCount = computed(() => this.fees().filter((f) => f.isActive).length);

  ngOnInit() {
    const ctx = resolveStaffPortalContext(this.router.url, this.auth.user()?.role);
    this.portalTitle = ctx.portalTitle;
    this.navSections = ctx.navSections;
    this.basePath = ctx.basePath;
    this.loadFees();
  }

  loadFees() {
    this.loading.set(true);
    this.api.get<SchoolFeeRow[]>('/billing/fees').subscribe({
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

  addFee() {
    if (!this.newFee.name.trim()) {
      this.showToast('error', 'Enter a fee name');
      return;
    }
    this.submitting.set(true);
    this.api
      .post<SchoolFeeRow>('/billing/fees', {
        ...this.newFee,
        name: this.newFee.name.trim(),
        code: this.newFee.code.trim() || undefined,
      })
      .subscribe({
        next: () => {
          this.newFee = {
            code: '',
            name: '',
            description: '',
            defaultAmount: 0,
            icon: '📋',
            isActive: true,
            sortOrder: 0,
          };
          this.submitting.set(false);
          this.showToast('success', 'Fee added');
          this.loadFees();
        },
        error: (err) => {
          this.submitting.set(false);
          this.showToast('error', err.error?.message || 'Failed to add fee');
        },
      });
  }

  startEdit(fee: SchoolFeeRow) {
    this.editingId.set(fee.id);
    this.editFee = {
      code: fee.code,
      name: fee.name,
      description: fee.description || '',
      defaultAmount: Number(fee.defaultAmount),
      icon: fee.icon || '',
      isActive: fee.isActive,
      sortOrder: fee.sortOrder,
    };
  }

  cancelEdit() {
    this.editingId.set(null);
  }

  saveEdit() {
    const id = this.editingId();
    if (!id || !this.editFee.name.trim()) {
      this.showToast('error', 'Enter a fee name');
      return;
    }
    this.submitting.set(true);
    this.api.patch<SchoolFeeRow>(`/billing/fees/${id}`, this.editFee).subscribe({
      next: () => {
        this.submitting.set(false);
        this.editingId.set(null);
        this.showToast('success', 'Fee updated');
        this.loadFees();
      },
      error: (err) => {
        this.submitting.set(false);
        this.showToast('error', err.error?.message || 'Failed to update fee');
      },
    });
  }

  deleteFee(fee: SchoolFeeRow) {
    if (!confirm(`Delete fee "${fee.name}"? This cannot be undone.`)) return;
    this.api.delete<{ message: string; forced?: boolean }>(`/billing/fees/${fee.id}`).subscribe({
      next: (res) => {
        this.showToast('success', res.message || 'Fee deleted');
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
            'Force delete anyway? The catalog entry will be removed; existing invoices and payments will keep their fee code for history.';
          if (!confirm(forceMsg)) return;
          this.api.delete<{ message: string }>(`/billing/fees/${fee.id}`, { force: 'true' }).subscribe({
            next: (res) => {
              this.showToast('success', res.message || 'Fee force-deleted');
              this.loadFees();
            },
            error: (forceErr) => {
              this.showToast('error', forceErr.error?.message || 'Cannot delete this fee');
            },
          });
          return;
        }
        this.showToast('error', err.error?.message || 'Cannot delete this fee');
      },
    });
  }

  toggleActive(fee: SchoolFeeRow) {
    this.api.patch(`/billing/fees/${fee.id}`, { isActive: !fee.isActive }).subscribe({
      next: () => this.loadFees(),
      error: () => this.showToast('error', 'Failed to update fee status'),
    });
  }

  private showToast(type: 'success' | 'error', msg: string) {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 4000);
  }
}
