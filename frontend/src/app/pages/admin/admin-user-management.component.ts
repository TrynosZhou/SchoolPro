import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ChangePasswordFormComponent } from '../../shared/change-password/change-password-form.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';

type PortalRole = 'director' | 'principal' | 'admin' | 'accountant' | 'teacher' | 'parent' | 'student';
type StatusFilter = 'active' | 'inactive' | 'all';
type DrawerMode = 'create' | 'edit' | null;
type SortOrder = 'name-asc' | 'name-desc' | 'role-asc' | 'newest';
type ViewMode = 'table' | 'cards';
type PageTab = 'users' | 'change-password';

interface SchoolRoleOption {
  id: string;
  name: string;
  baseRole: PortalRole;
}

interface ManagedUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  role: PortalRole;
  roleLabel: string;
  isActive: boolean;
  schoolRoleId: string | null;
  schoolRole: { id: string; name: string; baseRole: PortalRole } | null;
  failedLoginAttempts: number;
  lockedUntil: string | null;
  createdAt: string;
  staffProfile: {
    id: string;
    employeeNumber: string;
    department: string | null;
    isActive: boolean;
  } | null;
  parentProfile: { id: string } | null;
  studentProfile: {
    id: string;
    admissionNumber: string;
    firstName: string;
    lastName: string;
  } | null;
}

interface PasswordPolicy {
  minPasswordLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumber: boolean;
  requireSpecialChar: boolean;
}

