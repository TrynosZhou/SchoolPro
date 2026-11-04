import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DecimalPipe, DatePipe, NgTemplateOutlet, NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { executivePortalForRole } from '../../core/utils/executive-portal.util';
import { environment } from '../../../environments/environment';
import {
  buildPayslipPrintBlock,
  buildPayslipPrintDocument,
  openPayslipPrintWindow,
  PayslipPrintBranding,
  resolveLogoUrl,
} from '../../core/utils/payslip-print.util';

type Tab = 'runs' | 'setup' | 'payslips';
type RunStatus = 'draft' | 'processed' | 'paid' | 'cancelled';
type PayFrequency = 'monthly' | 'biweekly';
type PaymentMethod = 'bank_transfer' | 'cash' | 'ecocash';
type PayslipStatus = 'pending' | 'paid' | 'excluded';
type PayslipViewMode = 'table' | 'cards';

interface PayrollSummary {
  activeStaff: number;
  configuredProfiles: number;
  unconfiguredStaff: number;
  draftRuns: number;
  ytdNetPaid: number;
  recentRuns: PayrollRunRow[];
  lastPaidRun: PayrollRunRow | null;
}

interface PayrollRunRow {
  id: string;
  reference: string;
  year: number;
  month: number;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  payDate?: string;
  status: RunStatus;
  staffCount: number;
  totalGross: number;
  totalDeductions: number;
  totalNet: number;
  notes?: string;
  processedAt?: string;
  paidAt?: string;
}

interface StaffUser {
  firstName: string;
  lastName: string;
  email: string;
  role: string;
}

interface StaffRow {
  id: string;
  employeeNumber: string;
  department?: string;
  isActive: boolean;
  user: StaffUser;
}

interface PayrollProfile {
  id?: string;
  staffId: string;
  jobTitle?: string;
  payFrequency: PayFrequency;
  baseSalary: number;
  housingAllowance: number;
  transportAllowance: number;
  medicalAllowance: number;
  otherAllowances: number;
  payeAmount: number;
  nssaAmount: number;
  pensionAmount: number;
  loanDeduction: number;
  otherDeductions: number;
  bankName?: string;
  bankAccount?: string;
  bankBranch?: string;
  taxReference?: string;
  nssaNumber?: string;
  paymentMethod: PaymentMethod;
  notes?: string;
  annualLeaveDays?: number;
  isActive: boolean;
}

interface StaffLeaveInfo {
  annualEntitlementDays: number;
  monthlyAccrual: number;
  balanceDays: number;
}

interface ProfileRow {
  staff: StaffRow;
  profile: PayrollProfile | null;
  leave?: StaffLeaveInfo;
}

interface PayslipRow {
  id: string;
  payrollRunId: string;
  staffId: string;
  employeeNumber: string;
  staffName: string;
  department?: string;
  jobTitle?: string;
  baseSalary: number;
  housingAllowance: number;
  transportAllowance: number;
  medicalAllowance: number;
  otherAllowances: number;
  grossPay: number;
  payeAmount: number;
  nssaAmount: number;
  pensionAmount: number;
  loanDeduction: number;
  otherDeductions: number;
  totalDeductions: number;
  netPay: number;
  paymentMethod: PaymentMethod;
  bankName?: string;
  bankAccount?: string;
  status: PayslipStatus;
  notes?: string;
  annualLeaveEntitlement: number;
  monthlyLeaveAccrual: number;
  leaveOpeningBalance: number;
  leaveTakenDays: number;
  leaveClosingBalance: number;
}

interface PayslipEditForm {
  baseSalary: number;
  housingAllowance: number;
  transportAllowance: number;
  medicalAllowance: number;
  otherAllowances: number;
  payeAmount: number;
  nssaAmount: number;
  pensionAmount: number;
  loanDeduction: number;
  otherDeductions: number;
  leaveTakenDays: number;
  notes: string;
}

interface RunPreview {
  year: number;
  month: number;
  periodLabel: string;
  staffCount: number;
  missingCount: number;
  totalGross: number;
  totalDeductions: number;
  totalNet: number;
  existingRun: PayrollRunRow | null;
  included: { staffId: string; employeeNumber: string; name: string; netPay: number }[];
  missing: { staffId: string; employeeNumber: string; name: string }[];
}

