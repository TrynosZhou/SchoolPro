import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ApiService } from '../../core/services/api.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-parent-finance',
  standalone: true,
  imports: [PortalLayoutComponent, DecimalPipe],
  template: `
    <app-portal-layout portalTitle="Parent Portal" pageTitle="Financial Statement" [navItems]="nav">
      @if (statement(); as stmt) {
        <div class="stats-grid">
          <div class="stat-card"><span class="stat-value">{{ '$' + (stmt.summary.totalInvoiced | number:'1.2-2') }}</span><span class="stat-label">Total Invoiced</span></div>
          <div class="stat-card green"><span class="stat-value">{{ '$' + (stmt.summary.totalPaid | number:'1.2-2') }}</span><span class="stat-label">Total Paid</span></div>
          <div class="stat-card orange"><span class="stat-value">{{ '$' + (stmt.summary.balance | number:'1.2-2') }}</span><span class="stat-label">Balance</span></div>
        </div>
        <section class="card">
          <h3>Invoices</h3>
          <table class="data-table">
            <thead><tr><th>Invoice</th><th>Description</th><th>Amount</th><th>Paid</th><th>Status</th></tr></thead>
            <tbody>
              @for (inv of stmt.invoices; track inv.id) {
                <tr>
                  <td>{{ inv.invoiceNumber }}</td>
                  <td>{{ inv.description }}</td>
                  <td>{{ '$' + inv.totalAmount }}</td>
                  <td>{{ '$' + inv.amountPaid }}</td>
                  <td><span class="badge">{{ inv.status }}</span></td>
                </tr>
              }
            </tbody>
          </table>
        </section>
        <section class="card">
          <h3>Receipts</h3>
          @for (r of receipts(); track r.id) {
            <div class="receipt-row">
              <span>{{ r.receiptNumber }} — {{ '$' + (r.payment?.amount ?? 0) }}</span>
              <a [href]="receiptUrl(r.id)" target="_blank" class="btn-outline">Download PDF</a>
            </div>
          }
        </section>
      }
    </app-portal-layout>
  `,
})
export class ParentFinanceComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  statement = signal<{
    invoices: { id: string; invoiceNumber: string; description: string; totalAmount: number; amountPaid: number; status: string }[];
    summary: { totalInvoiced: number; totalPaid: number; balance: number };
  } | null>(null);
  receipts = signal<{ id: string; receiptNumber: string; payment?: { amount: number } }[]>([]);
  nav = [
    { label: 'My Children', path: '/parent', icon: '👨‍👩‍👧' },
    { label: 'Finance', path: '/parent/finance', icon: '💳' },
  ];

  ngOnInit() {
    this.route.paramMap.subscribe((params) => {
      const studentId = params.get('studentId');
      if (studentId) this.load(studentId);
      else {
        this.api.get<{ id: string }[]>('/students/parent/my-children').subscribe((kids) => {
          if (kids[0]) this.load(kids[0].id);
        });
      }
    });
  }

  load(studentId: string) {
    this.api.get<{
      invoices: { id: string; invoiceNumber: string; description: string; totalAmount: number; amountPaid: number; status: string }[];
      summary: { totalInvoiced: number; totalPaid: number; balance: number };
    }>(`/billing/statement/${studentId}`).subscribe((s) => this.statement.set(s));
    this.api.get<{ id: string; receiptNumber: string; payment?: { amount: number } }[]>(`/billing/receipts/student/${studentId}`)
      .subscribe((r) => this.receipts.set(r));
  }

  receiptUrl(id: string) {
    return `${environment.apiUrl}/billing/receipts/${id}/pdf`;
  }
}
