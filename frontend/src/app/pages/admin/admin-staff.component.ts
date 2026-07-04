import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';

import { classHeaderLabel } from '../../core/utils/class-display';
import { formatTeacherTimetableName, TEACHER_TITLE_OPTIONS } from '../../core/utils/teacher-display';

type Tab = 'directory' | 'teacherLoad';
type StaffRole = 'teacher' | 'admin' | 'principal';
type LessonLength = 'single' | 'double' | 'triple';
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
  title?: string | null;
  gender?: string | null;
  department?: string;
  qualification?: string;
  hireDate?: string;
  isActive: boolean;
  createdAt: string;
  user: StaffUser;
}

interface TeacherLoadSubjectRow {
  classSubjectId: string;
  subjectId: string;
  subjectName: string;
  subjectCode: string | null;
  weeklyPeriods: number;
  lessonLength: LessonLength;
  periods: number;
  timetablePeriods: number;
}

interface TeacherLoadClassGroup {
  classId: string;
  className: string;
  subjects: TeacherLoadSubjectRow[];
  classLoad: number;
}

interface TeacherLoadEntry {
  teacherId: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  classes: TeacherLoadClassGroup[];
  totalLoad: number;
}

interface TeacherLoadReport {
  teachers: TeacherLoadEntry[];
  summary: {
    teacherCount: number;
    teachersWithAssignments: number;
    teachersWithTimetableLoad: number;
    totalPeriods: number;
  };
}

interface TeacherLoadGridRow {
  teacherId: string;
  employeeNumber: string;
  teacherName: string;
  classSubjectId: string;
  classId: string;
  classLabel: string;
  subjectId: string;
  subjectLabel: string;
  weeklyPeriods: number;
  lessonLength: LessonLength;
  periods: number;
  totalLoad: number;
  assignedClassLabels: string[];
  isFirstRow: boolean;
  rowSpan: number;
  hasAssignment: boolean;
}

interface LoadClassOption {
  id: string;
  name: string;
  form?: { name: string };
}

interface LoadSubjectOption {
  id: string;
  name: string;
  code?: string;
}

interface ClassSubjectAssignmentRow {
  id: string;
  classId: string;
  subjectId: string;
  teacherId: string | null;
  teacher?: { id: string; firstName: string; lastName: string } | null;
}

interface DepartmentRow {
  id: string;
  code: string;
  name: string;
  description?: string;
  isActive: boolean;
  sortOrder: number;
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
  readonly teacherTitleOptions = TEACHER_TITLE_OPTIONS;
  readonly genderOptions: { value: string; label: string }[] = [
    { value: 'male', label: 'Male' },
    { value: 'female', label: 'Female' },
  ];
  readonly sortOptions: { value: SortKey; label: string }[] = [
    { value: 'name-asc', label: 'Name A–Z' },
    { value: 'name-desc', label: 'Name Z–A' },
    { value: 'hire-desc', label: 'Newest hire' },
    { value: 'hire-asc', label: 'Oldest hire' },
    { value: 'id-asc', label: 'Employee ID' },
  ];

  activeTab = signal<Tab>('directory');
  staff = signal<StaffMember[]>([]);
  departmentCatalog = signal<DepartmentRow[]>([]);
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

  showInitialPassword = signal(false);

  teacherLoadReport = signal<TeacherLoadReport | null>(null);
  teacherLoadLoading = signal(false);
  teacherLoadSearch = signal('');
  loadClasses = signal<LoadClassOption[]>([]);
  loadSubjects = signal<LoadSubjectOption[]>([]);
  loadClassAssignments = signal<ClassSubjectAssignmentRow[]>([]);
  loadModalOpen = signal(false);
  loadRemoveTarget = signal<TeacherLoadGridRow | null>(null);
  loadReassignOpen = signal(false);
  loadConflictMessage = signal('');
  teacherLoadPdfLoading = signal(false);

  readonly lessonLengthOptions: { value: LessonLength; label: string; multiplier: number }[] = [
    { value: 'single', label: 'Single', multiplier: 1 },
    { value: 'double', label: 'Double', multiplier: 2 },
    { value: 'triple', label: 'Triple', multiplier: 3 },
  ];

  loadForm = {
    teacherId: '',
    teacherName: '',
    classId: '',
    subjectId: '',
    weeklyPeriods: 1,
    lessonLength: 'single' as LessonLength,
  };

