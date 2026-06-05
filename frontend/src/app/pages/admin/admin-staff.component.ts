import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';

type Tab = 'directory' | 'attendance';
type StaffRole = 'teacher' | 'admin' | 'principal';
type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';
type ViewMode = 'table' | 'cards';
type SortKey = 'name-asc' | 'name-desc' | 'hire-desc' | 'hire-asc' | 'id-asc';

interface StaffUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role: StaffRole;
  isActive: boolean;
}

export interface StaffMember {
  id: string;
  employeeNumber: string;
  userId: string;
  department?: string;
  qualification?: string;
  hireDate?: string;
  isActive: boolean;
  createdAt: string;
  user: StaffUser;
}

interface StaffAttendanceRow {
  id?: string;
  staffId: string;
  date: string;
  status: AttendanceStatus;
  remarks?: string;
  staff?: StaffMember;
}

@Component({
  selector: 'app-admin-staff',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule],
  templateUrl: './admin-staff.component.html',
  styleUrl: './admin-staff.component.scss',
})
export class AdminStaffComponent implements OnInit {
  private api = inject(ApiService);

  readonly adminNav = ADMIN_NAV_SECTIONS;
  readonly attendanceStatuses: AttendanceStatus[] = ['present', 'late', 'absent', 'excused'];
  readonly sortOptions: { value: SortKey; label: string }[] = [
    { value: 'name-asc', label: 'Name A–Z' },
    { value: 'name-desc', label: 'Name Z–A' },
    { value: 'hire-desc', label: 'Newest hire' },
    { value: 'hire-asc', label: 'Oldest hire' },
    { value: 'id-asc', label: 'Employee ID' },
  ];

  activeTab = signal<Tab>('directory');
  staff = signal<StaffMember[]>([]);
  loading = signal(true);
  refreshing = signal(false);
  submitting = signal(false);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  search = signal('');
  roleFilter = signal('');
  statusFilter = signal('active');
  departmentFilter = signal('');
  sortBy = signal<SortKey>('name-asc');
  viewMode = signal<ViewMode>('table');

  registerDrawerOpen = signal(false);
  editingStaff = signal<StaffMember | null>(null);
  profileStaff = signal<StaffMember | null>(null);
  deactivateTarget = signal<StaffMember | null>(null);

  nextEmployeeId = signal('');
  attendanceDate = new Date().toISOString().split('T')[0];
  attendanceMarks = signal<Record<string, AttendanceStatus>>({});
  attendanceSearch = signal('');
  showInitialPassword = signal(false);

  newStaff = {
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    role: 'teacher' as StaffRole,
    department: '',
    qualification: '',
    hireDate: new Date().toISOString().split('T')[0],
  };

  editForm = {
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    role: 'teacher' as StaffRole,
    department: '',
    qualification: '',
    hireDate: '',
    password: '',
  };

