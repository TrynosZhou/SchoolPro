import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
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
import { buildClassListPdfBlob, ClassListPdfBranding } from '../../core/utils/class-list-pdf.util';
import { resolveLogoUrl } from '../../core/utils/payslip-print.util';
import { environment } from '../../../environments/environment';
import { Student } from '../../core/models';

interface ClassOption {
  id: string;
  name: string;
  capacity?: number;
  form?: { id?: string; name: string };
  students?: { id: string }[];
  studentCount?: number;
  _count?: { students?: number };
}

interface EditForm {
  firstName: string;
  lastName: string;
  gender: string;
  dateOfBirth: string;
  studentType: 'day_scholar' | 'boarder';
  classId: string;
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
  genderFilter = signal<GenderFilter>('all');
  sortOrder = signal<SortOrder>('name-asc');
  viewMode = signal<ViewMode>('table');
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  // ── Row actions (admin only) ──
  readonly canManage = !this.isTeacherPortal;
  editTarget = signal<Student | null>(null);
  deleteTarget = signal<Student | null>(null);
  saving = signal(false);
  editForm: EditForm = this.emptyEditForm();

  pdfLoading = signal(false);
  pdfPreviewOpen = signal(false);
  pdfPreviewUrl = signal<SafeResourceUrl | null>(null);
  private pdfObjectUrl: string | null = null;

  selectedClassLabel = computed(() => classDisplayName(this.classes(), this.selectedClassId));

  selectedTermLabel = computed(
    () => this.terms().find((t) => t.id === this.selectedTermId)?.name || '',
  );

  selectedClassMeta = computed(() => this.classes().find((c) => c.id === this.selectedClassId));

