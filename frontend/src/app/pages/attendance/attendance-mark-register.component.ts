import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { TEACHER_NAV_SECTIONS } from '../../core/config/teacher-nav';
import { ApiService } from '../../core/services/api.service';
import { classDisplayName } from '../../core/utils/class-display';
import { Student } from '../../core/models';

type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

interface ClassOption {
  id: string;
  name: string;
  form?: { name: string };
}

interface AttendanceRecord {
  studentId: string;
  status: AttendanceStatus;
  remarks?: string;
}

interface StudentRow {
  id: string;
  admissionNumber: string;
  firstName: string;
  lastName: string;
  gender?: string;
}

@Component({
  selector: 'app-attendance-mark-register',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule],
  templateUrl: './attendance-mark-register.component.html',
  styleUrl: './attendance-mark-register.component.scss',
})
export class AttendanceMarkRegisterComponent implements OnInit {
  private api = inject(ApiService);
  private router = inject(Router);

  readonly isTeacherPortal = this.router.url.startsWith('/teacher');
  readonly adminNav = ADMIN_NAV_SECTIONS;
  readonly teacherNav = TEACHER_NAV_SECTIONS;
  portalTitle = this.isTeacherPortal ? 'Teacher Portal' : 'Admin Portal';
  pageTitle = 'Mark Register';

  classes = signal<ClassOption[]>([]);
  students = signal<StudentRow[]>([]);
  marks = signal<Record<string, AttendanceStatus>>({});
  remarks = signal<Record<string, string>>({});

  selectedClassId = '';
  selectedDate = new Date().toISOString().split('T')[0];

  loadingClasses = signal(true);
  loadingRegister = signal(false);
  hasLoaded = signal(false);
  submitting = signal(false);
  search = signal('');
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  readonly statusOptions: AttendanceStatus[] = ['present', 'late', 'absent', 'excused'];

  selectedClassLabel = computed(() =>
    classDisplayName(this.classes(), this.selectedClassId),
  );

  filteredStudents = computed(() => {
    const q = this.search().trim().toLowerCase();
    const rows = [...this.students()].sort(
      (a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName),
    );
    if (!q) return rows;
    return rows.filter((s) =>
      `${s.admissionNumber} ${s.lastName} ${s.firstName}`.toLowerCase().includes(q),
    );
  });

  summary = computed(() => {
    const m = this.marks();
    let present = 0;
    let absent = 0;
    let late = 0;
    let excused = 0;
    for (const s of this.students()) {
      const st = m[s.id] || 'present';
      if (st === 'present') present++;
      else if (st === 'absent') absent++;
      else if (st === 'late') late++;
      else if (st === 'excused') excused++;
    }
    return { total: this.students().length, present, absent, late, excused };
  });

  ngOnInit(): void {
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

  loadRegister(): void {
    if (!this.selectedClassId) {
      this.showToast('error', 'Select a class first.');
      return;
    }
    if (!this.selectedDate) {
      this.showToast('error', 'Select a date.');
      return;
    }

    this.loadingRegister.set(true);
    this.hasLoaded.set(false);

    this.api
      .get<Student[]>('/students', { classId: this.selectedClassId, enrolled: 'true' })
      .subscribe({
        next: (studentList) => {
          const rows: StudentRow[] = studentList.map((s) => ({
            id: s.id,
            admissionNumber: s.admissionNumber,
            firstName: s.firstName,
            lastName: s.lastName,
            gender: s.gender,
          }));
          this.students.set(rows);

          const defaultMarks: Record<string, AttendanceStatus> = {};
          for (const s of rows) defaultMarks[s.id] = 'present';
          this.marks.set(defaultMarks);
          this.remarks.set({});

          this.api
            .get<{ studentId: string; status: AttendanceStatus; remarks?: string }[]>('/attendance/students', {
              classId: this.selectedClassId,
              date: this.selectedDate,
            })
            .subscribe({
              next: (records) => {
                const marks = { ...defaultMarks };
                const rem: Record<string, string> = {};
                for (const r of records) {
                  marks[r.studentId] = r.status;
                  if (r.remarks) rem[r.studentId] = r.remarks;
                }
                this.marks.set(marks);
                this.remarks.set(rem);
                this.loadingRegister.set(false);
                this.hasLoaded.set(true);
                if (!rows.length) this.showToast('error', 'No enrolled students in this class.');
              },
              error: () => {
                this.loadingRegister.set(false);
                this.hasLoaded.set(true);
                this.showToast('error', 'Could not load existing attendance.');
              },
            });
        },
        error: (e) => {
          this.loadingRegister.set(false);
          this.showToast('error', e.error?.message || 'Could not load students.');
        },
      });
  }

  setStatus(studentId: string, status: AttendanceStatus): void {
    this.marks.set({ ...this.marks(), [studentId]: status });
  }

  saveRegister(): void {
    if (!this.hasLoaded() || !this.students().length) {
      this.showToast('error', 'Load the register before saving.');
      return;
    }

    const records: AttendanceRecord[] = this.students().map((s) => ({
      studentId: s.id,
      status: this.marks()[s.id] || 'present',
      remarks: this.remarks()[s.id] || undefined,
    }));

    this.submitting.set(true);
    this.api.post('/attendance/students/bulk', { date: this.selectedDate, records }).subscribe({
      next: () => {
        this.submitting.set(false);
        this.showToast('success', `Attendance saved for ${this.selectedDate}.`);
      },
      error: (e) => {
        this.submitting.set(false);
        this.showToast('error', e.error?.message || 'Failed to save attendance.');
      },
    });
  }

  markAll(status: AttendanceStatus): void {
    const marks: Record<string, AttendanceStatus> = {};
    for (const s of this.students()) marks[s.id] = status;
    this.marks.set(marks);
  }

  private showToast(type: 'success' | 'error', msg: string): void {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 4000);
  }
}
