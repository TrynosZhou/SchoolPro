import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ChartData, ChartOptions } from 'chart.js';
import { ApiService } from '../../core/services/api.service';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ChartComponent } from '../../shared/chart/chart.component';
import { resolveExecutivePortalLayout } from '../../core/utils/portal-layout.util';

interface RetentionData {
  byYear: { schoolYearId: string; name: string; enrolled: number; graduated: number }[];
  yearOverYear: {
    fromYear: string;
    toYear: string;
    eligible: number;
    returned: number;
    graduated: number;
    dropped: number;
    retentionRate: number | null;
    dropoutRate: number | null;
  }[];
  termAttrition: {
    termId: string;
    termName: string;
    yearName: string;
    startDate: string;
    endDate: string;
    exits: number;
    withdrawn: number;
    transferred: number;
    graduated: number;
  }[];
  recentExits: {
    id: string;
    admissionNumber: string;
    firstName: string;
    lastName: string;
    status: string;
    exitDate: string;
    exitReason?: string;
    formName?: string;
  }[];
  summary: {
    currentRetentionRate: number | null;
    currentDropoutRate: number | null;
    latestPair: string | null;
    totalExits: number;
    hasHistory: boolean;
  };
}

interface AtRiskData {
  window: { termId: string | null; termName: string; start: string; end: string };
  counts: { total: number; high: number; medium: number; low: number };
  students: {
    studentId: string;
    admissionNumber: string;
    name: string;
    className: string | null;
    formName: string | null;
    attendanceRate: number | null;
    daysMarked: number;
    averageMark: number | null;
    performanceTrend: number | null;
    outstanding: number;
    riskScore: number;
    riskLevel: 'high' | 'medium' | 'low';
    riskFactors: string[];
  }[];
}

interface FilterOptions {
  terms: { id: string; name: string; isCurrent?: boolean }[];
  classes: { id: string; name: string }[];
  forms: { id: string; name: string }[];
}

@Component({
  selector: 'app-admin-analytics-retention',
  standalone: true,
  imports: [PortalLayoutComponent, ChartComponent, FormsModule, DecimalPipe, DatePipe],
  templateUrl: './admin-analytics-retention.component.html',
  styleUrl: './admin-analytics-retention.component.scss',
})
export class AdminAnalyticsRetentionComponent implements OnInit {
  private api = inject(ApiService);
  private router = inject(Router);

  readonly portalLayout = resolveExecutivePortalLayout(this.router);

  retention = signal<RetentionData | null>(null);
  atRisk = signal<AtRiskData | null>(null);
  options = signal<FilterOptions>({ terms: [], classes: [], forms: [] });
  loading = signal(true);
  atRiskLoading = signal(false);

  atRiskFilters = { termId: '', classId: '', formId: '' };

  ngOnInit(): void {
    this.api.get<FilterOptions>('/analytics/filters').subscribe({
      next: (opts) => {
        this.options.set({ terms: opts.terms, classes: opts.classes, forms: opts.forms });
        const current = opts.terms.find((t) => t.isCurrent);
        if (current) this.atRiskFilters.termId = current.id;
      },
    });
    this.loadRetention();
    this.loadAtRisk();
  }

  loadRetention(): void {
    this.loading.set(true);
    this.api.get<RetentionData>('/analytics/retention').subscribe({
      next: (d) => {
        this.retention.set(d);
        this.loading.set(false);
      },
      error: () => {
        this.retention.set(null);
        this.loading.set(false);
      },
    });
  }

  loadAtRisk(): void {
    this.atRiskLoading.set(true);
    const params: Record<string, string> = {};
    if (this.atRiskFilters.termId) params['termId'] = this.atRiskFilters.termId;
    if (this.atRiskFilters.classId) params['classId'] = this.atRiskFilters.classId;
    if (this.atRiskFilters.formId) params['formId'] = this.atRiskFilters.formId;
    this.api.get<AtRiskData>('/analytics/at-risk', params).subscribe({
      next: (d) => {
        this.atRisk.set(d);
        this.atRiskLoading.set(false);
      },
      error: () => {
        this.atRisk.set(null);
        this.atRiskLoading.set(false);
      },
    });
  }

  readonly retentionChart = computed<ChartData<'line'>>(() => {
    const rows = this.retention()?.yearOverYear ?? [];
    return {
      labels: rows.map((r) => `${r.fromYear} → ${r.toYear}`),
      datasets: [
        {
          label: 'Retention %',
          data: rows.map((r) => r.retentionRate ?? 0),
          borderColor: '#059669',
          backgroundColor: 'rgba(5, 150, 105, 0.1)',
          fill: true,
          tension: 0.3,
        },
        {
          label: 'Dropout %',
          data: rows.map((r) => r.dropoutRate ?? 0),
          borderColor: '#dc2626',
          backgroundColor: 'rgba(220, 38, 38, 0.08)',
          fill: true,
          tension: 0.3,
        },
      ],
    };
  });

  readonly enrollmentChart = computed<ChartData<'bar'>>(() => {
    const rows = this.retention()?.byYear ?? [];
    return {
      labels: rows.map((r) => r.name),
      datasets: [
        { label: 'Enrolled', data: rows.map((r) => r.enrolled), backgroundColor: '#2563eb' },
        { label: 'Graduated', data: rows.map((r) => r.graduated), backgroundColor: '#059669' },
      ],
    };
  });

  readonly termExitsChart = computed<ChartData<'bar'>>(() => {
    const rows = (this.retention()?.termAttrition ?? []).filter((t) => t.exits > 0);
    return {
      labels: rows.map((r) => `${r.termName} (${r.yearName})`),
      datasets: [
        { label: 'Withdrawn', data: rows.map((r) => r.withdrawn), backgroundColor: '#dc2626' },
        { label: 'Transferred', data: rows.map((r) => r.transferred), backgroundColor: '#d97706' },
        { label: 'Graduated', data: rows.map((r) => r.graduated), backgroundColor: '#059669' },
      ],
    };
  });

  readonly hasTermExits = computed(() =>
    (this.retention()?.termAttrition ?? []).some((t) => t.exits > 0),
  );

  readonly lineOptions: ChartOptions<'line'> = {
    scales: { y: { beginAtZero: true, max: 100, ticks: { callback: (v) => `${v}%` } } },
  };

  readonly stackedBarOptions: ChartOptions<'bar'> = {
    scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } },
  };

  statusLabel(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
}
