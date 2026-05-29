import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';

type Tab = 'roles' | 'users';
type PortalRole = 'director' | 'principal' | 'admin' | 'teacher' | 'parent' | 'student';

interface PermissionDef {
  key: string;
  label: string;
  description?: string;
}

interface PermissionGroup {
  id: string;
  label: string;
  permissions: PermissionDef[];
}

interface SchoolRoleRow {
  id: string;
  name: string;
  description?: string;
  baseRole: PortalRole;
  baseRoleLabel?: string;
  permissions: string[];
  isSystem: boolean;
  userCount?: number;
}

interface AssignableUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: PortalRole;
  schoolRoleId: string | null;
  schoolRole: { id: string; name: string; baseRole: PortalRole } | null;
  employeeNumber: string | null;
  permissions: string[];
}

@Component({
  selector: 'app-admin-user-permissions',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, RouterLink],
  templateUrl: './admin-user-permissions.component.html',
  styleUrl: './admin-user-permissions.component.scss',
})
export class AdminUserPermissionsComponent implements OnInit {
  private api = inject(ApiService);

  readonly adminNav = ADMIN_NAV_SECTIONS;
  portalRoleOptions = signal<{ value: PortalRole; label: string }[]>([
    { value: 'director', label: 'Director' },
    { value: 'principal', label: 'Principal' },
    { value: 'admin', label: 'Administrator' },
    { value: 'teacher', label: 'Teacher' },
    { value: 'parent', label: 'Parent' },
    { value: 'student', label: 'Student' },
  ]);

  activeTab = signal<Tab>('roles');
  loading = signal(true);
  submitting = signal(false);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  permissionGroups = signal<PermissionGroup[]>([]);
  roles = signal<SchoolRoleRow[]>([]);
  users = signal<AssignableUser[]>([]);

  editingRoleId = signal<string | null>(null);
  roleForm = {
    name: '',
    description: '',
    baseRole: 'teacher' as PortalRole,
    permissions: [] as string[],
  };

  editingUserId = signal<string | null>(null);
  userRoleId = '';

  userSearch = signal('');

  filteredUsers = computed(() => {
    const q = this.userSearch().trim().toLowerCase();
    if (!q) return this.users();
    return this.users().filter((u) =>
      `${u.firstName} ${u.lastName} ${u.email} ${u.schoolRole?.name ?? ''}`.toLowerCase().includes(q),
    );
  });

  editingRole = computed(() => this.roles().find((r) => r.id === this.editingRoleId()) ?? null);

  ngOnInit() {
    this.reload();
  }

  setTab(tab: Tab) {
    this.activeTab.set(tab);
  }

  reload() {
    this.loading.set(true);
    this.api
      .get<{ groups: PermissionGroup[]; portalRoles?: Record<string, string> }>(
        '/admin/permissions/catalog',
      )
      .subscribe({
      next: (catalog) => {
        this.permissionGroups.set(catalog.groups);
        if (catalog.portalRoles) {
          this.portalRoleOptions.set(
            Object.entries(catalog.portalRoles).map(([value, label]) => ({
              value: value as PortalRole,
              label,
            })),
          );
        }
        this.api.get<SchoolRoleRow[]>('/admin/permissions/roles').subscribe({
          next: (roles) => {
            this.roles.set(roles);
            this.api.get<AssignableUser[]>('/admin/permissions/users').subscribe({
              next: (users) => {
                this.users.set(users);
                this.loading.set(false);
              },
              error: () => {
                this.loading.set(false);
                this.showToast('error', 'Failed to load users');
              },
            });
          },
          error: () => {
            this.loading.set(false);
            this.showToast('error', 'Failed to load roles');
          },
        });
      },
      error: () => {
        this.loading.set(false);
        this.showToast('error', 'Failed to load permission catalog');
      },
    });
  }

  openNewRole() {
    this.editingRoleId.set('new');
    this.roleForm = {
      name: '',
      description: '',
      baseRole: 'teacher',
      permissions: [],
    };
  }

  openEditRole(role: SchoolRoleRow) {
    this.editingRoleId.set(role.id);
    this.roleForm = {
      name: role.name,
      description: role.description || '',
      baseRole: role.baseRole,
      permissions: [...role.permissions],
    };
  }

  closeRoleEditor() {
    this.editingRoleId.set(null);
  }

  togglePermission(key: string) {
    const set = new Set(this.roleForm.permissions);
    if (set.has(key)) set.delete(key);
    else set.add(key);
    this.roleForm.permissions = [...set];
  }

  hasPermission(key: string): boolean {
    return this.roleForm.permissions.includes(key);
  }

  selectAllInGroup(group: PermissionGroup) {
    const set = new Set(this.roleForm.permissions);
    for (const p of group.permissions) set.add(p.key);
    this.roleForm.permissions = [...set];
  }

  clearGroup(group: PermissionGroup) {
    const remove = new Set(group.permissions.map((p) => p.key));
    this.roleForm.permissions = this.roleForm.permissions.filter((k) => !remove.has(k));
  }

  saveRole() {
    const name = this.roleForm.name.trim();
    if (!name) {
      this.showToast('error', 'Role name is required');
      return;
    }
    const body = {
      name,
      description: this.roleForm.description.trim() || undefined,
      baseRole: this.roleForm.baseRole,
      permissions: this.roleForm.permissions,
    };
    this.submitting.set(true);
    const id = this.editingRoleId();
    const req =
      id === 'new'
        ? this.api.post<SchoolRoleRow>('/admin/permissions/roles', body)
        : this.api.patch<SchoolRoleRow>(`/admin/permissions/roles/${id}`, body);

    req.subscribe({
      next: () => {
        this.submitting.set(false);
        this.closeRoleEditor();
        this.reload();
        this.showToast('success', id === 'new' ? 'Role created' : 'Role updated');
      },
      error: (e) => {
        this.submitting.set(false);
        this.showToast('error', e.error?.message || 'Failed to save role');
      },
    });
  }

  deleteRole(role: SchoolRoleRow) {
    if (role.isSystem) {
      this.showToast('error', 'System roles cannot be deleted');
      return;
    }
    if (!confirm(`Delete role "${role.name}"?`)) return;
    this.api.delete(`/admin/permissions/roles/${role.id}`).subscribe({
      next: () => {
        this.reload();
        this.showToast('success', 'Role deleted');
      },
      error: (e) => this.showToast('error', e.error?.message || 'Failed to delete role'),
    });
  }

  openAssignUser(user: AssignableUser) {
    this.editingUserId.set(user.id);
    this.userRoleId = user.schoolRoleId || '';
  }

  closeAssignUser() {
    this.editingUserId.set(null);
    this.userRoleId = '';
  }

  saveUserRole() {
    const id = this.editingUserId();
    if (!id) return;
    this.submitting.set(true);
    this.api
      .patch<AssignableUser>(`/admin/permissions/users/${id}`, {
        schoolRoleId: this.userRoleId || null,
      })
      .subscribe({
        next: (updated) => {
          this.users.update((rows) => rows.map((u) => (u.id === id ? updated : u)));
          this.submitting.set(false);
          this.closeAssignUser();
          this.showToast('success', 'User permissions updated');
        },
        error: (e) => {
          this.submitting.set(false);
          this.showToast('error', e.error?.message || 'Failed to update user');
        },
      });
  }

  portalRoleLabel(role: string, fallback?: string): string {
    return (
      fallback ||
      this.portalRoleOptions().find((r) => r.value === role)?.label ||
      role
    );
  }

  private showToast(type: 'success' | 'error', msg: string) {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 4000);
  }
}
