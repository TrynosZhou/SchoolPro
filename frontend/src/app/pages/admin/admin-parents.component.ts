import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';

type StatusFilter = 'active' | 'inactive' | 'all';
type LinkFilter = 'all' | 'linked' | 'unlinked';
type SortOrder = 'name-asc' | 'name-desc' | 'newest' | 'oldest';
type ViewMode = 'table' | 'cards';
type DrawerMode = 'create' | 'edit' | null;

interface LinkedStudent {
  guardianId: string;
  studentId: string;
  admissionNumber: string;
  firstName: string;
  lastName: string;
  relationship: string;
}

interface ParentRow {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  isActive: boolean;
  occupation: string | null;
  gender: string | null;
  address: string | null;
  receivesWhatsApp: boolean;
  linkedStudents: LinkedStudent[];
  createdAt: string;
}

@Component({
  selector: 'app-admin-parents',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, DatePipe, RouterLink],
  templateUrl: './admin-parents.component.html',
  styleUrl: './admin-parents.component.scss',
})
export class AdminParentsComponent implements OnInit {
  private api = inject(ApiService);
  private router = inject(Router);
  readonly adminNav = ADMIN_NAV_SECTIONS;
  readonly genderOptions: { value: string; label: string }[] = [
    { value: '', label: 'Not set' },
    { value: 'male', label: 'Male' },
    { value: 'female', label: 'Female' },
  ];

  parents = signal<ParentRow[]>([]);
  loading = signal(true);
  refreshing = signal(false);
  submitting = signal(false);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  search = signal('');
  statusFilter = signal<StatusFilter>('active');
  linkFilter = signal<LinkFilter>('all');
  whatsappOnly = signal(false);
  sortOrder = signal<SortOrder>('name-asc');
  viewMode = signal<ViewMode>('table');

  drawerOpen = signal(false);
  drawerMode = signal<DrawerMode>(null);
  editingParent = signal<ParentRow | null>(null);
  showPassword = signal(false);

  form = {
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    occupation: '',
    gender: '',
    address: '',
    receivesWhatsApp: true,
    isActive: true,
    linkAdmissionNumber: '',
    relationship: 'Parent',
  };

  stats = computed(() => {
    const rows = this.parents();
    return {
      total: rows.length,
      active: rows.filter((p) => p.isActive).length,
      linked: rows.filter((p) => p.linkedStudents.length > 0).length,
      unlinked: rows.filter((p) => p.linkedStudents.length === 0).length,
      whatsapp: rows.filter((p) => p.receivesWhatsApp).length,
    };
  });

  visibleParents = computed(() => {
    let rows = [...this.parents()];
    const q = this.search().trim().toLowerCase();

    if (q) {
      rows = rows.filter((p) =>
        `${p.firstName} ${p.lastName} ${p.email} ${p.phone ?? ''} ${p.occupation ?? ''} ${p.linkedStudents.map((s) => `${s.firstName} ${s.lastName} ${s.admissionNumber}`).join(' ')}`
          .toLowerCase()
          .includes(q),
      );
    }

    const link = this.linkFilter();
    if (link === 'linked') rows = rows.filter((p) => p.linkedStudents.length > 0);
    else if (link === 'unlinked') rows = rows.filter((p) => p.linkedStudents.length === 0);

    if (this.whatsappOnly()) rows = rows.filter((p) => p.receivesWhatsApp);

    const sort = this.sortOrder();
    rows.sort((a, b) => {
      const nameA = `${a.lastName} ${a.firstName}`.toLowerCase();
      const nameB = `${b.lastName} ${b.firstName}`.toLowerCase();
      if (sort === 'name-asc') return nameA.localeCompare(nameB);
      if (sort === 'name-desc') return nameB.localeCompare(nameA);
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      if (sort === 'newest') return dateB - dateA;
      return dateA - dateB;
    });

    return rows;
  });

  hasActiveFilters = computed(
    () =>
      Boolean(this.search().trim()) ||
      this.linkFilter() !== 'all' ||
      this.whatsappOnly(),
  );

  ngOnInit() {
    this.loadParents();
  }

  loadParents(refresh = false) {
    if (refresh) this.refreshing.set(true);
    else this.loading.set(true);

    this.api.get<ParentRow[]>('/admin/parents', { status: this.statusFilter() }).subscribe({
      next: (rows) => {
        this.parents.set(rows);
        this.loading.set(false);
        this.refreshing.set(false);
      },
      error: () => {
        this.parents.set([]);
        this.loading.set(false);
        this.refreshing.set(false);
        this.showToast('error', 'Failed to load parents');
      },
    });
  }

