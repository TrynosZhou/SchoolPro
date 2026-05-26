import { Component, inject, OnInit, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-director-finance',
  standalone: true,
  imports: [PortalLayoutComponent, DecimalPipe],
  template: `
    <app-portal-layout portalTitle="Director Portal" pageTitle="Financial Books"
      [navItems]="nav">
      <div class="stats-grid">
        <div class="stat-card green"><span class="stat-value">{{ '$' + (balanceSheet()?.cashBalance | number:'1.2-2') }}</span><span class="stat-label">Cash Balance</span></div>
        <div class="stat-card orange"><span class="stat-value">{{ '$' + (balanceSheet()?.totalDebtors | number:'1.2-2') }}</span><span class="stat-label">Total Debtors</span></div>
        <div class="stat-card blue"><span class="stat-value">{{ '$' + (balanceSheet()?.monthlyCollections | number:'1.2-2') }}</span><span class="stat-label">Monthly Collections</span></div>
      </div>
      <section class="card">
        <h3>Debtors Aging</h3>
        <table class="data-table">
          <thead><tr><th>Period</th><th>Invoices</th><th>Amount</th></tr></thead>
          <tbody>
            @for (row of aging(); track row.bucket) {
              <tr><td>{{ row.bucket }}</td><td>{{ row.count }}</td><td>{{ '$' + (row.amount | number:'1.2-2') }}</td></tr>
            }
          </tbody>
        </table>
      </section>
      <section class="card">
        <h3>Cashbook (Recent)</h3>
        <table class="data-table">
          <thead><tr><th>Date</th><th>Description</th><th>In</th><th>Out</th><th>Balance</th></tr></thead>
          <tbody>
            @for (e of cashbook(); track e.id) {
              <tr>
                <td>{{ e.entryDate }}</td>
                <td>{{ e.description }}</td>
                <td class="text-green">{{ e.moneyIn ? '$' + e.moneyIn : '-' }}</td>
                <td class="text-red">{{ e.moneyOut ? '$' + e.moneyOut : '-' }}</td>
                <td>{{ '$' + e.balance }}</td>
              </tr>
            }
          </tbody>
        </table>
      </section>
    </app-portal-layout>
  `,
})
export class DirectorFinanceComponent implements OnInit {
  private api = inject(ApiService);
  nav = [
    { label: 'Overview', path: '/director', icon: '📊' },
    { label: 'Finance', path: '/director/finance', icon: '💰' },
    { label: 'Attendance', path: '/director/attendance', icon: '📋' },
    { label: 'Academics', path: '/director/academics', icon: '📚' },
    { label: 'Store & Inventory', path: '/director/store', icon: '🏪' },
  ];
  balanceSheet = signal<{ cashBalance: number; totalDebtors: number; monthlyCollections: number } | null>(null);
  aging = signal<{ bucket: string; count: number; amount: number }[]>([]);
  cashbook = signal<{ id: string; entryDate: string; description: string; moneyIn?: number; moneyOut?: number; balance: number }[]>([]);

  ngOnInit() {
    this.api.get<{ cashBalance: number; totalDebtors: number; monthlyCollections: number }>('/finance/balance-sheet').subscribe((d) => this.balanceSheet.set(d));
    this.api.get<{ bucket: string; count: number; amount: number }[]>('/finance/debtors-aging').subscribe((d) => this.aging.set(d));
    this.api.get<{ id: string; entryDate: string; description: string; moneyIn?: number; moneyOut?: number; balance: number }[]>('/finance/cashbook').subscribe((d) => this.cashbook.set(d.slice(0, 20)));
  }
}
