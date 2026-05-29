import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';
import { Student } from '../../core/models';

interface FormOption {
  id: string;
  name: string;
  level: number;
}

type StudentResidenceType = 'day_scholar' | 'boarder';

type StudentForm = {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  studentType: StudentResidenceType;
  address: string;
  previousSchool: string;
  formId: string;
};

interface RegisterStudentResponse extends Student {
  registrationInvoice?: {
    id: string;
    invoiceNumber: string;
    totalAmount: number;
  };
  registrationInvoiceError?: string;
}

@Component({
  selector: 'app-admin-students',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, RouterLink, NgTemplateOutlet],
  templateUrl: './admin-students.component.html',
  styleUrl: './admin-students.component.scss',
})
export class AdminStudentsComponent implements OnInit {
  private api = inject(ApiService);

  students = signal<Student[]>([]);
  forms = signal<FormOption[]>([]);
  nextStudentId = signal('');
  lastCreatedId = signal('');
  lastInvoiceInfo = signal('');
  saving = signal(false);
  search = '';
  showForm = false;
  editingStudent = signal<Student | null>(null);
  deleteTarget = signal<Student | null>(null);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  form: StudentForm = this.emptyForm();
  guardian = { fullName: '', phone: '', relationship: 'Parent', isPrimary: true };

  readonly adminNav = ADMIN_NAV_SECTIONS;

  registeredCount = computed(() => this.students().length);
  pendingEnrollmentCount = computed(() => this.students().filter((s) => !s.classId && !s.schoolClass).length);

  ngOnInit() {
    this.load();
    this.api.get<FormOption[]>('/admin/forms').subscribe({
      next: (f) => this.forms.set(f.sort((a, b) => a.level - b.level)),
      error: () => this.showToast('error', 'Could not load forms'),
    });
  }

  private emptyForm(): StudentForm {
    return {
      firstName: '',
      lastName: '',
      dateOfBirth: '',
      gender: '',
      studentType: 'day_scholar',
      address: '',
      previousSchool: '',
      formId: '',
    };
  }

  studentTypeLabel(type?: string): string {
    if (type === 'boarder') return 'Boarder';
    return 'Day Scholar';
  }

  formLabel(student: Student): string {
    return student.form?.name || student.schoolClass?.form?.name || '—';
  }

  toggleForm() {
    this.showForm = !this.showForm;
    this.editingStudent.set(null);
    this.lastCreatedId.set('');
    this.lastInvoiceInfo.set('');
    if (this.showForm) {
      this.resetForm();
      this.api.get<{ studentId: string }>('/students/next-student-id').subscribe({
        next: (r) => this.nextStudentId.set(r.studentId),
        error: () => this.nextStudentId.set('SP000001'),
      });
    }
  }

  load() {
    const params: Record<string, string> = {};
    if (this.search) params['search'] = this.search;
    this.api.get<Student[]>('/students', params).subscribe((s) => this.students.set(s));
  }

  openEdit(student: Student) {
    this.showForm = false;
    this.editingStudent.set(student);
    this.form = {
      firstName: student.firstName,
      lastName: student.lastName,
      dateOfBirth: student.dateOfBirth?.toString().slice(0, 10) || '',
      gender: student.gender || '',
      studentType: student.studentType === 'boarder' ? 'boarder' : 'day_scholar',
      address: student.address || '',
      previousSchool: student.previousSchool || '',
      formId: student.formId || student.form?.id || '',
    };
    const g = student.guardians?.[0];
    this.guardian = {
      fullName: g?.fullName || '',
      phone: g?.phone || '',
      relationship: g?.relationship || 'Parent',
      isPrimary: true,
    };
  }

  closeEdit() {
    this.editingStudent.set(null);
    this.resetForm();
  }

  confirmDelete(student: Student) {
    this.deleteTarget.set(student);
  }

  cancelDelete() {
    this.deleteTarget.set(null);
  }

  deleteStudent() {
    const student = this.deleteTarget();
    if (!student) return;
    this.saving.set(true);
    this.api.delete<{ message: string }>(`/students/${student.id}`).subscribe({
      next: () => {
        this.saving.set(false);
        this.deleteTarget.set(null);
        this.showToast('success', `${student.admissionNumber} removed.`);
        if (this.editingStudent()?.id === student.id) this.closeEdit();
        this.load();
      },
      error: () => {
        this.saving.set(false);
        this.showToast('error', 'Could not delete student. Try again.');
      },
    });
  }

