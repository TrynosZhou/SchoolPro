import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { buildTeacherNavSections } from '../../core/config/teacher-nav';
import { AuthService } from '../../core/services/auth.service';
import { ApiService } from '../../core/services/api.service';
import { classDisplayName } from '../../core/utils/class-display';
import { Student } from '../../core/models';

interface ClassOption {
  id: string;
  name: string;
  capacity?: number;
  form?: { id?: string; name: string };
  students?: { id: string }[];
}

interface TermOption {
  id: string;
  name: string;
  isCurrent?: boolean;
}

type GenderFilter = 'all' | 'Male' | 'Female';
type SortOrder = 'name-asc' | 'name-desc' | 'id-asc';
type ViewMode = 'table' | 'cards';

@Component({
  selector: 'app-class-list',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, RouterLink, DatePipe],
  templateUrl: './class-list.component.html',
  styleUrl: './class-list.component.scss',
})
export class ClassListComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private router = inject(Router);
  private sanitizer = inject(DomSanitizer);
  private auth = inject(AuthService);

  readonly isTeacherPortal = this.router.url.startsWith('/teacher');
  portalTitle = this.isTeacherPortal ? 'Teacher Portal' : 'Admin Portal';
  pageTitle = 'Class List';

  readonly adminNav = ADMIN_NAV_SECTIONS;
  get teacherNav() {
    return buildTeacherNavSections(this.auth.user()?.permissions);
  }

  classes = signal<ClassOption[]>([]);
  terms = signal<TermOption[]>([]);
  selectedTermId = '';
  selectedClassId = '';
  students = signal<Student[]>([]);
  loadingTerms = signal(true);
  loadingClasses = signal(true);
  loadingStudents = signal(false);
  hasFetched = signal(false);
  search = signal('');
  classFormFilter = signal('all');
  genderFilter = signal<GenderFilter>('all');
  sortOrder = signal<SortOrder>('name-asc');
  viewMode = signal<ViewMode>('table');
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  pdfLoading = signal(false);
  pdfPreviewOpen = signal(false);
  pdfPreviewUrl = signal<SafeResourceUrl | null>(null);
  private pdfObjectUrl: string | null = null;

  selectedClassLabel = computed(() => classDisplayName(this.classes(), this.selectedClassId));

  selectedTermLabel = computed(
    () => this.terms().find((t) => t.id === this.selectedTermId)?.name || '',
  );

  selectedClassMeta = computed(() => this.classes().find((c) => c.id === this.selectedClassId));

  classFormOptions = computed(() => {
    const names = new Set<string>();
    for (const c of this.classes()) {
      if (c.form?.name) names.add(c.form.name);
    }
    return [...names].sort();
  });

  visibleClasses = computed(() => {
    const form = this.classFormFilter();
    if (form === 'all') return this.classes();
    return this.classes().filter((c) => c.form?.name === form);
  });

  rosterStats = computed(() => {
    const rows = this.students();
    return {
      total: rows.length,
      male: rows.filter((s) => s.gender === 'Male').length,
      female: rows.filter((s) => s.gender === 'Female').length,
    };
  });

  pdfFilename = computed(() => {
    const label = this.selectedClassLabel() || 'class';
    return `class-list-${label.replace(/[^\w\-]+/g, '-').replace(/-+/g, '-')}.pdf`;
  });

  canExportPdf = computed(() => this.hasFetched() && this.students().length > 0 && !!this.selectedClassId);

  hasActiveFilters = computed(
    () =>
      Boolean(this.search().trim()) ||
      this.genderFilter() !== 'all' ||
      this.sortOrder() !== 'name-asc',
  );

  filteredStudents = computed(() => {
    let rows = [...this.students()];
    const q = this.search().trim().toLowerCase();

    if (q) {
      rows = rows.filter((s) =>
        `${s.admissionNumber} ${s.lastName} ${s.firstName} ${s.gender || ''}`.toLowerCase().includes(q),
      );
    }

    const gender = this.genderFilter();
    if (gender !== 'all') rows = rows.filter((s) => s.gender === gender);

    const sort = this.sortOrder();
    rows.sort((a, b) => {
      if (sort === 'id-asc') return a.admissionNumber.localeCompare(b.admissionNumber);
      const nameA = `${a.lastName} ${a.firstName}`.toLowerCase();
      const nameB = `${b.lastName} ${b.firstName}`.toLowerCase();
      if (sort === 'name-desc') return nameB.localeCompare(nameA);
      return nameA.localeCompare(nameB);
    });

    return rows;
  });

  ngOnInit(): void {
    this.api.get<TermOption[]>('/exams/terms').subscribe({
      next: (terms) => {
        const ordered = [...terms].sort((a, b) => a.name.localeCompare(b.name));
        this.terms.set(ordered);
        const current = ordered.find((t) => t.isCurrent);
        if (current) this.selectedTermId = current.id;
        this.loadingTerms.set(false);
      },
      error: () => {
        this.loadingTerms.set(false);
        this.showToast('error', 'Could not load terms.');
      },
    });

    if (this.isTeacherPortal) {
      this.api.get<{ assignedClasses: ClassOption[] }>('/dashboard/teacher').subscribe({
        next: (d) => {
          this.classes.set(d.assignedClasses || []);
          this.loadingClasses.set(false);
        },
        error: () => {
          this.loadingClasses.set(false);
          this.showToast('error', 'Could not load your classes.');
        },
      });
      return;
    }

    this.api.get<ClassOption[]>('/admin/classes').subscribe({
      next: (c) => {
        this.classes.set(c);
        this.loadingClasses.set(false);
      },
      error: () => {
        this.loadingClasses.set(false);
        this.showToast('error', 'Could not load classes.');
      },
    });
  }

  ngOnDestroy(): void {
    this.revokePdfUrl();
  }

  classEnrollmentCount(c: ClassOption): number {
    return c.students?.length ?? 0;
  }

  selectClass(classId: string): void {
    this.selectedClassId = classId;
    this.students.set([]);
    this.hasFetched.set(false);
    this.search.set('');
    this.closePdfPreview();
    this.tryAutoFetch();
  }

  fetchStudents(): void {
    if (!this.selectedTermId) {
      this.showToast('error', 'Select a term first.');
      return;
    }
    if (!this.selectedClassId) {
      this.showToast('error', 'Select a class first.');
      return;
    }

    this.closePdfPreview();
    this.loadingStudents.set(true);
    this.hasFetched.set(false);
    this.api
      .get<Student[]>('/students', { classId: this.selectedClassId, enrolled: 'true', termId: this.selectedTermId })
      .subscribe({
        next: (rows) => {
          this.students.set(rows);
          this.hasFetched.set(true);
          this.loadingStudents.set(false);
          if (!rows.length) {
            this.showToast('error', 'No students enrolled in this class yet.');
          }
        },
        error: (e) => {
          this.loadingStudents.set(false);
          this.hasFetched.set(true);
          this.students.set([]);
          this.showToast('error', e.error?.message || 'Could not load students for this class.');
        },
      });
  }

  clearFilters(): void {
    this.search.set('');
    this.genderFilter.set('all');
    this.sortOrder.set('name-asc');
  }

  initials(student: Student): string {
    return `${student.firstName.charAt(0)}${student.lastName.charAt(0)}`.toUpperCase();
  }

  studentTypeLabel(type?: string): string {
    if (type === 'boarder') return 'Boarder';
    if (type === 'day_scholar') return 'Day Scholar';
    return '—';
  }

  previewPdf(): void {
    this.fetchPdfBlob(true).then((blob) => {
      if (!blob) return;
      this.revokePdfUrl();
      this.pdfObjectUrl = URL.createObjectURL(blob);
      this.pdfPreviewUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(this.pdfObjectUrl));
      this.pdfPreviewOpen.set(true);
    });
  }

  downloadPdf(): void {
    this.fetchPdfBlob(false).then((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = this.pdfFilename();
      a.click();
      URL.revokeObjectURL(url);
      this.showToast('success', 'Class list PDF downloaded.');
    });
  }

  closePdfPreview(): void {
    this.pdfPreviewOpen.set(false);
    this.revokePdfUrl();
  }

  onTermChange(): void {
    this.students.set([]);
    this.hasFetched.set(false);
    this.search.set('');
    this.closePdfPreview();
  }

  private tryAutoFetch(): void {
    // Auto-fetch disabled — roster only loads when user clicks "Load roster"
  }

  private fetchPdfBlob(preview: boolean): Promise<Blob | null> {
    if (!this.canExportPdf()) {
      this.showToast('error', 'Load students for a class before exporting PDF.');
      return Promise.resolve(null);
    }

    this.pdfLoading.set(true);
    return new Promise((resolve) => {
      this.api
        .getBlob('/students/class-list/pdf', {
          classId: this.selectedClassId,
          termId: this.selectedTermId,
          ...(preview ? { preview: 'true' } : {}),
        })
        .subscribe({
          next: (blob) => {
            this.pdfLoading.set(false);
            if (blob.type && !blob.type.includes('pdf')) {
              this.showToast('error', 'Could not generate class list PDF.');
              resolve(null);
              return;
            }
            resolve(blob);
          },
          error: async (e) => {
            this.pdfLoading.set(false);
            let msg = 'Could not generate class list PDF.';
            if (e.error instanceof Blob) {
              try {
                const body = JSON.parse(await e.error.text());
                if (body.message) msg = body.message;
              } catch {
                /* ignore */
              }
            } else if (e.error?.message) {
              msg = e.error.message;
            }
            this.showToast('error', msg);
            resolve(null);
          },
        });
    });
  }

  private revokePdfUrl(): void {
    if (this.pdfObjectUrl) {
      URL.revokeObjectURL(this.pdfObjectUrl);
      this.pdfObjectUrl = null;
    }
    this.pdfPreviewUrl.set(null);
  }

  private showToast(type: 'success' | 'error', msg: string): void {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 4000);
  }
}
