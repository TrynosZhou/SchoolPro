import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';

interface AuditFieldChange {
  field: string;
  before: unknown;
  after: unknown;
}

interface AuditLogRow {
  id: string;
  userId: string;
  userRole: string;
  userEmail?: string;
  action: 'create' | 'update' | 'delete';
  module: string;
  recordId: string;
  recordLabel?: string;
  changes?: AuditFieldChange[];
  createdAt: string;
}

interface AuditMeta {
  modules: { id: string; label: string }[];
  loggedModules: string[];
  actions: { id: string; label: string }[];
}

interface AuditResponse {
  rows: AuditLogRow[];
  total: number;
}

@Component({
  selector: 'app-admin-audit-trail',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, DatePipe],
  templateUrl: './admin-audit-trail.component.html',
  styleUrl: './admin-audit-trail.component.scss',
})
export class AdminAuditTrailComponent implements OnInit {
  private api = inject(ApiService);

  readonly adminNav = ADMIN_NAV_SECTIONS;
  readonly pageSize = 50;

  meta = signal<AuditMeta | null>(null);
  rows = signal<AuditLogRow[]>([]);
  total = signal(0);
  offset = signal(0);
  loading = signal(true);
  error = signal<string | null>(null);
  expandedId = signal<string | null>(null);

  filters = {
    module: '',
    action: '',
    userEmail: '',
    recordId: '',
    dateFrom: '',
    dateTo: '',
  };

  pageInfo = computed(() => {
    const t = this.total();
    const off = this.offset();
    if (!t) return 'No entries';
    const from = off + 1;
    const to = Math.min(off + this.pageSize, t);
    return `${from}–${to} of ${t}`;
  });

  hasActiveFilters = computed(() =>
    Boolean(
      this.filters.module ||
        this.filters.action ||
        this.filters.userEmail.trim() ||
        this.filters.recordId.trim() ||
        this.filters.dateFrom ||
        this.filters.dateTo,
    ),
  );

  hasPrev = computed(() => this.offset() > 0);
  hasNext = computed(() => this.offset() + this.pageSize < this.total());

  ngOnInit(): void {
    this.api.get<AuditMeta>('/access-control/audit-logs/meta').subscribe({
      next: (m) => this.meta.set(m),
      error: () => this.meta.set(null),
    });
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    const params: Record<string, string> = {
      limit: String(this.pageSize),
      offset: String(this.offset()),
    };
    if (this.filters.module) params['module'] = this.filters.module;
    if (this.filters.action) params['action'] = this.filters.action;
    if (this.filters.userEmail.trim()) params['userEmail'] = this.filters.userEmail.trim();
    if (this.filters.recordId.trim()) params['recordId'] = this.filters.recordId.trim();
    if (this.filters.dateFrom) params['dateFrom'] = this.filters.dateFrom;
    if (this.filters.dateTo) params['dateTo'] = this.filters.dateTo;

    this.api.get<AuditResponse>('/access-control/audit-logs', params).subscribe({
      next: (res) => {
        this.rows.set(res.rows);
        this.total.set(res.total);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'Failed to load audit trail');
      },
    });
  }

  applyFilters(): void {
    this.offset.set(0);
    this.expandedId.set(null);
    this.load();
  }

  resetFilters(): void {
    this.filters.module = '';
    this.filters.action = '';
    this.filters.userEmail = '';
    this.filters.recordId = '';
    this.filters.dateFrom = '';
    this.filters.dateTo = '';
    this.applyFilters();
  }

  prevPage(): void {
    if (!this.hasPrev()) return;
    this.offset.update((o) => Math.max(0, o - this.pageSize));
    this.expandedId.set(null);
    this.load();
  }

  nextPage(): void {
    if (!this.hasNext()) return;
    this.offset.update((o) => o + this.pageSize);
    this.expandedId.set(null);
    this.load();
  }

  toggleExpand(id: string): void {
    this.expandedId.update((cur) => (cur === id ? null : id));
  }

  moduleLabel(moduleId: string): string {
    return this.meta()?.modules.find((m) => m.id === moduleId)?.label ?? moduleId;
  }

  actionLabel(action: string): string {
    return this.meta()?.actions.find((a) => a.id === action)?.label ?? action;
  }

  actionClass(action: string): string {
    if (action === 'create') return 'pill-create';
    if (action === 'delete') return 'pill-delete';
    return 'pill-update';
  }

  formatValue(v: unknown): string {
    if (v == null) return '—';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }

  hasChanges(row: AuditLogRow): boolean {
    return Boolean(row.changes?.length);
  }
}