@Component({
  selector: 'app-admin-user-management',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, DatePipe, RouterLink, ChangePasswordFormComponent],
  templateUrl: './admin-user-management.component.html',
  styleUrl: './admin-user-management.component.scss',
})
export class AdminUserManagementComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private route = inject(ActivatedRoute);

  readonly adminNav = ADMIN_NAV_SECTIONS;

  pageTab = signal<PageTab>('users');

  users = signal<ManagedUser[]>([]);
  schoolRoles = signal<SchoolRoleOption[]>([]);
  passwordPolicy = signal<PasswordPolicy | null>(null);

  loading = signal(true);
  submitting = signal(false);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  search = signal('');
  roleFilter = signal('');
  statusFilter = signal<StatusFilter>('active');
  lockedOnly = signal(false);
  sortOrder = signal<SortOrder>('name-asc');
  viewMode = signal<ViewMode>('table');

  drawerOpen = signal(false);
  drawerMode = signal<DrawerMode>(null);
  editingUser = signal<ManagedUser | null>(null);
  showPassword = signal(false);

  form = {
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    role: 'teacher' as PortalRole,
    schoolRoleId: '',
    department: '',
    qualification: '',
    hireDate: new Date().toISOString().split('T')[0],
    admissionNumber: '',
    linkAdmissionNumber: '',
    relationship: 'Parent',
    isActive: true,
  };

  readonly roleOptions: { value: PortalRole; label: string }[] = [
    { value: 'director', label: 'Director' },
    { value: 'principal', label: 'Principal' },
    { value: 'admin', label: 'Administrator' },
    { value: 'accountant', label: 'Accountant' },
    { value: 'teacher', label: 'Teacher' },
    { value: 'parent', label: 'Parent' },
    { value: 'student', label: 'Student' },
  ];

  stats = computed(() => {
    const list = this.users();
    return {
      total: list.length,
      active: list.filter((u) => u.isActive).length,
      locked: list.filter((u) => this.isLocked(u)).length,
      staff: list.filter((u) => ['director', 'principal', 'admin', 'accountant', 'teacher'].includes(u.role)).length,
      parents: list.filter((u) => u.role === 'parent').length,
      students: list.filter((u) => u.role === 'student').length,
    };
  });

  visibleUsers = computed(() => {
    let rows = [...this.users()];
    const q = this.search().trim().toLowerCase();

    if (this.lockedOnly()) {
      rows = rows.filter((u) => this.isLocked(u));
    }

    if (q) {
      rows = rows.filter((u) =>
        `${u.firstName} ${u.lastName} ${u.email} ${u.roleLabel} ${u.staffProfile?.employeeNumber ?? ''} ${u.studentProfile?.admissionNumber ?? ''} ${u.schoolRole?.name ?? ''}`
          .toLowerCase()
          .includes(q),
      );
    }

    const sort = this.sortOrder();
    rows.sort((a, b) => {
      if (sort === 'newest') {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      if (sort === 'role-asc') {
        return a.roleLabel.localeCompare(b.roleLabel) || a.lastName.localeCompare(b.lastName);
      }
      const nameA = `${a.lastName} ${a.firstName}`.toLowerCase();
      const nameB = `${b.lastName} ${b.firstName}`.toLowerCase();
      if (sort === 'name-desc') return nameB.localeCompare(nameA);
      return nameA.localeCompare(nameB);
    });

    return rows;
  });

  hasActiveFilters = computed(
    () =>
      Boolean(this.search().trim()) ||
      this.roleFilter() !== '' ||
      this.statusFilter() !== 'active' ||
      this.lockedOnly(),
  );

  isStaffRole = computed(() => ['director', 'principal', 'admin', 'accountant', 'teacher'].includes(this.form.role));
  isParentRole = computed(() => this.form.role === 'parent');
  isStudentRole = computed(() => this.form.role === 'student');
  isEditMode = computed(() => this.drawerMode() === 'edit');
  isEditingSelf = computed(() => {
    const editing = this.editingUser();
    const me = this.auth.user()?.id;
    return Boolean(editing && me && editing.id === me);
  });

  ngOnInit() {
    this.route.queryParamMap.subscribe((params) => {
      this.pageTab.set(params.get('tab') === 'change-password' ? 'change-password' : 'users');
    });
    this.api.get<PasswordPolicy>('/auth/password-policy').subscribe({
      next: (p) => this.passwordPolicy.set(p),
      error: () => undefined,
    });
    this.api.get<SchoolRoleOption[]>('/admin/permissions/roles').subscribe({
      next: (roles) => this.schoolRoles.set(roles),
      error: () => undefined,
    });
    this.loadUsers();
  }

  setPageTab(tab: PageTab): void {
    this.pageTab.set(tab);
    if (tab === 'users') {
      this.closeDrawer();
    }
  }

  loadUsers() {
    this.loading.set(true);
    const params: Record<string, string> = { status: this.statusFilter() };
    if (this.roleFilter()) params['role'] = this.roleFilter();

    this.api.get<ManagedUser[]>('/admin/users', params).subscribe({
      next: (rows) => {
        this.users.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.showToast('error', 'Failed to load users');
      },
    });
  }

  applyFilters() {
    this.loadUsers();
  }

  setRoleFilter(role: string) {
    this.roleFilter.set(role);
    this.applyFilters();
  }

  setStatusFilter(status: StatusFilter) {
    this.statusFilter.set(status);
    this.applyFilters();
  }

  viewLockedOnly() {
    this.lockedOnly.set(true);
    this.statusFilter.set('all');
    this.applyFilters();
  }

  clearFilters() {
    this.search.set('');
    this.roleFilter.set('');
    this.statusFilter.set('active');
    this.lockedOnly.set(false);
    this.applyFilters();
  }

  openCreate() {
    this.drawerMode.set('create');
    this.editingUser.set(null);
    this.showPassword.set(false);
    this.form = {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      password: '',
      role: 'teacher',
      schoolRoleId: '',
      department: '',
      qualification: '',
      hireDate: new Date().toISOString().split('T')[0],
      admissionNumber: '',
      linkAdmissionNumber: '',
      relationship: 'Parent',
      isActive: true,
    };
    this.drawerOpen.set(true);
  }

  openEdit(user: ManagedUser) {
    this.drawerMode.set('edit');
    this.editingUser.set(user);
    this.showPassword.set(false);
    this.form = {
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone ?? '',
      password: '',
      role: user.role,
      schoolRoleId: user.schoolRoleId ?? '',
      department: user.staffProfile?.department ?? '',
      qualification: '',
      hireDate: new Date().toISOString().split('T')[0],
      admissionNumber: user.studentProfile?.admissionNumber ?? '',
      linkAdmissionNumber: '',
      relationship: 'Parent',
      isActive: user.isActive,
    };
    this.drawerOpen.set(true);
  }

  closeDrawer() {
    this.drawerOpen.set(false);
    this.drawerMode.set(null);
    this.editingUser.set(null);
  }

  saveUser() {
    if (!this.form.firstName.trim() || !this.form.lastName.trim() || !this.form.email.trim()) {
      this.showToast('error', 'First name, last name, and email are required');
      return;
    }

    this.submitting.set(true);

    if (this.isEditMode()) {
      const user = this.editingUser()!;
      const currentUserId = this.auth.user()?.id;
      const body: Record<string, unknown> = {
        firstName: this.form.firstName.trim(),
        lastName: this.form.lastName.trim(),
        email: this.form.email.trim(),
        phone: this.form.phone.trim() || undefined,
      };
      if (user.id !== currentUserId) {
        body['isActive'] = this.form.isActive;
      } else if (!this.form.isActive) {
        this.submitting.set(false);
        this.showToast('error', 'You cannot deactivate your own account');
        return;
      }
      if (this.form.password.trim()) body['password'] = this.form.password;
      if (this.isStaffRole() && this.form.schoolRoleId) {
        body['schoolRoleId'] = this.form.schoolRoleId;
      } else if (this.isStaffRole()) {
        body['schoolRoleId'] = null;
      }
      if (user.staffProfile) {
        body['department'] = this.form.department.trim() || undefined;
        body['qualification'] = this.form.qualification.trim() || undefined;
        body['hireDate'] = this.form.hireDate || undefined;
      }

      this.api.patch<ManagedUser>(`/admin/users/${user.id}`, body).subscribe({
        next: (updated) => {
          this.users.update((list) => list.map((u) => (u.id === updated.id ? updated : u)));
          this.submitting.set(false);
          this.showToast('success', 'User updated successfully');
          this.closeDrawer();
        },
        error: (e) => {
          this.submitting.set(false);
          this.showToast('error', e?.error?.message || 'Could not update user');
        },
      });
      return;
    }

    if (!this.form.password.trim()) {
      this.submitting.set(false);
      this.showToast('error', 'Password is required for new users');
      return;
    }
    if (this.isStudentRole() && !this.form.admissionNumber.trim()) {
      this.submitting.set(false);
      this.showToast('error', 'Student ID is required for student accounts');
      return;
    }

    const body: Record<string, unknown> = {
      firstName: this.form.firstName.trim(),
      lastName: this.form.lastName.trim(),
      email: this.form.email.trim(),
      phone: this.form.phone.trim() || undefined,
      password: this.form.password,
      role: this.form.role,
    };
    if (this.isStaffRole()) {
      if (this.form.schoolRoleId) body['schoolRoleId'] = this.form.schoolRoleId;
      if (this.form.role !== 'director') {
        body['department'] = this.form.department.trim() || undefined;
        body['qualification'] = this.form.qualification.trim() || undefined;
        body['hireDate'] = this.form.hireDate || undefined;
      }
    }
    if (this.isParentRole()) {
      if (this.form.linkAdmissionNumber.trim()) {
        body['linkAdmissionNumber'] = this.form.linkAdmissionNumber.trim();
        body['relationship'] = this.form.relationship.trim() || 'Parent';
      }
    }
    if (this.isStudentRole()) {
      body['admissionNumber'] = this.form.admissionNumber.trim();
    }

    this.api.post<ManagedUser>('/admin/users', body).subscribe({
      next: (created) => {
        this.users.update((list) => [created, ...list]);
        this.submitting.set(false);
        this.showToast('success', 'User created successfully');
        this.closeDrawer();
      },
      error: (e) => {
        this.submitting.set(false);
        this.showToast('error', e?.error?.message || 'Could not create user');
      },
    });
  }

  unlockUser(user: ManagedUser) {
    this.api.post<ManagedUser>(`/admin/users/${user.id}/unlock`, {}).subscribe({
      next: (updated) => {
        this.users.update((list) => list.map((u) => (u.id === updated.id ? updated : u)));
        this.showToast('success', `${user.firstName} ${user.lastName} unlocked`);
      },
      error: (e) => this.showToast('error', e?.error?.message || 'Could not unlock user'),
    });
  }

  toggleActive(user: ManagedUser) {
    const currentUserId = this.auth.user()?.id;
    if (user.id === currentUserId) {
      this.showToast('error', 'You cannot deactivate your own account');
      return;
    }
    this.api.patch<ManagedUser>(`/admin/users/${user.id}`, { isActive: !user.isActive }).subscribe({
      next: (updated) => {
        this.users.update((list) => list.map((u) => (u.id === updated.id ? updated : u)));
        this.showToast('success', updated.isActive ? 'User activated' : 'User deactivated');
      },
      error: (e) => this.showToast('error', e?.error?.message || 'Could not update status'),
    });
  }

  isLocked(user: ManagedUser): boolean {
    if (!user.lockedUntil) return false;
    return new Date(user.lockedUntil).getTime() > Date.now();
  }

  initials(user: ManagedUser): string {
    return `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase();
  }

  profileHint(user: ManagedUser): string {
    if (user.staffProfile?.employeeNumber) return user.staffProfile.employeeNumber;
    if (user.studentProfile?.admissionNumber) return user.studentProfile.admissionNumber;
    if (user.parentProfile) return 'Parent account';
    return '—';
  }

  roleBadgeClass(role: PortalRole): string {
    return `role-${role}`;
  }

  passwordHint(): string {
    const p = this.passwordPolicy();
    if (!p) return 'Use a strong password.';
    const parts = [`At least ${p.minPasswordLength} characters`];
    if (p.requireUppercase) parts.push('uppercase');
    if (p.requireLowercase) parts.push('lowercase');
    if (p.requireNumber) parts.push('number');
    if (p.requireSpecialChar) parts.push('special character');
    return parts.join(' · ');
  }

  filteredSchoolRoles(): SchoolRoleOption[] {
    if (!this.isStaffRole()) return [];
    return this.schoolRoles().filter((r) => r.baseRole === this.form.role || !this.form.role);
  }

  private showToast(type: 'success' | 'error', msg: string) {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 4500);
  }
}
