import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';
import {
  Application,
  ApplicationDocumentMeta,
  ApplicationStatus,
  APPLICATION_STATUS_LABELS,
} from '../../core/models/admission';

type StatusFilter = 'all' | ApplicationStatus;

const STATUS_ORDER: ApplicationStatus[] = ['applied', 'shortlisted', 'admitted', 'rejected'];

const DOC_TYPE_LABELS: Record<string, string> = {
  birth_certificate: 'Birth certificate',
  report_card: 'Report card',
  passport_photo: 'Passport photo',
  id_copy: 'ID / passport copy',
  other: 'Document',
};

@Component({
  selector: 'app-admin-admissions',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, DatePipe],
  templateUrl: './admin-admissions.component.html',
  styleUrl: './admin-admissions.component.scss',
})
export class AdminAdmissionsComponent implements OnInit {
  private api = inject(ApiService);

  readonly adminNav = ADMIN_NAV_SECTIONS;
  readonly statusLabels = APPLICATION_STATUS_LABELS;
  readonly statusOrder = STATUS_ORDER;

  applications = signal<Application[]>([]);
  loading = signal(true);
  refreshing = signal(false);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  search = signal('');
  statusFilter = signal<StatusFilter>('all');
  classFilter = signal('all');
  dateFrom = signal('');
  dateTo = signal('');

  detail = signal<Application | null>(null);
  editStatus = signal<ApplicationStatus>('applied');
  editNote = signal('');
  savingStatus = signal(false);
  docLoadingId = signal<string | null>(null);

  stats = computed(() => {
    const rows = this.applications();
    return {
      total: rows.length,
      applied: rows.filter((a) => a.status === 'applied').length,
      shortlisted: rows.filter((a) => a.status === 'shortlisted').length,
      admitted: rows.filter((a) => a.status === 'admitted').length,
      rejected: rows.filter((a) => a.status === 'rejected').length,
    };
  });

  classOptions = computed(() => {
    const set = new Set<string>();
    for (const a of this.applications()) {
      if (a.classAppliedFor) set.add(a.classAppliedFor);
    }
    return Array.from(set).sort((x, y) => x.localeCompare(y));
  });

  visibleApplications = computed(() => {
    let rows = [...this.applications()];
    const q = this.search().trim().toLowerCase();

    if (q) {
      rows = rows.filter((a) =>
        `${a.studentFirstName} ${a.studentLastName} ${a.referenceNumber} ${a.guardianName} ${a.contactEmail} ${a.contactPhone}`
          .toLowerCase()
          .includes(q),
      );
    }

    const status = this.statusFilter();
    if (status !== 'all') rows = rows.filter((a) => a.status === status);

    const cls = this.classFilter();
    if (cls !== 'all') rows = rows.filter((a) => a.classAppliedFor === cls);

    const from = this.dateFrom();
    const to = this.dateTo();
    if (from) rows = rows.filter((a) => a.submittedAt.slice(0, 10) >= from);
    if (to) rows = rows.filter((a) => a.submittedAt.slice(0, 10) <= to);

    return rows.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  });

  hasActiveFilters = computed(
    () =>
      !!this.search() ||
      this.statusFilter() !== 'all' ||
      this.classFilter() !== 'all' ||
      !!this.dateFrom() ||
      !!this.dateTo(),
  );

  ngOnInit(): void {
    this.load();
  }

  load(isRefresh = false): void {
    if (isRefresh) this.refreshing.set(true);
    else this.loading.set(true);

    this.api.get<Application[]>('/admissions').subscribe({
      next: (rows) => {
        this.applications.set(rows || []);
        this.loading.set(false);
        this.refreshing.set(false);
      },
      error: () => {
        this.showToast('error', 'Could not load applications.');
        this.loading.set(false);
        this.refreshing.set(false);
      },
    });
  }

  clearFilters(): void {
    this.search.set('');
    this.statusFilter.set('all');
    this.classFilter.set('all');
    this.dateFrom.set('');
    this.dateTo.set('');
  }

  openDetail(app: Application): void {
    this.detail.set(app);
    this.editStatus.set(app.status);
    this.editNote.set(app.statusNote ?? '');
  }

  closeDetail(): void {
    this.detail.set(null);
    this.savingStatus.set(false);
  }

  statusLabel(status: string): string {
    return this.statusLabels[status as ApplicationStatus] ?? status;
  }

  docLabel(doc: ApplicationDocumentMeta): string {
    return DOC_TYPE_LABELS[doc.docType] ?? DOC_TYPE_LABELS['other'];
  }

  fullName(app: Application): string {
    return `${app.studentFirstName} ${app.studentLastName}`.trim();
  }

  initials(app: Application): string {
    return `${app.studentFirstName?.[0] ?? ''}${app.studentLastName?.[0] ?? ''}`.toUpperCase();
  }

  updateStatus(): void {
    const app = this.detail();
    if (!app) return;
    this.savingStatus.set(true);

    this.api
      .patch<{ status: ApplicationStatus; statusNote?: string | null; reviewedAt?: string | null }>(
        `/admissions/${app.id}/status`,
        { status: this.editStatus(), statusNote: this.editNote().trim() },
      )
      .subscribe({
        next: (res) => {
          const updated: Application = {
            ...app,
            status: res.status,
            statusNote: res.statusNote ?? null,
            reviewedAt: res.reviewedAt ?? null,
          };
          this.applications.update((rows) =>
            rows.map((r) => (r.id === app.id ? updated : r)),
          );
          this.detail.set(updated);
          this.savingStatus.set(false);
          this.showToast('success', 'Status updated. Applicant notified by email.');
        },
        error: (e) => {
          this.savingStatus.set(false);
          this.showToast('error', e.error?.message || 'Could not update status.');
        },
      });
  }

  viewDocument(app: Application, doc: ApplicationDocumentMeta): void {
    this.docLoadingId.set(doc.id);
    this.api.getBlob(`/admissions/${app.id}/documents/${doc.id}`).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        this.docLoadingId.set(null);
      },
      error: () => {
        this.docLoadingId.set(null);
        this.showToast('error', 'Could not open document.');
      },
    });
  }

  /** Public application form link, useful to share with prospective parents. */
  get publicApplyUrl(): string {
    return `${window.location.origin}/apply`;
  }

  copyApplyLink(): void {
    const url = this.publicApplyUrl;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(url)
        .then(() => this.showToast('success', 'Public application link copied.'))
        .catch(() => this.showToast('error', 'Could not copy link.'));
    } else {
      this.showToast('error', 'Copy not supported in this browser.');
    }
  }

  private showToast(type: 'success' | 'error', msg: string): void {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 4000);
  }
}
