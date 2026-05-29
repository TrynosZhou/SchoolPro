import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ApiService } from '../../core/services/api.service';
import { environment } from '../../../environments/environment';
import { PARENT_NAV_ITEMS } from '../../core/config/parent-nav';
import { reportCardPdfFilename } from '../../core/utils/report-card-filename';

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
    schoolClass?: { name: string; form?: { name: string } };
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
  private route = inject(ActivatedRoute);

  studentId = '';
  terms = signal<{ id: string; name: string; isCurrent?: boolean }[]>([]);
  selectedTermId = signal('');
  report = signal<ReportCardDto | null>(null);
  loading = signal(false);
  notFound = signal(false);

  readonly nav = PARENT_NAV_ITEMS;

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
  }

  onTermChange(termId: string) {
    this.selectedTermId.set(termId);
    this.loadReport(termId);
  }

  loadReport(termId: string) {
    if (!this.studentId || !termId) return;
    this.loading.set(true);
    this.notFound.set(false);
    this.report.set(null);

    this.api.get<ReportCardDto>(`/exams/report-cards/${this.studentId}/${termId}`).subscribe({
      next: (r) => {
        this.report.set(r);
        this.loading.set(false);
      },
      error: () => {
        this.notFound.set(true);
        this.loading.set(false);
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
