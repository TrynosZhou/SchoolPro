import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';
import { Student } from '../../core/models';

type Tab = 'overview' | 'cashbook' | 'debtors' | 'statements';

interface BalanceSheet {
  cashBalance: number;
  totalDebtors: number;
  monthlyCollections: number;
}

interface CashbookEntry {
  id: string;
  entryDate: string;
  type: string;
  description: string;
  moneyIn: number;
  moneyOut: number;
  balance: number;
  paymentMethod?: string;
  reference?: string;
}

interface Debtor {
  id: string;
  firstName: string;
  lastName: string;
  admissionNumber?: string;
  className: string;
  owed: number;
  oldestDue?: string;
}

interface PaymentRow {
  id: string;
  paymentReference: string;
  amount: number;
  method: string;
  label: string;
  feeType: string;
  paidAt: string;
  firstName: string;
  lastName: string;
  admissionNumber: string;
  className: string;
}

interface StatementData {
  ledger: { entryDate: string; description: string; debit: number; credit: number; balance: number }[];
  invoices: { id: string; invoiceNumber: string; description: string; totalAmount: number; amountPaid: number; status: string; dueDate: string }[];
  payments: { id: string; paymentReference: string; amount: number; label: string; method: string; paidAt: string }[];
  summary: { totalInvoiced: number; totalPaid: number; balance: number };
}

@Component({
  selector: 'app-admin-finance',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, DecimalPipe, DatePipe, RouterLink],
  templateUrl: './admin-finance.component.html',
  styleUrl: './admin-finance.component.scss',
})
export class AdminFinanceComponent implements OnInit {
  private api = inject(ApiService);

  readonly adminNav = ADMIN_NAV_SECTIONS;

  activeTab = signal<Tab>('overview');
  loading = signal(true);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  balanceSheet = signal<BalanceSheet | null>(null);
  aging = signal<{ bucket: string; count: number; amount: number }[]>([]);
  cashbook = signal<CashbookEntry[]>([]);
  debtors = signal<Debtor[]>([]);
  recentPayments = signal<PaymentRow[]>([]);
  classDebt = signal<{ id: string; name: string; formName: string; owed: number; studentsOwing: number }[]>([]);

  cashbookFrom = '';
  cashbookTo = '';
  cashbookFilter = signal('');
  showAddEntry = signal(false);
  newEntry = {
    entryDate: new Date().toISOString().split('T')[0],
    type: 'receipt',
    description: '',
    moneyIn: 0,
    moneyOut: 0,
    paymentMethod: 'cash',
    reference: '',
  };

  debtorSearch = signal('');
  filteredDebtors = computed(() => {
    const q = this.debtorSearch().toLowerCase();
    if (!q) return this.debtors();
    return this.debtors().filter((d) =>
      `${d.firstName} ${d.lastName} ${d.className} ${d.admissionNumber}`.toLowerCase().includes(q)
    );
  });

  totalDebtorsOwed = computed(() =>
    this.debtors().reduce((s, d) => s + Number(d.owed), 0)
  );

  agingMax = computed(() => {
    const amounts = this.aging().map((a) => Number(a.amount));
    return Math.max(...amounts, 1);
  });

  students = signal<Student[]>([]);
  selectedStudentId = '';
  statement = signal<StatementData | null>(null);
  statementLoading = signal(false);

  filteredCashbook = computed(() => {
    const q = this.cashbookFilter().toLowerCase();
    if (!q) return this.cashbook();
    return this.cashbook().filter((e) =>
      e.description.toLowerCase().includes(q) || e.reference?.toLowerCase().includes(q)
    );
  });

  ngOnInit() {
    this.loadAll();
    this.api.get<Student[]>('/students').subscribe((s) => this.students.set(s));
  }

  setTab(tab: Tab) {
    this.activeTab.set(tab);
    if (tab === 'statements' && !this.selectedStudentId && this.students().length) {
      this.selectedStudentId = this.students()[0].id;
      this.loadStatement();
    }
  }