const emptyPayslipEditForm = (): PayslipEditForm => ({
  baseSalary: 0,
  housingAllowance: 0,
  transportAllowance: 0,
  medicalAllowance: 0,
  otherAllowances: 0,
  payeAmount: 0,
  nssaAmount: 0,
  pensionAmount: 0,
  loanDeduction: 0,
  otherDeductions: 0,
  leaveTakenDays: 0,
  notes: '',
});

const EMPTY_PROFILE = (): PayrollProfile => ({
  staffId: '',
  payFrequency: 'monthly',
  baseSalary: 0,
  housingAllowance: 0,
  transportAllowance: 0,
  medicalAllowance: 0,
  otherAllowances: 0,
  payeAmount: 0,
  nssaAmount: 0,
  pensionAmount: 0,
  loanDeduction: 0,
  otherDeductions: 0,
  paymentMethod: 'bank_transfer',
  annualLeaveDays: 12,
  isActive: true,
});

@Component({
  selector: 'app-admin-payroll',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, DecimalPipe, NgTemplateOutlet, NgClass],
  templateUrl: './admin-payroll.component.html',
  styleUrl: './admin-payroll.component.scss',
})
export class AdminPayrollComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);

  readonly adminNav = ADMIN_NAV_SECTIONS;
  readonly execCtx = computed(() => executivePortalForRole(this.auth.user()?.role));
  readonly isExecutive = computed(() => {
    const r = this.auth.user()?.role;
    return r === 'director' || r === 'principal';
  });

  activeTab = signal<Tab>('runs');
  loading = signal(true);
  submitting = signal(false);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  schoolBranding = signal<PayslipPrintBranding>({ schoolName: 'School Pro Academy', currency: 'USD' });

  summary = signal<PayrollSummary | null>(null);
  runs = signal<PayrollRunRow[]>([]);
  profiles = signal<ProfileRow[]>([]);
  selectedRunId = signal<string | null>(null);
  selectedRun = signal<PayrollRunRow | null>(null);
  payslips = signal<PayslipRow[]>([]);

  runSearch = signal('');
  setupSearch = signal('');
  setupFilter = signal<'all' | 'configured' | 'unconfigured'>('all');

  newRunOpen = signal(false);
  newRunYear = new Date().getFullYear();
  newRunMonth = new Date().getMonth() + 1;
  newRunPayDate = '';
  newRunNotes = '';
  runPreview = signal<RunPreview | null>(null);
  previewLoading = signal(false);

  profileDrawerOpen = signal(false);
  editingStaff = signal<StaffRow | null>(null);
  profileForm: PayrollProfile = EMPTY_PROFILE();

  payslipDrawerOpen = signal(false);
  viewingPayslip = signal<PayslipRow | null>(null);
  payslipEditMode = signal(false);
  payslipEditForm: PayslipEditForm = emptyPayslipEditForm();

  payslipsLoading = signal(false);
  payslipSearch = signal('');
  payslipStatusFilter = signal<'all' | PayslipStatus>('all');
  payslipViewMode = signal<PayslipViewMode>('table');
  showExcludedPayslips = signal(true);

  readonly payslipRuns = computed(() =>
    this.runs()
      .filter((r) => r.status !== 'cancelled')
      .sort((a, b) => b.year - a.year || b.month - a.month),
  );

  readonly filteredPayslips = computed(() => {
    const q = this.payslipSearch().trim().toLowerCase();
    const status = this.payslipStatusFilter();
    const showExcluded = this.showExcludedPayslips();
    return this.payslips().filter((p) => {
      if (!showExcluded && p.status === 'excluded') return false;
      if (status !== 'all' && p.status !== status) return false;
      if (!q) return true;
      return (
        p.staffName.toLowerCase().includes(q)
        || p.employeeNumber.toLowerCase().includes(q)
        || (p.department || '').toLowerCase().includes(q)
      );
    });
  });

  readonly payslipTabStats = computed(() => {
    const rows = this.filteredPayslips();
    let gross = 0;
    let deductions = 0;
    let net = 0;
    let pending = 0;
    let paid = 0;
    let excluded = 0;
    for (const p of rows) {
      if (p.status === 'excluded') {
        excluded += 1;
        continue;
      }
      gross += Number(p.grossPay);
      deductions += Number(p.totalDeductions);
      net += Number(p.netPay);
      if (p.status === 'paid') paid += 1;
      else pending += 1;
    }
    return { count: rows.length, gross, deductions, net, pending, paid, excluded };
  });

  readonly filteredRuns = computed(() => {
    const q = this.runSearch().trim().toLowerCase();
    return this.runs().filter((r) => {
      if (!q) return true;
      return (
        r.reference.toLowerCase().includes(q)
        || r.periodLabel.toLowerCase().includes(q)
        || r.status.includes(q)
      );
    });
  });

  readonly filteredProfiles = computed(() => {
    const q = this.setupSearch().trim().toLowerCase();
    const f = this.setupFilter();
    return this.profiles().filter((row) => {
      const name = `${row.staff.user.firstName} ${row.staff.user.lastName}`.toLowerCase();
      const configured = !!row.profile && Number(row.profile.baseSalary) > 0;
      if (f === 'configured' && !configured) return false;
      if (f === 'unconfigured' && configured) return false;
      if (!q) return true;
      return (
        name.includes(q)
        || row.staff.employeeNumber.toLowerCase().includes(q)
        || (row.staff.department || '').toLowerCase().includes(q)
      );
    });
  });

  readonly DEFAULT_ANNUAL_LEAVE = 12;

  profileMonthlyLeave(): number {
    const annual = Number(this.profileForm.annualLeaveDays) || this.DEFAULT_ANNUAL_LEAVE;
    return Math.round((annual / 12) * 100) / 100;
  }

  formatLeaveDays(days: number): string {
    const n = Number(days) || 0;
    return Number.isInteger(n) ? String(n) : n.toFixed(2);
  }

  profilePreviewTotals(): { gross: number; deductions: number; net: number } {
    const p = this.profileForm;
    const gross = Number(p.baseSalary) + Number(p.housingAllowance) + Number(p.transportAllowance)
      + Number(p.medicalAllowance) + Number(p.otherAllowances);
    const ded = Number(p.payeAmount) + Number(p.nssaAmount) + Number(p.pensionAmount)
      + Number(p.loanDeduction) + Number(p.otherDeductions);
    return { gross, deductions: ded, net: gross - ded };
  }

  ngOnInit(): void {
    this.loadSchoolBranding();
    this.refreshAll();
  }

  private loadSchoolBranding(): void {
    this.api.get<PayslipPrintBranding>('/exams/school-branding').subscribe({
      next: (b) => this.schoolBranding.set({ ...this.schoolBranding(), ...b }),
      error: () => {},
    });
  }

  brandingLogoUrl(): string | null {
    return resolveLogoUrl(this.schoolBranding().logoUrl, environment.apiUrl);
  }

  refreshAll(): void {
    this.loading.set(true);
    Promise.all([
      this.loadSummary(),
      this.loadRuns(),
      this.loadProfiles(),
    ]).finally(() => this.loading.set(false));
  }

  private loadSummary(): Promise<void> {
    return new Promise((resolve) => {
      this.api.get<PayrollSummary>('/payroll/summary').subscribe({
        next: (s) => { this.summary.set(s); resolve(); },
        error: () => resolve(),
      });
    });
  }

  private loadRuns(): Promise<void> {
    return new Promise((resolve) => {
      this.api.get<PayrollRunRow[]>('/payroll/runs').subscribe({
        next: (r) => {
          this.runs.set(r);
          const selected = this.selectedRunId();
          if (selected && !r.some((run) => run.id === selected && run.status !== 'cancelled')) {
            this.selectedRunId.set(null);
            this.selectedRun.set(null);
            this.payslips.set([]);
          }
          resolve();
        },
        error: () => resolve(),
      });
    });
  }

  private loadProfiles(): Promise<void> {
    return new Promise((resolve) => {
      this.api.get<ProfileRow[]>('/payroll/profiles').subscribe({
        next: (p) => { this.profiles.set(p); resolve(); },
        error: () => resolve(),
      });
    });
  }

  selectRun(run: PayrollRunRow): void {
    this.activeTab.set('payslips');
    this.loadPayslipsForRun(run.id, run);
  }

  openPayslipsTab(): void {
    this.activeTab.set('payslips');
    const available = this.payslipRuns();
    if (!available.length) return;
    const current = this.selectedRunId();
    const stillValid = current && available.some((r) => r.id === current);
    if (stillValid && this.payslips().length) return;
    const run = stillValid
      ? available.find((r) => r.id === current)!
      : available[0];
    this.loadPayslipsForRun(run.id, run);
  }

  onPayslipRunChange(runId: string): void {
    const run = this.payslipRuns().find((r) => r.id === runId);
    if (run) this.loadPayslipsForRun(run.id, run);
  }

  loadPayslipsForRun(runId: string, runHint?: PayrollRunRow): void {
    this.selectedRunId.set(runId);
    if (runHint) this.selectedRun.set(runHint);
    this.payslipsLoading.set(true);
    this.api.get<{ run: PayrollRunRow; payslips: PayslipRow[] }>(`/payroll/runs/${runId}`).subscribe({
      next: (data) => {
        this.selectedRun.set(data.run);
        this.payslips.set(data.payslips);
        this.payslipsLoading.set(false);
      },
      error: (err) => {
        this.payslipsLoading.set(false);
        if (err?.status === 404) {
          this.selectedRunId.set(null);
          this.selectedRun.set(null);
          this.payslips.set([]);
          this.loadRuns().then(() => {
            const fallback = this.payslipRuns()[0];
            if (fallback) {
              this.loadPayslipsForRun(fallback.id, fallback);
            }
          });
          this.showToast('error', 'That payroll run was removed or no longer exists. Loaded the latest run.');
          return;
        }
        this.showToast('error', err?.error?.message || 'Could not load payslips');
      },
    });
  }

  openNewRun(): void {
    this.newRunOpen.set(true);
    this.runPreview.set(null);
    this.loadRunPreview();
  }

  closeNewRun(): void {
    this.newRunOpen.set(false);
    this.runPreview.set(null);
  }

  loadRunPreview(): void {
    this.previewLoading.set(true);
    this.api
      .get<RunPreview>('/payroll/runs/preview', {
        year: String(this.newRunYear),
        month: String(this.newRunMonth),
      })
      .subscribe({
        next: (p) => {
          this.runPreview.set(p);
          this.previewLoading.set(false);
        },
        error: (err) => {
          this.previewLoading.set(false);
          this.showToast('error', err?.error?.message || 'Preview failed');
        },
      });
  }

  createRun(): void {
    this.submitting.set(true);
    this.api
      .post<{ run: PayrollRunRow; payslips: PayslipRow[] }>('/payroll/runs', {
        year: this.newRunYear,
        month: this.newRunMonth,
        payDate: this.newRunPayDate || undefined,
        notes: this.newRunNotes || undefined,
      })
      .subscribe({
        next: (data) => {
          this.submitting.set(false);
          this.closeNewRun();
          this.showToast('success', 'Payroll run created');
          this.loadRuns();
          this.loadSummary();
          if (data?.run) this.selectRun(data.run);
        },
        error: (err) => {
          this.submitting.set(false);
          this.showToast('error', err?.error?.message || 'Could not create run');
        },
      });
  }

  processRun(run: PayrollRunRow): void {
    if (!confirm(`Process payroll for ${run.periodLabel}? This locks payslip edits.`)) return;
    this.submitting.set(true);
    this.api.post(`/payroll/runs/${run.id}/process`, {}).subscribe({
      next: () => {
        this.submitting.set(false);
        this.showToast('success', 'Payroll processed');
        this.afterRunAction(run.id);
      },
      error: (err) => {
        this.submitting.set(false);
        this.showToast('error', err?.error?.message || 'Process failed');
      },
    });
  }

  markPaid(run: PayrollRunRow): void {
    if (!confirm(`Mark ${run.periodLabel} payroll as paid?`)) return;
    this.submitting.set(true);
    this.api.post(`/payroll/runs/${run.id}/mark-paid`, {}).subscribe({
      next: () => {
        this.submitting.set(false);
        this.showToast('success', 'Payroll marked as paid');
        this.afterRunAction(run.id);
      },
      error: (err) => {
        this.submitting.set(false);
        this.showToast('error', err?.error?.message || 'Failed to mark paid');
      },
    });
  }

  cancelRun(run: PayrollRunRow): void {
    if (!confirm(`Cancel draft run ${run.reference}?`)) return;
    this.api.delete(`/payroll/runs/${run.id}`).subscribe({
      next: () => {
        this.showToast('success', 'Run cancelled');
        if (this.selectedRunId() === run.id) {
          this.selectedRunId.set(null);
          this.selectedRun.set(null);
          this.payslips.set([]);
        }
        this.loadRuns();
        this.loadSummary();
      },
      error: (err) => this.showToast('error', err?.error?.message || 'Cancel failed'),
    });
  }

  private afterRunAction(runId: string): void {
    this.loadRuns();
    this.loadSummary();
    this.api.get<{ run: PayrollRunRow; payslips: PayslipRow[] }>(`/payroll/runs/${runId}`).subscribe({
      next: (data) => {
        this.selectedRun.set(data.run);
        this.payslips.set(data.payslips);
        this.runs.update((list) => list.map((r) => (r.id === runId ? data.run : r)));
      },
    });
  }

  openProfile(staff: StaffRow, profile: PayrollProfile | null): void {
    this.editingStaff.set(staff);
    this.profileForm = profile ? { ...profile } : { ...EMPTY_PROFILE(), staffId: staff.id };
    this.profileDrawerOpen.set(true);
  }

  closeProfile(): void {
    this.profileDrawerOpen.set(false);
    this.editingStaff.set(null);
  }

  saveProfile(): void {
    const staff = this.editingStaff();
    if (!staff) return;
    this.submitting.set(true);
    const body = { ...this.profileForm, staffId: staff.id };
    this.api.put<PayrollProfile>(`/payroll/profiles/${staff.id}`, body).subscribe({
      next: () => {
        this.submitting.set(false);
        this.showToast('success', 'Pay profile saved');
        this.closeProfile();
        this.loadProfiles();
        this.loadSummary();
      },
      error: (err) => {
        this.submitting.set(false);
        this.showToast('error', err?.error?.message || 'Save failed');
      },
    });
  }

  openPayslip(p: PayslipRow): void {
    this.viewingPayslip.set(p);
    this.payslipEditMode.set(false);
    this.payslipDrawerOpen.set(true);
  }

  closePayslip(): void {
    this.payslipDrawerOpen.set(false);
    this.viewingPayslip.set(null);
    this.payslipEditMode.set(false);
  }

  startEditPayslip(p: PayslipRow): void {
    this.viewingPayslip.set(p);
    this.payslipEditForm = {
      baseSalary: Number(p.baseSalary),
      housingAllowance: Number(p.housingAllowance),
      transportAllowance: Number(p.transportAllowance),
      medicalAllowance: Number(p.medicalAllowance),
      otherAllowances: Number(p.otherAllowances),
      payeAmount: Number(p.payeAmount),
      nssaAmount: Number(p.nssaAmount),
      pensionAmount: Number(p.pensionAmount),
      loanDeduction: Number(p.loanDeduction),
      otherDeductions: Number(p.otherDeductions),
      leaveTakenDays: Number(p.leaveTakenDays),
      notes: p.notes || '',
    };
    this.payslipEditMode.set(true);
    this.payslipDrawerOpen.set(true);
  }

  payslipEditPreview(): { gross: number; deductions: number; net: number } {
    const f = this.payslipEditForm;
    const gross = f.baseSalary + f.housingAllowance + f.transportAllowance
      + f.medicalAllowance + f.otherAllowances;
    const deductions = f.payeAmount + f.nssaAmount + f.pensionAmount
      + f.loanDeduction + f.otherDeductions;
    return { gross, deductions, net: gross - deductions };
  }

  savePayslipEdit(): void {
    const p = this.viewingPayslip();
    const run = this.selectedRun();
    if (!p || !run || run.status !== 'draft') return;
    this.submitting.set(true);
    this.api.patch<PayslipRow>(`/payroll/payslips/${p.id}`, this.payslipEditForm).subscribe({
      next: (updated) => {
        this.submitting.set(false);
        this.showToast('success', 'Payslip updated');
        this.payslipEditMode.set(false);
        if (updated) this.viewingPayslip.set(updated);
        this.afterRunAction(run.id);
      },
      error: (err) => {
        this.submitting.set(false);
        this.showToast('error', err?.error?.message || 'Update failed');
      },
    });
  }

  includePayslip(p: PayslipRow): void {
    const run = this.selectedRun();
    if (!run || run.status !== 'draft') return;
    this.api.patch(`/payroll/payslips/${p.id}`, { status: 'pending' }).subscribe({
      next: () => {
        this.showToast('success', 'Staff included in run');
        this.afterRunAction(run.id);
      },
      error: (err) => this.showToast('error', err?.error?.message || 'Update failed'),
    });
  }

  excludePayslip(p: PayslipRow): void {
    const run = this.selectedRun();
    if (!run || run.status !== 'draft') return;
    this.api.patch(`/payroll/payslips/${p.id}`, { status: 'excluded' }).subscribe({
      next: () => {
        this.showToast('success', 'Staff excluded from run');
        this.afterRunAction(run.id);
      },
      error: (err) => this.showToast('error', err?.error?.message || 'Update failed'),
    });
  }

  statusLabel(status: RunStatus): string {
    const map: Record<RunStatus, string> = {
      draft: 'Draft',
      processed: 'Processed',
      paid: 'Paid',
      cancelled: 'Cancelled',
    };
    return map[status] || status;
  }

  statusClass(status: RunStatus): string {
    return `status-${status}`;
  }

  payslipStatusClass(status: PayslipStatus): string {
    return `payslip-status-${status}`;
  }

  payslipStatusLabel(status: PayslipStatus): string {
    const map: Record<PayslipStatus, string> = {
      pending: 'Pending',
      paid: 'Paid',
      excluded: 'Excluded',
    };
    return map[status] || status;
  }

  paymentMethodLabel(method: PaymentMethod): string {
    const map: Record<PaymentMethod, string> = {
      bank_transfer: 'Bank transfer',
      cash: 'Cash',
      ecocash: 'EcoCash',
    };
    return map[method] || method;
  }

  printPayslip(p: PayslipRow): void {
    const run = this.selectedRun();
    if (!run) return;
    const html = this.buildPrintDocument(run, [p]);
    const ok = openPayslipPrintWindow(html, `Payslip — ${p.staffName}`);
    if (!ok) this.showToast('error', 'Allow pop-ups to print payslips');
  }

  printAllPayslips(): void {
    const run = this.selectedRun();
    const rows = this.filteredPayslips().filter((p) => p.status !== 'excluded');
    if (!run || !rows.length) return;
    const html = this.buildPrintDocument(run, rows);
    const ok = openPayslipPrintWindow(html, `${run.reference} — Payslips`);
    if (!ok) this.showToast('error', 'Allow pop-ups to print payslips');
  }

  private buildPrintDocument(run: PayrollRunRow, rows: PayslipRow[]): string {
    const branding = this.schoolBranding();
    const logo = resolveLogoUrl(branding.logoUrl, environment.apiUrl);
    const printRun = {
      reference: run.reference,
      periodLabel: run.periodLabel,
      periodStart: run.periodStart,
      periodEnd: run.periodEnd,
      payDate: run.payDate,
    };
    const blocks = rows.map((p, i) => {
      const block = buildPayslipPrintBlock(printRun, {
        ...p,
        paymentMethod: p.paymentMethod,
        status: this.payslipStatusLabel(p.status),
      }, branding, logo);
      return i < rows.length - 1 ? `${block}<div class="page-break"></div>` : block;
    }).join('');
    const title = rows.length === 1
      ? `Payslip — ${rows[0].staffName}`
      : `${run.reference} — Payslips`;
    return buildPayslipPrintDocument(title, blocks);
  }

  formatPayslipMoney(amount: number): string {
    const currency = this.schoolBranding().currency || 'USD';
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(amount) || 0);
    } catch {
      return `${currency} ${(Number(amount) || 0).toFixed(2)}`;
    }
  }

  exportPayslipsCsv(): void {
    const run = this.selectedRun();
    const rows = this.filteredPayslips();
    if (!run || !rows.length) return;
    const header = [
      'Employee ID', 'Name', 'Department', 'Gross', 'Deductions', 'Net',
      'Leave Accrual', 'Leave Taken', 'Leave Balance', 'Bank', 'Account', 'Status',
    ];
    const lines = rows.map((p) => [
      p.employeeNumber,
      p.staffName,
      p.department || '',
      p.grossPay,
      p.totalDeductions,
      p.netPay,
      p.monthlyLeaveAccrual,
      p.leaveTakenDays,
      p.leaveClosingBalance,
      p.bankName || '',
      p.bankAccount || '',
      p.status,
    ].map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','));
    const csv = [header.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${run.reference}-payslips.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  private showToast(type: 'success' | 'error', msg: string): void {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 4000);
  }
}
