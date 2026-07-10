import { NgClass } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { formatTitledFullName } from '../../core/utils/class-display';
import { DashboardOverview } from '../../core/models';

interface AttentionItem {
  id: string;
  title: string;
  detail: string;
  path: string;
  tone: 'warning' | 'danger' | 'info';
}

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [PortalLayoutComponent, RouterLink, DecimalPipe, NgClass],
  templateUrl: './admin-dashboard.component.html',
  styleUrl: './admin-dashboard.component.scss',
})
export class AdminDashboardComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);

  readonly adminNav = ADMIN_NAV_SECTIONS;
  readonly overview = signal<DashboardOverview | null>(null);
  readonly loading = signal(true);

  readonly todayLabel = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date());

  readonly greetingPeriod = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'morning';
    if (hour < 17) return 'afternoon';
    return 'evening';
  })();

  readonly greetingName = computed(() => {
    const u = this.auth.user();
    if (!u) return 'Administrator';
    const titled = formatTitledFullName(u.firstName, u.lastName, u.gender);
    return titled || 'Administrator';
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

  readonly attentionItems = computed((): AttentionItem[] => {
    if (this.loading()) return [];
    const items: AttentionItem[] = [];
    if (this.attendanceTotal() === 0) {
      items.push({
        id: 'attendance',
        title: 'No attendance recorded today',
        detail: 'Open the mark register to start today\'s submissions.',
        path: '/admin/attendance/mark-register',
        tone: 'info',
      });
    }
    if (this.debtRatio() >= 40) {
      items.push({
        id: 'debt',
        title: 'High outstanding balance ratio',
        detail: `Debt is ${this.debtRatio().toFixed(0)}% of this month's collections.`,
        path: '/admin/fin-reports/debtor-aging',
        tone: 'warning',
      });
    }
    const lowStock = Number(this.overview()?.lowStockItems ?? 0);
    if (lowStock > 0) {
      items.push({
        id: 'stock',
        title: `${lowStock} low-stock item${lowStock === 1 ? '' : 's'}`,
        detail: 'Review inventory before stockouts affect operations.',
        path: '/admin/finance',
        tone: 'danger',
      });
    }
    return items;
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
      },
      {
        key: 'staff',
        title: 'Staff',
        value: String(o?.totalStaff ?? 0),
        caption: 'Teaching & support',
        path: '/admin/staff',
        tone: 'indigo',
      },
      {
        key: 'collections',
        title: 'Collections',
        value: `$${(o?.monthlyCollections ?? 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`,
        caption: 'Received this month',
        path: '/admin/payment',
        tone: 'green',
      },
      {
        key: 'debtors',
        title: 'Outstanding',
        value: `$${(o?.totalDebtors ?? 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`,
        caption: 'Debtor balances',
        path: '/admin/fin-reports/debtor-aging',
        tone: 'amber',
      },
    ];
  });

  readonly quickActions = [
    { label: 'Mark register', path: '/admin/attendance/mark-register' },
    { label: 'Record payment', path: '/admin/payment' },
    { label: 'Billing', path: '/admin/billing' },
    { label: 'Announcements', path: '/admin/communication/send' },
    { label: 'Report cards', path: '/admin/report-cards' },
    { label: 'Timetable', path: '/admin/timetable/generate' },
    { label: 'LMS', path: '/admin/lms' },
    { label: 'Library', path: '/admin/library' },
  ];

  ngOnInit(): void {
    this.api.get<{ gender?: string | null }>('/auth/me').subscribe({
      next: (profile) => {
        if (profile.gender != null) {
          this.auth.patchUser({ gender: profile.gender });
        }
      },
    });

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

  attendanceTone(status: string): string {
    const s = status.toLowerCase();
    if (s.includes('present')) return 'present';
    if (s.includes('absent')) return 'absent';
    if (s.includes('late')) return 'late';
    if (s.includes('excus')) return 'excused';
    return '';
  }
}