  newStaff = {
    title: '' as string,
    gender: '' as string,
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
    title: '' as string,
    gender: '' as string,
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

  activeDepartments = computed(() =>
    this.departmentCatalog().filter((d) => d.isActive),
  );

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

  teacherLoadSummary = computed(() => {
    return (
      this.teacherLoadReport()?.summary ?? {
        teacherCount: 0,
        teachersWithAssignments: 0,
        teachersWithTimetableLoad: 0,
        totalPeriods: 0,
      }
    );
  });

  teacherLoadGridRows = computed((): TeacherLoadGridRow[] => {
    const q = this.teacherLoadSearch().trim().toLowerCase();
    const teachers = this.teacherLoadReport()?.teachers ?? [];
    const rows: TeacherLoadGridRow[] = [];

    for (const teacher of teachers) {
      const teacherName = `${teacher.firstName} ${teacher.lastName}`.trim();
      const haystack = `${teacherName} ${teacher.employeeNumber}`.toLowerCase();
      const assignedClassLabels = teacher.classes
        .map((cg) => (cg.className ? classHeaderLabel({ name: cg.className }) : ''))
        .filter(Boolean);

      const assignmentRows: Omit<TeacherLoadGridRow, 'isFirstRow' | 'rowSpan'>[] = [];

      if (!teacher.classes.length) {
        assignmentRows.push({
          teacherId: teacher.teacherId,
          employeeNumber: teacher.employeeNumber,
          teacherName,
          classSubjectId: '',
          classId: '',
          classLabel: '—',
          subjectId: '',
          subjectLabel: '—',
          weeklyPeriods: 0,
          lessonLength: 'single' as LessonLength,
          periods: 0,
          totalLoad: teacher.totalLoad,
          assignedClassLabels: [],
          hasAssignment: false,
        });
      } else {
        for (const cg of teacher.classes) {
          const classLabel = cg.className ? classHeaderLabel({ name: cg.className }) : '—';
          for (const sub of cg.subjects) {
            assignmentRows.push({
              teacherId: teacher.teacherId,
              employeeNumber: teacher.employeeNumber,
              teacherName,
              classSubjectId: sub.classSubjectId,
              classId: cg.classId,
              classLabel,
              subjectId: sub.subjectId,
              subjectLabel: sub.subjectCode ? `${sub.subjectName} (${sub.subjectCode})` : sub.subjectName,
              weeklyPeriods: sub.weeklyPeriods,
              lessonLength: sub.lessonLength || 'single',
              periods: sub.periods,
              totalLoad: teacher.totalLoad,
              assignedClassLabels,
              hasAssignment: true,
            });
          }
        }
      }

      const visibleRows = assignmentRows.filter((row) => {
        if (!q) return true;
        if (haystack.includes(q)) return true;
        const classes = row.assignedClassLabels.join(' ').toLowerCase();
        return `${classes} ${row.classLabel} ${row.subjectLabel}`.toLowerCase().includes(q);
      });

      if (!visibleRows.length) continue;

      visibleRows.forEach((row, index) => {
        rows.push({
          ...row,
          isFirstRow: index === 0,
          rowSpan: visibleRows.length,
        });
      });
    }

    return rows;
  });

  ngOnInit() {
    this.loadStaff();
    this.loadDepartments();
    this.loadTeacherLoad(true);
  }

  setTab(tab: Tab) {
    this.activeTab.set(tab);
    this.profileStaff.set(null);
    if (tab === 'teacherLoad') {
      this.loadTeacherLoad();
      this.loadTeacherLoadCatalog();
    }
  }

  openRegister() {
    this.editingStaff.set(null);
    this.profileStaff.set(null);
    this.resetNewForm();
    this.registerDrawerOpen.set(true);
    this.loadDepartments();
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
      },
      error: () => {
        this.loading.set(false);
        this.refreshing.set(false);
        this.showToast('error', 'Failed to load staff');
      },
    });
  }

  loadDepartments() {
    this.api.get<DepartmentRow[]>('/admin/departments').subscribe({
      next: (list) => this.departmentCatalog.set(list),
      error: () => this.departmentCatalog.set([]),
    });
  }

  isKnownDepartment(name: string): boolean {
    const trimmed = String(name || '').trim();
    if (!trimmed) return true;
    return this.departmentCatalog().some((d) => d.name === trimmed);
  }

  refreshList() {
    this.loadStaff(true);
    this.loadTeacherLoad(true);
  }

  loadTeacherLoad(silent = false) {
    if (!silent) this.teacherLoadLoading.set(true);
    this.api.get<TeacherLoadReport>('/admin/staff/teacher-load').subscribe({
      next: (report) => {
        this.teacherLoadReport.set(report);
        this.teacherLoadLoading.set(false);
      },
      error: () => {
        this.teacherLoadReport.set(null);
        this.teacherLoadLoading.set(false);
        this.showToast('error', 'Failed to load teacher workload');
      },
    });
  }

  loadTeacherLoadCatalog() {
    this.api.get<LoadClassOption[]>('/admin/classes').subscribe({
      next: (rows) => this.loadClasses.set(rows),
      error: () => this.loadClasses.set([]),
    });
    this.api.get<LoadSubjectOption[]>('/admin/subjects').subscribe({
      next: (rows) => this.loadSubjects.set(rows),
      error: () => this.loadSubjects.set([]),
    });
  }

  openAddLoadModal(row: TeacherLoadGridRow) {
    this.loadForm = {
      teacherId: row.teacherId,
      teacherName: row.teacherName,
      classId: row.hasAssignment ? row.classId : '',
      subjectId: row.hasAssignment ? row.subjectId : '',
      weeklyPeriods: row.hasAssignment && row.weeklyPeriods > 0 ? row.weeklyPeriods : 1,
      lessonLength: row.hasAssignment ? row.lessonLength : 'single',
    };
    if (!this.loadClasses().length || !this.loadSubjects().length) {
      this.loadTeacherLoadCatalog();
    }
    if (this.loadForm.classId) {
      this.loadClassAssignmentsForModal(this.loadForm.classId);
    } else {
      this.loadClassAssignments.set([]);
    }
    this.loadModalOpen.set(true);
  }

  onLoadClassChange(classId: string) {
    this.loadForm.classId = classId;
    this.loadForm.subjectId = '';
    if (classId) {
      this.loadClassAssignmentsForModal(classId);
    } else {
      this.loadClassAssignments.set([]);
    }
  }

  loadClassAssignmentsForModal(classId: string) {
    this.api.get<ClassSubjectAssignmentRow[]>('/admin/class-subjects', { classId }).subscribe({
      next: (rows) => this.loadClassAssignments.set(rows),
      error: () => this.loadClassAssignments.set([]),
    });
  }

  subjectAssignmentLabel(subjectId: string): string {
    const assignment = this.loadClassAssignments().find((row) => row.subjectId === subjectId);
    if (!assignment?.teacherId) return '';
    if (assignment.teacherId === this.loadForm.teacherId) return ' (already yours)';
    const teacher = assignment.teacher;
    const name = teacher ? `${teacher.firstName} ${teacher.lastName}`.trim() : 'another teacher';
    return ` (assigned to ${name})`;
  }

  isSubjectBlockedForLoad(subjectId: string): boolean {
    const assignment = this.loadClassAssignments().find((row) => row.subjectId === subjectId);
    return Boolean(assignment?.teacherId && assignment.teacherId !== this.loadForm.teacherId);
  }

  closeAddLoadModal() {
    this.loadModalOpen.set(false);
    this.loadReassignOpen.set(false);
    this.loadConflictMessage.set('');
  }

  saveLoadAssignment(forceReassign = false) {
    if (!this.loadForm.teacherId || !this.loadForm.classId || !this.loadForm.subjectId) {
      this.showToast('error', 'Select class and subject.');
      return;
    }
    if (!this.loadForm.weeklyPeriods || this.loadForm.weeklyPeriods < 1) {
      this.showToast('error', 'Enter at least 1 period per week.');
      return;
    }
    if (this.isSubjectBlockedForLoad(this.loadForm.subjectId)) {
      this.showToast('error', 'This subject is already assigned to another teacher for the selected class.');
      return;
    }
    this.submitting.set(true);
    this.api
      .post<TeacherLoadReport>('/admin/staff/teacher-load', {
        teacherId: this.loadForm.teacherId,
        classId: this.loadForm.classId,
        subjectId: this.loadForm.subjectId,
        weeklyPeriods: this.loadForm.weeklyPeriods,
        lessonLength: this.loadForm.lessonLength,
        forceReassign,
      })
      .subscribe({
        next: (report) => {
          this.teacherLoadReport.set(report);
          this.submitting.set(false);
          this.loadModalOpen.set(false);
          this.loadReassignOpen.set(false);
          this.loadConflictMessage.set('');
          this.showToast('success', forceReassign ? 'Assignment reassigned.' : 'Lesson assignment added.');
        },
        error: (e) => {
          this.submitting.set(false);
          const msg = e.error?.message || 'Failed to add assignment';
          if (e.status === 409 && !forceReassign) {
            this.loadConflictMessage.set(msg);
            this.loadReassignOpen.set(true);
            return;
          }
          this.showToast('error', msg);
        },
      });
  }

  cancelReassignLoad() {
    this.loadReassignOpen.set(false);
    this.loadConflictMessage.set('');
  }

  confirmReassignLoad() {
    this.saveLoadAssignment(true);
  }

  previewTeacherLoadPdf() {
    this.exportTeacherLoadPdf(true);
  }

  downloadTeacherLoadPdf() {
    this.exportTeacherLoadPdf(false);
  }

  private exportTeacherLoadPdf(preview: boolean) {
    this.teacherLoadPdfLoading.set(true);
    const params: Record<string, string> = {};
    if (preview) params['preview'] = 'true';

    this.api.getBlob('/admin/staff/teacher-load/pdf', params).subscribe({
      next: (blob) => {
        this.teacherLoadPdfLoading.set(false);
        if (blob.type && !blob.type.includes('pdf')) {
          this.showToast('error', 'Server did not return a PDF file.');
          return;
        }
        const url = URL.createObjectURL(blob);
        if (preview) {
          window.open(url, '_blank', 'noopener,noreferrer');
          setTimeout(() => URL.revokeObjectURL(url), 90_000);
          return;
        }
        const a = document.createElement('a');
        a.href = url;
        a.download = 'teacher-load-report.pdf';
        a.click();
        URL.revokeObjectURL(url);
      },
      error: (e) => {
        this.teacherLoadPdfLoading.set(false);
        this.showToast('error', e.error?.message || 'Failed to generate teacher load PDF.');
      },
    });
  }

  requestRemoveLoadRow(row: TeacherLoadGridRow) {
    if (!row.hasAssignment) return;
    this.loadRemoveTarget.set(row);
  }

  cancelRemoveLoadRow() {
    this.loadRemoveTarget.set(null);
  }

  confirmRemoveLoadRow() {
    const row = this.loadRemoveTarget();
    if (!row?.hasAssignment || !row.classSubjectId) return;
    this.submitting.set(true);
    this.api
      .delete<TeacherLoadReport>('/admin/staff/teacher-load', {
        classSubjectId: row.classSubjectId,
      })
      .subscribe({
        next: (report) => {
          this.teacherLoadReport.set(report);
          this.loadRemoveTarget.set(null);
          this.submitting.set(false);
          this.showToast('success', 'Assignment removed from teacher.');
        },
        error: (e) => {
          this.submitting.set(false);
          this.showToast('error', e.error?.message || 'Failed to remove assignment');
        },
      });
  }

  loadClassLabel(classId: string): string {
    const c = this.loadClasses().find((x) => x.id === classId);
    return c ? classHeaderLabel(c) : '';
  }

  loadSubjectLabel(subjectId: string): string {
    const s = this.loadSubjects().find((x) => x.id === subjectId);
    if (!s) return '';
    return s.code ? `${s.name} (${s.code})` : s.name;
  }

  lessonLengthMultiplier(length: LessonLength): number {
    return this.lessonLengthOptions.find((o) => o.value === length)?.multiplier ?? 1;
  }

  loadFormEffectivePeriods(): number {
    const count = Math.max(0, Number(this.loadForm.weeklyPeriods) || 0);
    return count * this.lessonLengthMultiplier(this.loadForm.lessonLength);
  }

  formatLoadPeriods(row: Pick<TeacherLoadGridRow, 'weeklyPeriods' | 'lessonLength' | 'periods'>): string {
    if (!row.periods) return '0';
    const lengthLabel = this.lessonLengthOptions.find((o) => o.value === row.lessonLength)?.label ?? 'Single';
    if (row.lessonLength === 'single') {
      return `${row.weeklyPeriods || row.periods}`;
    }
    return `${row.weeklyPeriods} × ${lengthLabel} (${row.periods})`;
  }

  classOptionLabel(c: LoadClassOption): string {
    return classHeaderLabel(c);
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
    this.loadDepartments();
    this.editForm = {
      title: s.title || '',
      gender: s.gender || '',
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

  genderLabel(value?: string | null): string {
    const v = String(value || '').trim().toLowerCase();
    if (v === 'male') return 'Male';
    if (v === 'female') return 'Female';
    return '—';
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

  fullName(s: StaffMember): string {
    return formatTeacherTimetableName({
      title: s.title,
      firstName: s.user.firstName,
      lastName: s.user.lastName,
    });
  }

  directoryName(s: StaffMember): string {
    const title = String(s.title || '').trim();
    const base = `${s.user.firstName} ${s.user.lastName}`.trim();
    return title ? `${title} ${base}` : base;
  }

  initials(s: StaffMember): string {
    return `${(s.user.firstName || '').charAt(0)}${(s.user.lastName || '').charAt(0)}`.toUpperCase() || '?';
  }

  initialsFromName(name: string): string {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() || '')
      .join('') || '?';
  }

  roleLabel(role: string): string {
    const map: Record<string, string> = {
      teacher: 'Teacher',
      admin: 'Administrator',
      principal: 'Principal',
    };
    return map[role] || role;
  }

  resetNewForm() {
    this.newStaff = {
      title: '',
      gender: '',
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