  departments = computed(() => {
    const set = new Set<string>();
    for (const s of this.staff()) {
      const d = s.department?.trim();
      if (d) set.add(d);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  });

  filteredStaff = computed(() => {
    const q = this.search().toLowerCase().trim();
    const dept = this.departmentFilter();
    return this.staff().filter((s) => {
      if (dept && (s.department || '') !== dept) return false;
      if (!q) return true;
      return `${s.user.firstName} ${s.user.lastName} ${s.user.email} ${s.employeeNumber} ${s.department} ${s.qualification}`
        .toLowerCase()
        .includes(q);
    });
  });

  sortedStaff = computed(() => {
    const list = [...this.filteredStaff()];
    const sort = this.sortBy();
    list.sort((a, b) => {
      if (sort === 'id-asc') return a.employeeNumber.localeCompare(b.employeeNumber);
      if (sort === 'hire-desc') return (b.hireDate || '').localeCompare(a.hireDate || '');
      if (sort === 'hire-asc') return (a.hireDate || '').localeCompare(b.hireDate || '');
      const nameA = `${a.user.lastName} ${a.user.firstName}`.toLowerCase();
      const nameB = `${b.user.lastName} ${b.user.firstName}`.toLowerCase();
      if (sort === 'name-desc') return nameB.localeCompare(nameA);
      return nameA.localeCompare(nameB);
    });
    return list;
  });

  stats = computed(() => {
    const list = this.staff();
    const active = list.filter((s) => s.isActive);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentHires = active.filter((s) => {
      if (!s.hireDate) return false;
      return new Date(s.hireDate) >= thirtyDaysAgo;
    }).length;
    return {
      total: list.length,
      active: active.length,
      inactive: list.length - active.length,
      teachers: list.filter((s) => s.user.role === 'teacher').length,
      admins: list.filter((s) => s.user.role === 'admin').length,
      principals: list.filter((s) => s.user.role === 'principal').length,
      recentHires,
    };
  });

  hasActiveFilters = computed(
    () =>
      Boolean(this.search().trim()) ||
      Boolean(this.roleFilter()) ||
      Boolean(this.departmentFilter()) ||
      this.statusFilter() !== 'active',
  );

  activeStaff = computed(() => this.staff().filter((s) => s.isActive));

  filteredAttendanceStaff = computed(() => {
    const q = this.attendanceSearch().toLowerCase().trim();
    const list = this.activeStaff();
    if (!q) return list;
    return list.filter((s) =>
      `${s.user.firstName} ${s.user.lastName} ${s.employeeNumber} ${s.department}`.toLowerCase().includes(q),
    );
  });

  attendanceStats = computed(() => {
    const marks = this.attendanceMarks();
    const counts = { present: 0, late: 0, absent: 0, excused: 0 };
    for (const s of this.activeStaff()) {
      const st = marks[s.id] || 'present';
      counts[st] += 1;
    }
    const total = this.activeStaff().length;
    return { ...counts, total, marked: total };
  });

  ngOnInit() {
    this.loadStaff();
  }

  setTab(tab: Tab) {
    this.activeTab.set(tab);
    this.profileStaff.set(null);
    if (tab === 'attendance') {
      this.initAttendanceMarks();
    }
  }

  openRegister() {
    this.editingStaff.set(null);
    this.profileStaff.set(null);
    this.resetNewForm();
    this.registerDrawerOpen.set(true);
    this.fetchNextEmployeeId();
  }

  closeRegister() {
    this.registerDrawerOpen.set(false);
    this.resetNewForm();
  }

  loadStaff(silent = false) {
    if (silent) this.refreshing.set(true);
    else this.loading.set(true);

    const params: Record<string, string> = { status: this.statusFilter() };
    if (this.roleFilter()) params['role'] = this.roleFilter();
    const q = this.search().trim();
    if (q.length >= 2) params['search'] = q;

    this.api.get<StaffMember[]>('/admin/staff', params).subscribe({
      next: (list) => {
        this.staff.set(list);
        this.loading.set(false);
        this.refreshing.set(false);
        if (this.activeTab() === 'attendance') this.initAttendanceMarks();
      },
      error: () => {
        this.loading.set(false);
        this.refreshing.set(false);
        this.showToast('error', 'Failed to load staff');
      },
    });
  }

  refreshList() {
    this.loadStaff(true);
  }

  clearFilters() {
    this.search.set('');
    this.roleFilter.set('');
    this.departmentFilter.set('');
    this.statusFilter.set('active');
    this.loadStaff();
  }

  setRoleFilter(role: string) {
    this.roleFilter.set(this.roleFilter() === role ? '' : role);
    this.loadStaff();
  }

  setStatusFilter(status: string) {
    this.statusFilter.set(status);
    this.loadStaff();
  }

  fetchNextEmployeeId() {
    this.api.get<{ employeeNumber: string }>('/admin/staff/next-employee-id').subscribe({
      next: (r) => this.nextEmployeeId.set(r.employeeNumber),
      error: () => this.nextEmployeeId.set('EMP000001'),
    });
  }

  addStaff() {
    if (!this.newStaff.firstName || !this.newStaff.lastName || !this.newStaff.email) {
      this.showToast('error', 'First name, last name, and email are required');
      return;
    }
    this.submitting.set(true);
    this.api.post<StaffMember>('/admin/staff', this.newStaff).subscribe({
      next: () => {
        this.submitting.set(false);
        this.showToast('success', 'Staff member added');
        this.closeRegister();
        this.loadStaff();
      },
      error: (e) => {
        this.submitting.set(false);
        this.showToast('error', e.error?.message || 'Failed to add staff');
      },
    });
  }

  addFormProgress(): number {
    const checks = [
      Boolean(this.newStaff.firstName?.trim()),
      Boolean(this.newStaff.lastName?.trim()),
      Boolean(this.newStaff.email?.trim()),
      Boolean(this.newStaff.role),
      Boolean(this.newStaff.hireDate),
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }

  roleHint(): string {
    if (this.newStaff.role === 'principal') {
      return 'Principal account selected. Use an institutional email for secure access.';
    }
    if (this.newStaff.role === 'admin') {
      return 'Administrator account selected. This role can manage operations and records.';
    }
    return 'Teacher account selected. This role is focused on academics and class workflows.';
  }

  toggleInitialPasswordVisibility(): void {
    this.showInitialPassword.update((v) => !v);
  }

  openProfile(s: StaffMember) {
    this.profileStaff.set(s);
  }

  closeProfile() {
    this.profileStaff.set(null);
  }

  startEdit(s: StaffMember) {
    this.registerDrawerOpen.set(false);
    this.profileStaff.set(null);
    this.editingStaff.set(s);
    this.editForm = {
      firstName: s.user.firstName,
      lastName: s.user.lastName,
      email: s.user.email,
      phone: s.user.phone || '',
      role: s.user.role,
      department: s.department || '',
      qualification: s.qualification || '',
      hireDate: s.hireDate || '',
      password: '',
    };
  }

  cancelEdit() {
    this.editingStaff.set(null);
  }

  saveEdit() {
    const staff = this.editingStaff();
    if (!staff) return;
    this.submitting.set(true);
    const { password, ...body } = this.editForm;
    const payload = password ? { ...body, password } : body;
    this.api.patch<StaffMember>(`/admin/staff/${staff.id}`, payload).subscribe({
      next: () => {
        this.submitting.set(false);
        this.editingStaff.set(null);
        this.showToast('success', 'Staff updated');
        this.loadStaff();
      },
      error: (e) => {
        this.submitting.set(false);
        this.showToast('error', e.error?.message || 'Update failed');
      },
    });
  }

  requestDeactivate(s: StaffMember) {
    if (!s.isActive) {
      this.toggleActive(s);
      return;
    }
    this.deactivateTarget.set(s);
  }

  cancelDeactivate() {
    this.deactivateTarget.set(null);
  }

  confirmDeactivate() {
    const s = this.deactivateTarget();
    if (!s) return;
    this.deactivateTarget.set(null);
    this.toggleActive(s);
  }

  toggleActive(s: StaffMember) {
    const isActive = !s.isActive;
    this.api.patch<StaffMember>(`/admin/staff/${s.id}`, { isActive }).subscribe({
      next: () => {
        this.showToast('success', isActive ? 'Staff reactivated' : 'Staff deactivated');
        this.profileStaff.set(null);
        this.loadStaff();
      },
      error: () => this.showToast('error', 'Status update failed'),
    });
  }

  copyEmail(email: string) {
    void navigator.clipboard.writeText(email).then(
      () => this.showToast('success', 'Email copied to clipboard'),
      () => this.showToast('error', 'Could not copy email'),
    );
  }

  exportCsv() {
    const rows = this.sortedStaff();
    if (!rows.length) {
      this.showToast('error', 'No staff to export');
      return;
    }
    const header = ['Employee ID', 'First Name', 'Last Name', 'Email', 'Phone', 'Role', 'Department', 'Qualification', 'Hire Date', 'Status'];
    const lines = rows.map((s) =>
      [
        s.employeeNumber,
        s.user.firstName,
        s.user.lastName,
        s.user.email,
        s.user.phone || '',
        this.roleLabel(s.user.role),
        s.department || '',
        s.qualification || '',
        s.hireDate || '',
        s.isActive ? 'Active' : 'Inactive',
      ]
        .map((c) => `"${String(c).replace(/"/g, '""')}"`)
        .join(','),
    );
    const csv = [header.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `staff-directory-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    this.showToast('success', `Exported ${rows.length} staff records`);
  }

  initAttendanceMarks() {
    const marks: Record<string, AttendanceStatus> = {};
    for (const s of this.staff().filter((x) => x.isActive)) {
      marks[s.id] = 'present';
    }
    this.attendanceMarks.set(marks);
    this.loadAttendanceForDate();
  }

  loadAttendanceForDate() {
    this.api.get<StaffAttendanceRow[]>('/attendance/staff', { date: this.attendanceDate }).subscribe({
      next: (records) => {
        const marks = { ...this.attendanceMarks() };
        for (const r of records) {
          marks[r.staffId] = r.status;
        }
        this.attendanceMarks.set(marks);
      },
    });
  }

  setAttendance(staffId: string, status: AttendanceStatus) {
    this.attendanceMarks.set({ ...this.attendanceMarks(), [staffId]: status });
  }

  markAllAttendance(status: AttendanceStatus) {
    const marks = { ...this.attendanceMarks() };
    for (const s of this.activeStaff()) {
      marks[s.id] = status;
    }
    this.attendanceMarks.set(marks);
  }

  saveAttendance() {
    const activeStaff = this.staff().filter((s) => s.isActive);
    const records = activeStaff.map((s) => ({
      staffId: s.id,
      status: this.attendanceMarks()[s.id] || 'present',
    }));
    this.submitting.set(true);
    this.api.post('/attendance/staff/bulk', { date: this.attendanceDate, records }).subscribe({
      next: () => {
        this.submitting.set(false);
        this.showToast('success', `Attendance saved for ${this.attendanceDate}`);
      },
      error: () => {
        this.submitting.set(false);
        this.showToast('error', 'Failed to save attendance');
      },
    });
  }

  fullName(s: StaffMember): string {
    return `${s.user.firstName} ${s.user.lastName}`;
  }

  initials(s: StaffMember): string {
    return `${(s.user.firstName || '').charAt(0)}${(s.user.lastName || '').charAt(0)}`.toUpperCase() || '?';
  }

  roleLabel(role: string): string {
    const map: Record<string, string> = {
      teacher: 'Teacher',
      admin: 'Administrator',
      principal: 'Principal',
    };
    return map[role] || role;
  }

  attendanceLabel(status: AttendanceStatus): string {
    const map: Record<AttendanceStatus, string> = {
      present: 'Present',
      late: 'Late',
      absent: 'Absent',
      excused: 'Excused',
    };
    return map[status];
  }

  resetNewForm() {
    this.newStaff = {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      password: '',
      role: 'teacher',
      department: '',
      qualification: '',
      hireDate: new Date().toISOString().split('T')[0],
    };
    this.nextEmployeeId.set('');
    this.showInitialPassword.set(false);
  }

  private showToast(type: 'success' | 'error', msg: string) {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 4500);
  }
}
