import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';
import { promotionClassLabel } from '../../core/utils/class-display';

const OL_COMPLETE = '__OL_COMPLETE__';
const AL_COMPLETE = '__AL_COMPLETE__';

const COMPLETION_OPTIONS = [
  { value: OL_COMPLETE, label: '🎓 Ordinary Level Completed' },
  { value: AL_COMPLETE, label: '🎓 Advanced Level Completed' },
] as const;

function sentinelToLabel(sentinel: string): string | undefined {
  return COMPLETION_OPTIONS.find((o) => o.value === sentinel)?.label.replace('🎓 ', '');
}

function labelToSentinel(label: string): string | undefined {
  return COMPLETION_OPTIONS.find((o) => o.label.replace('🎓 ', '') === label)?.value;
}

type Tab = 'calendar' | 'classes' | 'subjects' | 'departments' | 'exams' | 'promotion';

interface GradeBoundaryRow {
  grade: string;
  label?: string;
  minPercent: number;
}

interface SchoolSettings {
  gradeBoundaries?: GradeBoundaryRow[];
}

interface SchoolYear {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  terms?: Term[];
}

interface Term {
  id: string;
  name: string;
  termNumber: number;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  schoolYearId: string;
}

interface FormRow {
  id: string;
  name: string;
  level: number;
  classes?: { id: string; name: string; capacity: number }[];
}

interface ClassRow {
  id: string;
  name: string;
  formId: string;
  classTeacherId?: string;
  capacity: number;
  form?: { id: string; name: string; level: number };
  students?: { id: string }[];
}

interface SubjectRow {
  id: string;
  code: string;
  name: string;
  description?: string;
}

interface DepartmentRow {
  id: string;
  code: string;
  name: string;
  description?: string;
  isActive: boolean;
  sortOrder: number;
}

interface ClassSubjectRow {
  id: string;
  classId: string;
  subjectId: string;
  teacherId?: string;
  subject?: { code: string; name: string };
  teacher?: { id: string; user?: { firstName: string; lastName: string } };
}

interface StaffRow {
  id: string;
  employeeNumber: string;
  user?: { firstName: string; lastName: string };
}

interface ExamTypeRow {
  id: string;
  name: string;
  code: string;
  weight: number;
  maxMarks: number;
}

interface PromotionRuleRow {
  id: string;
  fromClassId: string;
  toClassId?: string;
  completionLabel?: string;
  isActive: boolean;
}

@Component({
  selector: 'app-admin-academic-settings',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, RouterLink],
  templateUrl: './admin-academic-settings.component.html',
  styleUrls: ['./admin-academic-settings.component.scss', './admin-settings.component.scss'],
})
export class AdminAcademicSettingsComponent implements OnInit {
  private api = inject(ApiService);

  readonly adminNav = ADMIN_NAV_SECTIONS;
  readonly promotionClassLabel = promotionClassLabel;
  readonly completionOptions = COMPLETION_OPTIONS;

  readonly tabs: { id: Tab; label: string; icon: string; desc: string }[] = [
    { id: 'calendar', label: 'Academic Calendar', icon: '📅', desc: 'Years, terms & sessions' },
    { id: 'classes', label: 'Forms & Classes', icon: '🎓', desc: 'Structure & teachers' },
    { id: 'subjects', label: 'Subjects', icon: '📖', desc: 'Catalogue & class assignments' },
    { id: 'departments', label: 'Departments', icon: '🏛️', desc: 'School departments & faculties' },
    { id: 'exams', label: 'Exams & Grades', icon: '📝', desc: 'Weights & grade boundaries' },
    { id: 'promotion', label: 'Promotion Rules', icon: '🎯', desc: 'Class progression at year-end' },
  ];

  activeTab = signal<Tab>('calendar');
  loading = signal(true);
  submitting = signal(false);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  schoolYears = signal<SchoolYear[]>([]);
  forms = signal<FormRow[]>([]);
  classes = signal<ClassRow[]>([]);
  subjects = signal<SubjectRow[]>([]);
  departments = signal<DepartmentRow[]>([]);
  classSubjects = signal<ClassSubjectRow[]>([]);
  staff = signal<StaffRow[]>([]);
  examTypes = signal<ExamTypeRow[]>([]);
  gradeBoundaries = signal<GradeBoundaryRow[]>([]);
  gradePreviewMarks = signal(65);
  targetsByClass = signal<Record<string, string>>({});

