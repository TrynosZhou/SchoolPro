import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { buildTeacherNavSections } from '../../core/config/teacher-nav';
import { AuthService } from '../../core/services/auth.service';
import { ApiService } from '../../core/services/api.service';
import { classDisplayName } from '../../core/utils/class-display';
import { isSchoolDay, weekendDayName } from '../../core/utils/school-day.util';
import { Student } from '../../core/models';

type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';
type StatusFilter = 'all' | AttendanceStatus;
type ViewMode = 'table' | 'cards';

interface ClassOption {
  id: string;
  name: string;
  form?: { name: string };
  students?: { id: string }[];
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
  imports: [PortalLayoutComponent, FormsModule, RouterLink],
  templateUrl: './attendance-mark-register.component.html',
  styleUrl: './attendance-mark-register.component.scss',
})
export class AttendanceMarkRegisterComponent implements OnInit {
  private api = inject(ApiService);
  private router = inject(Router);
  private auth = inject(AuthService);

  readonly isTeacherPortal = this.router.url.startsWith('/teacher');
  readonly adminNav = ADMIN_NAV_SECTIONS;
  get teacherNav() {
    return buildTeacherNavSections(this.auth.user()?.permissions);
  }
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
  refreshing = signal(false);
  hasLoaded = signal(false);
  submitting = signal(false);
  search = signal('');
  statusFilter = signal<StatusFilter>('all');
  viewMode = signal<ViewMode>('table');
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  readonly statusOptions: AttendanceStatus[] = ['present', 'late', 'absent', 'excused'];

  selectedClassLabel = computed(() => classDisplayName(this.classes(), this.selectedClassId));

  visibleClasses = computed(() =>
    [...this.classes()].sort((a, b) => a.name.localeCompare(b.name)),
  );

  filteredStudents = computed(() => {
    const q = this.search().trim().toLowerCase();
    let rows = [...this.students()].sort(
      (a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName),
    );
    if (q) {
      rows = rows.filter((s) =>
        `${s.admissionNumber} ${s.lastName} ${s.firstName}`.toLowerCase().includes(q),
      );
    }
    const filter = this.statusFilter();
    if (filter !== 'all') {
      rows = rows.filter((s) => (this.marks()[s.id] || 'present') === filter);
    }
    return rows;
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
    const total = this.students().length;
    const rate = total ? Math.round((present / total) * 100) : 0;
    return { total, present, absent, late, excused, rate };
  });

  hasActiveFilters = computed(
    () => Boolean(this.search().trim()) || this.statusFilter() !== 'all',
  );

  /** Registers are marked Monday–Friday only. */
  canMarkSelectedDate = computed(() => isSchoolDay(this.selectedDate));

  selectedWeekendLabel = computed(() => weekendDayName(this.selectedDate));

  ngOnInit(): void {
    if (this.isTeacherPortal) {
      this.api
        .get<{ classTeacherOf: { classId: string; className: string; formName?: string }[] }>(
          '/dashboard/teacher',
        )
        .subscribe({
          next: (d) => {
            this.classes.set(
              (d.classTeacherOf || []).map((c) => ({
                id: c.classId,
                name: c.className,
                form: c.formName ? { name: c.formName } : undefined,
              })),
            );
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

  selectClass(classId: string): void {
    this.selectedClassId = classId;
    this.hasLoaded.set(false);
    this.students.set([]);
    this.marks.set({});
    this.remarks.set({});
    this.clearFilters();
  }

  onDateChange(): void {
    this.hasLoaded.set(false);
    this.students.set([]);
    this.marks.set({});
    this.remarks.set({});
    this.clearFilters();
  }

  setToday(): void {
    this.selectedDate = new Date().toISOString().split('T')[0];
    this.onDateChange();
  }

  setYesterday(): void {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    this.selectedDate = d.toISOString().split('T')[0];
    this.onDateChange();
  }

  isToday(): boolean {
    return this.selectedDate === new Date().toISOString().split('T')[0];
  }

  loadRegister(refresh = false): void {
    if (!this.selectedClassId) {
      this.showToast('error', 'Select a class first.');
      return;
    }
    if (!this.selectedDate) {
      this.showToast('error', 'Select a date.');
      return;
    }
    if (!this.canMarkSelectedDate()) {
      this.hasLoaded.set(false);
      this.students.set([]);
      this.showToast('error', `Registers cannot be marked on ${this.selectedWeekendLabel()}. Attendance is recorded Monday to Friday only.`);
      return;
    }

    if (refresh) this.refreshing.set(true);
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
                this.refreshing.set(false);
                this.hasLoaded.set(true);
                if (!rows.length) this.showToast('error', 'No enrolled students in this class.');
              },
              error: () => {
                this.loadingRegister.set(false);
                this.refreshing.set(false);
                this.hasLoaded.set(true);
                this.showToast('error', 'Could not load existing attendance.');
              },
            });
        },
        error: (e) => {
          this.loadingRegister.set(false);
          this.refreshing.set(false);
          this.showToast('error', e.error?.message || 'Could not load students.');
        },
      });
  }

  setStatus(studentId: string, status: AttendanceStatus): void {
    if (!this.canMarkSelectedDate()) return;
    this.marks.set({ ...this.marks(), [studentId]: status });
  }

  saveRegister(): void {
    if (!this.canMarkSelectedDate()) {
      this.showToast('error', `Registers cannot be marked on ${this.selectedWeekendLabel()}. Attendance is recorded Monday to Friday only.`);
      return;
    }
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
    this.api.post<{ queued?: boolean; message?: string }>('/attendance/students/bulk', { date: this.selectedDate, records }).subscribe({
      next: (res) => {
        this.submitting.set(false);
        if (res?.queued) {
          this.showToast('success', res.message || 'Attendance saved offline — will sync when you reconnect.');
        } else {
          this.showToast('success', `Attendance saved for ${this.selectedDate}.`);
        }
      },
      error: (e) => {
        this.submitting.set(false);
        this.showToast('error', e.error?.message || 'Failed to save attendance.');
      },
    });
  }

  markAll(status: AttendanceStatus): void {
    if (!this.canMarkSelectedDate()) return;
    const marks: Record<string, AttendanceStatus> = {};
    for (const s of this.students()) marks[s.id] = status;
    this.marks.set(marks);
  }

  clearFilters(): void {
    this.search.set('');
    this.statusFilter.set('all');
  }

  initials(student: StudentRow): string {
    return `${student.firstName.charAt(0)}${student.lastName.charAt(0)}`.toUpperCase();
  }

  statusLabel(status: AttendanceStatus): string {
    return status.charAt(0).toUpperCase() + status.slice(1);
  }

  rowStatus(studentId: string): AttendanceStatus {
    return this.marks()[studentId] || 'present';
  }

  private showToast(type: 'success' | 'error', msg: string): void {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 4000);
  }
}
