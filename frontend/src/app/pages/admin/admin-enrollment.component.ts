import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { TEACHER_NAV_SECTIONS } from '../../core/config/teacher-nav';
import { ApiService } from '../../core/services/api.service';
import { classSelectLabel, formatGenderLabel, formatStudentClassLabel } from '../../core/utils/class-display';
import { Student } from '../../core/models';

interface ClassOption {
  id: string;
  name: string;
  capacity: number;
  formId?: string;
  form?: { id?: string; name: string };
  students?: { id: string }[];
}

type EnrollmentView = 'pending' | 'enrolled';
type SortOrder = 'name-asc' | 'name-desc' | 'id-asc' | 'class-asc';
type EnrolledViewMode = 'table' | 'cards';

@Component({
  selector: 'app-admin-enrollment',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, RouterLink, DatePipe],
  templateUrl: './admin-enrollment.component.html',
  styleUrl: './admin-enrollment.component.scss',
})
export class AdminEnrollmentComponent implements OnInit {
  private api = inject(ApiService);
  private router = inject(Router);

  portalTitle = 'Admin Portal';
  pageTitle = 'Class Enrollment';
  studentsLink = '/admin/students';

  readonly adminNav = ADMIN_NAV_SECTIONS;
  readonly teacherNav = TEACHER_NAV_SECTIONS;
  readonly classSelectLabel = classSelectLabel;

  view = signal<EnrollmentView>('pending');
  pendingStudents = signal<Student[]>([]);
  enrolledStudents = signal<Student[]>([]);
  classes = signal<ClassOption[]>([]);
  search = signal('');
  formFilter = signal('all');
  sortOrder = signal<SortOrder>('name-asc');
  enrolledViewMode = signal<EnrolledViewMode>('table');
  selectedClassId = signal<Record<string, string>>({});
  submitting = signal<string | null>(null);
  loading = signal(true);
  refreshing = signal(false);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  stats = computed(() => {
    const classRows = this.classRows();
    const fullClasses = classRows.filter((c) => this.classUsage(c).isFull).length;
    return {
      pending: this.pendingStudents().length,
      enrolled: this.enrolledStudents().length,
      total: this.pendingStudents().length + this.enrolledStudents().length,
      classes: classRows.length,
      fullClasses,
      openSeats: classRows.reduce((sum, c) => sum + Math.max(0, c.capacity - (c.students?.length ?? 0)), 0),
    };
  });

  formOptions = computed(() => {
    const names = new Set<string>();
    for (const s of [...this.pendingStudents(), ...this.enrolledStudents()]) {
      const name = s.form?.name || s.schoolClass?.form?.name;
      if (name) names.add(name);
    }
    return [...names].sort();
  });

  visiblePending = computed(() => this.filterAndSortStudents(this.pendingStudents()));
  visibleEnrolled = computed(() => this.filterAndSortStudents(this.enrolledStudents(), true));

  hasActiveFilters = computed(
    () => Boolean(this.search().trim()) || this.formFilter() !== 'all' || this.sortOrder() !== 'name-asc',
  );

  ngOnInit() {
    if (this.router.url.startsWith('/teacher')) {
      this.portalTitle = 'Teacher Portal';
      this.studentsLink = '/teacher';
    }
    this.load();
    this.api.get<ClassOption[]>('/admin/classes').subscribe({
      next: (c) => this.classes.set(this.asClassArray(c)),
      error: () => this.showToast('error', 'Could not load classes'),
    });
  }

  setView(v: EnrollmentView) {
    this.view.set(v);
  }

  load(refresh = false) {
    if (refresh) this.refreshing.set(true);
    else this.loading.set(true);

    let pendingDone = false;
    let enrolledDone = false;

    const finish = () => {
      if (pendingDone && enrolledDone) {
        this.loading.set(false);
        this.refreshing.set(false);
      }
    };

    this.api.get<Student[]>('/students', { unenrolled: 'true' }).subscribe({
      next: (s) => {
        this.pendingStudents.set(this.asStudentArray(s));
        pendingDone = true;
        finish();
      },
      error: () => {
        this.pendingStudents.set([]);
        pendingDone = true;
        finish();
        this.showToast('error', 'Failed to load pending students');
      },
    });

    this.api.get<Student[]>('/students', { enrolled: 'true' }).subscribe({
      next: (s) => {
        this.enrolledStudents.set(this.asStudentArray(s));
        enrolledDone = true;
        finish();
      },
      error: () => {
        this.enrolledStudents.set([]);
        enrolledDone = true;
        finish();
        this.showToast('error', 'Failed to load enrolled students');
      },
    });
  }

  clearFilters() {
    this.search.set('');
    this.formFilter.set('all');
    this.sortOrder.set('name-asc');
  }

  classLabel(c: ClassOption): string {
    const usage = this.classUsage(c);
    return `${classSelectLabel(c)}${c.form?.name ? ` · ${c.form.name}` : ''} — ${usage.count}/${c.capacity}`;
  }

  classUsage(c: ClassOption) {
    const count = c.students?.length ?? 0;
    const capacity = c.capacity || 0;
    const pct = capacity ? Math.min(100, Math.round((count / capacity) * 100)) : 0;
    return { count, capacity, pct, isFull: capacity > 0 && count >= capacity };
  }