  newYear = { name: '', startDate: '', endDate: '', isCurrent: false };
  editingYearId = signal<string | null>(null);
  editYearData = { name: '', startDate: '', endDate: '', isCurrent: false };
  newTerm = { name: '', termNumber: 1, startDate: '', endDate: '', schoolYearId: '', isCurrent: false };
  newForm = { name: '', level: 1 };
  editingFormId = signal<string | null>(null);
  editFormData = { name: '', level: 1 };
  editingClassId = signal<string | null>(null);
  editClassName = '';
  editingClassFormName = signal('');
  editingSubjectId = signal<string | null>(null);
  editingSubjectField = signal<'name' | 'code' | null>(null);
  editSubjectValue = '';
  editingSubjectHint = signal('');
  newClass = { name: '', formId: '', capacity: 40, classTeacherId: '' };
  newSubject = { code: '', name: '', description: '' };
  newDepartment = { code: '', name: '', description: '', isActive: true, sortOrder: 0 };
  editingDepartmentId = signal<string | null>(null);
  editDepartmentData = { code: '', name: '', description: '', isActive: true, sortOrder: 0 };
  newAssignment = { classId: '', subjectId: '', teacherId: '' };
  selectedClassId = signal('');

  filteredClassSubjects = computed(() => {
    const classId = this.selectedClassId();
    if (!classId) return this.classSubjects();
    return this.classSubjects().filter((cs) => cs.classId === classId);
  });

  selectedClass = computed(() => this.classes().find((c) => c.id === this.selectedClassId()) ?? null);

  pageStats = computed(() => ({
    subjects: this.subjects().length,
    departments: this.departments().length,
    classes: this.classes().length,
    forms: this.forms().length,
    assignments: this.filteredClassSubjects().length,
    years: this.schoolYears().length,
    promotionRules: Object.values(this.targetsByClass()).filter((v) => !!v).length,
  }));

  examWeightTotal = computed(() => this.examTypes().reduce((s, e) => s + Number(e.weight), 0));

  gradeBoundaryRanges = computed(() => {
    const sorted = [...this.gradeBoundaries()].sort((a, b) => b.minPercent - a.minPercent);
    return sorted.map((b, i) => {
      const top = i === 0 ? 100 : sorted[i - 1].minPercent - 1;
      return {
        ...b,
        rangeLabel:
          i === 0 ? `${b.minPercent}% – 100%` : `${b.minPercent}% – ${Math.max(b.minPercent, top)}%`,
      };
    });
  });

  gradePreviewResult = computed(() => {
    const pct = this.gradePreviewMarks();
    const sorted = [...this.gradeBoundaries()].sort((a, b) => b.minPercent - a.minPercent);
    for (const b of sorted) {
      if (pct >= Number(b.minPercent)) return b.grade;
    }
    return sorted[sorted.length - 1]?.grade ?? '—';
  });

  sortedClasses = computed(() =>
    [...this.classes()].sort((a, b) => {
      const levelA = a.form?.level ?? 0;
      const levelB = b.form?.level ?? 0;
      if (levelA !== levelB) return levelA - levelB;
      const formCmp = (a.form?.name || '').localeCompare(b.form?.name || '');
      if (formCmp !== 0) return formCmp;
      return a.name.localeCompare(b.name);
    }),
  );

  activeTabMeta = computed(() => this.tabs.find((t) => t.id === this.activeTab()) ?? this.tabs[0]);

  ngOnInit() {
    this.loadAll();
  }

  setTab(tab: Tab) {
    this.activeTab.set(tab);
  }

