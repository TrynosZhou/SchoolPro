import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';
import { environment } from '../../../environments/environment';

type Tab = 'profile' | 'calendar' | 'classes' | 'subjects' | 'exams' | 'notifications' | 'store';

interface GradeBoundaryRow {
  grade: string;
  label?: string;
  minPercent: number;
}

interface SchoolSettings {
  id: string;
  schoolName: string;
  tagline?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  logoUrl?: string;
  updatedAt?: string;
  currency: string;
  feeReminderTemplate?: string;
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
  form?: { name: string };
  students?: { id: string }[];
}

interface SubjectRow {
  id: string;
  code: string;
  name: string;
  description?: string;
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

interface TuckshopItem {
  id: string;
  name: string;
  sku?: string;
  unitPrice: number;
  stockQuantity: number;
  reorderLevel: number;
  isActive: boolean;
}

interface WhatsAppStatus {
  enabled: boolean;
  configured: boolean;
  from: string | null;
}

@Component({
  selector: 'app-admin-settings',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule],
  templateUrl: './admin-settings.component.html',
  styleUrl: './admin-settings.component.scss',
})
export class AdminSettingsComponent implements OnInit {
  private api = inject(ApiService);

  readonly adminNav = ADMIN_NAV_SECTIONS;

  readonly tabs: { id: Tab; label: string; icon: string; desc: string }[] = [
    { id: 'profile', label: 'School Profile', icon: '🏫', desc: 'Branding & contact details' },
    { id: 'calendar', label: 'Academic Calendar', icon: '📅', desc: 'Years, terms & sessions' },
    { id: 'classes', label: 'Forms & Classes', icon: '🎓', desc: 'Structure & teachers' },
    { id: 'subjects', label: 'Subjects', icon: '📖', desc: 'Catalogue & class assignments' },
    { id: 'exams', label: 'Exams & Grades', icon: '📝', desc: 'Weights & grade boundaries' },
    { id: 'notifications', label: 'WhatsApp', icon: '📱', desc: 'Parent messaging' },
    { id: 'store', label: 'Tuckshop', icon: '🛒', desc: 'Inventory & stock' },
  ];

  activeTab = signal<Tab>('profile');
  loading = signal(true);
  submitting = signal(false);
  uploadingLogo = signal(false);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  school = signal<SchoolSettings | null>(null);
  whatsapp = signal<WhatsAppStatus | null>(null);
  schoolYears = signal<SchoolYear[]>([]);
  forms = signal<FormRow[]>([]);
  classes = signal<ClassRow[]>([]);
  subjects = signal<SubjectRow[]>([]);
  classSubjects = signal<ClassSubjectRow[]>([]);
  staff = signal<StaffRow[]>([]);
  examTypes = signal<ExamTypeRow[]>([]);
  gradeBoundaries = signal<GradeBoundaryRow[]>([]);
  gradePreviewMarks = signal(65);
  tuckshopItems = signal<TuckshopItem[]>([]);

  profileForm: SchoolSettings = {
    id: 'default',
    schoolName: '',
    tagline: '',
    address: '',
    phone: '',
    email: '',
    website: '',
    currency: 'USD',
    feeReminderTemplate: '',
  };

  newYear = { name: '', startDate: '', endDate: '', isCurrent: false };
  newTerm = { name: '', termNumber: 1, startDate: '', endDate: '', schoolYearId: '', isCurrent: false };
  newForm = { name: '', level: 1 };
  newClass = { name: '', formId: '', capacity: 40, classTeacherId: '' };
  newSubject = { code: '', name: '', description: '' };
  newAssignment = { classId: '', subjectId: '', teacherId: '' };
  newTuckshopItem = { name: '', sku: '', unitPrice: 0, stockQuantity: 0, reorderLevel: 10 };

  selectedClassId = signal('');
  whatsappTest = { phone: '', message: '' };

  filteredClassSubjects = computed(() => {
    const classId = this.selectedClassId();
    if (!classId) return this.classSubjects();
    return this.classSubjects().filter((cs) => cs.classId === classId);
  });

  selectedClass = computed(() =>
    this.classes().find((c) => c.id === this.selectedClassId()) ?? null
  );

  pageStats = computed(() => ({
    subjects: this.subjects().length,
    classes: this.classes().length,
    forms: this.forms().length,
    assignments: this.filteredClassSubjects().length,
    years: this.schoolYears().length,
  }));

  examWeightTotal = computed(() =>
    this.examTypes().reduce((s, e) => s + Number(e.weight), 0)
  );