  classesForStudent(student: Student): ClassOption[] {
    const all = this.classRows();
    const formName = student.form?.name || student.schoolClass?.form?.name;
    if (!formName) return all;
    const matched = all.filter((c) => c.form?.name === formName);
    return matched.length ? matched : all;
  }

  formLabel(student: Student): string {
    return student.form?.name || student.schoolClass?.form?.name || '—';
  }

  initials(student: Student): string {
    return `${student.firstName.charAt(0)}${student.lastName.charAt(0)}`.toUpperCase();
  }

  enroll(student: Student) {
    const classId = this.selectedClassId()[student.id];
    if (!classId) {
      this.showToast('error', 'Select a class first');
      return;
    }

    const selected = this.classRows().find((c) => c.id === classId);
    if (selected && this.classUsage(selected).isFull) {
      this.showToast('error', `${selected.name} is at full capacity`);
      return;
    }

    this.submitting.set(student.id);
    this.api.patch<Student>(`/students/${student.id}/enroll`, { classId }).subscribe({
      next: () => {
        this.submitting.set(null);
        this.showToast('success', `${student.firstName} enrolled successfully`);
        this.load(true);
        const map = { ...this.selectedClassId() };
        delete map[student.id];
        this.selectedClassId.set(map);
        this.api.get<ClassOption[]>('/admin/classes').subscribe({
          next: (c) => this.classes.set(this.asClassArray(c)),
        });
      },
      error: (e) => {
        this.submitting.set(null);
        this.showToast('error', e.error?.message || 'Enrollment failed');
      },
    });
  }

  changeClass(student: Student, classId: string) {
    if (!classId || classId === student.classId) return;

    const selected = this.classRows().find((c) => c.id === classId);
    if (selected && this.classUsage(selected).isFull) {
      this.showToast('error', `${selected.name} is at full capacity`);
      return;
    }

    this.submitting.set(student.id);
    this.api.patch<Student>(`/students/${student.id}/enroll`, { classId }).subscribe({
      next: () => {
        this.submitting.set(null);
        this.showToast('success', 'Class updated');
        this.load(true);
        this.api.get<ClassOption[]>('/admin/classes').subscribe({
          next: (c) => this.classes.set(this.asClassArray(c)),
        });
      },
      error: () => {
        this.submitting.set(null);
        this.showToast('error', 'Failed to update class');
      },
    });
  }

  unenroll(student: Student) {
    if (!confirm(`Remove ${student.firstName} ${student.lastName} from their class?`)) return;
    this.submitting.set(student.id);
    this.api.patch<Student>(`/students/${student.id}/unenroll`, {}).subscribe({
      next: () => {
        this.submitting.set(null);
        this.showToast('success', 'Student moved to pending enrollment');
        this.load(true);
        this.api.get<ClassOption[]>('/admin/classes').subscribe({
          next: (c) => this.classes.set(this.asClassArray(c)),
        });
      },
      error: () => {
        this.submitting.set(null);
        this.showToast('error', 'Failed to unenroll');
      },
    });
  }

  onClassPick(studentId: string, classId: string) {
    this.selectedClassId.set({ ...this.selectedClassId(), [studentId]: classId });
  }

  private filterAndSortStudents(rows: Student[], includeClass = false): Student[] {
    let list = [...rows];
    const q = this.search().trim().toLowerCase();

    if (q) {
      list = list.filter((s) =>
        `${s.firstName} ${s.lastName} ${s.admissionNumber} ${s.schoolClass?.name ?? ''} ${s.form?.name ?? ''}`
          .toLowerCase()
          .includes(q),
      );
    }

    const form = this.formFilter();
    if (form !== 'all') {
      list = list.filter((s) => (s.form?.name || s.schoolClass?.form?.name) === form);
    }

    const sort = this.sortOrder();
    list.sort((a, b) => {
      if (sort === 'class-asc' && includeClass) {
        const classA = a.schoolClass?.name || '';
        const classB = b.schoolClass?.name || '';
        return classA.localeCompare(classB);
      }
      if (sort === 'id-asc') return a.admissionNumber.localeCompare(b.admissionNumber);
      const nameA = `${a.lastName} ${a.firstName}`.toLowerCase();
      const nameB = `${b.lastName} ${b.firstName}`.toLowerCase();
      if (sort === 'name-desc') return nameB.localeCompare(nameA);
      return nameA.localeCompare(nameB);
    });

    return list;
  }

  studentClassLabel(className?: string | null): string {
    return formatStudentClassLabel(className);
  }

  studentGenderLabel(gender?: string | null): string {
    return formatGenderLabel(gender);
  }

  private showToast(type: 'success' | 'error', msg: string) {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 4000);
  }

  private classRows(): ClassOption[] {
    return this.asClassArray(this.classes());
  }

  private asStudentArray(value: unknown): Student[] {
    return Array.isArray(value) ? value : [];
  }

  private asClassArray(value: unknown): ClassOption[] {
    return Array.isArray(value) ? value : [];
  }
}