  loadAll() {
    this.loading.set(true);
    forkJoin({
      settings: this.api.get<{ school: SchoolSettings }>('/admin/settings'),
      years: this.api.get<SchoolYear[]>('/admin/school-years'),
      forms: this.api.get<FormRow[]>('/admin/forms'),
      classes: this.api.get<ClassRow[]>('/admin/classes'),
      subjects: this.api.get<SubjectRow[]>('/admin/subjects'),
      departments: this.api.get<DepartmentRow[]>('/admin/departments'),
      classSubjects: this.api.get<ClassSubjectRow[]>('/admin/class-subjects'),
      staff: this.api.get<StaffRow[]>('/admin/staff'),
      examTypes: this.api.get<ExamTypeRow[]>('/admin/exam-types'),
      promotionRules: this.api
        .get<PromotionRuleRow[]>('/admin/promotion-rules')
        .pipe(catchError(() => of([] as PromotionRuleRow[]))),
    }).subscribe({
      next: (data) => {
        this.gradeBoundaries.set(
          data.settings.school.gradeBoundaries?.length
            ? data.settings.school.gradeBoundaries.map((b) => ({ ...b }))
            : this.defaultGradeBoundaries(),
        );
        this.schoolYears.set(data.years);
        this.forms.set(data.forms);
        this.classes.set(data.classes);
        this.subjects.set(data.subjects);
        this.departments.set(data.departments);
        this.classSubjects.set(data.classSubjects);
        this.staff.set(data.staff);
        this.examTypes.set(data.examTypes);
        this.applyPromotionRules(data.promotionRules);
        const currentYear = data.years.find((y) => y.isCurrent) || data.years[0];
        if (currentYear) this.newTerm.schoolYearId = currentYear.id;
        if (data.classes[0]) {
          this.selectedClassId.set(data.classes[0].id);
          this.newAssignment.classId = data.classes[0].id;
        }
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        if (err?.status === 404) {
          this.showToast('error', 'Some academic APIs are unavailable — restart the backend.');
        } else {
          this.showToast('error', 'Failed to load academic settings');
        }
      },
    });
  }

  private applyPromotionRules(rules: PromotionRuleRow[]) {
    const map: Record<string, string> = {};
    for (const r of rules) {
      if (r.isActive === false) continue;
      if (r.completionLabel) {
        const sentinel = labelToSentinel(r.completionLabel);
        if (sentinel) map[r.fromClassId] = sentinel;
      } else if (r.toClassId) {
        map[r.fromClassId] = r.toClassId;
      }
    }
    this.targetsByClass.set(map);
  }

  addSchoolYear() {
    if (!this.newYear.name || !this.newYear.startDate) {
      this.showToast('error', 'Enter year name and dates');
      return;
    }
    this.submitting.set(true);
    this.api.post<SchoolYear>('/admin/school-years', this.newYear).subscribe({
      next: () => {
        this.newYear = { name: '', startDate: '', endDate: '', isCurrent: false };
        this.reloadYears();
        this.submitting.set(false);
        this.showToast('success', 'School year created');
      },
      error: () => {
        this.submitting.set(false);
        this.showToast('error', 'Failed to create school year');
      },
    });
  }

  startEditYear(year: SchoolYear) {
    this.editingYearId.set(year.id);
    this.editYearData = {
      name: year.name,
      startDate: year.startDate,
      endDate: year.endDate,
      isCurrent: year.isCurrent,
    };
  }

  cancelEditYear() {
    this.editingYearId.set(null);
  }

  saveEditYear() {
    const id = this.editingYearId();
    if (!id || !this.editYearData.name.trim() || !this.editYearData.startDate || !this.editYearData.endDate) {
      this.showToast('error', 'Year name, start date, and end date are required');
      return;
    }
    this.submitting.set(true);
    this.api.patch(`/admin/school-years/${id}`, this.editYearData).subscribe({
      next: () => {
        this.editingYearId.set(null);
        this.reloadYears();
        this.submitting.set(false);
        this.showToast('success', 'School year updated');
      },
      error: (e) => {
        this.submitting.set(false);
        this.showToast('error', e.error?.message || 'Failed to update school year');
      },
    });
  }

  setCurrentYear(year: SchoolYear) {
    this.api.patch(`/admin/school-years/${year.id}`, { isCurrent: true }).subscribe({
      next: () => {
        this.reloadYears();
        this.showToast('success', `${year.name} set as current year`);
      },
      error: () => this.showToast('error', 'Failed to update year'),
    });
  }

