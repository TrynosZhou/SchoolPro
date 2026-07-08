import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { formatStudentClassLabel, isALevelForm, reportCardClassValue } from '../../core/utils/class-display';
import { environment } from '../../../environments/environment';
import { PARENT_NAV_ITEMS } from '../../core/config/parent-nav';
import { STUDENT_NAV_SECTIONS } from '../../core/config/student-nav';
import { reportCardPdfFilename } from '../../core/utils/report-card-filename';
import { appendHeadmasterToPrincipalRemarks } from '../../core/utils/principal-remarks.util';

interface GradeBoundaryRow {
  grade: string;
  label?: string;
  minPercent: number;
  points?: number;
}

interface SubjectResult {
  subject: string;
  subjectName?: string;
  subjectCode?: string;
  marks: number;
  grade: string;
  remarks?: string;
  mean?: number;
  subjectPosition?: number;
  subjectPositionTotal?: number;
}

interface ReportCardDto {
  id: string;
  studentId: string;
  termId: string;
  subjectResults: SubjectResult[];
  averageMark?: number;
  overallGrade?: string;
  classPosition?: number;
  formPosition?: number;
  classTotal?: number;
  formTotal?: number;
  subjectsPassed?: number;
  totalSubjects?: number;
  classTeacherRemarks?: string;
  principalRemarks?: string;
  student?: {
    firstName: string;
    lastName: string;
    admissionNumber: string;
    schoolClass?: { name: string; form?: { name: string; level?: number } };
  };
  term?: { name: string };
}

@Component({
  selector: 'app-parent-report-card',
  standalone: true,
  imports: [PortalLayoutComponent, RouterLink, DecimalPipe],
  templateUrl: './parent-report-card.component.html',
  styleUrl: './parent-report-card.component.scss',
})
export class ParentReportCardComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private route = inject(ActivatedRoute);

  studentId = '';
  terms = signal<{ id: string; name: string; isCurrent?: boolean }[]>([]);
  selectedTermId = signal('');
  report = signal<ReportCardDto | null>(null);
  gradeBoundaries = signal<GradeBoundaryRow[]>([]);
  schoolBranding = signal<{
    schoolName?: string;
    tagline?: string;
    logoUrl?: string;
    address?: string;
    email?: string;
    website?: string;
    headmasterName?: string;
  } | null>(null);
  loading = signal(false);
  notFound = signal(false);
  blockedMessage = signal<string | null>(null);

  readonly isStudent = computed(() => this.auth.user()?.role === 'student');
  readonly portalTitle = computed(() => (this.isStudent() ? 'Student Portal' : 'Parent Portal'));
  readonly navSections = computed(() => (this.isStudent() ? STUDENT_NAV_SECTIONS : []));
  readonly navItems = computed(() => (this.isStudent() ? [] : PARENT_NAV_ITEMS));
  readonly homeLink = computed(() => (this.isStudent() ? '/student/report-cards' : '/parent/report-cards'));
  readonly formatStudentClassLabel = formatStudentClassLabel;
  readonly reportCardClassValue = reportCardClassValue;

  ngOnInit() {
    this.studentId = this.route.snapshot.paramMap.get('studentId') || '';
    if (!this.studentId) return;

    this.api.get<{ id: string; name: string; isCurrent?: boolean }[]>('/exams/terms').subscribe((terms) => {
      this.terms.set(terms);
      const current = terms.find((t) => t.isCurrent);
      const termId = current?.id || terms[0]?.id || '';
      if (termId) {
        this.selectedTermId.set(termId);
        this.loadReport(termId);
      }
    });
    this.api.get<GradeBoundaryRow[]>('/exams/grade-boundaries').subscribe((b) => this.gradeBoundaries.set(b));
    this.api.get<{
      schoolName?: string;
      tagline?: string;
      logoUrl?: string;
      address?: string;
      email?: string;
      website?: string;
      headmasterName?: string;
    }>('/exams/school-branding').subscribe({
      next: (b) => this.schoolBranding.set(b),
      error: () => this.schoolBranding.set({ schoolName: 'School Pro Academy' }),
    });
  }

  schoolName(): string {
    return this.schoolBranding()?.schoolName || 'School Pro Academy';
  }

  headmasterName(): string {
    return (this.schoolBranding()?.headmasterName || '').trim();
  }

  principalRemarksForDisplay(): string {
    return appendHeadmasterToPrincipalRemarks(this.report()?.principalRemarks, this.headmasterName());
  }

  hasPrincipalRemarksSection(): boolean {
    return !!(this.report()?.principalRemarks?.trim() || this.headmasterName());
  }

  logoFullUrl(): string | null {
    const url = this.schoolBranding()?.logoUrl;
    if (!url) return null;
    const origin = environment.apiUrl.replace(/\/api$/, '');
    return `${origin}${url}`;
  }

  websiteDisplay(): string {
    const url = this.schoolBranding()?.website?.trim();
    if (!url) return '';
    return url.replace(/^https?:\/\//i, '').replace(/\/$/, '');
  }

  onTermChange(termId: string) {
    this.selectedTermId.set(termId);
    this.loadReport(termId);
  }

  loadReport(termId: string) {
    if (!this.studentId || !termId) return;
    this.loading.set(true);
    this.notFound.set(false);
    this.blockedMessage.set(null);
    this.report.set(null);

    this.api.get<ReportCardDto>(`/exams/report-cards/${this.studentId}/${termId}`).subscribe({
      next: (r) => {
        this.report.set(r);
        this.loading.set(false);
      },
      error: (e) => {
        this.loading.set(false);
        const msg = e?.error?.message;
        if (e?.status === 403 && msg) {
          this.blockedMessage.set(msg);
        } else {
          this.notFound.set(true);
        }
      },
    });
  }

  positionOutOfLabel(position?: number, total?: number): string {
    if (!position || !total) return '—';
    return `${position} Out Of ${total}`;
  }

  subjectsPassedLabel(passed?: number, total?: number): string {
    if (passed == null || !total) return '—';
    return `${passed} Out Of ${total}`;
  }

  subjectPositionLabel(pos?: number, total?: number): string {
    if (!pos || !total) return '—';
    return `${pos}/${total}`;
  }

  showGradePoints(): boolean {
    return isALevelForm(this.report()?.student?.schoolClass?.form);
  }

  pointsForGrade(grade?: string | null): string {
    if (!grade?.trim()) return '—';
    const key = grade.trim().toUpperCase();
    const row = this.gradeBoundaries().find((b) => b.grade.trim().toUpperCase() === key);
    if (row?.points == null || Number.isNaN(Number(row.points))) return '—';
    return String(row.points);
  }

  totalPointsForReport(): string {
    const report = this.report();
    if (!report || !this.showGradePoints()) return '—';
    let total = 0;
    let hasAny = false;
    for (const row of report.subjectResults) {
      const pts = this.pointsForGrade(row.grade);
      if (pts !== '—') {
        total += Number(pts);
        hasAny = true;
      }
    }
    return hasAny ? String(total) : '—';
  }

  downloadPdf() {
    const termId = this.selectedTermId();
    const report = this.report();
    if (!this.studentId || !termId) return;
    const token = localStorage.getItem('school_pro_token');
    const url = `${environment.apiUrl}/exams/report-cards/${this.studentId}/${termId}/pdf`;
    fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => r.blob())
      .then((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = reportCardPdfFilename(
          report?.student?.firstName,
          report?.student?.lastName,
          report?.student?.admissionNumber || this.studentId,
        );
        a.click();
        URL.revokeObjectURL(a.href);
      });
  }
}
