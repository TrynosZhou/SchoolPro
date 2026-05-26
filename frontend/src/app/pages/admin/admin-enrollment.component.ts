import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { TEACHER_NAV_SECTIONS } from '../../core/config/teacher-nav';
import { ApiService } from '../../core/services/api.service';
import { classSelectLabel } from '../../core/utils/class-display';
import { Student } from '../../core/models';

interface ClassOption {
  id: string;
  name: string;
  capacity: number;
  form?: { name: string };
  students?: { id: string }[];
}

@Component({
  selector: 'app-admin-enrollment',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, RouterLink],
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

  view = signal<'pending' | 'enrolled'>('pending');
  pending = signal<Student[]>([]);
  enrolled = signal<Student[]>([]);
  classes = signal<ClassOption[]>([]);
  search = signal('');
  selectedClassId = signal<Record<string, string>>({});
  submitting = signal<string | null>(null);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  filteredPending = computed(() => {
    const q = this.search().toLowerCase();
    if (!q) return this.pending();
    return this.pending().filter((s) =>
      `${s.firstName} ${s.lastName} ${s.admissionNumber}`.toLowerCase().includes(q)
    );
  });

  filteredEnrolled = computed(() => {
    const q = this.search().toLowerCase();
    if (!q) return this.enrolled();
    return this.enrolled().filter((s) =>
      `${s.firstName} ${s.lastName} ${s.admissionNumber} ${s.schoolClass?.name}`.toLowerCase().includes(q)
    );
  });

  pendingCount = computed(() => this.pending().length);

  ngOnInit() {
    if (this.router.url.startsWith('/teacher')) {
      this.portalTitle = 'Teacher Portal';
      this.studentsLink = '/teacher';
    }
    this.load();
    this.api.get<ClassOption[]>('/admin/classes').subscribe((c) => this.classes.set(c));
  }

  setView(v: 'pending' | 'enrolled') {
    this.view.set(v);
  }

  load() {
    this.api.get<Student[]>('/students', { unenrolled: 'true' }).subscribe((s) => this.pending.set(s));
    this.api.get<Student[]>('/students', { enrolled: 'true' }).subscribe((s) => this.enrolled.set(s));
  }

  classLabel(c: ClassOption): string {
    const count = c.students?.length ?? 0;
    return `${classSelectLabel(c)} — ${count}/${c.capacity}`;
  }

  enroll(student: Student) {
    const classId = this.selectedClassId()[student.id];
    if (!classId) {
      this.showToast('error', 'Select a class first');
      return;
    }
    this.submitting.set(student.id);
    this.api.patch<Student>(`/students/${student.id}/enroll`, { classId }).subscribe({
      next: () => {
        this.submitting.set(null);
        this.showToast('success', `${student.firstName} enrolled successfully`);
        this.load();
        const map = { ...this.selectedClassId() };
        delete map[student.id];
        this.selectedClassId.set(map);
      },
      error: (e) => {
        this.submitting.set(null);
        this.showToast('error', e.error?.message || 'Enrollment failed');
      },
    });
  }

  changeClass(student: Student, classId: string) {
    if (!classId) return;
    this.submitting.set(student.id);
    this.api.patch<Student>(`/students/${student.id}/enroll`, { classId }).subscribe({
      next: () => {
        this.submitting.set(null);
        this.showToast('success', 'Class updated');
        this.load();
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
        this.load();
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

  private showToast(type: 'success' | 'error', msg: string) {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 4000);
  }
}
