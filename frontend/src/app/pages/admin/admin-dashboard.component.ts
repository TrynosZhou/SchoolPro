import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { DashboardOverview } from '../../core/models';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [PortalLayoutComponent, DecimalPipe, RouterLink],
  templateUrl: './admin-dashboard.component.html',
  styleUrl: './admin-dashboard.component.scss',
})
export class AdminDashboardComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);

  overview = signal<DashboardOverview | null>(null);
  loading = signal(true);
  readonly adminNav = ADMIN_NAV_SECTIONS;
  readonly todayLabel = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date());

  readonly greetingName = computed(() => {
    const u = this.auth.user();
    const name = u ? `${u.firstName} ${u.lastName}`.trim() : '';
    return name ? `${name}'s Dashboard` : 'School Operations Dashboard';
  });

  readonly attendanceRows = computed(() => this.overview()?.attendanceToday ?? []);
  readonly attendanceTotal = computed(() =>
    this.attendanceRows().reduce((sum, row) => sum + Number(row.count || 0), 0),
  );

  readonly debtRatio = computed(() => {
    const debtors = Number(this.overview()?.totalDebtors ?? 0);
    const collections = Number(this.overview()?.monthlyCollections ?? 0);
    if (!collections) return debtors > 0 ? 100 : 0;
    return (debtors / collections) * 100;
  });

  readonly financeHealth = computed(() => {
    const ratio = this.debtRatio();
    if (ratio >= 80) return 'High Risk';
    if (ratio >= 40) return 'Watch List';
    return 'Healthy';
  });

  readonly statCards = computed(() => {
    const o = this.overview();
    return [
      {
        key: 'students',
        title: 'Students',
        value: String(o?.totalStudents ?? 0),
        caption: 'Total enrolled learners',
        icon: '🎓',
        tone: 'blue',
      },
      {
        key: 'staff',
        title: 'Staff',
        value: String(o?.totalStaff ?? 0),
        caption: 'Teaching & support team',
        icon: '👩‍🏫',
        tone: 'purple',
      },
      {
        key: 'collections',
        title: 'Collections (Month)',
        value: `$${(o?.monthlyCollections ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        caption: 'Payments received this month',
        icon: '💰',
        tone: 'green',
      },
      {
        key: 'debtors',
        title: 'Debtors',
        value: `$${(o?.totalDebtors ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        caption: 'Outstanding balances',
        icon: '📊',
        tone: 'orange',
      },
    ];
  });

  readonly actionGroups = [
    {
      title: 'Students & Staff',
      links: [
        { label: 'Register Student', path: '/admin/students', icon: '📝' },
        { label: 'Class Enrollment', path: '/admin/enrollment', icon: '🎓' },
        { label: 'Staff Management', path: '/admin/staff', icon: '👩‍🏫' },
      ],
    },
    {
      title: 'Attendance',
      links: [
        { label: 'Mark Register', path: '/admin/attendance/mark-register', icon: '✅' },
        { label: 'Attendance Report', path: '/admin/attendance/report', icon: '📊' },
      ],
    },
    {
      title: 'Finance',
      links: [
        { label: 'Billing & Payments', path: '/admin/billing', icon: '💳' },
        { label: 'Manage Fees', path: '/admin/manage-fees', icon: '💵' },
        { label: 'Student Balance', path: '/admin/student-balance', icon: '🧮' },
        { label: 'Financial Books', path: '/admin/finance', icon: '💰' },
      ],
    },
    {
      title: 'Fin.Reports',
      links: [
        { label: 'Student Ledger', path: '/admin/fin-reports/student-ledger', icon: '📒' },
        { label: 'Outstanding Invoices', path: '/admin/fin-reports/outstanding-invoices', icon: '🧾' },
        { label: 'Student Reconcilliation', path: '/admin/fin-reports/student-reconciliation', icon: '⚖️' },
        { label: 'Debtor Aging', path: '/admin/fin-reports/debtor-aging', icon: '⏳' },
        { label: 'Fee Collection & Revenue', path: '/admin/fin-reports/fee-collection-revenue', icon: '📊' },
      ],
    },
    {
      title: 'Communication',
      links: [
        { label: 'Send Message', path: '/admin/communication/send', icon: '✉️' },
        { label: 'Inbox', path: '/admin/communication/inbox', icon: '📥' },
      ],
    },
    {
      title: 'Timetable',
      links: [
        { label: 'Configure Periods', path: '/admin/timetable/configure-periods', icon: '⏱️' },
        { label: 'Generate Timetable', path: '/admin/timetable/generate', icon: '📅' },
        { label: 'View Timetable', path: '/admin/timetable/view', icon: '👁️' },
      ],
    },
    {
      title: 'Academics',
      links: [
        { label: 'Exam Marks', path: '/admin/exams', icon: '🧾' },
        { label: 'Mark Sheet', path: '/admin/mark-sheet', icon: '📑' },
        { label: 'Results Analysis', path: '/admin/results-analysis', icon: '📈' },
        { label: 'Ranking', path: '/admin/ranking', icon: '🏆' },
        { label: 'Report Cards', path: '/admin/report-cards', icon: '📄' },
      ],
    },
    {
      title: 'System Administration',
      links: [
        { label: 'School Settings', path: '/admin/settings', icon: '⚙️' },
        { label: 'Academic Settings', path: '/admin/academic-settings', icon: '📚' },
        { label: 'User Permissions', path: '/admin/user-permissions', icon: '🔐' },
      ],
    },
  ];

  ngOnInit() {
    this.api.get<DashboardOverview>('/dashboard/overview').subscribe({
      next: (d) => {
        this.overview.set(d);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  attendanceTone(status: string): string {
    const s = status.toLowerCase();
    if (s.includes('present')) return 'present';
    if (s.includes('absent')) return 'absent';
    if (s.includes('late')) return 'late';
    if (s.includes('excus')) return 'excused';
    return '';
  }
}