  addTerm() {
    if (!this.newTerm.name || !this.newTerm.schoolYearId) {
      this.showToast('error', 'Select school year and enter term details');
      return;
    }
    this.submitting.set(true);
    this.api.post<Term>('/admin/terms', this.newTerm).subscribe({
      next: () => {
        this.newTerm = {
          name: '',
          termNumber: 1,
          startDate: '',
          endDate: '',
          schoolYearId: this.newTerm.schoolYearId,
          isCurrent: false,
        };
        this.reloadYears();
        this.submitting.set(false);
        this.showToast('success', 'Term created');
      },
      error: () => {
        this.submitting.set(false);
        this.showToast('error', 'Failed to create term');
      },
    });
  }

  setCurrentTerm(term: Term) {
    this.api.patch(`/admin/terms/${term.id}`, { isCurrent: true }).subscribe({
      next: () => {
        this.reloadYears();
        this.showToast('success', `${term.name} set as current term`);
      },
      error: () => this.showToast('error', 'Failed to update term'),
    });
  }

  addForm() {
    if (!this.newForm.name) return;
    this.api.post('/admin/forms', this.newForm).subscribe({
      next: () => {
        this.newForm = { name: '', level: 1 };
        this.reloadForms();
        this.showToast('success', 'Form added');
      },
      error: () => this.showToast('error', 'Failed to add form'),
    });
  }

  startEditForm(f: FormRow) {
    this.editingFormId.set(f.id);
    this.editFormData = { name: f.name, level: f.level };
  }

  cancelEditForm() {
    this.editingFormId.set(null);
  }

  saveEditForm() {
    const id = this.editingFormId();
    if (!id || !this.editFormData.name.trim()) {
      this.showToast('error', 'Form name is required');
      return;
    }
    this.api.patch(`/admin/forms/${id}`, this.editFormData).subscribe({
      next: () => {
        this.editingFormId.set(null);
        this.reloadForms();
        this.showToast('success', 'Form updated');
      },
      error: (e) => this.showToast('error', e.error?.message || 'Failed to update form'),
    });
  }

  deleteForm(f: FormRow) {
    if (!confirm(`Delete "${f.name}"? This cannot be undone.`)) return;
    this.api.delete(`/admin/forms/${f.id}`).subscribe({
      next: () => {
        this.reloadForms();
        this.showToast('success', `${f.name} deleted`);
      },
      error: (e) => this.showToast('error', e.error?.message || 'Cannot delete this form'),
    });
  }

  addClass() {
    if (!this.newClass.name || !this.newClass.formId) {
      this.showToast('error', 'Enter class name and select form');
      return;
    }
    this.api
      .post('/admin/classes', {
        ...this.newClass,
        classTeacherId: this.newClass.classTeacherId || undefined,
      })
      .subscribe({
        next: () => {
          this.newClass = { name: '', formId: '', capacity: 40, classTeacherId: '' };
          this.reloadClasses();
          this.showToast('success', 'Class created');
        },
        error: () => this.showToast('error', 'Failed to create class'),
      });
  }

  updateClassTeacher(cls: ClassRow, teacherId: string) {
    this.api.patch(`/admin/classes/${cls.id}`, { classTeacherId: teacherId || null }).subscribe({
      next: () => this.showToast('success', 'Class teacher updated'),
      error: () => this.showToast('error', 'Failed to update class'),
    });
  }

  openEditClass(cls: ClassRow) {
    this.editingClassId.set(cls.id);
    this.editClassName = cls.name;
    this.editingClassFormName.set(cls.form?.name || '—');
  }

  closeEditClass() {
    this.editingClassId.set(null);
    this.editClassName = '';
    this.editingClassFormName.set('');
  }