  visibleClasses = computed(() =>
    [...this.classes()].sort((a, b) => a.name.localeCompare(b.name)),
  );

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
      this.api
        .get<{
          assignedClasses?: ClassOption[];
          assignments?: { classId: string; className?: string; formName?: string; studentCount?: number }[];
          classTeacherOf?: { classId: string; className?: string; formName?: string; studentCount?: number }[];
        }>('/dashboard/teacher')
        .subscribe({
        next: (d) => {
          // Student counts come back on assignments / classTeacherOf, not on assignedClasses.
          const counts = new Map<string, number>();
          for (const r of [...(d.assignments ?? []), ...(d.classTeacherOf ?? [])]) {
            if (r.studentCount != null) counts.set(r.classId, Math.max(counts.get(r.classId) ?? 0, r.studentCount));
          }
          let source: ClassOption[] = d.assignedClasses ?? [];
          if (!source.length) {
            const seen = new Map<string, ClassOption>();
            for (const r of [...(d.classTeacherOf ?? []), ...(d.assignments ?? [])]) {
              if (r.classId && r.className && !seen.has(r.classId)) {
                seen.set(r.classId, { id: r.classId, name: r.className, form: r.formName ? { name: r.formName } : undefined });
              }
            }
            source = [...seen.values()];
          }
          this.classes.set(source.map((c) => ({ ...c, studentCount: c.studentCount ?? counts.get(c.id) })));
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

  /**
   * Enrolled learners in a class. The selected class uses the roster actually loaded;
   * otherwise fall back to whatever count the API supplied for that class.
   */
  classEnrollmentCount(c: ClassOption): number {
    if (c.id === this.selectedClassId && this.hasFetched()) return this.students().length;
    return c.students?.length ?? c._count?.students ?? c.studentCount ?? 0;
  }

  selectClass(classId: string): void {
    this.selectedClassId = classId;
    this.students.set([]);
    this.hasFetched.set(false);
    this.search.set('');
    this.closePdfPreview();
    this.tryAutoFetch();
  }

  fetchStudents(quiet = false): void {
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
          if (!rows.length && !quiet) {
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

  // ───────────────────────── Edit / Delete ─────────────────────────

  private emptyEditForm(): EditForm {
    return { firstName: '', lastName: '', gender: '', dateOfBirth: '', studentType: 'day_scholar', classId: '' };
  }

  private guardDemo(): boolean {
    if (this.auth.isDemoSession()) {
      this.showToast('error', "This action isn't available in demo mode.");
      return true;
    }
    return false;
  }

  openEdit(student: Student): void {
    if (!this.canManage || this.guardDemo()) return;
    this.deleteTarget.set(null);
    this.editForm = {
      firstName: student.firstName,
      lastName: student.lastName,
      gender: student.gender || '',
      dateOfBirth: student.dateOfBirth?.toString().slice(0, 10) || '',
      studentType: student.studentType === 'boarder' ? 'boarder' : 'day_scholar',
      classId: this.selectedClassId,
    };
    this.editTarget.set(student);
  }

  closeEdit(): void {
    if (this.saving()) return;
    this.editTarget.set(null);
    this.editForm = this.emptyEditForm();
  }

  /** Classes the learner can be moved to, with a note when one is full. */
  classOptionLabel(c: ClassOption): string {
    const label = classDisplayName(this.classes(), c.id) || c.name;
    if (c.id === this.selectedClassId) return `${label} (current)`;
    if (this.isClassFull(c)) return `${label} (full)`;
    return label;
  }

  isClassFull(c: ClassOption): boolean {
    return !!c.capacity && this.classEnrollmentCount(c) >= c.capacity;
  }

  saveEdit(): void {
    const student = this.editTarget();
    if (!student) return;
    const f = this.editForm;

    if (!f.firstName.trim() || !f.lastName.trim()) {
      this.showToast('error', 'First name and last name are required.');
      return;
    }
    if (!f.dateOfBirth) {
      this.showToast('error', 'Date of birth is required.');
      return;
    }
    if (!f.gender) {
      this.showToast('error', 'Select a gender.');
      return;
    }

    const movingClass = !!f.classId && f.classId !== this.selectedClassId;
    if (movingClass) {
      const target = this.classes().find((c) => c.id === f.classId);
      if (target && this.isClassFull(target)) {
        this.showToast('error', `${target.name} is at full capacity.`);
        return;
      }
    }

    const g = student.guardians?.[0];
    const guardians = g
      ? [
          {
            ...g,
            phone: g.phone || g.guardianPhone || '',
            guardianPhone: g.phone || g.guardianPhone || undefined,
            isPrimary: true,
          },
        ]
      : [];

    const body = {
      firstName: f.firstName.trim(),
      lastName: f.lastName.trim(),
      gender: f.gender,
      dateOfBirth: f.dateOfBirth,
      studentType: f.studentType,
      address: student.address || '',
      previousSchool: student.previousSchool || '',
      formId: student.formId || student.form?.id || this.selectedClassMeta()?.form?.id || '',
      guardians,
    };

    this.saving.set(true);
    this.api.put<Student>(`/students/${student.id}`, body).subscribe({
      next: () => {
        if (!movingClass) {
          this.finishEdit(`${student.admissionNumber} updated.`);
          return;
        }
        this.api.patch<Student>(`/students/${student.id}/enroll`, { classId: f.classId }).subscribe({
          next: () => {
            this.finishEdit(`${student.admissionNumber} updated and moved to another class.`);
            this.refreshClasses();
          },
          error: (e) => {
            this.saving.set(false);
            this.showToast('error', e.error?.message || 'Details saved, but the class could not be changed.');
            this.fetchStudents(true);
          },
        });
      },
      error: (e) => {
        this.saving.set(false);
        this.showToast('error', e.error?.message || 'Update failed. Try again.');
      },
    });
  }

  private finishEdit(msg: string): void {
    this.saving.set(false);
    this.editTarget.set(null);
    this.editForm = this.emptyEditForm();
    this.showToast('success', msg);
    this.fetchStudents(true);
  }

  confirmDelete(student: Student): void {
    if (!this.canManage || this.guardDemo()) return;
    this.editTarget.set(null);
    this.deleteTarget.set(student);
  }

  cancelDelete(): void {
    if (this.saving()) return;
    this.deleteTarget.set(null);
  }

  /** Takes the learner out of this class but keeps the student record. */
  removeFromClass(): void {
    const student = this.deleteTarget();
    if (!student) return;
    this.saving.set(true);
    this.api.patch<Student>(`/students/${student.id}/unenroll`, {}).subscribe({
      next: () => {
        this.saving.set(false);
        this.deleteTarget.set(null);
        this.showToast('success', `${student.firstName} ${student.lastName} removed from the class.`);
        this.fetchStudents(true);
        this.refreshClasses();
      },
      error: (e) => {
        this.saving.set(false);
        this.showToast('error', e.error?.message || 'Could not remove the student from this class.');
      },
    });
  }

  /** Permanently deletes the student record. */
  deleteStudent(): void {
    const student = this.deleteTarget();
    if (!student) return;
    this.saving.set(true);
    this.api.delete<{ message: string }>(`/students/${student.id}`).subscribe({
      next: () => {
        this.saving.set(false);
        this.deleteTarget.set(null);
        this.showToast('success', `${student.admissionNumber} deleted.`);
        this.fetchStudents(true);
        this.refreshClasses();
      },
      error: (e) => {
        this.saving.set(false);
        this.showToast('error', e.error?.message || 'Could not delete the student. Try again.');
      },
    });
  }

  private refreshClasses(): void {
    if (this.isTeacherPortal) return;
    this.api.get<ClassOption[]>('/admin/classes').subscribe({
      next: (c) => this.classes.set(c),
    });
  }

  previewPdf(): void {
    this.fetchPdfBlob(true).then((blob) => {
      if (!blob) return;
      this.revokePdfUrl();
      this.pdfObjectUrl = URL.createObjectURL(blob);
      this.pdfPreviewUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(this.pdfObjectUrl));
      this.pdfPreviewOpen.set(true);
      if (this.isMobileDevice()) {
        try {
          const w = window.open(this.pdfObjectUrl, '_blank', 'noopener,noreferrer');
          if (!w) {
            const a = document.createElement('a');
            a.href = this.pdfObjectUrl;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            document.body.appendChild(a);
            a.click();
            a.remove();
          }
        } catch {
          /* swallow — modal fallback is still open */
        }
      }
    });
  }

  openPreviewInNewTab(): void {
    const url = this.pdfObjectUrl;
    if (!url) {
      this.previewPdf();
      return;
    }
    try {
      const w = window.open(url, '_blank', 'noopener,noreferrer');
      if (!w) throw new Error('blocked');
    } catch {
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  }

  downloadPdf(): void {
    this.fetchPdfBlob(false).then((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = this.pdfFilename();
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      this.showToast('success', 'Class list PDF downloaded.');
    });
  }

  closePdfPreview(): void {
    this.pdfPreviewOpen.set(false);
    this.revokePdfUrl();
  }

  private isMobileDevice(): boolean {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    const touchCoarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    const mobileUa = /iPhone|iPod|iPad|Android|BlackBerry|IEMobile|Mobile|Silk|Opera Mini|Windows Phone/i.test(ua);
    const smallScreen = typeof window !== 'undefined' && Math.min(window.innerWidth || 0, window.innerHeight || 0) <= 900;
    return mobileUa || touchCoarse || smallScreen;
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
    return this.renderClassListPdf()
      .catch(() => this.fetchServerPdf(preview))
      .then((blob) => {
        this.pdfLoading.set(false);
        return blob;
      });
  }

  /** Builds the redesigned class list PDF in the browser. */
  private async renderClassListPdf(): Promise<Blob> {
    let branding: ClassListPdfBranding = {};
    try {
      const b = await firstValueFrom(
        this.api.get<{
          schoolName?: string;
          tagline?: string;
          logoUrl?: string;
          address?: string;
          phone?: string;
          email?: string;
        }>('/exams/school-branding'),
      );
      branding = { ...b, logoUrl: resolveLogoUrl(b.logoUrl, environment.apiUrl) };
    } catch {
      /* the PDF still renders with the default school name and a monogram crest */
    }

    return buildClassListPdfBlob({
      className: this.selectedClassLabel() || 'Class',
      termName: this.selectedTermLabel() || undefined,
      generatedAt: new Date(),
      students: this.students(),
      branding,
    });
  }

  /** Fallback: the server-rendered PDF, used only if client-side generation fails. */
  private fetchServerPdf(preview: boolean): Promise<Blob | null> {
    return new Promise((resolve) => {
      this.api
        .getBlob('/students/class-list/pdf', {
          classId: this.selectedClassId,
          termId: this.selectedTermId,
          ...(preview ? { preview: 'true' } : {}),
        })
        .subscribe({
          next: (blob) => {
            if (blob.type && !blob.type.includes('pdf')) {
              this.showToast('error', 'Could not generate class list PDF.');
              resolve(null);
              return;
            }
            resolve(blob);
          },
          error: async (e) => {
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