  saveStudent() {
    if (!this.validateForm()) return;
    this.saving.set(true);
    const body = this.buildPayload();
    this.api.post<RegisterStudentResponse>('/students', body).subscribe({
      next: (student) => {
        this.saving.set(false);
        this.showForm = false;
        this.lastCreatedId.set(student.admissionNumber);
        if (student.registrationInvoice) {
          const amt = student.registrationInvoice.totalAmount;
          this.lastInvoiceInfo.set(
            `Invoice ${student.registrationInvoice.invoiceNumber} created ($${amt.toFixed(2)}).`,
          );
          this.showToast(
            'success',
            `${student.admissionNumber} registered. Registration invoice ${student.registrationInvoice.invoiceNumber} created.`,
          );
        } else if (student.registrationInvoiceError) {
          this.lastInvoiceInfo.set('');
          this.showToast(
            'error',
            `Student registered but invoice failed: ${student.registrationInvoiceError}`,
          );
        } else {
          this.showToast('success', `Student ${student.admissionNumber} registered.`);
        }
        this.load();
        this.resetForm();
      },
      error: (err) => {
        this.saving.set(false);
        this.showToast('error', err.error?.message || 'Registration failed. Check required fields.');
      },
    });
  }

  updateStudent() {
    const student = this.editingStudent();
    if (!student || !this.validateForm()) return;
    this.saving.set(true);
    const body = this.buildPayload();
    this.api.put<Student>(`/students/${student.id}`, body).subscribe({
      next: () => {
        this.saving.set(false);
        this.showToast('success', `${student.admissionNumber} updated successfully.`);
        this.closeEdit();
        this.load();
      },
      error: (err) => {
        this.saving.set(false);
        this.showToast('error', err.error?.message || 'Update failed. Try again.');
      },
    });
  }

  private buildPayload() {
    return {
      ...this.form,
      formId: this.form.formId,
      gender: this.form.gender,
      dateOfBirth: this.form.dateOfBirth || undefined,
      guardians: this.guardian.fullName
        ? [{ ...this.guardian }]
        : this.editingStudent()?.guardians?.length
          ? [{ ...this.guardian }]
          : [],
    };
  }

  private validateForm(): boolean {
    if (!this.form.firstName?.trim() || !this.form.lastName?.trim()) {
      this.showToast('error', 'First name and last name are required.');
      return false;
    }
    if (!this.form.gender) {
      this.showToast('error', 'Gender is required for every student record.');
      return false;
    }
    if (!this.form.studentType) {
      this.showToast('error', 'Select Day Scholar or Boarder.');
      return false;
    }
    if (!this.form.formId) {
      this.showToast('error', 'Form is required (e.g. Form 1).');
      return false;
    }
    return true;
  }

  resetForm() {
    this.form = this.emptyForm();
    this.guardian = { fullName: '', phone: '', relationship: 'Parent', isPrimary: true };
    this.nextStudentId.set('');
  }

  registrationProgress(): number {
    const requiredChecks = [
      Boolean(this.form.firstName?.trim()),
      Boolean(this.form.lastName?.trim()),
      Boolean(this.form.gender),
      Boolean(this.form.studentType),
      Boolean(this.form.formId),
    ];
    const complete = requiredChecks.filter(Boolean).length;
    return Math.round((complete / requiredChecks.length) * 100);
  }

  selectedFormHint(): string {
    const selected = this.forms().find((f) => f.id === this.form.formId);
    if (!selected) return 'Select a form to auto-apply the correct tuition structure.';
    if (selected.level <= 4) return 'Ordinary Level selected. Tuition follows O-Level settings.';
    return 'Advanced Level selected. Tuition follows A-Level settings.';
  }

  enrollmentStatus(s: Student): 'pending' | 'enrolled' {
    return s.classId || s.schoolClass ? 'enrolled' : 'pending';
  }

  private showToast(type: 'success' | 'error', msg: string) {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 5000);
  }
}
