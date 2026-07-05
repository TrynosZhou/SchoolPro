import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe, SlicePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { PARENT_NAV_ITEMS } from '../../core/config/parent-nav';
import { STUDENT_NAV_ITEMS } from '../../core/config/student-nav';
import { ApiService } from '../../core/services/api.service';
import { formatGenderLabel, formatStudentClassLabel } from '../../core/utils/class-display';
import { AuthService } from '../../core/services/auth.service';

interface LinkedChild {
  linkId?: string;
  relationship?: string;
  student: {
    id: string;
    admissionNumber?: string;
    firstName: string;
    lastName: string;
    schoolClass?: { name?: string; form?: { name?: string } };
  };
}

interface TermOption {
  id: string;
  name: string;
  isCurrent?: boolean;
}

interface ParentAttendanceReport {
  term: {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    configuredEndDate?: string;
    extendedEnd?: boolean;
    schoolYear?: string;
  };
  student: {
    studentId: string;
    admissionNumber: string;
    firstName: string;
    lastName: string;
    className?: string;
    formName?: string;
    gender?: string;
  };
  summary: {
    daysMarked: number;
    present: number;
    absent: number;
    late: number;
    excused: number;
    attendancePercent: number | null;
  };
  records: { date: string; status: string; remarks: string | null }[];
}

@Component({
  selector: 'app-parent-attendance',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, DecimalPipe, SlicePipe, RouterLink],
  templateUrl: './parent-attendance.component.html',
  styleUrl: './parent-attendance.component.scss',
})
export class ParentAttendanceComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private route = inject(ActivatedRoute);

  readonly isStudent = computed(() => this.auth.user()?.role === 'student');
  readonly portalTitle = computed(() => (this.isStudent() ? 'Student Portal' : 'Parent Portal'));
  readonly nav = computed(() => (this.isStudent() ? STUDENT_NAV_ITEMS : PARENT_NAV_ITEMS));
  readonly homeLink = computed(() => (this.isStudent() ? '/student' : '/parent'));
  readonly formatStudentClassLabel = formatStudentClassLabel;
  readonly formatGenderLabel = formatGenderLabel;

  children = signal<LinkedChild[]>([]);
  terms = signal<TermOption[]>([]);
  report = signal<ParentAttendanceReport | null>(null);

  selectedStudentId = '';
  selectedTermId = '';

  loading = signal(true);
  loadingTerms = signal(true);
  generating = signal(false);
  hasGenerated = signal(false);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  ngOnInit() {
    this.loadChildren();
    this.loadTerms();
  }

  loadChildren() {
    const studentUserId = this.auth.user()?.studentId;
    if (this.auth.user()?.role === 'student' && studentUserId) {
      this.api.get<LinkedChild['student']>(`/students/${studentUserId}`).subscribe({
        next: (student) => {
          this.children.set([{ student }]);
          this.selectedStudentId = student.id;
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.showToast('error', 'Could not load student profile.');
        },
      });
      return;
    }

    this.api.get<LinkedChild[]>('/students/parent/my-children').subscribe({
      next: (rows) => {
        this.children.set(rows);
        const fromQuery = this.route.snapshot.queryParamMap.get('studentId');
        if (fromQuery && rows.some((r) => r.student.id === fromQuery)) {
          this.selectedStudentId = fromQuery;
        } else if (rows.length === 1) {
          this.selectedStudentId = rows[0].student.id;
        }
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.showToast('error', 'Could not load linked children.');
      },
    });
  }

  loadTerms() {
    this.api.get<TermOption[]>('/exams/terms').subscribe({
      next: (terms) => {
        const sorted = [...terms].sort((a, b) => {
          if (a.isCurrent && !b.isCurrent) return -1;
          if (!a.isCurrent && b.isCurrent) return 1;
          return a.name.localeCompare(b.name);
        });
        this.terms.set(sorted);
        const current = sorted.find((t) => t.isCurrent);
        this.selectedTermId = current?.id || sorted[0]?.id || '';
        this.loadingTerms.set(false);
      },
      error: () => {
        this.loadingTerms.set(false);
        this.showToast('error', 'Could not load terms.');
      },
    });
  }

  childLabel(child: LinkedChild): string {
    const s = child.student;
    const cls = [s.schoolClass?.form?.name, s.schoolClass?.name].filter(Boolean).join(' ');
    const id = s.admissionNumber ? ` (${s.admissionNumber})` : '';
    return `${s.firstName} ${s.lastName}${id}${cls ? ` — ${cls}` : ''}`;
  }

  canGenerate(): boolean {
    return !!(this.selectedStudentId && this.selectedTermId);
  }

  generateReport() {
    if (!this.canGenerate()) {
      this.showToast('error', 'Select a student and term.');
      return;
    }

    this.generating.set(true);
    this.hasGenerated.set(false);
    this.api
      .get<ParentAttendanceReport>('/attendance/students/parent-report', {
        studentId: this.selectedStudentId,
        termId: this.selectedTermId,
      })
      .subscribe({
        next: (data) => {
          this.report.set(data);
          this.generating.set(false);
          this.hasGenerated.set(true);
        },
        error: (e) => {
          this.generating.set(false);
          this.showToast('error', e.error?.message || 'Failed to generate attendance report.');
        },
      });
  }

  statusLabel(status: string): string {
    return status.charAt(0).toUpperCase() + status.slice(1);
  }

  private showToast(type: 'success' | 'error', msg: string) {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 4500);
  }
}
