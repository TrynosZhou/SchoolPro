import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe, SlicePipe } from '@angular/common';
import { Router } from '@angular/router';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { TEACHER_NAV_SECTIONS } from '../../core/config/teacher-nav';
import { ApiService } from '../../core/services/api.service';
import { classDisplayName } from '../../core/utils/class-display';

interface ClassOption {
  id: string;
  name: string;
  form?: { name: string };
}

interface TermOption {
  id: string;
  name: string;
  isCurrent?: boolean;
  startDate?: string;
  endDate?: string;
}

interface ReportStudent {
  studentId: string;
  admissionNumber: string;
  firstName: string;
  lastName: string;
  daysMarked: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  attendancePercent: number | null;
}

interface ReportResponse {
  term: {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    configuredEndDate?: string;
    extendedEnd?: boolean;
    schoolYear?: string;
  };
  class: { id: string; name: string; formName?: string };
  students: ReportStudent[];
}

@Component({
  selector: 'app-attendance-report',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, DecimalPipe, SlicePipe],
  templateUrl: './attendance-report.component.html',
  styleUrl: './attendance-report.component.scss',
})
export class AttendanceReportComponent implements OnInit {
  private api = inject(ApiService);
  private router = inject(Router);

  readonly isTeacherPortal = this.router.url.startsWith('/teacher');
  readonly adminNav = ADMIN_NAV_SECTIONS;
  readonly teacherNav = TEACHER_NAV_SECTIONS;
  portalTitle = this.isTeacherPortal ? 'Teacher Portal' : 'Admin Portal';
  pageTitle = 'Attendance Report';

  classes = signal<ClassOption[]>([]);
  terms = signal<TermOption[]>([]);
  report = signal<ReportResponse | null>(null);

  selectedClassId = '';
  selectedTermId = '';

  loadingClasses = signal(true);
  loadingTerms = signal(true);
  loadingReport = signal(false);
  hasGenerated = signal(false);
  search = signal('');
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  selectedClassLabel = computed(() =>
    classDisplayName(this.classes(), this.selectedClassId),
  );

  filteredRows = computed(() => {
    const q = this.search().trim().toLowerCase();
    const rows = [...(this.report()?.students || [])];
    if (!q) return rows;
    return rows.filter((s) =>
      `${s.admissionNumber} ${s.lastName} ${s.firstName}`.toLowerCase().includes(q),
    );
  });

  classTotals = computed(() => {
    const rows = this.report()?.students || [];
    return rows.reduce(
      (acc, s) => ({
        present: acc.present + s.present,
        absent: acc.absent + s.absent,
        late: acc.late + s.late,
        excused: acc.excused + s.excused,
        daysMarked: acc.daysMarked + s.daysMarked,
      }),
      { present: 0, absent: 0, late: 0, excused: 0, daysMarked: 0 },
    );
  });

  ngOnInit(): void {
    this.api.get<TermOption[]>('/exams/terms').subscribe({
      next: (t) => {
        this.terms.set(t);
        const current = t.find((x) => x.isCurrent);
        if (current) this.selectedTermId = current.id;
        this.loadingTerms.set(false);
      },
      error: () => {
        this.loadingTerms.set(false);
        this.showToast('error', 'Could not load terms.');
      },
    });

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

  generateReport(): void {
    if (!this.selectedClassId || !this.selectedTermId) {
      this.showToast('error', 'Select both class and term.');
      return;
    }

    this.loadingReport.set(true);
    this.hasGenerated.set(false);
    this.api
      .get<ReportResponse>('/attendance/students/report', {
        classId: this.selectedClassId,
        termId: this.selectedTermId,
      })
      .subscribe({
        next: (data) => {
          this.report.set(data);
          this.loadingReport.set(false);
          this.hasGenerated.set(true);
          if (!data.students.length) this.showToast('error', 'No students found for this class.');
        },
        error: (e) => {
          this.loadingReport.set(false);
          this.showToast('error', e.error?.message || 'Failed to generate report.');
        },
      });
  }

  exportCsv(): void {
    const rows = this.report()?.students;
    if (!rows?.length) return;

    const header = ['Student ID', 'Last Name', 'First Name', 'Days Marked', 'Present', 'Late', 'Absent', 'Excused', 'Attendance %'];
    const lines = rows.map((s) =>
      [
        s.admissionNumber,
        s.lastName,
        s.firstName,
        s.daysMarked,
        s.present,
        s.late,
        s.absent,
        s.excused,
        s.attendancePercent ?? '',
      ].join(','),
    );
    const csv = [header.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance-report-${this.selectedClassLabel().replace(/[^\w\-]+/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  private showToast(type: 'success' | 'error', msg: string): void {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 4000);
  }
}
