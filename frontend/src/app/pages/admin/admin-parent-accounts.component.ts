import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AccountResetModalComponent } from '../../shared/account-reset-modal/account-reset-modal.component';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';

type StatusFilter = 'all' | 'active' | 'deactivated' | 'nochildren';

interface AccountRow {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  username?: string | null;
  phone: string | null;
  isActive: boolean;
  occupation: string | null;
  linkedStudents: { studentId: string; firstName: string; lastName: string }[];
}

@Component({
  selector: 'app-admin-parent-accounts',
  standalone: true,
  imports: [PortalLayoutComponent, AccountResetModalComponent, FormsModule],
  templateUrl: './admin-parent-accounts.component.html',
  styleUrl: './admin-parent-accounts.component.scss',
})
export class AdminParentAccountsComponent implements OnInit {
  private api = inject(ApiService);
  readonly adminNav = ADMIN_NAV_SECTIONS;

  parents = signal<AccountRow[]>([]);
  loading = signal(true);
  loadError = signal(false);
  busyId = signal<string | null>(null);
  confirmToggleId = signal<string | null>(null);
  search = signal('');
  filter = signal<StatusFilter>('all');
  resetUser = signal<{ userId: string; name: string } | null>(null);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  readonly filters: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'All accounts' },
    { key: 'active', label: 'Active' },
    { key: 'deactivated', label: 'Deactivated' },
    { key: 'nochildren', label: 'No children linked' },
  ];

  stats = computed(() => {
    const rows = this.parents();
    return {
      total: rows.length,
      active: rows.filter((p) => p.isActive).length,
      deactivated: rows.filter((p) => !p.isActive).length,
      noChildren: rows.filter((p) => p.linkedStudents.length === 0).length,
    };
  });

  visible = computed(() => {
    const q = this.search().trim().toLowerCase();
    const f = this.filter();
    return this.parents().filter((p) => {
      if (f === 'active' && !p.isActive) return false;
      if (f === 'deactivated' && p.isActive) return false;
      if (f === 'nochildren' && p.linkedStudents.length > 0) return false;
      if (!q) return true;
      return `${p.firstName} ${p.lastName} ${p.email} ${p.username ?? ''} ${p.phone ?? ''}`.toLowerCase().includes(q);
    });
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.get<AccountRow[]>('/admin/parents', { status: 'all' }).subscribe({
      next: (rows) => {
        this.parents.set(rows ?? []);
        this.loadError.set(false);
        this.loading.set(false);
      },
      error: () => {
        this.loadError.set(true);
        this.loading.set(false);
      },
    });
  }

  initials(p: AccountRow): string {
    return `${p.firstName.charAt(0)}${p.lastName.charAt(0)}`.toUpperCase();
  }

  count(key: StatusFilter): number {
    const s = this.stats();
    return key === 'all' ? s.total : key === 'active' ? s.active : key === 'deactivated' ? s.deactivated : s.noChildren;
  }

  openReset(p: AccountRow): void {
    this.confirmToggleId.set(null);
    this.resetUser.set({ userId: p.userId, name: `${p.firstName} ${p.lastName}` });
  }

  closeReset(): void {
    this.resetUser.set(null);
  }

  onResetSaved(result: { message: string }): void {
    this.showToast('success', result.message);
  }

  toggle(p: AccountRow): void {
    const next = !p.isActive;
    this.busyId.set(p.id);
    this.api.patch<AccountRow>(`/admin/parents/${p.id}`, { isActive: next }).subscribe({
      next: (updated) => {
        this.parents.set(this.parents().map((r) => (r.id === p.id ? { ...r, isActive: updated.isActive } : r)));
        this.busyId.set(null);
        this.confirmToggleId.set(null);
        this.showToast('success', `${p.firstName} ${p.lastName}'s portal access ${next ? 'activated' : 'deactivated'}.`);
      },
      error: (e) => {
        this.busyId.set(null);
        this.confirmToggleId.set(null);
        this.showToast('error', e?.error?.message || 'Could not update the account.');
      },
    });
  }

  private showToast(type: 'success' | 'error', msg: string): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toast.set({ type, msg });
    this.toastTimer = setTimeout(() => this.toast.set(null), 4500);
  }
}