  loadAll() {
    this.loading.set(true);
    forkJoin({
      balanceSheet: this.api.get<BalanceSheet>('/finance/balance-sheet'),
      aging: this.api.get<{ bucket: string; count: number; amount: number }[]>('/finance/debtors-aging'),
      debtors: this.api.get<Debtor[]>('/billing/debtors'),
      payments: this.api.get<PaymentRow[]>('/finance/recent-payments', { limit: '12' }),
      classDebt: this.api.get<{ id: string; name: string; formName: string; owed: number; studentsOwing: number }[]>('/finance/class-debt-summary'),
    }).subscribe({
      next: (data) => {
        this.balanceSheet.set(data.balanceSheet);
        this.aging.set(data.aging);
        this.debtors.set(data.debtors);
        this.recentPayments.set(data.payments);
        this.classDebt.set(data.classDebt);
        this.loadCashbook();
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.showToast('error', 'Failed to load financial data');
      },
    });
  }

  loadCashbook() {
    const params: Record<string, string> = {};
    if (this.cashbookFrom) params['from'] = this.cashbookFrom;
    if (this.cashbookTo) params['to'] = this.cashbookTo;
    this.api.get<CashbookEntry[]>('/finance/cashbook', params).subscribe({
      next: (d) => this.cashbook.set(d),
      error: () => this.showToast('error', 'Could not load cashbook'),
    });
  }

  applyCashbookDates() {
    this.loadCashbook();
  }

  clearCashbookDates() {
    this.cashbookFrom = '';
    this.cashbookTo = '';
    this.loadCashbook();
  }

  submitCashbookEntry() {
    const body = {
      entryDate: this.newEntry.entryDate,
      type: this.newEntry.type,
      description: this.newEntry.description,
      moneyIn: this.newEntry.type === 'receipt' ? Number(this.newEntry.moneyIn) : 0,
      moneyOut: this.newEntry.type === 'payment' ? Number(this.newEntry.moneyOut) : 0,
      paymentMethod: this.newEntry.paymentMethod,
      reference: this.newEntry.reference || undefined,
    };
    if (!body.description || (body.moneyIn <= 0 && body.moneyOut <= 0)) {
      this.showToast('error', 'Enter description and amount');
      return;
    }
    this.api.post<CashbookEntry>('/finance/cashbook', body).subscribe({
      next: () => {
        this.showToast('success', 'Cashbook entry recorded');
        this.showAddEntry.set(false);
        this.newEntry = {
          entryDate: new Date().toISOString().split('T')[0],
          type: 'receipt',
          description: '',
          moneyIn: 0,
          moneyOut: 0,
          paymentMethod: 'cash',
          reference: '',
        };
        this.loadCashbook();
        this.api.get<BalanceSheet>('/finance/balance-sheet').subscribe((bs) => this.balanceSheet.set(bs));
      },
      error: () => this.showToast('error', 'Failed to save entry'),
    });
  }

  loadStatement() {
    if (!this.selectedStudentId) return;
    this.statementLoading.set(true);
    this.api.get<StatementData>(`/billing/statement/${this.selectedStudentId}`).subscribe({
      next: (s) => {
        this.statement.set(s);
        this.statementLoading.set(false);
      },
      error: () => {
        this.statementLoading.set(false);
        this.showToast('error', 'Could not load student statement');
      },
    });
  }

  viewDebtorStatement(debtorId: string) {
    this.selectedStudentId = debtorId;
    this.setTab('statements');
    this.loadStatement();
  }

  sendReminders() {
    const ids = this.debtors().map((d) => d.id);
    if (!ids.length) {
      this.showToast('error', 'No debtors to remind');
      return;
    }
    this.api.post<{ sent: number }>('/billing/reminders/send', { studentIds: ids }).subscribe({
      next: (r) => this.showToast('success', `Reminders sent to ${r.sent} families`),
      error: () => this.showToast('error', 'Failed to send reminders'),
    });
  }

  formatMethod(m: string): string {
    const map: Record<string, string> = {
      cash: 'Cash', bank: 'Bank', ecocash: 'EcoCash', onemoney: 'OneMoney', innbucks: 'InnBucks', other: 'Other',
    };
    return map[m] || m;
  }

  private showToast(type: 'success' | 'error', msg: string) {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 4000);
  }
}