  saveEditClass() {
    const id = this.editingClassId();
    const name = this.editClassName.trim();
    if (!id || !name) {
      this.showToast('error', 'Class name is required');
      return;
    }
    this.submitting.set(true);
    this.api.patch<ClassRow>(`/admin/classes/${id}`, { name }).subscribe({
      next: (updated) => {
        this.classes.update((rows) =>
          rows.map((c) => (c.id === id ? { ...c, ...updated, name: updated.name } : c)),
        );
        this.forms.update((forms) =>
          forms.map((f) => ({
            ...f,
            classes: f.classes?.map((c) => (c.id === id ? { ...c, name: updated.name } : c)),
          })),
        );
        this.closeEditClass();
        this.submitting.set(false);
        this.showToast('success', 'Class name updated');
      },
      error: (e) => {
        this.submitting.set(false);
        this.showToast('error', e.error?.message || 'Failed to update class name');
      },
    });
  }

  addSubject() {
    if (!this.newSubject.code || !this.newSubject.name) {
      this.showToast('error', 'Enter subject code and name');
      return;
    }
    this.api.post('/admin/subjects', this.newSubject).subscribe({
      next: () => {
        this.newSubject = { code: '', name: '', description: '' };
        this.api.get<SubjectRow[]>('/admin/subjects').subscribe((s) => this.subjects.set(s));
        this.showToast('success', 'Subject added');
      },
      error: () => this.showToast('error', 'Failed to add subject'),
    });
  }

  openEditSubjectName(subject: SubjectRow) {
    this.editingSubjectId.set(subject.id);
    this.editingSubjectField.set('name');
    this.editSubjectValue = subject.name;
    this.editingSubjectHint.set(`Code: ${subject.code}`);
  }

  openEditSubjectCode(subject: SubjectRow) {
    this.editingSubjectId.set(subject.id);
    this.editingSubjectField.set('code');
    this.editSubjectValue = subject.code;
    this.editingSubjectHint.set(`Name: ${subject.name}`);
  }

  closeEditSubject() {
    this.editingSubjectId.set(null);
    this.editingSubjectField.set(null);
    this.editSubjectValue = '';
    this.editingSubjectHint.set('');
  }

  private applySubjectUpdate(updated: SubjectRow) {
    this.subjects.update((rows) => rows.map((s) => (s.id === updated.id ? { ...s, ...updated } : s)));
    this.classSubjects.update((rows) =>
      rows.map((cs) =>
        cs.subjectId === updated.id && cs.subject
          ? { ...cs, subject: { ...cs.subject, code: updated.code, name: updated.name } }
          : cs,
      ),
    );
  }

  saveEditSubject() {
    const id = this.editingSubjectId();
    const field = this.editingSubjectField();
    const value = this.editSubjectValue.trim();
    if (!id || !field) return;
    if (!value) {
      this.showToast('error', field === 'code' ? 'Subject code is required' : 'Subject name is required');
      return;
    }

    const body = field === 'code' ? { code: value.toUpperCase() } : { name: value };
    this.submitting.set(true);
    this.api.patch<SubjectRow>(`/admin/subjects/${id}`, body).subscribe({
      next: (updated) => {
        this.applySubjectUpdate(updated);
        this.closeEditSubject();
        this.submitting.set(false);
        this.showToast('success', field === 'code' ? 'Subject code updated' : 'Subject name updated');
      },
      error: (e) => {
        this.submitting.set(false);
        this.showToast('error', e.error?.message || 'Failed to update subject');
      },
    });
  }

  addDepartment() {
    if (!this.newDepartment.code.trim() || !this.newDepartment.name.trim()) {
      this.showToast('error', 'Enter department code and name');
      return;
    }
    this.api.post<DepartmentRow>('/admin/departments', this.newDepartment).subscribe({
      next: () => {
        this.newDepartment = { code: '', name: '', description: '', isActive: true, sortOrder: 0 };
        this.reloadDepartments();
        this.showToast('success', 'Department added');
      },
      error: (e) => this.showToast('error', e.error?.message || 'Failed to add department'),
    });
  }

  startEditDepartment(d: DepartmentRow) {
    this.editingDepartmentId.set(d.id);
    this.editDepartmentData = {
      code: d.code,
      name: d.name,
      description: d.description || '',
      isActive: d.isActive,
      sortOrder: d.sortOrder,
    };
  }

  cancelEditDepartment() {
    this.editingDepartmentId.set(null);
  }

