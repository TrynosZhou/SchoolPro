import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { formatTeacherTimetableName } from '../../core/utils/teacher-display';

type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
type StatusFilter = LeaveStatus | 'all';
type LeaveType = 'annual' | 'sick' | 'maternity' | 'paternity' | 'compassionate' | 'study' | 'unpaid';

interface StaffMember {
  id: string;
  employeeNumber: string;
  title?: string | null;
  department?: string;
  isActive: boolean;
  user: { firstName: string; lastName: string; role: string };
}

interface LeaveRequest {
  id: string;
  staffId: string;
  staff?: StaffMember;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  days: number;
  reason?: string;
  status: LeaveStatus;
  reviewNote?: string;
  reviewedAt?: string;
  createdAt?: string;
}

interface BalanceRow {
  staff?: { id: string };
  leave?: { balanceDays: number; annualEntitlementDays: number };
}

interface RequestForm {
  staffId: string;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  reason: string;
  approveNow: boolean;
}

const LEAVE_TYPES: { value: LeaveType; label: string }[] = [
  { value: 'annual', label: 'Annual leave' },
  { value: 'sick', label: 'Sick leave' },
  { value: 'maternity', label: 'Maternity leave' },
  { value: 'paternity', label: 'Paternity leave' },
  { value: 'compassionate', label: 'Compassionate leave' },
  { value: 'study', label: 'Study leave' },
  { value: 'unpaid', label: 'Unpaid leave' },
];

