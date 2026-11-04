import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { AuthService } from '../../core/services/auth.service';
import { NavSection } from '../../shared/portal-layout/portal-layout.component';
import { resolveStaffPortalContext, portalLink } from '../../core/utils/staff-portal.util';
import { ApiService } from '../../core/services/api.service';
import { formatGenderLabel, formatStudentClassLabel } from '../../core/utils/class-display';

interface StudentBalanceRow {
  id: string;
  admissionNumber: string;
  firstName: string;
  lastName: string;
  gender?: string;
  className?: string;
  classLabel?: string;
  totalInvoiced: number;
  totalPaid: number;
  balance: number;
}

interface OutstandingInvoiceRow {
  invoiceId: string;
  invoiceNumber: string;
  description: string;
  issuedDate?: string;
  dueDate: string;
  totalAmount: number;
  amountPaid: number;
  balance: number;
  status: string;
}

interface OutstandingStudentRow {
  id: string;
  admissionNumber: string;
  firstName: string;
  lastName: string;
  gender?: string;
  className: string;
  classLabel?: string;
  formName?: string;
  invoiceBalance: number;
  invoices: OutstandingInvoiceRow[];
}

interface OutstandingInvoicesGroup {
  classId: string;
  className: string;
  classLabel?: string;
  formName?: string;
  classTotal: number;
  students: OutstandingStudentRow[];
}

interface OutstandingInvoicesReport {
  groups: OutstandingInvoicesGroup[];
  grandTotal: number;
  studentCount: number;
  invoiceCount: number;
}

interface FlatInvoiceRow extends OutstandingInvoiceRow {
  studentId: string;
  admissionNumber: string;
  firstName: string;
  lastName: string;
  gender?: string;
  className: string;
  classLabel?: string;
  formName?: string;
  studentBalance: number;
}

type DueFilter = 'all' | 'overdue' | 'due_soon';
type SortOrder = 'balance-desc' | 'balance-asc' | 'student-name' | 'due-date' | 'class-name';
type ViewMode = 'grouped' | 'flat' | 'cards';

@Component({
  selector: 'app-admin-outstanding-invoices',
  standalone: true,
  imports: [PortalLayoutComponent, DecimalPipe, FormsModule, RouterLink],
  templateUrl: './admin-outstanding-invoices.component.html',
  styleUrl: './admin-outstanding-invoices.component.scss',
})
export class AdminOutstandingInvoicesComponent implements OnInit {
  private api = inject(ApiService);
  private router = inject(Router);
  private auth = inject(AuthService);

  portalTitle = 'Admin Portal';
  navSections: NavSection[] = ADMIN_NAV_SECTIONS;
  basePath = '/admin';

