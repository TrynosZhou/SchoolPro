import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';

type FamilyFilter = 'all' | 'siblings' | 'nochildren' | 'noprimary';

interface LinkedStudent {
  guardianId: string;
  studentId: string;
  admissionNumber: string;
  firstName: string;
  lastName: string;
  className?: string | null;
  formName?: string | null;
  relationship: string;
  isPrimary?: boolean;
}

interface FamilyRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  linkedStudents: LinkedStudent[];
}

interface StudentMatch {
  id: string;
  admissionNumber: string;
  firstName: string;
  lastName: string;
  className: string | null;
  formName: string | null;
  alreadyLinked: boolean;
}

const RELATIONSHIPS = ['Mother', 'Father', 'Guardian', 'Grandparent', 'Sibling', 'Other'];

@Component({
  selector: 'app-admin-family-links',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, RouterLink],
  templateUrl: './admin-family-links.component.html',
  styleUrl: './admin-family-links.component.scss',
})
export class AdminFamilyLinksComponent implements OnInit {
  private api = inject(ApiService);
  readonly adminNav = ADMIN_NAV_SECTIONS;
  readonly relationships = RELATIONSHIPS;

  families = signal<FamilyRow[]>([]);
  loading = signal(true);
  loadError = signal(false);
  search = signal('');
  filter = signal<FamilyFilter>('all');
  busy = signal<string | null>(null);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  // Link-a-child panel (one open at a time)
  linkingId = signal<string | null>(null);
  linkQuery = '';
  linkRelationship = 'Mother';
  linkSearching = signal(false);
  linkResults = signal<StudentMatch[]>([]);
  linkSelected = signal<string[]>([]);
  linkSearched = signal(false);

  // Unlink confirmation: `${parentId}:${studentId}`
  confirmUnlink = signal<string | null>(null);

  readonly filters: { key: FamilyFilter; label: string }[] = [
    { key: 'all', label: 'All families' },
    { key: 'siblings', label: 'Siblings' },
    { key: 'nochildren', label: 'No children linked' },
    { key: 'noprimary', label: 'Needs primary contact' },
  ];

  /** studentId → every linked guardian (parent) of that child. */
  private byStudent = computed(() => {
    const map = new Map<string, { parentId: string; parentName: string; relationship: string; isPrimary: boolean }[]>();
    for (const f of this.families()) {
      for (const s of f.linkedStudents) {
        const list = map.get(s.studentId) ?? [];
        list.push({ parentId: f.id, parentName: `${f.firstName} ${f.lastName}`, relationship: s.relationship, isPrimary: !!s.isPrimary });
        map.set(s.studentId, list);
      }
    }
    return map;
  });

  stats = computed(() => {
    const rows = this.families();
    const students = this.byStudent();
    let noPrimary = 0;
    students.forEach((g) => {
      if (!g.some((x) => x.isPrimary)) noPrimary += 1;
    });
    return {
      parents: rows.length,
      children: students.size,
      siblingFamilies: rows.filter((f) => f.linkedStudents.length > 1).length,
      noPrimary,
    };
  });

