import { Component, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';

interface StudentBalanceRow {
  id: string;
  admissionNumber: string;
  firstName: string;
  lastName: string;
  className?: string;
  totalInvoiced: number;
  totalPaid: number;
  balance: number;
}

@Component({
  selector: 'app-admin-student-balance',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, DecimalPipe],
  templateUrl: './admin-student-balance.component.html',
  styleUrl: './admin-student-balance.component.scss',
})
export class AdminStudentBalanceComponent {
  private api = inject(ApiService);

  readonly adminNav = ADMIN_NAV_SECTIONS;
  query = '';
  loading = signal(false);
  rows = signal<StudentBalanceRow[]>([]);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  getBalance() {
    const q = this.query.trim();
    if (!q) {
      this.showToast('error', 'Enter Student ID, first name, or last name.');
      return;
    }

    this.loading.set(true);
    this.api.get<StudentBalanceRow[]>('/billing/student-balance', { q }).subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.loading.set(false);
        if (!rows.length) {
          this.showToast('error', 'No matching student found.');
        } else {
          this.showToast('success', `Found ${rows.length} student(s).`);
        }
      },
      error: (e) => {
        this.loading.set(false);
        this.rows.set([]);
        this.showToast('error', e.error?.message || 'Failed to fetch student balance.');
      },
    });
  }

  private showToast(type: 'success' | 'error', msg: string) {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 4000);
  }
}