  setStatusFilter(status: StatusFilter) {
    this.statusFilter.set(status);
    this.loadParents();
  }

  setLinkFilter(filter: LinkFilter) {
    this.linkFilter.set(filter);
  }

  clearFilters() {
    this.search.set('');
    this.linkFilter.set('all');
    this.whatsappOnly.set(false);
    this.sortOrder.set('name-asc');
  }

  openCreate() {
    this.drawerMode.set('create');
    this.editingParent.set(null);
    this.form = {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      password: '',
      occupation: '',
      gender: '',
      address: '',
      receivesWhatsApp: true,
      isActive: true,
      linkAdmissionNumber: '',
      relationship: 'Parent',
    };
    this.showPassword.set(false);
    this.drawerOpen.set(true);
  }

  openParent(parent: ParentRow) {
    void this.router.navigate(['/admin/parents', parent.id]);
  }

  openEdit(parent: ParentRow, event?: Event) {
    event?.stopPropagation();
    this.drawerMode.set('edit');
    this.editingParent.set(parent);
    this.form = {
      firstName: parent.firstName,
      lastName: parent.lastName,
      email: parent.email,
      phone: parent.phone ?? '',
      password: '',
      occupation: parent.occupation ?? '',
      gender: parent.gender ?? '',
      address: parent.address ?? '',
      receivesWhatsApp: parent.receivesWhatsApp,
      isActive: parent.isActive,
      linkAdmissionNumber: '',
      relationship: parent.linkedStudents[0]?.relationship ?? 'Parent',
    };
    this.showPassword.set(false);
    this.drawerOpen.set(true);
  }

  closeDrawer() {
    this.drawerOpen.set(false);
    this.drawerMode.set(null);
    this.editingParent.set(null);
  }

  saveParent() {
    if (!this.form.firstName.trim() || !this.form.lastName.trim() || !this.form.email.trim()) {
      this.showToast('error', 'First name, last name, and email are required.');
      return;
    }

    this.submitting.set(true);
    const payload = {
      firstName: this.form.firstName.trim(),
      lastName: this.form.lastName.trim(),
      email: this.form.email.trim(),
      phone: this.form.phone.trim() || undefined,
      occupation: this.form.occupation.trim() || undefined,
      gender: this.form.gender.trim() || undefined,
      address: this.form.address.trim() || undefined,
      receivesWhatsApp: this.form.receivesWhatsApp,
      linkAdmissionNumber: this.form.linkAdmissionNumber.trim() || undefined,
      relationship: this.form.relationship.trim() || 'Parent',
    };

    if (this.drawerMode() === 'create') {
      this.api.post<ParentRow>('/admin/parents', {
        ...payload,
        password: this.form.password.trim() || undefined,
      }).subscribe({
        next: () => {
          this.submitting.set(false);
          this.closeDrawer();
          this.loadParents(true);
          this.showToast('success', 'Parent account created.');
        },
        error: (e) => {
          this.submitting.set(false);
          this.showToast('error', e.error?.message || 'Failed to create parent');
        },
      });
      return;
    }

    const parent = this.editingParent();
    if (!parent) return;

    this.api.patch<ParentRow>(`/admin/parents/${parent.id}`, {
      ...payload,
      isActive: this.form.isActive,
      password: this.form.password.trim() || undefined,
    }).subscribe({
      next: () => {
        this.submitting.set(false);
        this.closeDrawer();
        this.loadParents(true);
        this.showToast('success', 'Parent updated.');
      },
      error: (e) => {
        this.submitting.set(false);
        this.showToast('error', e.error?.message || 'Failed to update parent');
      },
    });
  }

  deleteParent(parent: ParentRow, event?: Event) {
    event?.stopPropagation();
    if (!confirm(`Delete ${parent.firstName} ${parent.lastName}? Their portal account will be removed.`)) return;

    this.api.delete(`/admin/parents/${parent.id}`).subscribe({
      next: () => {
        this.loadParents(true);
        this.showToast('success', 'Parent deleted.');
      },
      error: (e) => this.showToast('error', e.error?.message || 'Failed to delete parent'),
    });
  }

  initials(parent: ParentRow): string {
    return `${parent.firstName.charAt(0)}${parent.lastName.charAt(0)}`.toUpperCase();
  }

  private showToast(type: 'success' | 'error', msg: string) {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 4500);
  }
}