  visible = computed(() => {
    const q = this.search().trim().toLowerCase();
    const f = this.filter();
    return this.families().filter((fam) => {
      if (f === 'siblings' && fam.linkedStudents.length < 2) return false;
      if (f === 'nochildren' && fam.linkedStudents.length > 0) return false;
      if (f === 'noprimary' && !fam.linkedStudents.some((s) => !this.hasPrimary(s.studentId))) return false;
      if (!q) return true;
      const hay = `${fam.firstName} ${fam.lastName} ${fam.email} ${fam.phone ?? ''} ${fam.linkedStudents
        .map((s) => `${s.firstName} ${s.lastName} ${s.admissionNumber}`)
        .join(' ')}`.toLowerCase();
      return hay.includes(q);
    });
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.get<FamilyRow[]>('/admin/parents', { status: 'active' }).subscribe({
      next: (rows) => {
        this.families.set(rows ?? []);
        this.loadError.set(false);
        this.loading.set(false);
      },
      error: () => {
        this.loadError.set(true);
        this.loading.set(false);
      },
    });
  }

  initials(f: FamilyRow): string {
    return `${f.firstName.charAt(0)}${f.lastName.charAt(0)}`.toUpperCase();
  }

  count(key: FamilyFilter): number {
    const rows = this.families();
    switch (key) {
      case 'all': return rows.length;
      case 'siblings': return rows.filter((f) => f.linkedStudents.length > 1).length;
      case 'nochildren': return rows.filter((f) => f.linkedStudents.length === 0).length;
      default: return rows.filter((f) => f.linkedStudents.some((s) => !this.hasPrimary(s.studentId))).length;
    }
  }

  hasPrimary(studentId: string): boolean {
    return (this.byStudent().get(studentId) ?? []).some((g) => g.isPrimary);
  }

  /** Other parents linked to the same child, e.g. "Mr Moyo (Father)". */
  coGuardians(familyId: string, studentId: string): string[] {
    return (this.byStudent().get(studentId) ?? [])
      .filter((g) => g.parentId !== familyId)
      .map((g) => `${g.parentName} (${g.relationship})`);
  }

  relOptions(current: string): string[] {
    return RELATIONSHIPS.includes(current) ? RELATIONSHIPS : [current, ...RELATIONSHIPS];
  }

  private replaceFamily(updated: FamilyRow): void {
    this.families.set(this.families().map((f) => (f.id === updated.id ? updated : f)));
  }

  // ── Primary contact & relationship ──────────────────────────
  setPrimary(f: FamilyRow, s: LinkedStudent): void {
    const next = !s.isPrimary;
    this.busy.set(`${f.id}:${s.studentId}`);
    this.api.patch<{ parent: FamilyRow }>(`/admin/parents/${f.id}/students/${s.studentId}/link`, { isPrimary: next }).subscribe({
      next: (res) => {
        // Only one primary contact per child: clear it on the other parents, then apply the server's copy.
        this.families.set(
          this.families().map((fam) =>
            fam.id === f.id
              ? res.parent
              : {
                  ...fam,
                  linkedStudents: fam.linkedStudents.map((x) => (x.studentId === s.studentId && next ? { ...x, isPrimary: false } : x)),
                },
          ),
        );
        this.busy.set(null);
        this.showToast('success', next ? `${f.firstName} ${f.lastName} is now the primary contact for ${s.firstName}.` : 'Primary contact cleared.');
      },
      error: (e) => this.fail(e, 'Could not update the primary contact.'),
    });
  }

  setRelationship(f: FamilyRow, s: LinkedStudent, relationship: string): void {
    this.busy.set(`${f.id}:${s.studentId}`);
    this.api.patch<{ parent: FamilyRow }>(`/admin/parents/${f.id}/students/${s.studentId}/link`, { relationship }).subscribe({
      next: (res) => {
        this.replaceFamily(res.parent);
        this.busy.set(null);
        this.showToast('success', 'Relationship updated.');
      },
      error: (e) => this.fail(e, 'Could not update the relationship.'),
    });
  }

  // ── Unlink ──────────────────────────────────────────────────
  unlink(f: FamilyRow, s: LinkedStudent): void {
    this.busy.set(`${f.id}:${s.studentId}`);
    this.api.delete<{ parent: FamilyRow }>(`/admin/parents/${f.id}/students/${s.studentId}/unlink`).subscribe({
      next: (res) => {
        this.replaceFamily(res.parent);
        this.busy.set(null);
        this.confirmUnlink.set(null);
        this.showToast('success', `${s.firstName} ${s.lastName} unlinked from ${f.firstName} ${f.lastName}.`);
      },
      error: (e) => this.fail(e, 'Could not unlink the student.'),
    });
  }

  // ── Link a child ────────────────────────────────────────────
  openLink(f: FamilyRow): void {
    this.confirmUnlink.set(null);
    this.linkingId.set(this.linkingId() === f.id ? null : f.id);
    this.linkQuery = '';
    this.linkResults.set([]);
    this.linkSelected.set([]);
    this.linkSearched.set(false);
    this.linkRelationship = 'Mother';
  }

  searchStudents(f: FamilyRow): void {
    const q = this.linkQuery.trim();
    if (!q) {
      this.showToast('error', 'Enter a first or last name to search.');
      return;
    }
    this.linkSearching.set(true);
    this.api.get<StudentMatch[]>(`/admin/parents/${f.id}/students/search`, { q }).subscribe({
      next: (rows) => {
        this.linkResults.set(rows ?? []);
        this.linkSelected.set([]);
        this.linkSearched.set(true);
        this.linkSearching.set(false);
      },
      error: (e) => {
        this.linkSearching.set(false);
        this.showToast('error', e?.error?.message || 'Search failed.');
      },
    });
  }

  toggleSelected(id: string): void {
    const cur = this.linkSelected();
    this.linkSelected.set(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  }

  saveLinks(f: FamilyRow): void {
    const studentIds = this.linkSelected();
    if (!studentIds.length) return;
    this.busy.set(`link:${f.id}`);
    this.api.post<{ linked: number; parent: FamilyRow }>(`/admin/parents/${f.id}/students/link`, {
      studentIds,
      relationship: this.linkRelationship,
    }).subscribe({
      next: (res) => {
        this.replaceFamily(res.parent);
        this.busy.set(null);
        this.linkingId.set(null);
        this.showToast('success', `Linked ${res.linked} ${res.linked === 1 ? 'child' : 'children'} to ${f.firstName} ${f.lastName}.`);
      },
      error: (e) => this.fail(e, 'Could not link the students.'),
    });
  }

  private fail(e: any, fallback: string): void {
    this.busy.set(null);
    this.confirmUnlink.set(null);
    this.showToast('error', e?.error?.message || fallback);
  }

  private showToast(type: 'success' | 'error', msg: string): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toast.set({ type, msg });
    this.toastTimer = setTimeout(() => this.toast.set(null), 4500);
  }
}