  saveEditDepartment() {
    const id = this.editingDepartmentId();
    if (!id || !this.editDepartmentData.code.trim() || !this.editDepartmentData.name.trim()) {
      this.showToast('error', 'Department code and name are required');
      return;
    }
    this.api.patch(`/admin/departments/${id}`, this.editDepartmentData).subscribe({
      next: () => {
        this.editingDepartmentId.set(null);
        this.reloadDepartments();
        this.showToast('success', 'Department updated');
      },
      error: (e) => this.showToast('error', e.error?.message || 'Failed to update department'),
    });
  }

  deleteDepartment(d: DepartmentRow) {
    if (!confirm(`Delete department "${d.name}"? This cannot be undone.`)) return;
    this.api.delete(`/admin/departments/${d.id}`).subscribe({
      next: () => {
        this.reloadDepartments();
        this.showToast('success', `${d.name} deleted`);
      },
      error: (e) => this.showToast('error', e.error?.message || 'Cannot delete this department'),
    });
  }

  onClassSelect(classId: string) {
    this.selectedClassId.set(classId);
    this.newAssignment.classId = classId;
    this.api.get<ClassSubjectRow[]>('/admin/class-subjects', { classId }).subscribe({
      next: (cs) => this.classSubjects.set(cs),
    });
  }

  assignSubject() {
    if (!this.newAssignment.classId || !this.newAssignment.subjectId) {
      this.showToast('error', 'Select class and subject');
      return;
    }
    this.api
      .post('/admin/class-subjects', {
        classId: this.newAssignment.classId,
        subjectId: this.newAssignment.subjectId,
        teacherId: this.newAssignment.teacherId || undefined,
      })
      .subscribe({
        next: () => {
          this.onClassSelect(this.newAssignment.classId);
          this.newAssignment.subjectId = '';
          this.newAssignment.teacherId = '';
          this.showToast('success', 'Subject assigned to class');
        },
        error: (e) =>
          this.showToast('error', e.error?.message || 'Assignment failed (may already exist)'),
      });
  }

  updateAssignmentTeacher(cs: ClassSubjectRow, teacherId: string) {
    this.api.patch(`/admin/class-subjects/${cs.id}`, { teacherId: teacherId || null }).subscribe({
      next: () => this.showToast('success', 'Teacher updated'),
      error: () => this.showToast('error', 'Failed to update assignment'),
    });
  }

  removeAssignment(cs: ClassSubjectRow) {
    this.api.delete(`/admin/class-subjects/${cs.id}`).subscribe({
      next: () => {
        this.onClassSelect(cs.classId);
        this.showToast('success', 'Assignment removed');
      },
      error: () => this.showToast('error', 'Failed to remove assignment'),
    });
  }

  addGradeBoundary() {
    this.gradeBoundaries.update((rows) => [...rows, { grade: '', label: '', minPercent: 0 }]);
  }

  removeGradeBoundary(index: number) {
    if (this.gradeBoundaries().length <= 1) {
      this.showToast('error', 'At least one grade boundary is required.');
      return;
    }
    this.gradeBoundaries.update((rows) => rows.filter((_, i) => i !== index));
  }

  resetGradeBoundaries() {
    this.gradeBoundaries.set(this.defaultGradeBoundaries());
    this.showToast('success', 'Restored default grade boundaries (save to apply).');
  }

  saveGradeBoundaries() {
    const rows = this.gradeBoundaries().map((b) => ({
      grade: b.grade.trim(),
      label: b.label?.trim() || undefined,
      minPercent: Number(b.minPercent),
    }));
    if (!rows.every((b) => b.grade)) {
      this.showToast('error', 'Every row needs a grade code.');
      return;
    }
    if (!rows.some((b) => b.minPercent === 0)) {
      this.showToast('error', 'Include one boundary at 0% for the lowest band.');
      return;
    }
    this.submitting.set(true);
    this.api.patch<SchoolSettings>('/admin/settings', { gradeBoundaries: rows }).subscribe({
      next: (s) => {
        this.gradeBoundaries.set(s.gradeBoundaries?.map((b) => ({ ...b })) ?? rows);
        this.submitting.set(false);
        this.showToast('success', 'Grade boundaries saved');
      },
      error: (e) => {
        this.submitting.set(false);
        this.showToast('error', e.error?.message || 'Failed to save grade boundaries');
      },
    });
  }

