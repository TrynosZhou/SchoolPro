import { Component, inject, OnInit, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ApiService } from '../../core/services/api.service';
import { DashboardOverview } from '../../core/models';

@Component({
  selector: 'app-director-dashboard',
  standalone: true,
  imports: [PortalLayoutComponent, DecimalPipe],
  template: `
    <app-portal-layout portalTitle="Director Portal" pageTitle="Executive Overview"
      [navItems]="nav">
      <div class="stats-grid">
        @for (card of statCards(); track card.label) {
          <div class="stat-card" [class]="card.color">
            <span class="stat-value">{{ card.value }}</span>
            <span class="stat-label">{{ card.label }}</span>
          </div>
        }
      </div>
      <div class="grid-2">
        <section class="card">
          <h3>Financial Overview</h3>
          <p>Monthly collections: <strong>{{ '$' + (overview()?.monthlyCollections | number:'1.2-2') }}</strong></p>
          <p>Outstanding debtors: <strong>{{ '$' + (overview()?.totalDebtors | number:'1.2-2') }}</strong></p>
          <a routerLink="/director/finance" class="link">View cashbook & balance sheet →</a>
        </section>
        <section class="card">
          <h3>Operations</h3>
          <p>Active students: {{ overview()?.totalStudents }}</p>
          <p>Staff members: {{ overview()?.totalStaff }}</p>
          <p>Low stock items: {{ overview()?.lowStockItems }}</p>
        </section>
      </div>
    </app-portal-layout>
  `,
})
export class DirectorDashboardComponent implements OnInit {
  private api = inject(ApiService);
  overview = signal<DashboardOverview | null>(null);

  nav = [
    { label: 'Overview', path: '/director', icon: '📊' },
    { label: 'Finance', path: '/director/finance', icon: '💰' },
    { label: 'Attendance', path: '/director/attendance', icon: '📋' },
    { label: 'Academics', path: '/director/academics', icon: '📚' },
    { label: 'Store & Inventory', path: '/director/store', icon: '🏪' },
  ];

  statCards = signal<{ label: string; value: string | number; color: string }[]>([]);

  ngOnInit() {
    this.api.get<DashboardOverview>('/dashboard/overview').subscribe((data) => {
      this.overview.set(data);
      this.statCards.set([
        { label: 'Students', value: data.totalStudents, color: 'blue' },
        { label: 'Staff', value: data.totalStaff, color: 'purple' },
        { label: 'Collections (Month)', value: `$${data.monthlyCollections}`, color: 'green' },
        { label: 'Debtors', value: `$${data.totalDebtors}`, color: 'orange' },
      ]);
    });
  }
}
