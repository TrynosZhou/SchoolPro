import { Router } from '@angular/router';
import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { AuthService } from '../../core/services/auth.service';
import { NavSection } from '../../shared/portal-layout/portal-layout.component';
import { resolveStaffPortalContext } from '../../core/utils/staff-portal.util';
import { ApiService } from '../../core/services/api.service';
import { formatGenderLabel, formatStudentClassLabel } from '../../core/utils/class-display';

type ExemptionType = 'percentage' | 'amount' | 'staff_child';

interface ExemptionStudentRow {
  id: string;
  admissionNumber: string;
  firstName: string;
  lastName: string;
  gender?: string;
  className?: string;
  hasExemption: boolean;
}

interface TuitionExemptionRow {
  id: string;
  studentId: string;
  admissionNumber: string;
  firstName: string;
  lastName: string;
  gender?: string;
  className?: string;
  exemptionType: ExemptionType;
  value: number;
  reason?: string;
  updatedAt: string;
}

@Component({
  selector: 'app-admin-exemptions',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule],
  templateUrl: './admin-exemptions.component.html',
  styleUrl: './admin-exemptions.component.scss',
})
export class AdminExemptionsComponent implements OnInit {
  private api = inject(ApiService);
  private router = inject(Router);
  private auth = inject(AuthService);

  portalTitle = 'Admin Portal';
  navSections: NavSection[] = ADMIN_NAV_SECTIONS;
  readonly adminNav = ADMIN_NAV_SECTIONS;

  query = '';
  searchLoading = signal(false);
  listLoading = signal(false);
  saving = signal(false);
  pdfLoading = signal(false);
  searchResults = signal<ExemptionStudentRow[]>([]);
  exemptions = signal<TuitionExemptionRow[]>([]);
  hasSearched = signal(false);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  addOpen = signal(false);
  selectedStudent = signal<ExemptionStudentRow | null>(null);
  formType: ExemptionType = 'percentage';
  formValue = 0;
  formReason = '';

  ngOnInit(): void {
    const ctx = resolveStaffPortalContext(this.router.url, this.auth.user()?.role);
    this.portalTitle = ctx.portalTitle;
    this.navSections = ctx.navSections;
    this.loadExemptions();
  }

  searchStudents(): void {
    const q = this.query.trim();
    if (!q) {
      this.showToast('error', 'Enter Student ID, first name, or last name.');
      return;
    }

    this.searchLoading.set(true);
    this.hasSearched.set(true);
    this.api.get<ExemptionStudentRow[]>('/billing/tuition-exemptions/student-search', { q }).subscribe({
      next: (rows) => {
        this.searchResults.set(rows);
        this.searchLoading.set(false);
        if (!rows.length) {
          this.showToast('error', 'No matching student found.');
        }
      },
      error: (e) => {
        this.searchLoading.set(false);
        this.searchResults.set([]);
        this.showToast('error', e.error?.message || 'Student search failed.');
      },
    });
  }

  clearSearch(): void {
    this.query = '';
    this.searchResults.set([]);
    this.hasSearched.set(false);
  }

  openAdd(student: ExemptionStudentRow): void {
    const existing = this.exemptions().find((row) => row.studentId === student.id);
    this.selectedStudent.set(student);
    this.formType = existing?.exemptionType || 'percentage';
    this.formValue = existing?.value ?? 0;
    this.formReason = existing?.reason || '';
    this.addOpen.set(true);
  }

  closeAdd(): void {
    this.addOpen.set(false);
    this.selectedStudent.set(null);
    this.formType = 'percentage';
    this.formValue = 0;
    this.formReason = '';
  }

  saveExemption(): void {
    const student = this.selectedStudent();
    if (!student) return;

    if (this.formType === 'staff_child') {
      // value not used for staff child
    } else if (this.formType === 'percentage' && (this.formValue < 0 || this.formValue > 100)) {
      this.showToast('error', 'Percentage must be between 0 and 100.');
      return;
    } else if (this.formType === 'amount' && this.formValue < 0) {
      this.showToast('error', 'Fixed amount cannot be negative.');
      return;
    }

    this.saving.set(true);
    this.api.post<TuitionExemptionRow>('/billing/tuition-exemptions', {
      studentId: student.id,
      exemptionType: this.formType,
      value: this.formType === 'staff_child' ? 0 : this.formValue,
      reason: this.formReason.trim() || undefined,
    }).subscribe({
      next: () => {
        this.saving.set(false);
        this.closeAdd();
        this.loadExemptions();
        this.searchStudents();
        this.showToast('success', `${student.lastName}, ${student.firstName} added to exemption list.`);
      },
      error: (e) => {
        this.saving.set(false);
        this.showToast('error', e.error?.message || 'Failed to save exemption.');
      },
    });
  }

  removeExemption(row: TuitionExemptionRow): void {
    if (!confirm(`Remove tuition exemption for ${row.lastName}, ${row.firstName}?`)) return;

    this.api.delete(`/billing/tuition-exemptions/${row.id}`).subscribe({
      next: () => {
        this.loadExemptions();
        if (this.hasSearched()) this.searchStudents();
        this.showToast('success', 'Exemption removed.');
      },
      error: (e) => {
        this.showToast('error', e.error?.message || 'Failed to remove exemption.');
      },
    });
  }

  exemptionLabel(row: TuitionExemptionRow): string {
    if (row.exemptionType === 'staff_child') {
      return 'Staff child — all fees waived';
    }
    if (row.exemptionType === 'percentage') {
      return `${row.value}% off tuition`;
    }
    return `$${Number(row.value).toFixed(2)} off tuition`;
  }

  previewPdf(): void {
    this.exportPdf(true);
  }

  downloadPdf(): void {
    this.exportPdf(false);
  }

  private exportPdf(preview: boolean): void {
    this.pdfLoading.set(true);
    const params: Record<string, string> = {};
    if (preview) params['preview'] = 'true';

    this.api.getBlob('/billing/tuition-exemptions/export.pdf', params).subscribe({
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
        a.download = 'tuition-exemptions.pdf';
        a.click();
        URL.revokeObjectURL(url);
        this.showToast('success', 'PDF downloaded.');
      },
      error: (e) => {
        this.pdfLoading.set(false);
        this.showToast('error', e.error?.message || 'Failed to generate PDF');
      },
    });
  }

  private loadExemptions(): void {
    this.listLoading.set(true);
    this.api.get<TuitionExemptionRow[]>('/billing/tuition-exemptions').subscribe({
      next: (rows) => {
        this.exemptions.set(rows);
        this.listLoading.set(false);
      },
      error: (e) => {
        this.listLoading.set(false);
        this.showToast('error', e.error?.message || 'Failed to load exemptions.');
      },
    });
  }

  private showToast(type: 'success' | 'error', msg: string): void {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 4500);
  }

  classLabel(className?: string): string {
    return formatStudentClassLabel(className);
  }

  genderLabel(gender?: string): string {
    return formatGenderLabel(gender);
  }
}
