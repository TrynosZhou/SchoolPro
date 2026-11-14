import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { DashboardOverview } from '../../core/models';

type KpiTone = 'lavender' | 'mint' | 'sky' | 'peach';

interface KpiCard {
  key: string;
  title: string;
  value: string;
  caption: string;
  icon: string;
  tone: KpiTone;
  link: string;
}

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [PortalLayoutComponent, RouterLink],
  templateUrl: './admin-dashboard.component.html',
  styleUrl: './admin-dashboard.component.scss',
})
export class AdminDashboardComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);

  readonly adminNav = ADMIN_NAV_SECTIONS;
  readonly overview = signal<DashboardOverview | null>(null);
  readonly schoolName = signal('School Pro');
  readonly academicYear = signal('Academic Year');
  readonly currencySymbol = signal('$');
  readonly loading = signal(true);

  readonly todayLabel = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  readonly greeting = computed(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  });

  readonly adminName = computed(() => {
    const u = this.auth.user();
    return u ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() : '';
  });

  readonly attendance = computed(() => {
    const rows = this.overview()?.attendanceToday ?? [];
    const countOf = (status: string) =>
      Number(rows.find((r) => (r.status || '').toLowerCase() === status)?.count || 0);

    const present = countOf('present');
    const late = countOf('late');
    const absent = countOf('absent');
    const total = present + late + absent;
    const pct = (value: number) => (total ? Math.round((value / total) * 100) : 0);

    return {
      present,
      late,
      absent,
      total,
      rate: total ? pct(present) : null,
      presentPct: pct(present),
      latePct: pct(late),
      absentPct: pct(absent),
    };
  });

  readonly enrolment = computed(() => {
    const boarders = Number(this.overview()?.boarders || 0);
    const dayScholars = Number(this.overview()?.dayScholars || 0);
    const total = boarders + dayScholars || Number(this.overview()?.totalStudents || 0);
    const boarderPct = total ? Math.round((boarders / total) * 100) : 0;
    return {
      boarders,
      dayScholars,
      total,
      boarderPct,
      dayPct: total ? 100 - boarderPct : 0,
    };
  });

  readonly staffSplit = computed(() => {
    const male = Number(this.overview()?.maleStaff || 0);
    const female = Number(this.overview()?.femaleStaff || 0);
    const total = Number(this.overview()?.totalStaff || 0);
    return {
      male,
      female,
      total,
      malePct: total ? Math.round((male / total) * 100) : 0,
      femalePct: total ? 100 - Math.round((male / total) * 100) : 0,
    };
  });

  readonly finance = computed(() => {
    const symbol = this.currencySymbol();
    const collected = Number(this.overview()?.monthlyCollections || 0);
    const outstanding = Number(this.overview()?.totalDebtors || 0);
    const expected = collected + outstanding;
    return {
      collectedLabel: `${symbol}${collected.toLocaleString()}`,
      outstandingLabel: `${symbol}${outstanding.toLocaleString()}`,
      rate: expected ? Math.round((collected / expected) * 100) : 0,
    };
  });

  readonly lowStock = computed(() => Number(this.overview()?.lowStockItems || 0));

  readonly kpis = computed<KpiCard[]>(() => {
    const d = this.overview();
    const att = this.attendance();
    const enr = this.enrolment();
    const staff = this.staffSplit();
    const fin = this.finance();

    return [
      {
        key: 'students',
        title: 'Total Students',
        value: String(d?.totalStudents ?? 0),
        caption: `${enr.boarders} boarders · ${enr.dayScholars} day scholars`,
        icon: 'students',
        tone: 'lavender',
        link: '/admin/students',
      },
      {
        key: 'staff',
        title: 'Teaching Staff',
        value: String(staff.total),
        caption: `${staff.male} male · ${staff.female} female`,
        icon: 'staff',
        tone: 'mint',
        link: '/admin/staff',
      },
      {
        key: 'attendance',
        title: 'Attendance Today',
        value: att.rate === null ? '—' : `${att.rate}%`,
        caption: att.total ? `${att.present} of ${att.total} presented` : 'Register not marked yet',
        icon: 'attendance',
        tone: 'sky',
        link: '/admin/attendance/report',
      },
      {
        key: 'finance',
        title: 'Fees Collected',
        value: fin.collectedLabel,
        caption: 'Current month',
        icon: 'finance',
        tone: 'peach',
        link: '/admin/finance',
      },
    ];
  });

  ngOnInit(): void {
    this.auth.refreshProfile();
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
