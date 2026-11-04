import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe, NgClass, SlicePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { buildTeacherNavSections } from '../../core/config/teacher-nav';
import { AuthService } from '../../core/services/auth.service';
import { DIRECTOR_NAV_ITEMS } from '../../core/config/director-nav';
import { PRINCIPAL_NAV_ITEMS } from '../../core/config/principal-nav';
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

type RateFilter = 'all' | 'excellent' | 'good' | 'atRisk' | 'noData';
type SortKey = 'name' | 'rateDesc' | 'rateAsc' | 'absentDesc';
type ViewMode = 'table' | 'cards';

@Component({
  selector: 'app-attendance-report',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, DecimalPipe, SlicePipe, NgClass, RouterLink],
  templateUrl: './attendance-report.component.html',
  styleUrl: './attendance-report.component.scss',
})
export class AttendanceReportComponent implements OnInit {
  private api = inject(ApiService);
  private router = inject(Router);
  private auth = inject(AuthService);

  readonly isTeacherPortal = this.router.url.startsWith('/teacher');
  readonly isDirectorPortal = this.router.url.startsWith('/director');
  readonly isPrincipalPortal = this.router.url.startsWith('/principal');
  readonly adminNav = ADMIN_NAV_SECTIONS;
  get teacherNav() {
    return buildTeacherNavSections(this.auth.user()?.permissions);
  }
  readonly directorNav = DIRECTOR_NAV_ITEMS;
  readonly principalNav = PRINCIPAL_NAV_ITEMS;
  portalTitle = this.isPrincipalPortal ? 'Principal Portal' : this.isDirectorPortal ? 'Director Portal' : this.isTeacherPortal ? 'Teacher Portal' : 'Admin Portal';
  pageTitle = 'Attendance Report';

  readonly markRegisterPath = this.isTeacherPortal ? '/teacher/attendance/mark-register' : '/admin/attendance/mark-register';

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
  rateFilter = signal<RateFilter>('all');
  sortBy = signal<SortKey>('name');
  viewMode = signal<ViewMode>('table');
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  readonly sortOptions: { value: SortKey; label: string }[] = [
    { value: 'name', label: 'Name (A–Z)' },
    { value: 'rateDesc', label: 'Attendance % (high → low)' },
    { value: 'rateAsc', label: 'Attendance % (low → high)' },
    { value: 'absentDesc', label: 'Most absences' },
  ];

  selectedClassLabel = computed(() =>
    classDisplayName(this.classes(), this.selectedClassId),
  );

