import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';

type Tab = 'directory' | 'add' | 'attendance';
type StaffRole = 'teacher' | 'admin' | 'principal';
type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

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

  activeTab = signal<Tab>('directory');
  staff = signal<StaffMember[]>([]);
  loading = signal(true);
  submitting = signal(false);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  search = signal('');
  roleFilter = signal('');
  statusFilter = signal('active');
  editingStaff = signal<StaffMember | null>(null);

  nextEmployeeId = signal('');
  attendanceDate = new Date().toISOString().split('T')[0];
  attendanceMarks = signal<Record<string, AttendanceStatus>>({});

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

  filteredStaff = computed(() => {
    const q = this.search().toLowerCase();
    if (!q) return this.staff();
    return this.staff().filter((s) =>
      `${s.user.firstName} ${s.user.lastName} ${s.user.email} ${s.employeeNumber} ${s.department}`.toLowerCase().includes(q)
    );
  });

  stats = computed(() => {
    const list = this.staff();
    return {
      total: list.length,
      teachers: list.filter((s) => s.user.role === 'teacher').length,
      admins: list.filter((s) => s.user.role === 'admin').length,
      principals: list.filter((s) => s.user.role === 'principal').length,
    };
  });

  activeStaff = computed(() => this.staff().filter((s) => s.isActive));

  ngOnInit() {
    this.loadStaff();
  }

  setTab(tab: Tab) {
    this.activeTab.set(tab);
    if (tab === 'add' && !this.nextEmployeeId()) {
      this.fetchNextEmployeeId();
    }
    if (tab === 'attendance') {
      this.initAttendanceMarks();
    }
  }

  loadStaff() {
    this.loading.set(true);
    const params: Record<string, string> = { status: this.statusFilter() };
    if (this.roleFilter()) params['role'] = this.roleFilter();
    this.api.get<StaffMember[]>('/admin/staff', params).subscribe({
      next: (list) => {
        this.staff.set(list);
        this.loading.set(false);
        if (this.activeTab() === 'attendance') this.initAttendanceMarks();
      },
      error: () => {
        this.loading.set(false);
        this.showToast('error', 'Failed to load staff');
      },
    });
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
        this.resetNewForm();
        this.setTab('directory');
        this.loadStaff();
      },
      error: (e) => {
        this.submitting.set(false);
        this.showToast('error', e.error?.message || 'Failed to add staff');
      },
    });
  }

  startEdit(s: StaffMember) {
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

  toggleActive(s: StaffMember) {
    const isActive = !s.isActive;
    this.api.patch<StaffMember>(`/admin/staff/${s.id}`, { isActive }).subscribe({
      next: () => {
        this.showToast('success', isActive ? 'Staff reactivated' : 'Staff deactivated');
        this.loadStaff();
      },
      error: () => this.showToast('error', 'Status update failed'),
    });
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

  roleLabel(role: string): string {
    const map: Record<string, string> = {
      teacher: 'Teacher',
      admin: 'Administrator',
      principal: 'Principal',
    };
    return map[role] || role;
  }

  roleClass(role: string): string {
    return role;
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
  }

  private showToast(type: 'success' | 'error', msg: string) {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 4500);
  }
}