@Component({
  selector: 'app-admin-leave-requests',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, DatePipe],
  templateUrl: './admin-leave-requests.component.html',
  styleUrl: './admin-leave-requests.component.scss',
})
export class AdminLeaveRequestsComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);

  readonly adminNav = ADMIN_NAV_SECTIONS;
  readonly leaveTypes = LEAVE_TYPES;
  readonly filters: { value: StatusFilter; label: string }[] = [
    { value: 'pending', label: 'Pending' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Rejected' },
    { value: 'cancelled', label: 'Cancelled' },
    { value: 'all', label: 'All' },
  ];

  requests = signal<LeaveRequest[]>([]);
  staff = signal<StaffMember[]>([]);
  balances = signal<Record<string, number>>({});
  loading = signal(true);
  apiMissing = signal(false);
  saving = signal(false);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  statusFilter = signal<StatusFilter>('pending');
  search = signal('');

  newOpen = signal(false);
  form: RequestForm = this.emptyForm();

  detail = signal<LeaveRequest | null>(null);
  reviewNote = '';

  private readonly today = new Date().toISOString().slice(0, 10);
  readonly todayIso = this.today;

  activeStaff = computed(() =>
    this.staff()
      .filter((s) => s.isActive)
      .sort((a, b) => a.user.lastName.localeCompare(b.user.lastName)),
  );

  stats = computed(() => {
    const rows = this.requests();
    const month = this.today.slice(0, 7);
    return {
      pending: rows.filter((r) => r.status === 'pending').length,
      approvedMonth: rows.filter((r) => r.status === 'approved' && r.startDate.slice(0, 7) === month).length,
      onLeave: rows.filter(
        (r) => r.status === 'approved' && r.startDate.slice(0, 10) <= this.today && r.endDate.slice(0, 10) >= this.today,
      ).length,
      rejected: rows.filter((r) => r.status === 'rejected').length,
    };
  });

  countFor(f: StatusFilter): number {
    return f === 'all' ? this.requests().length : this.requests().filter((r) => r.status === f).length;
  }

  filtered = computed(() => {
    const f = this.statusFilter();
    const q = this.search().trim().toLowerCase();
    return this.requests()
      .filter((r) => f === 'all' || r.status === f)
      .filter((r) => {
        if (!q) return true;
        const s = this.staffOf(r);
        return `${s?.user.firstName || ''} ${s?.user.lastName || ''} ${s?.employeeNumber || ''} ${s?.department || ''} ${r.leaveType}`
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => b.startDate.localeCompare(a.startDate));
  });

  ngOnInit(): void {
    this.load();
    this.api.get<StaffMember[]>('/admin/staff', { status: 'active' }).subscribe({
      next: (list) => this.staff.set(list),
    });
    this.api.get<BalanceRow[]>('/payroll/profiles').subscribe({
      next: (rows) => {
        const map: Record<string, number> = {};
        for (const r of rows) {
          if (r.staff?.id && r.leave) map[r.staff.id] = r.leave.balanceDays;
        }
        this.balances.set(map);
      },
      error: () => {
        /* balances are a nice-to-have */
      },
    });
  }

  load(): void {
    this.loading.set(true);
    this.api.get<LeaveRequest[]>('/leave-requests').subscribe({
      next: (rows) => {
        this.requests.set(rows);
        this.apiMissing.set(false);
        this.loading.set(false);
      },
      error: (e) => {
        this.loading.set(false);
        if (e.status === 404) {
          this.apiMissing.set(true);
          this.requests.set([]);
        } else {
          this.showToast('error', e.error?.message || 'Could not load leave requests.');
        }
      },
    });
  }

  // ── Helpers ──
  staffOf(r: LeaveRequest): StaffMember | undefined {
    return r.staff || this.staff().find((s) => s.id === r.staffId);
  }

  staffName(s?: StaffMember): string {
    if (!s) return 'Unknown staff';
    return formatTeacherTimetableName({ title: s.title, firstName: s.user.firstName, lastName: s.user.lastName });
  }

  initials(s?: StaffMember): string {
    if (!s) return '?';
    return `${(s.user.firstName || '').charAt(0)}${(s.user.lastName || '').charAt(0)}`.toUpperCase() || '?';
  }

  typeLabel(t: LeaveType): string {
    return LEAVE_TYPES.find((x) => x.value === t)?.label || t;
  }

  statusLabel(s: LeaveStatus): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  balanceFor(staffId: string): number | null {
    const b = this.balances()[staffId];
    return typeof b === 'number' ? b : null;
  }

  /** Working days (Mon–Fri) between two ISO dates, inclusive. */
  workingDays(start: string, end: string): number {
    if (!start || !end || end < start) return 0;
    const d = new Date(start + 'T00:00:00');
    const last = new Date(end + 'T00:00:00');
    let n = 0;
    while (d <= last) {
      const day = d.getDay();
      if (day !== 0 && day !== 6) n += 1;
      d.setDate(d.getDate() + 1);
    }
    return n;
  }

  formDayCount(): number {
    return this.workingDays(this.form.startDate, this.form.endDate);
  }

  formBalanceWarning(): string {
    if (this.form.leaveType !== 'annual' || !this.form.staffId) return '';
    const bal = this.balanceFor(this.form.staffId);
    const days = this.formDayCount();
    if (bal !== null && days > bal) {
      return `This is ${days} working days but the staff member only has ${bal} annual leave days available.`;
    }
    return '';
  }

  // ── New request ──
  private emptyForm(): RequestForm {
    const t = new Date().toISOString().slice(0, 10);
    return { staffId: '', leaveType: 'annual', startDate: t, endDate: t, reason: '', approveNow: false };
  }

  openNew(): void {
    if (this.guardDemo()) return;
    this.form = this.emptyForm();
    this.newOpen.set(true);
  }

  closeNew(): void {
    if (this.saving()) return;
    this.newOpen.set(false);
  }

  submitNew(): void {
    const f = this.form;
    if (!f.staffId) return this.showToast('error', 'Select a staff member.');
    if (!f.startDate || !f.endDate) return this.showToast('error', 'Choose the first and last day of leave.');
    if (f.endDate < f.startDate) return this.showToast('error', 'The last day cannot be before the first day.');
    const days = this.formDayCount();
    if (days < 1) return this.showToast('error', 'The selected dates contain no working days.');

    this.saving.set(true);
    this.api
      .post('/leave-requests', {
        staffId: f.staffId,
        leaveType: f.leaveType,
        startDate: f.startDate,
        endDate: f.endDate,
        days,
        reason: f.reason.trim() || undefined,
        status: f.approveNow ? 'approved' : 'pending',
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.newOpen.set(false);
          this.showToast('success', f.approveNow ? 'Leave recorded and approved.' : 'Leave request submitted.');
          this.load();
        },
        error: (e) => {
          this.saving.set(false);
          this.showToast('error', e.error?.message || 'Could not save the leave request.');
        },
      });
  }

  // ── Review ──
  openDetail(r: LeaveRequest): void {
    this.reviewNote = r.reviewNote || '';
    this.detail.set(r);
  }

  closeDetail(): void {
    if (this.saving()) return;
    this.detail.set(null);
    this.reviewNote = '';
  }

  review(decision: 'approved' | 'rejected'): void {
    const r = this.detail();
    if (!r || this.guardDemo()) return;
    if (decision === 'rejected' && !this.reviewNote.trim()) {
      this.showToast('error', 'Add a short reason so the staff member knows why.');
      return;
    }
    this.saving.set(true);
    this.api
      .patch(`/leave-requests/${r.id}/review`, { status: decision, note: this.reviewNote.trim() || undefined })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.detail.set(null);
          this.reviewNote = '';
          this.showToast('success', decision === 'approved' ? 'Leave approved.' : 'Leave request rejected.');
          this.load();
        },
        error: (e) => {
          this.saving.set(false);
          this.showToast('error', e.error?.message || 'Could not update the request.');
        },
      });
  }

  cancelRequest(): void {
    const r = this.detail();
    if (!r || this.guardDemo()) return;
    this.saving.set(true);
    this.api.patch(`/leave-requests/${r.id}/cancel`, {}).subscribe({
      next: () => {
        this.saving.set(false);
        this.detail.set(null);
        this.showToast('success', 'Leave request cancelled.');
        this.load();
      },
      error: (e) => {
        this.saving.set(false);
        this.showToast('error', e.error?.message || 'Could not cancel the request.');
      },
    });
  }

  private guardDemo(): boolean {
    if (this.auth.isDemoSession()) {
      this.showToast('error', "This action isn't available in demo mode.");
      return true;
    }
    return false;
  }

  private showToast(type: 'success' | 'error', msg: string): void {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 4000);
  }
}
