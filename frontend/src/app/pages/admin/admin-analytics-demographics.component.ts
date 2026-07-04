import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ChartData, ChartOptions } from 'chart.js';
import { ApiService } from '../../core/services/api.service';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ChartComponent } from '../../shared/chart/chart.component';
import { resolveExecutivePortalLayout } from '../../core/utils/portal-layout.util';

interface FilterOptions {
  schoolYears: { id: string; name: string; isCurrent?: boolean }[];
  terms: { id: string; name: string; schoolYearId: string; isCurrent?: boolean }[];
  classes: { id: string; name: string; formId: string; formName?: string }[];
  forms: { id: string; name: string; level: number }[];
}

interface Demographics {
  source: 'live' | 'snapshot';
  schoolYearId?: string;
  totals: {
    total: number;
    male: number;
    female: number;
    unspecified: number;
    boarders: number;
    dayScholars: number;
  };
  byGender: { key: string; count: number }[];
  byStudentType: { key: string; count: number }[];
  byGrade: {
    formId: string;
    formName: string;
    level: number | null;
    total: number;
    male: number;
    female: number;
    unspecified: number;
  }[];
  byClass: {
    classId: string;
    className: string;
    total: number;
    male: number;
    female: number;
    boarders: number;
    dayScholars: number;
  }[];
  byAge: { key: string; count: number }[];
}

const PALETTE = {
  male: '#2563eb',
  female: '#db2777',
  unspecified: '#94a3b8',
  boarder: '#7c3aed',
  day: '#0891b2',
  bars: ['#1e3a8a', '#2563eb', '#0891b2', '#059669', '#d97706', '#db2777', '#7c3aed', '#dc2626'],
};

@Component({
  selector: 'app-admin-analytics-demographics',
  standalone: true,
  imports: [PortalLayoutComponent, ChartComponent, FormsModule, DecimalPipe],
  templateUrl: './admin-analytics-demographics.component.html',
  styleUrl: './admin-analytics-demographics.component.scss',
})
export class AdminAnalyticsDemographicsComponent implements OnInit {
  private api = inject(ApiService);
  private router = inject(Router);

  readonly portalLayout = resolveExecutivePortalLayout(this.router);

  options = signal<FilterOptions>({ schoolYears: [], terms: [], classes: [], forms: [] });
  filters = { schoolYearId: '', termId: '', classId: '', formId: '' };

  data = signal<Demographics | null>(null);
  loading = signal(false);

  readonly termsForYear = computed(() => {
    const y = this.filters.schoolYearId;
    const terms = this.options().terms;
    return y ? terms.filter((t) => t.schoolYearId === y) : terms;
  });

  ngOnInit(): void {
    this.api.get<FilterOptions>('/analytics/filters').subscribe({
      next: (opts) => {
        this.options.set(opts);
        const current = opts.schoolYears.find((y) => y.isCurrent);
        if (current) this.filters.schoolYearId = current.id;
        this.load();
      },
      error: () => this.load(),
    });
  }

  load(): void {
    this.loading.set(true);
    const params: Record<string, string> = {};
    if (this.filters.schoolYearId) params['schoolYearId'] = this.filters.schoolYearId;
    if (this.filters.termId) params['termId'] = this.filters.termId;
    if (this.filters.classId) params['classId'] = this.filters.classId;
    if (this.filters.formId) params['formId'] = this.filters.formId;
    this.api.get<Demographics>('/analytics/demographics', params).subscribe({
      next: (d) => {
        this.data.set(d);
        this.loading.set(false);
      },
      error: () => {
        this.data.set(null);
        this.loading.set(false);
      },
    });
  }

  onYearChange(): void {
    this.filters.termId = '';
    this.load();
  }

  resetFilters(): void {
    const current = this.options().schoolYears.find((y) => y.isCurrent);
    this.filters = { schoolYearId: current?.id || '', termId: '', classId: '', formId: '' };
    this.load();
  }

  // --- Chart data ---------------------------------------------------------

  readonly genderChart = computed<ChartData<'pie'>>(() => {
    const d = this.data();
    const rows = d?.byGender ?? [];
    return {
      labels: rows.map((r) => r.key),
      datasets: [
        {
          data: rows.map((r) => r.count),
          backgroundColor: rows.map((r) =>
            r.key === 'Male' ? PALETTE.male : r.key === 'Female' ? PALETTE.female : PALETTE.unspecified,
          ),
        },
      ],
    };
  });

  readonly typeChart = computed<ChartData<'doughnut'>>(() => {
    const d = this.data();
    const rows = d?.byStudentType ?? [];
    return {
      labels: rows.map((r) => r.key),
      datasets: [
        {
          data: rows.map((r) => r.count),
          backgroundColor: rows.map((r) => (r.key === 'Boarder' ? PALETTE.boarder : PALETTE.day)),
        },
      ],
    };
  });

  readonly gradeChart = computed<ChartData<'bar'>>(() => {
    const d = this.data();
    const rows = d?.byGrade ?? [];
    return {
      labels: rows.map((r) => r.formName),
      datasets: [
        { label: 'Male', data: rows.map((r) => r.male), backgroundColor: PALETTE.male },
        { label: 'Female', data: rows.map((r) => r.female), backgroundColor: PALETTE.female },
        {
          label: 'Unspecified',
          data: rows.map((r) => r.unspecified),
          backgroundColor: PALETTE.unspecified,
        },
      ],
    };
  });

  readonly classChart = computed<ChartData<'bar'>>(() => {
    const d = this.data();
    const rows = d?.byClass ?? [];
    return {
      labels: rows.map((r) => r.className),
      datasets: [
        { label: 'Boarders', data: rows.map((r) => r.boarders), backgroundColor: PALETTE.boarder },
        { label: 'Day Scholars', data: rows.map((r) => r.dayScholars), backgroundColor: PALETTE.day },
      ],
    };
  });

  readonly ageChart = computed<ChartData<'bar'>>(() => {
    const d = this.data();
    const rows = (d?.byAge ?? []).filter((r) => r.count > 0);
    return {
      labels: rows.map((r) => r.key),
      datasets: [
        {
          label: 'Students',
          data: rows.map((r) => r.count),
          backgroundColor: rows.map((_, i) => PALETTE.bars[i % PALETTE.bars.length]),
        },
      ],
    };
  });

  readonly stackedBarOptions: ChartOptions<'bar'> = {
    scales: {
      x: { stacked: true },
      y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } },
    },
  };

  readonly plainBarOptions: ChartOptions<'bar'> = {
    plugins: { legend: { display: false } },
    scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
  };

  pct(part: number, total: number): number {
    return total ? Math.round((part / total) * 1000) / 10 : 0;
  }
}
