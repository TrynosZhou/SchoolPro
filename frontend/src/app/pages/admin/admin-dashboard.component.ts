import { NgClass, NgTemplateOutlet } from '@angular/common';
import { Component, computed, ElementRef, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { CHANGE_PASSWORD_ICON, CHANGE_PASSWORD_LABEL, CHANGE_PASSWORD_PATHS } from '../../core/utils/change-password-route.util';
import { DashboardOverview } from '../../core/models';

interface MajorMenu {
  title: string;
  icon: string;
  primaryPath: string;
  links: { label: string; path: string }[];
}

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [PortalLayoutComponent, RouterLink, DecimalPipe, NgClass, NgTemplateOutlet],
  templateUrl: './admin-dashboard.component.html',
  styleUrl: './admin-dashboard.component.scss',
})
export class AdminDashboardComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private elementRef = inject(ElementRef<HTMLElement>);

  readonly adminNav = ADMIN_NAV_SECTIONS;
  readonly selectedMenu = signal<string | null>(null);
  readonly overview = signal<DashboardOverview | null>(null);
  readonly loading = signal(true);

  readonly todayLabel = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date());

  readonly greetingName = computed(() => {
    const u = this.auth.user();
    const name = u ? `${u.firstName} ${u.lastName}`.trim() : '';
    return name || 'Administrator';
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

  readonly statCards = computed(() => {
    const o = this.overview();
    return [
      {
        key: 'students',
        title: 'Students',
        value: String(o?.totalStudents ?? 0),
        caption: 'Enrolled learners',
        path: '/admin/students',
        tone: 'blue',
        icon: '👥',
      },
      {
        key: 'staff',
        title: 'Staff',
        value: String(o?.totalStaff ?? 0),
        caption: 'Teaching & support',
        path: '/admin/staff',
        tone: 'indigo',
        icon: '👩‍🏫',
      },
      {
        key: 'collections',
        title: 'Collections',
        value: `$${(o?.monthlyCollections ?? 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`,
        caption: 'Received this month',
        path: '/admin/payment',
        tone: 'green',
        icon: '💳',
      },
      {
        key: 'debtors',
        title: 'Outstanding',
        value: `$${(o?.totalDebtors ?? 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`,
        caption: 'Debtor balances',
        path: '/admin/fin-reports/debtor-aging',
        tone: 'amber',
        icon: '📊',
      },
    ];
  });

  readonly quickActions = [
    { label: 'Mark register', path: '/admin/attendance/mark-register', icon: '☑️' },
    { label: 'Record payment', path: '/admin/payment', icon: '💳' },
    { label: 'Billing', path: '/admin/billing', icon: '🧾' },
    { label: 'Announcements', path: '/admin/communication/send', icon: '✉️' },
    { label: 'Report cards', path: '/admin/report-cards', icon: '📄' },
    { label: 'Timetable', path: '/admin/timetable/generate', icon: '📅' },
    { label: CHANGE_PASSWORD_LABEL, path: CHANGE_PASSWORD_PATHS.admin, icon: CHANGE_PASSWORD_ICON },
  ];

  readonly majorMenus: MajorMenu[] = [
    {
      title: 'Students',
      icon: 'students',
      primaryPath: '/admin/students',
      links: [
        { label: 'Students', path: '/admin/students' },
        { label: 'Class Enrolment', path: '/admin/enrollment' },
        { label: 'Class List', path: '/admin/class-list' },
        { label: 'Class Promotion', path: '/admin/class-promotion' },
      ],
    },
    {
      title: 'Parents',
      icon: 'parents',
      primaryPath: '/admin/parents',
      links: [{ label: 'Parents', path: '/admin/parents' }],
    },
    {
      title: 'Attendance',
      icon: 'attendance',
      primaryPath: '/admin/attendance/mark-register',
      links: [
        { label: 'Mark Register', path: '/admin/attendance/mark-register' },
        { label: 'Attendance Report', path: '/admin/attendance/report' },
      ],
    },
    {
      title: 'Staff',
      icon: 'staff',
      primaryPath: '/admin/staff',
      links: [
        { label: 'Staff Directory', path: '/admin/staff' },
        { label: 'Class Assignments', path: '/admin/class-assignments' },
        { label: 'Staff Attendance', path: '/admin/staff-attendance' },
        { label: 'Payroll', path: '/admin/payroll' },
      ],
    },
    {
      title: 'Examinations',
      icon: 'examinations',
      primaryPath: '/admin/exams',
      links: [
        { label: 'Exam Marks', path: '/admin/exams' },
        { label: 'Report Cards', path: '/admin/report-cards' },
        { label: 'Mark Sheet', path: '/admin/mark-sheet' },
        { label: 'Results Analysis', path: '/admin/results-analysis' },
        { label: 'Ranking', path: '/admin/ranking' },
        { label: 'Mark Entry Progress', path: '/admin/mark-entry-progress' },
      ],
    },
    {
      title: 'Finance',
      icon: 'finance',
      primaryPath: '/admin/billing',
      links: [
        { label: 'Billing', path: '/admin/billing' },
        { label: 'Payment', path: '/admin/payment' },
        { label: 'Manage Fees', path: '/admin/manage-fees' },
        { label: 'Student Balance', path: '/admin/student-balance' },
        { label: 'Financial Books', path: '/admin/finance' },
      ],
    },
    {
      title: 'Fin. Reports',
      icon: 'fin-reports',
      primaryPath: '/admin/fin-reports/student-ledger',
      links: [
        { label: 'Student Ledger', path: '/admin/fin-reports/student-ledger' },
        { label: 'Outstanding Invoices', path: '/admin/fin-reports/outstanding-invoices' },
        { label: 'Student Reconciliation', path: '/admin/fin-reports/student-reconciliation' },
        { label: 'Debtor Aging', path: '/admin/fin-reports/debtor-aging' },
        { label: 'Fee Collection & Revenue', path: '/admin/fin-reports/fee-collection-revenue' },
      ],
    },
    {
      title: 'Communication',
      icon: 'communication',
      primaryPath: '/admin/communication/inbox',
      links: [
        { label: 'Announcements', path: '/admin/communication/send' },
        { label: 'Messages', path: '/admin/communication/inbox' },
      ],
    },
    {
      title: 'Timetable',
      icon: 'timetable',
      primaryPath: '/admin/timetable/view',
      links: [
        { label: 'Configure Periods', path: '/admin/timetable/configure-periods' },
        { label: 'Generate Timetable', path: '/admin/timetable/generate' },
        { label: 'Class Schedule', path: '/admin/timetable/view' },
      ],
    },
    {
      title: 'System Admin',
      icon: 'system-admin',
      primaryPath: '/admin/settings',
      links: [
        { label: 'School Settings', path: '/admin/settings' },
        { label: 'Academic Settings', path: '/admin/academic-settings' },
        { label: 'User Management', path: '/admin/user-management' },
        { label: CHANGE_PASSWORD_LABEL, path: CHANGE_PASSWORD_PATHS.admin },
        { label: 'User Permissions', path: '/admin/user-permissions' },
        { label: 'Integrations', path: '/admin/integrations' },
      ],
    },
  ];

  selectedMenuLinks = computed(() => {
    const key = this.selectedMenu();
    if (!key) return [];
    return this.majorMenus.find((m) => m.title === key)?.links ?? [];
  });

  ngOnInit(): void {
    this.api.get<DashboardOverview>('/dashboard/overview').subscribe({
      next: (d) => {
        this.overview.set(d);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  attendanceSegmentFlex(count: string | number): number {
    const total = this.attendanceTotal();
    if (!total) return 1;
    return Math.max(0.08, Number(count) / total);
  }

  isSelected(title: string): boolean {
    return this.selectedMenu() === title;
  }

  toggleMenu(title: string): void {
    const opening = this.selectedMenu() !== title;
    this.selectedMenu.update((current) => (current === title ? null : title));
    if (opening) {
      queueMicrotask(() => this.scrollMenuTileIntoView(title));
    }
  }

  onDashboardSubmenuClick(): void {
    const title = this.selectedMenu();
    if (title) {
      this.scrollMenuTileIntoView(title);
    }
  }

  menuDomId(title: string): string {
    return title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }

  private scrollMenuTileIntoView(title: string): void {
    requestAnimationFrame(() => {
      const tile = this.elementRef.nativeElement.querySelector(
        `#menu-tile-${this.menuDomId(title)}`,
      ) as HTMLElement | null;
      tile?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  primaryPathFor(title: string): string {
    return this.majorMenus.find((m) => m.title === title)?.primaryPath ?? '/admin';
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
