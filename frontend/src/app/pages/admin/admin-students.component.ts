import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';
import { Student } from '../../core/models';

type StudentForm = {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  address: string;
  previousSchool: string;
};

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
  nextStudentId = signal('');
  lastCreatedId = signal('');
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
  }

  private emptyForm(): StudentForm {
    return {
      firstName: '',
      lastName: '',
      dateOfBirth: '',
      gender: '',
      address: '',
      previousSchool: '',
    };
  }

  toggleForm() {
    this.showForm = !this.showForm;
    this.editingStudent.set(null);
    this.lastCreatedId.set('');
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
      address: student.address || '',
      previousSchool: student.previousSchool || '',
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
    this.api.post<Student>('/students', body).subscribe({
      next: (student) => {
        this.saving.set(false);
        this.showForm = false;
        this.lastCreatedId.set(student.admissionNumber);
        this.showToast('success', `Student ${student.admissionNumber} registered.`);
        this.load();
        this.resetForm();
      },
      error: () => {
        this.saving.set(false);
        this.showToast('error', 'Registration failed. Check required fields.');
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
      error: () => {
        this.saving.set(false);
        this.showToast('error', 'Update failed. Try again.');
      },
    });
  }

  private buildPayload() {
    return {
      ...this.form,
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
    return true;
  }

  resetForm() {
    this.form = this.emptyForm();
    this.guardian = { fullName: '', phone: '', relationship: 'Parent', isPrimary: true };
    this.nextStudentId.set('');
  }

  enrollmentStatus(s: Student): 'pending' | 'enrolled' {
    return s.classId || s.schoolClass ? 'enrolled' : 'pending';
  }

  private showToast(type: 'success' | 'error', msg: string) {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 4000);
  }
}