  loading = signal(true);
  pdfLoading = signal(false);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);
  report = signal<OutstandingInvoicesReport | null>(null);

  search = signal('');
  balanceQuery = '';
  balanceLoading = signal(false);
  balanceRows = signal<StudentBalanceRow[]>([]);
  balanceSearchAttempted = signal(false);
  classFilter = signal('all');
  formFilter = signal('all');
  dueFilter = signal<DueFilter>('all');
  sortOrder = signal<SortOrder>('balance-desc');
  viewMode = signal<ViewMode>('grouped');
  expandedClasses = signal<Record<string, boolean>>({});

  formOptions = computed(() => {
    const names = new Set<string>();
    for (const g of this.report()?.groups || []) {
      if (g.formName) names.add(g.formName);
    }
    return [...names].sort();
  });

  classOptions = computed(() =>
    [...(this.report()?.groups || [])].sort((a, b) => b.classTotal - a.classTotal),
  );

  overdueSummary = computed(() => {
    let count = 0;
    let amount = 0;
    for (const g of this.report()?.groups || []) {
      for (const s of g.students) {
        for (const inv of s.invoices) {
          if (this.isOverdue(inv.dueDate)) {
            count += 1;
            amount += inv.balance;
          }
        }
      }
    }
    return { count, amount };
  });

  filteredGroups = computed(() => {
    const r = this.report();
    if (!r) return [];

    const q = this.search().trim().toLowerCase();
    const classId = this.classFilter();
    const formName = this.formFilter();
    const due = this.dueFilter();

    let groups: OutstandingInvoicesGroup[] = r.groups
      .map((g) => ({
        ...g,
        students: g.students.map((s) => ({ ...s, invoices: [...s.invoices] })),
      }))
      .filter((g) => classId === 'all' || g.classId === classId)
      .filter((g) => formName === 'all' || (g.formName || '') === formName);

    groups = groups
      .map((g) => {
        const students = g.students
          .map((s) => {
            let invoices = s.invoices.filter((inv) => {
              if (due === 'overdue' && !this.isOverdue(inv.dueDate)) return false;
              if (due === 'due_soon' && !this.isDueSoon(inv.dueDate)) return false;
              return true;
            });

            if (q) {
              const studentMatch = `${s.admissionNumber} ${s.firstName} ${s.lastName}`.toLowerCase().includes(q);
              invoices = invoices.filter(
                (inv) =>
                  studentMatch ||
                  inv.invoiceNumber.toLowerCase().includes(q) ||
                  inv.description.toLowerCase().includes(q),
              );
            }

            if (!invoices.length) return null;
            const invoiceBalance = invoices.reduce((sum, inv) => sum + inv.balance, 0);
            return { ...s, invoices, invoiceBalance };
          })
          .filter((s): s is OutstandingStudentRow => Boolean(s));

        if (!students.length) return null;
        const classTotal = students.reduce((sum, s) => sum + s.invoiceBalance, 0);
        return { ...g, students, classTotal };
      })
      .filter((g): g is OutstandingInvoicesGroup => Boolean(g));

    const sort = this.sortOrder();
    if (sort === 'class-name') {
      groups.sort((a, b) => this.classHeading(a).localeCompare(this.classHeading(b)));
    } else {
      groups.sort((a, b) =>
        sort === 'balance-asc' ? a.classTotal - b.classTotal : b.classTotal - a.classTotal,
      );
    }

    for (const g of groups) {
      if (sort === 'student-name') {
        g.students.sort((a, b) =>
          `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`),
        );
      } else if (sort === 'due-date') {
        g.students.sort((a, b) => this.earliestDue(a) - this.earliestDue(b));
      } else if (sort === 'balance-asc') {
        g.students.sort((a, b) => a.invoiceBalance - b.invoiceBalance);
      } else {
        g.students.sort((a, b) => b.invoiceBalance - a.invoiceBalance);
      }
    }

    return groups;
  });

  filteredSummary = computed(() => {
    const groups = this.filteredGroups();
    let studentCount = 0;
    let invoiceCount = 0;
    let grandTotal = 0;
    let overdueCount = 0;

    for (const g of groups) {
      for (const s of g.students) {
        studentCount += 1;
        for (const inv of s.invoices) {
          invoiceCount += 1;
          grandTotal += inv.balance;
          if (this.isOverdue(inv.dueDate)) overdueCount += 1;
        }
      }
    }

    return { classCount: groups.length, studentCount, invoiceCount, grandTotal, overdueCount };
  });

  flatRows = computed((): FlatInvoiceRow[] => {
    const rows: FlatInvoiceRow[] = [];
    for (const g of this.filteredGroups()) {
      for (const s of g.students) {
        for (const inv of s.invoices) {
          rows.push({
            ...inv,
            studentId: s.id,
            admissionNumber: s.admissionNumber,
            firstName: s.firstName,
            lastName: s.lastName,
            className: s.className,
            classLabel: s.classLabel,
            formName: s.formName,
            gender: s.gender,
            studentBalance: s.invoiceBalance,
          });
        }
      }
    }

    const sort = this.sortOrder();
    if (sort === 'student-name') {
      rows.sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`));
    } else if (sort === 'due-date') {
      rows.sort((a, b) => this.parseDate(a.dueDate) - this.parseDate(b.dueDate));
    } else if (sort === 'balance-asc') {
      rows.sort((a, b) => a.balance - b.balance);
    } else if (sort === 'class-name') {
      rows.sort((a, b) => a.className.localeCompare(b.className));
    } else {
      rows.sort((a, b) => b.balance - a.balance);
    }

    return rows;
  });

  cardStudents = computed(() => {
    const list: (OutstandingStudentRow & { classHeading: string; classId: string })[] = [];
    for (const g of this.filteredGroups()) {
      for (const s of g.students) {
        list.push({ ...s, classHeading: this.classHeading(g), classId: g.classId });
      }
    }

    const sort = this.sortOrder();
    if (sort === 'student-name') {
      list.sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`));
    } else if (sort === 'due-date') {
      list.sort((a, b) => this.earliestDue(a) - this.earliestDue(b));
    } else if (sort === 'balance-asc') {
      list.sort((a, b) => a.invoiceBalance - b.invoiceBalance);
    } else if (sort === 'class-name') {
      list.sort((a, b) => a.classHeading.localeCompare(b.classHeading));
    } else {
      list.sort((a, b) => b.invoiceBalance - a.invoiceBalance);
    }

    return list;
  });

  hasActiveFilters = computed(
    () =>
      Boolean(this.search().trim()) ||
      Boolean(this.balanceQuery.trim()) ||
      this.classFilter() !== 'all' ||
      this.formFilter() !== 'all' ||
      this.dueFilter() !== 'all' ||
      this.sortOrder() !== 'balance-desc',
  );

  ngOnInit() {
    const ctx = resolveStaffPortalContext(this.router.url, this.auth.user()?.role);
    this.portalTitle = ctx.portalTitle;
    this.navSections = ctx.navSections;
    this.basePath = ctx.basePath;
    this.loadReport();
  }

  loadReport() {
    this.loading.set(true);
    this.api.get<OutstandingInvoicesReport>('/billing/reports/outstanding-invoices').subscribe({
      next: (data) => {
        this.report.set(data);
        this.loading.set(false);
        const expanded: Record<string, boolean> = {};
        for (const g of data.groups) expanded[g.classId] = true;
        this.expandedClasses.set(expanded);
        this.showToast('success', 'Outstanding invoices report loaded.');
      },
      error: (e) => {
        this.loading.set(false);
        this.showToast('error', e.error?.message || 'Failed to load outstanding invoices report');
      },
    });
  }

  classHeading(group: OutstandingInvoicesGroup): string {
    return group.classLabel || formatStudentClassLabel(group.className) || 'Class —';
  }

  studentClassLabel(row: { classLabel?: string; className?: string }): string {
    return row.classLabel || formatStudentClassLabel(row.className);
  }

  studentGenderLabel(gender?: string): string {
    return formatGenderLabel(gender);
  }

  initials(student: { firstName: string; lastName: string }): string {
    return `${student.firstName.charAt(0)}${student.lastName.charAt(0)}`.toUpperCase();
  }

  isOverdue(dueDate: string): boolean {
    const due = this.parseDate(dueDate);
    const today = this.todayKey();
    return due < today;
  }

  isDueSoon(dueDate: string): boolean {
    const due = this.parseDate(dueDate);
    const today = this.todayKey();
    const soon = today + 7 * 86_400_000;
    return due >= today && due <= soon;
  }

  dueTone(dueDate: string): 'overdue' | 'soon' | 'ok' {
    if (this.isOverdue(dueDate)) return 'overdue';
    if (this.isDueSoon(dueDate)) return 'soon';
    return 'ok';
  }

  statusLabel(status: string): string {
    const map: Record<string, string> = {
      draft: 'Draft',
      issued: 'Issued',
      partial: 'Partial',
      paid: 'Paid',
      overdue: 'Overdue',
      cancelled: 'Cancelled',
    };
    return map[status?.toLowerCase()] || status || '—';
  }

  isClassExpanded(classId: string): boolean {
    return this.expandedClasses()[classId] !== false;
  }

  toggleClass(classId: string) {
    const next = { ...this.expandedClasses() };
    next[classId] = !this.isClassExpanded(classId);
    this.expandedClasses.set(next);
  }

  expandAll() {
    const next: Record<string, boolean> = {};
    for (const g of this.filteredGroups()) next[g.classId] = true;
    this.expandedClasses.set(next);
  }

  collapseAll() {
    const next: Record<string, boolean> = {};
    for (const g of this.filteredGroups()) next[g.classId] = false;
    this.expandedClasses.set(next);
  }

  clearFilters() {
    this.search.set('');
    this.clearBalanceLookup();
    this.classFilter.set('all');
    this.formFilter.set('all');
    this.dueFilter.set('all');
    this.sortOrder.set('balance-desc');
  }

  getBalance() {
    const q = this.balanceQuery.trim();
    if (!q) {
      this.showToast('error', 'Enter Student ID, first name, or last name.');
      return;
    }

    this.balanceLoading.set(true);
    this.balanceSearchAttempted.set(true);
    this.search.set(q);

    this.api.get<StudentBalanceRow[]>('/billing/student-balance', { q }).subscribe({
      next: (rows) => {
        this.balanceRows.set(rows);
        this.balanceLoading.set(false);
        if (!rows.length) {
          this.showToast('error', 'No matching student found.');
          return;
        }
        if (rows.length === 1) {
          const s = rows[0];
          this.showToast(
            'success',
            `${s.firstName} ${s.lastName}: $${Number(s.balance).toFixed(2)} outstanding`,
          );
        }
      },
      error: (e) => {
        this.balanceLoading.set(false);
        this.balanceRows.set([]);
        this.showToast('error', e.error?.message || 'Failed to fetch student balance.');
      },
    });
  }

  clearBalanceLookup() {
    this.balanceQuery = '';
    this.balanceRows.set([]);
    this.balanceSearchAttempted.set(false);
  }

  selectBalanceStudent(row: StudentBalanceRow) {
    this.balanceQuery = row.admissionNumber || `${row.firstName} ${row.lastName}`;
    this.balanceRows.set([row]);
    this.search.set(this.balanceQuery);
  }

  recordPaymentForBalance(row: StudentBalanceRow): void {
    void this.router.navigate([portalLink(this.basePath, `fin-reports/record-payment/${row.id}`)]);
  }

  selectClassChip(classId: string) {
    this.classFilter.set(this.classFilter() === classId ? 'all' : classId);
  }

  previewPdf() {
    this.exportPdf(true);
  }

  downloadPdf() {
    this.exportPdf(false);
  }

  recordPayment(studentId: string, invoiceId?: string): void {
    void this.router.navigate([portalLink(this.basePath, `fin-reports/record-payment/${studentId}`)], {
      queryParams: invoiceId ? { invoiceId } : {},
    });
  }

  private earliestDue(student: OutstandingStudentRow): number {
    if (!student.invoices.length) return Number.MAX_SAFE_INTEGER;
    return Math.min(...student.invoices.map((i) => this.parseDate(i.dueDate)));
  }

  private parseDate(value: string): number {
    const d = new Date(String(value).slice(0, 10));
    return Number.isNaN(d.getTime()) ? 0 : d.getTime();
  }

  private todayKey(): number {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  }

  private exportPdf(preview: boolean) {
    if (!this.report()) {
      this.showToast('error', 'Load outstanding invoices before exporting PDF.');
      return;
    }

    this.pdfLoading.set(true);
    const query = preview ? { preview: 'true' } : undefined;
    this.api.getBlob('/billing/reports/outstanding-invoices/export.pdf', query).subscribe({
      next: (blob) => {
        this.pdfLoading.set(false);
        if (blob.type && !blob.type.includes('pdf')) {
          this.showToast('error', 'Server did not return a PDF file');
          return;
        }
        const url = URL.createObjectURL(blob);
        if (preview) {
          window.open(url, '_blank', 'noopener,noreferrer');
          setTimeout(() => URL.revokeObjectURL(url), 90_000);
          return;
        }
        const a = document.createElement('a');
        a.href = url;
        a.download = 'outstanding-invoices-report.pdf';
        a.click();
        URL.revokeObjectURL(url);
      },
      error: (e) => {
        this.pdfLoading.set(false);
        this.showToast('error', e.error?.message || 'Failed to generate outstanding invoices PDF');
      },
    });
  }

  private showToast(type: 'success' | 'error', msg: string) {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 4500);
  }
}
