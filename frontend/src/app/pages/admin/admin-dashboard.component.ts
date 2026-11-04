import { Component, computed, inject, OnInit, signal } from '@angular/core';
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
  imports: [PortalLayoutComponent],
  templateUrl: './admin-dashboard.component.html',
  styleUrl: './admin-dashboard.component.scss',
})
export class AdminDashboardComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);

  readonly adminNav = ADMIN_NAV_SECTIONS;
  readonly overview = signal<DashboardOverview | null>(null);
  readonly schoolName = signal('School Pro');
  readonly academicYear = signal('Academic Year 2025-2026');
  readonly currencySymbol = signal('$');
  readonly loading = signal(true);

  readonly todayLabel = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  readonly statCardsRow1 = computed(() => {
    return [
      {
        title: 'Total Students',
        value: '30',
        trend: '+8 this term',
        trendTone: 'green',
        icon: 'students',
        tone: 'purple',
      },
      {
        title: 'Teaching Staff',
        value: '7',
        trend: '+2 this term',
        trendTone: 'green',
        icon: 'staff',
        tone: 'violet',
      },
      {
        title: 'Active Classes',
        value: '7',
        trend: 'Stable',
        trendTone: 'blue',
        icon: 'classes',
        tone: 'blue',
      },
      {
        title: 'Overall Attendance',
        value: '89%',
        trend: 'Last 12 days',
        trendTone: 'green',
        icon: 'attendance',
        tone: 'green',
      },
    ];
  });

  readonly statCardsRow2 = computed(() => {
    const data = this.overview();
    const symbol = this.currencySymbol();
    
    return [
      {
        title: 'Fees Collected',
        value: `${symbol}${Number(data?.monthlyCollections || 0).toLocaleString()}`,
        trend: 'This academic year',
        trendTone: 'green',
        icon: 'finance',
        tone: 'green',
      },
      {
        title: 'Fees Pending',
        value: `${symbol}${Number(data?.totalDebtors || 0).toLocaleString()}`,
        trend: 'Pending dues',
        trendTone: 'red',
        icon: 'pending-fees',
        tone: 'orange',
      },
      {
        title: 'Pending Leaves',
        value: '2',
        trend: 'Needs review',
        trendTone: 'orange',
        icon: 'leaves',
        tone: 'red',
      },
      {
        title: 'Active Notices',
        value: '4',
        trend: 'Published',
        trendTone: 'purple',
        icon: 'notices',
        tone: 'purple',
      },
    ];
  });

  ngOnInit(): void {
    this.api.get<{ schoolName: string | null; currency?: string }>('/dashboard/school-links').subscribe({
      next: (data) => {
        if (data.schoolName) this.schoolName.set(data.schoolName);
        if (data.currency) {
          const sym = data.currency === 'INR' ? '₹' : data.currency === 'GBP' ? '£' : data.currency === 'EUR' ? '€' : '$';
          this.currencySymbol.set(sym);
        }
      },
    });

    this.api.get<any[]>('/admin/school-years').subscribe({
      next: (years) => {
        const current = years.find((y) => y.isCurrent);
        if (current) this.academicYear.set(`Academic Year ${current.name}`);
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
}