  saveExamType(et: ExamTypeRow) {
    this.api
      .patch(`/admin/exam-types/${et.id}`, {
        weight: Number(et.weight),
        maxMarks: Number(et.maxMarks),
      })
      .subscribe({
        next: () => this.showToast('success', `${et.name} weights saved`),
        error: () => this.showToast('error', 'Failed to save exam type'),
      });
  }

  targetOptions(fromClassId: string): ClassRow[] {
    return this.sortedClasses().filter((c) => c.id !== fromClassId);
  }

  setTarget(fromClassId: string, value: string) {
    this.targetsByClass.update((prev) => {
      const next = { ...prev };
      if (!value) delete next[fromClassId];
      else next[fromClassId] = value;
      return next;
    });
  }

  getTarget(fromClassId: string): string {
    return this.targetsByClass()[fromClassId] || '';
  }

  isSentinel(value: string): boolean {
    return value === OL_COMPLETE || value === AL_COMPLETE;
  }

  completionBadgeLabel(fromClassId: string): string {
    return sentinelToLabel(this.getTarget(fromClassId)) ?? '';
  }

  saveRules() {
    const rules = Object.entries(this.targetsByClass())
      .filter(([, value]) => !!value)
      .map(([fromClassId, value]) => {
        if (value === OL_COMPLETE) {
          return { fromClassId, completionLabel: 'Ordinary Level Completed', isActive: true };
        }
        if (value === AL_COMPLETE) {
          return { fromClassId, completionLabel: 'Advanced Level Completed', isActive: true };
        }
        return { fromClassId, toClassId: value, isActive: true };
      });

    this.submitting.set(true);
    this.api.put<PromotionRuleRow[]>('/admin/promotion-rules', { rules }).subscribe({
      next: (saved) => {
        this.applyPromotionRules(saved);
        this.submitting.set(false);
        this.showToast('success', 'Promotion rules saved');
      },
      error: (err) => {
        this.submitting.set(false);
        this.showToast('error', err?.error?.message || 'Failed to save promotion rules');
      },
    });
  }

  staffName(s: StaffRow): string {
    if (s.user) return `${s.user.firstName} ${s.user.lastName}`;
    return s.employeeNumber;
  }

  subjectHue(code: string): string {
    const hues = ['#1e40af', '#7c3aed', '#059669', '#d97706', '#dc2626', '#0891b2'];
    let hash = 0;
    for (let i = 0; i < code.length; i++) hash = code.charCodeAt(i) + ((hash << 5) - hash);
    return hues[Math.abs(hash) % hues.length];
  }

  classStudentCount(cls: ClassRow): number {
    return cls.students?.length ?? 0;
  }

  private defaultGradeBoundaries(): GradeBoundaryRow[] {
    return [
      { grade: 'A', label: 'Excellent', minPercent: 80 },
      { grade: 'B', label: 'Very Good', minPercent: 70 },
      { grade: 'C', label: 'Good', minPercent: 60 },
      { grade: 'D', label: 'Pass', minPercent: 50 },
      { grade: 'E', label: 'Weak Pass', minPercent: 40 },
      { grade: 'U', label: 'Ungraded', minPercent: 0 },
    ];
  }

  private reloadYears() {
    this.api.get<SchoolYear[]>('/admin/school-years').subscribe((y) => this.schoolYears.set(y));
  }

  private reloadForms() {
    this.api.get<FormRow[]>('/admin/forms').subscribe((f) => this.forms.set(f));
  }

  private reloadClasses() {
    this.api.get<ClassRow[]>('/admin/classes').subscribe((c) => this.classes.set(c));
  }

  private reloadDepartments() {
    this.api.get<DepartmentRow[]>('/admin/departments').subscribe((d) => this.departments.set(d));
  }

  private showToast(type: 'success' | 'error', msg: string) {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 4500);
  }
}
