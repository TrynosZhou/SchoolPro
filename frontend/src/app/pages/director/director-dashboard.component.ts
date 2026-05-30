import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DecimalPipe, DatePipe } from '@angular/common';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { executivePortalForRole, executiveActionGroups } from '../../core/utils/executive-portal.util';

interface DirectorDashboardData {
  currentTerm: { id: string; name: string } | null;
  currentSchoolYear: { id: string; name: string } | null;
  totalStudents: number;
  totalStaff: number;
  enrolledStudents: number;
  unenrolledStudents: number;
  attendanceToday: { status: string; count: number }[];
  monthlyCollections: number;
  totalDebtors: number;
  cashBalance: number;
  lowStockItems: number;
  outstandingInvoices: number;
  debtRatio: number;
  financeHealth: string;
  topDebtors: {
    studentId: string;
    firstName: string;
    lastName: string;
    admissionNumber: string;
    className?: string;
    formName?: string;
    owed: number;
  }[];
  recentPayments: {
    id: string;
    amount: number;
    label: string;
    method: string;
    paidAt: string;
    firstName: string;
    lastName: string;
    admissionNumber: string;
  }[];
  classDebtSummary: {
    id: string;
    name: string;
    formName?: string;
    owed: number;
    studentsOwing: number;
  }[];
  lowStockAlerts: {
    name: string;
    stockQuantity: number;
    reorderLevel: number;
    unitPrice: number;
  }[];
  collectionsTrend: { day: string; total: number }[];
}

@Component({
  selector: 'app-director-dashboard',
  standalone: true,
  imports: [PortalLayoutComponent, RouterLink, DecimalPipe, DatePipe],
  templateUrl: './director-dashboard.component.html',
  styleUrl: './director-dashboard.component.scss',
})
export class DirectorDashboardComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);

  readonly portal = computed(() => executivePortalForRole(this.auth.user()?.role));
  readonly actionGroups = computed(() => executiveActionGroups(this.portal().basePath));

  data = signal<DirectorDashboardData | null>(null);
  loading = signal(true);

  readonly todayLabel = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date());

  readonly greeting = computed(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  });

  readonly directorName = computed(() => {
    const u = this.auth.user();
    const name = u ? `${u.firstName} ${u.lastName}`.trim() : '';
    if (name) return name;
    return this.portal().basePath === '/principal' ? 'Principal' : 'Director';
  });

  readonly portalTitle = computed(() => this.portal().portalTitle);

  readonly statCards = computed(() => {
    const d = this.data();
    return [
      {
        key: 'students',
        title: 'Students',
        value: String(d?.totalStudents ?? 0),
        caption: `${d?.enrolledStudents ?? 0} enrolled · ${d?.unenrolledStudents ?? 0} pending class`,
        icon: '🎓',
        tone: 'blue',
      },
      {
        key: 'staff',
        title: 'Staff',
        value: String(d?.totalStaff ?? 0),
        caption: 'Active teaching & support team',
        icon: '👩‍🏫',
        tone: 'purple',
      },
      {
        key: 'cash',
        title: 'Cash Balance',
        value: `$${(d?.cashBalance ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        caption: 'Latest cashbook balance',
        icon: '🏦',
        tone: 'teal',
      },
      {
        key: 'collections',
        title: 'Collections (Month)',
        value: `$${(d?.monthlyCollections ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        caption: 'Payments received this month',
        icon: '💰',
        tone: 'green',
      },
      {
        key: 'debtors',
        title: 'Outstanding Debt',
        value: `$${(d?.totalDebtors ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        caption: `${d?.outstandingInvoices ?? 0} open invoice(s)`,
        icon: '📊',
        tone: 'orange',
      },
      {
        key: 'inventory',
        title: 'Low Stock',
        value: String(d?.lowStockItems ?? 0),
        caption: 'Store items at reorder level',
        icon: '📦',
        tone: 'amber',
      },
    ];
  });

  readonly attendanceTotal = computed(() =>
    (this.data()?.attendanceToday ?? []).reduce((sum, row) => sum + Number(row.count || 0), 0),
  );

  readonly trendMax = computed(() => {
    const values = (this.data()?.collectionsTrend ?? []).map((t) => t.total);
    return Math.max(...values, 1);
  });

  ngOnInit() {
    this.api.get<DirectorDashboardData>('/dashboard/director').subscribe({
      next: (d) => {
        this.data.set(d);
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

  financeHealthClass(): string {
    const health = this.data()?.financeHealth ?? 'Healthy';
    if (health === 'High Risk') return 'risk';
    if (health === 'Watch List') return 'warn';
    return 'ok';
  }

  formatMethod(m: string): string {
    const map: Record<string, string> = {
      cash: 'Cash',
      bank: 'Bank',
      ecocash: 'EcoCash',
      onemoney: 'OneMoney',
      innbucks: 'InnBucks',
      other: 'Other',
    };
    return map[m] || m;
  }

  trendBarHeight(total: number): number {
    return Math.max(8, Math.round((total / this.trendMax()) * 100));
  }

  trendDayLabel(day: string): string {
    const d = new Date(day + 'T12:00:00');
    return new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(d);
  }
}