  gradeBoundaryRanges = computed(() => {
    const sorted = [...this.gradeBoundaries()].sort((a, b) => b.minPercent - a.minPercent);
    return sorted.map((b, i) => {
      const top = i === 0 ? 100 : sorted[i - 1].minPercent - 1;
      return {
        ...b,
        rangeLabel:
          i === 0
            ? `${b.minPercent}% – 100%`
            : `${b.minPercent}% – ${Math.max(b.minPercent, top)}%`,
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

  activeTabMeta = computed(() =>
    this.tabs.find((t) => t.id === this.activeTab()) ?? this.tabs[0]
  );

  ngOnInit() {
    this.loadAll();
  }

  setTab(tab: Tab) {
    this.activeTab.set(tab);
  }

  loadAll() {
    this.loading.set(true);
    forkJoin({
      settings: this.api.get<{ school: SchoolSettings; whatsapp: WhatsAppStatus }>('/admin/settings'),
      years: this.api.get<SchoolYear[]>('/admin/school-years'),
      forms: this.api.get<FormRow[]>('/admin/forms'),
      classes: this.api.get<ClassRow[]>('/admin/classes'),
      subjects: this.api.get<SubjectRow[]>('/admin/subjects'),
      classSubjects: this.api.get<ClassSubjectRow[]>('/admin/class-subjects'),
      staff: this.api.get<StaffRow[]>('/admin/staff'),
      examTypes: this.api.get<ExamTypeRow[]>('/admin/exam-types'),
      tuckshop: this.api.get<TuckshopItem[]>('/admin/tuckshop/items'),
    }).subscribe({
      next: (data) => {
        this.school.set(data.settings.school);
        this.whatsapp.set(data.settings.whatsapp);
        this.profileForm = { ...data.settings.school };
        this.gradeBoundaries.set(
          data.settings.school.gradeBoundaries?.length
            ? data.settings.school.gradeBoundaries.map((b) => ({ ...b }))
            : this.defaultGradeBoundaries()
        );
        this.schoolYears.set(data.years);
        this.forms.set(data.forms);
        this.classes.set(data.classes);
        this.subjects.set(data.subjects);
        this.classSubjects.set(data.classSubjects);
        this.staff.set(data.staff);
        this.examTypes.set(data.examTypes);
        this.tuckshopItems.set(data.tuckshop);
        const currentYear = data.years.find((y) => y.isCurrent) || data.years[0];
        if (currentYear) this.newTerm.schoolYearId = currentYear.id;
        if (data.classes[0]) {
          this.selectedClassId.set(data.classes[0].id);
          this.newAssignment.classId = data.classes[0].id;
        }
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.showToast('error', 'Failed to load settings');
      },
    });
  }

  logoFullUrl(): string | null {
    const school = this.school();
    const url = school?.logoUrl;
    if (!url) return null;
    const origin = environment.apiUrl.replace(/\/api$/, '');
    const cacheBust = school?.updatedAt ? `?v=${encodeURIComponent(school.updatedAt)}` : '';
    return `${origin}${url}${cacheBust}`;
  }

  onLogoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!/^image\//i.test(file.type)) {
      this.showToast('error', 'Please choose a PNG, JPG, or WebP image.');
      return;
    }
    this.uploadingLogo.set(true);
    this.api.uploadFile<SchoolSettings>('/admin/settings/logo', file, 'logo').subscribe({
      next: (s) => {
        this.school.set(s);
        this.profileForm = { ...this.profileForm, logoUrl: s.logoUrl };
        this.uploadingLogo.set(false);
        this.showToast('success', 'School logo uploaded.');
        input.value = '';
      },
      error: (e) => {
        this.uploadingLogo.set(false);
        input.value = '';
        this.showToast('error', e.error?.message || 'Failed to upload logo.');
      },
    });
  }

  removeLogo(): void {
    this.uploadingLogo.set(true);
    this.api.delete<SchoolSettings>('/admin/settings/logo').subscribe({
      next: (s) => {
        this.school.set(s);
        this.profileForm = { ...this.profileForm, logoUrl: undefined };
        this.uploadingLogo.set(false);
        this.showToast('success', 'School logo removed.');
      },
      error: () => {
        this.uploadingLogo.set(false);
        this.showToast('error', 'Failed to remove logo.');
      },
    });
  }

  saveProfile() {
    this.submitting.set(true);
    this.api.patch<SchoolSettings>('/admin/settings', this.profileForm).subscribe({
      next: (s) => {
        this.school.set(s);
        this.profileForm = { ...s };
        this.submitting.set(false);
        this.showToast('success', 'School profile saved');
      },
      error: () => {
        this.submitting.set(false);
        this.showToast('error', 'Failed to save profile');
      },
    });
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
        this.api.get<FormRow[]>('/admin/forms').subscribe((f) => this.forms.set(f));
        this.showToast('success', 'Form added');
      },
      error: () => this.showToast('error', 'Failed to add form'),
    });
  }

