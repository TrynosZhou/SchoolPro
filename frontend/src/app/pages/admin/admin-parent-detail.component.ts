import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';
import { formatStudentClassLabel } from '../../core/utils/class-display';

interface LinkedStudent {
  guardianId: string;
  studentId: string;
  admissionNumber: string;
  firstName: string;
  lastName: string;
  className: string | null;
  formName: string | null;
  relationship: string;
}

interface ParentDetail {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  isActive: boolean;
  occupation: string | null;
  address: string | null;
  receivesWhatsApp: boolean;
  linkedStudents: LinkedStudent[];
  createdAt: string;
}

interface StudentSearchRow {
  id: string;
  admissionNumber: string;
  firstName: string;
  lastName: string;
  className: string | null;
  formName: string | null;
  alreadyLinked: boolean;
}

@Component({
  selector: 'app-admin-parent-detail',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, RouterLink],
  templateUrl: './admin-parent-detail.component.html',
  styleUrl: './admin-parent-detail.component.scss',
})
export class AdminParentDetailComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly searchDebounceMs = 300;
  readonly adminNav = ADMIN_NAV_SECTIONS;

  parent = signal<ParentDetail | null>(null);
  loading = signal(true);
  searching = signal(false);
  linkingStudentId = signal<string | null>(null);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  studentSearch = signal('');
  searchResults = signal<StudentSearchRow[]>([]);
  selectedStudentIds = signal<Set<string>>(new Set());
  relationship = 'Parent';

  linkableResults = computed(() => this.searchResults().filter((s) => !s.alreadyLinked));
  selectedCount = computed(() => this.selectedStudentIds().size);

  ngOnInit() {
    this.route.paramMap.subscribe((params) => {
      const id = params.get('id');
      if (id) this.loadParent(id);
    });
  }

  ngOnDestroy() {
    if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);
  }

  onStudentSearchInput(value: string) {
    this.studentSearch.set(value);
    if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);

    const q = value.trim();
    if (!q) {
      this.searchResults.set([]);
      this.selectedStudentIds.set(new Set());
      this.searching.set(false);
      return;
    }

    this.searchDebounceTimer = setTimeout(() => {
      this.searchStudents({ silent: true });
    }, this.searchDebounceMs);
  }

  loadParent(id: string) {
    this.loading.set(true);
    this.api.get<ParentDetail>(`/admin/parents/${id}`).subscribe({
      next: (row) => {
        this.parent.set(row);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.showToast('error', 'Parent not found');
        void this.router.navigate(['/admin/parents']);
      },
    });
  }

  searchStudents(options?: { silent?: boolean; keepSelection?: boolean }) {
    const q = this.studentSearch().trim();
    const parent = this.parent();
    if (!parent) return;
    if (!q) {
      this.searchResults.set([]);
      if (!options?.keepSelection) this.selectedStudentIds.set(new Set());
      return;
    }

    this.searching.set(true);
    if (!options?.keepSelection) this.selectedStudentIds.set(new Set());
    this.api.get<StudentSearchRow[]>(`/admin/parents/${parent.id}/students/search`, { q }).subscribe({
      next: (rows) => {
        this.searchResults.set(rows);
        this.searching.set(false);
        if (!rows.length && !options?.silent) {
          this.showToast('error', 'No students matched your search.');
        }
      },
      error: (e) => {
        this.searchResults.set([]);
        this.searching.set(false);
        if (!options?.silent) {
          this.showToast('error', e.error?.message || 'Student search failed');
        }
      },
    });
  }

  isSelected(studentId: string): boolean {
    return this.selectedStudentIds().has(studentId);
  }

  toggleStudent(student: StudentSearchRow, checked: boolean) {
    if (student.alreadyLinked) return;
    this.selectedStudentIds.update((set) => {
      const next = new Set(set);
      if (checked) next.add(student.id);
      else next.delete(student.id);
      return next;
    });
  }

  toggleSelectAll(checked: boolean) {
    if (!checked) {
      this.selectedStudentIds.set(new Set());
      return;
    }
    this.selectedStudentIds.set(new Set(this.linkableResults().map((s) => s.id)));
  }

  linkStudent(student: StudentSearchRow) {
    const parent = this.parent();
    if (!parent || student.alreadyLinked) return;
    if (!this.isSelected(student.id)) {
      this.showToast('error', 'Check the student first, then click Link selected.');
      return;
    }

    this.linkingStudentId.set(student.id);
    this.api.post<{ linked: number; parent: ParentDetail }>(`/admin/parents/${parent.id}/students/link`, {
      studentIds: [student.id],
      relationship: this.relationship.trim() || 'Parent',
    }).subscribe({
      next: (res) => {
        this.linkingStudentId.set(null);
        this.parent.set(res.parent);
        this.selectedStudentIds.update((set) => {
          const next = new Set(set);
          next.delete(student.id);
          return next;
        });
        this.searchStudents({ silent: true });
        this.showToast('success', `${student.firstName} ${student.lastName} linked.`);
      },
      error: (e) => {
        this.linkingStudentId.set(null);
        this.showToast('error', e.error?.message || 'Failed to link student');
      },
    });
  }

  unlinkStudent(student: LinkedStudent) {
    const parent = this.parent();
    if (!parent) return;
    if (!confirm(`Unlink ${student.firstName} ${student.lastName} from this parent?`)) return;

    this.api.delete<{ parent: ParentDetail }>(`/admin/parents/${parent.id}/students/${student.studentId}/unlink`).subscribe({
      next: (res) => {
        this.parent.set(res.parent);
        if (this.searchResults().length) this.searchStudents({ silent: true });
        this.showToast('success', 'Student unlinked.');
      },
      error: (e) => this.showToast('error', e.error?.message || 'Failed to unlink student'),
    });
  }

  classLabel(student: { className: string | null; formName: string | null }): string {
    return formatStudentClassLabel(student.className);
  }

  private showToast(type: 'success' | 'error', msg: string) {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 4500);
  }
}