  filteredRows = computed(() => {
    const q = this.search().trim().toLowerCase();
    const filter = this.rateFilter();
    let rows = [...(this.report()?.students || [])];

    if (q) {
      rows = rows.filter((s) =>
        `${s.admissionNumber} ${s.lastName} ${s.firstName}`.toLowerCase().includes(q),
      );
    }

    rows = rows.filter((s) => {
      const pct = s.attendancePercent;
      switch (filter) {
        case 'excellent':
          return pct != null && pct >= 95;
        case 'good':
          return pct != null && pct >= 80 && pct < 95;
        case 'atRisk':
          return pct != null && pct < 80;
        case 'noData':
          return pct == null || s.daysMarked === 0;
        default:
          return true;
      }
    });

    const sort = this.sortBy();
    rows.sort((a, b) => {
      if (sort === 'rateDesc') {
        return (b.attendancePercent ?? -1) - (a.attendancePercent ?? -1);
      }
      if (sort === 'rateAsc') {
        const av = a.attendancePercent ?? 999;
        const bv = b.attendancePercent ?? 999;
        return av - bv;
      }
      if (sort === 'absentDesc') {
        return b.absent - a.absent || a.lastName.localeCompare(b.lastName);
      }
      return a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName);
    });

    return rows;
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

  reportStats = computed(() => {
    const rows = this.report()?.students || [];
    const withRate = rows.filter((s) => s.attendancePercent != null);
    const avg =
      withRate.length > 0
        ? Math.round((withRate.reduce((sum, s) => sum + (s.attendancePercent ?? 0), 0) / withRate.length) * 10) / 10
        : null;

    return {
      totalStudents: rows.length,
      classAverage: avg,
      excellent: rows.filter((s) => (s.attendancePercent ?? 0) >= 95).length,
      good: rows.filter((s) => {
        const p = s.attendancePercent;
        return p != null && p >= 80 && p < 95;
      }).length,
      atRisk: rows.filter((s) => s.attendancePercent != null && s.attendancePercent < 80).length,
      noData: rows.filter((s) => s.attendancePercent == null || s.daysMarked === 0).length,
    };
  });

  distribution = computed(() => {
    const t = this.classTotals();
    const total = t.present + t.late + t.absent + t.excused;
    if (!total) {
      return { present: 0, late: 0, absent: 0, excused: 0, total: 0 };
    }
    return {
      present: Math.round((t.present / total) * 1000) / 10,
      late: Math.round((t.late / total) * 1000) / 10,
      absent: Math.round((t.absent / total) * 1000) / 10,
      excused: Math.round((t.excused / total) * 1000) / 10,
      total,
    };
  });

  rateFilterCounts = computed(() => {
    const rows = this.report()?.students || [];
    return {
      all: rows.length,
      excellent: rows.filter((s) => (s.attendancePercent ?? 0) >= 95).length,
      good: rows.filter((s) => {
        const p = s.attendancePercent;
        return p != null && p >= 80 && p < 95;
      }).length,
      atRisk: rows.filter((s) => s.attendancePercent != null && s.attendancePercent < 80).length,
      noData: rows.filter((s) => s.attendancePercent == null || s.daysMarked === 0).length,
    };
  });

  hasActiveFilters = computed(
    () => !!this.search().trim() || this.rateFilter() !== 'all' || this.sortBy() !== 'name',
  );

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
    this.search.set('');
    this.rateFilter.set('all');
    this.sortBy.set('name');

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
          if (!data.students.length) {
            this.showToast('error', 'No students found for this class.');
          } else {
            this.showToast('success', `Report generated for ${data.students.length} students.`);
          }
        },
        error: (e) => {
          this.loadingReport.set(false);
          this.showToast('error', e.error?.message || 'Failed to generate report.');
        },
      });
  }

  clearFilters(): void {
    this.search.set('');
    this.rateFilter.set('all');
    this.sortBy.set('name');
  }

  rateTier(percent: number | null): 'excellent' | 'good' | 'atRisk' | 'none' {
    if (percent == null) return 'none';
    if (percent >= 95) return 'excellent';
    if (percent >= 80) return 'good';
    return 'atRisk';
  }

  exportCsv(): void {
    const rows = this.filteredRows();
    if (!rows.length) return;

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
    this.showToast('success', 'CSV exported.');
  }

  printReport(): void {
    const r = this.report();
    if (!r?.students.length) return;

    const rows = this.filteredRows();
    const stats = this.reportStats();
    const dist = this.distribution();
    const totals = this.classTotals();
    const classLabel = this.selectedClassLabel();
    const termRange = `${r.term.startDate.slice(0, 10)} – ${r.term.endDate.slice(0, 10)}`;

    const tableRows = rows
      .map(
        (s) => `
      <tr>
        <td>${s.admissionNumber}</td>
        <td>${s.lastName}</td>
        <td>${s.firstName}</td>
        <td class="num">${s.daysMarked}</td>
        <td class="num">${s.present}</td>
        <td class="num">${s.late}</td>
        <td class="num">${s.absent}</td>
        <td class="num">${s.excused}</td>
        <td class="num">${s.attendancePercent != null ? `${s.attendancePercent}%` : '—'}</td>
      </tr>`,
      )
      .join('');

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Attendance Report — ${classLabel}</title>
<style>
  body { font-family: system-ui, sans-serif; color: #0f172a; margin: 24px; }
  h1 { margin: 0 0 4px; font-size: 1.35rem; }
  .meta { color: #64748b; font-size: 0.9rem; margin-bottom: 20px; }
  .summary { display: flex; gap: 24px; flex-wrap: wrap; margin-bottom: 20px; font-size: 0.88rem; }
  .summary strong { display: block; font-size: 1.1rem; color: #0f172a; }
  table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
  th, td { border: 1px solid #e2e8f0; padding: 8px 10px; text-align: left; }
  th { background: #f8fafc; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; color: #64748b; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  tfoot td { font-weight: 600; background: #f8fafc; }
  @media print { body { margin: 12px; } }
</style></head><body>
  <h1>Attendance Report — ${classLabel}</h1>
  <p class="meta">${r.term.name}${r.term.schoolYear ? ` · ${r.term.schoolYear}` : ''} · ${termRange}</p>
  <div class="summary">
    <div><span>Students</span><strong>${stats.totalStudents}</strong></div>
    <div><span>Class average</span><strong>${stats.classAverage != null ? `${stats.classAverage}%` : '—'}</strong></div>
    <div><span>At risk (&lt;80%)</span><strong>${stats.atRisk}</strong></div>
    <div><span>Distribution</span><strong>P ${dist.present}% · L ${dist.late}% · A ${dist.absent}% · E ${dist.excused}%</strong></div>
  </div>
  <table>
    <thead><tr>
      <th>Student ID</th><th>Last</th><th>First</th><th>Days</th><th>Present</th><th>Late</th><th>Absent</th><th>Excused</th><th>Rate</th>
    </tr></thead>
    <tbody>${tableRows}</tbody>
    <tfoot><tr>
      <td colspan="3">Class totals</td>
      <td class="num">${totals.daysMarked}</td>
      <td class="num">${totals.present}</td>
      <td class="num">${totals.late}</td>
      <td class="num">${totals.absent}</td>
      <td class="num">${totals.excused}</td>
      <td></td>
    </tr></tfoot>
  </table>
  <script>window.onload = () => { window.print(); window.onafterprint = () => window.close(); };</script>
</body></html>`;

    const win = window.open('', '_blank', 'noopener,noreferrer,width=900,height=700');
    if (!win) {
      this.showToast('error', 'Allow pop-ups to print the report.');
      return;
    }
    win.document.write(html);
    win.document.close();
  }

  private showToast(type: 'success' | 'error', msg: string): void {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 4000);
  }
}