  addClass() {
    if (!this.newClass.name || !this.newClass.formId) {
      this.showToast('error', 'Enter class name and select form');
      return;
    }
    const body = {
      ...this.newClass,
      classTeacherId: this.newClass.classTeacherId || undefined,
    };
    this.api.post('/admin/classes', body).subscribe({
      next: () => {
        this.newClass = { name: '', formId: '', capacity: 40, classTeacherId: '' };
        this.api.get<ClassRow[]>('/admin/classes').subscribe((c) => this.classes.set(c));
        this.showToast('success', 'Class created');
      },
      error: () => this.showToast('error', 'Failed to create class'),
    });
  }

  updateClassTeacher(cls: ClassRow, teacherId: string) {
    this.api.patch(`/admin/classes/${cls.id}`, {
      classTeacherId: teacherId || null,
    }).subscribe({
      next: () => this.showToast('success', 'Class teacher updated'),
      error: () => this.showToast('error', 'Failed to update class'),
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
    this.api.post('/admin/class-subjects', {
      classId: this.newAssignment.classId,
      subjectId: this.newAssignment.subjectId,
      teacherId: this.newAssignment.teacherId || undefined,
    }).subscribe({
      next: () => {
        this.onClassSelect(this.newAssignment.classId);
        this.newAssignment.subjectId = '';
        this.newAssignment.teacherId = '';
        this.showToast('success', 'Subject assigned to class');
      },
      error: (e) => this.showToast('error', e.error?.message || 'Assignment failed (may already exist)'),
    });
  }

  updateAssignmentTeacher(cs: ClassSubjectRow, teacherId: string) {
    this.api.patch(`/admin/class-subjects/${cs.id}`, {
      teacherId: teacherId || null,
    }).subscribe({
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

  addGradeBoundary() {
    this.gradeBoundaries.update((rows) => [
      ...rows,
      { grade: '', label: '', minPercent: 0 },
    ]);
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
        this.school.set(s);
        this.gradeBoundaries.set(s.gradeBoundaries?.map((b) => ({ ...b })) ?? rows);
        this.submitting.set(false);
        this.showToast('success', 'Grade boundaries saved. New marks will use these grades.');
      },
      error: (e) => {
        this.submitting.set(false);
        this.showToast('error', e.error?.message || 'Failed to save grade boundaries');
      },
    });
  }

  saveExamType(et: ExamTypeRow) {
    this.api.patch(`/admin/exam-types/${et.id}`, {
      weight: Number(et.weight),
      maxMarks: Number(et.maxMarks),
    }).subscribe({
      next: () => this.showToast('success', `${et.name} weights saved`),
      error: () => this.showToast('error', 'Failed to save exam type'),
    });
  }

  testWhatsApp() {
    if (!this.whatsappTest.phone) {
      this.showToast('error', 'Enter a phone number (e.g. +263771000005)');
      return;
    }
    this.submitting.set(true);
    this.api.post<{ sent: boolean }>('/admin/settings/test-whatsapp', this.whatsappTest).subscribe({
      next: () => {
        this.submitting.set(false);
        this.showToast('success', 'Test message sent (or logged in mock mode)');
      },
      error: (e) => {
        this.submitting.set(false);
        this.showToast('error', e.error?.message || 'WhatsApp test failed');
      },
    });
  }

  addTuckshopItem() {
    if (!this.newTuckshopItem.name) return;
    this.api.post('/admin/tuckshop/items', this.newTuckshopItem).subscribe({
      next: () => {
        this.newTuckshopItem = { name: '', sku: '', unitPrice: 0, stockQuantity: 0, reorderLevel: 10 };
        this.api.get<TuckshopItem[]>('/admin/tuckshop/items').subscribe((t) => this.tuckshopItems.set(t));
        this.showToast('success', 'Tuckshop item added');
      },
      error: () => this.showToast('error', 'Failed to add item'),
    });
  }

  saveTuckshopItem(item: TuckshopItem) {
    this.api.patch(`/admin/tuckshop/items/${item.id}`, {
      unitPrice: Number(item.unitPrice),
      stockQuantity: Number(item.stockQuantity),
      reorderLevel: Number(item.reorderLevel),
      isActive: item.isActive,
    }).subscribe({
      next: () => this.showToast('success', `${item.name} updated`),
      error: () => this.showToast('error', 'Failed to update item'),
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

  private reloadYears() {
    this.api.get<SchoolYear[]>('/admin/school-years').subscribe((y) => this.schoolYears.set(y));
  }

  private showToast(type: 'success' | 'error', msg: string) {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 4500);
  }
}
