import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { STUDENT_NAV_SECTIONS } from '../../core/config/student-nav';
import { ApiService } from '../../core/services/api.service';
import { environment } from '../../../environments/environment';

interface WeeklyAssessment {
  id: string;
  weekStart: string;
  topic: string;
  score?: number;
  maxScore?: number;
  remarks?: string;
  subject?: { name?: string; code?: string };
}

interface LearningSchedule {
  id: string;
  weekStart: string;
  topic?: string;
  homework?: string;
  objectives?: string;
  subject?: { name?: string; code?: string };
}

interface ClassHomeworkAssignment {
  id: string;
  title: string;
  instructions?: string | null;
  originalFileName: string;
  fileUrl: string;
  mimeType: string;
  fileSize: number;
  dueDate?: string | null;
  createdAt: string;
  subjectName?: string | null;
  teacherName?: string | null;
}

interface TermOption {
  id: string;
  name: string;
  isCurrent?: boolean;
}

@Component({
  selector: 'app-student-homework',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule],
  templateUrl: './student-homework.component.html',
  styleUrl: './student-homework.component.scss',
})
export class StudentHomeworkComponent implements OnInit {
  private api = inject(ApiService);

  readonly navSections = STUDENT_NAV_SECTIONS;

  classAssignments = signal<ClassHomeworkAssignment[]>([]);
  assessments = signal<WeeklyAssessment[]>([]);
  schedules = signal<LearningSchedule[]>([]);
  terms = signal<TermOption[]>([]);

  selectedTermId = '';
  activeTab: 'class' | 'assessments' | 'schedules' = 'class';

  loading = signal(true);
  loadingData = signal(false);

  ngOnInit() {
    this.api.get<TermOption[]>('/exams/terms').subscribe({
      next: (terms) => {
        const sorted = [...terms].sort((a, b) => {
          if (a.isCurrent && !b.isCurrent) return -1;
          if (!a.isCurrent && b.isCurrent) return 1;
          return a.name.localeCompare(b.name);
        });
        this.terms.set(sorted);
        const current = sorted.find((t) => t.isCurrent);
        this.selectedTermId = current?.id || sorted[0]?.id || '';
        this.loading.set(false);
        this.loadData();
      },
      error: () => this.loading.set(false),
    });
  }

  onTermChange() {
    this.loadData();
  }

  setTab(tab: 'class' | 'assessments' | 'schedules') {
    this.activeTab = tab;
  }

  loadData() {
    this.loadingData.set(true);
    const params: Record<string, string> = {};
    if (this.selectedTermId) params['termId'] = this.selectedTermId;

    let pending = 3;
    const done = () => {
      pending -= 1;
      if (pending <= 0) this.loadingData.set(false);
    };

    this.api.get<ClassHomeworkAssignment[]>('/academics/homework-assignments', params).subscribe({
      next: (rows) => {
        this.classAssignments.set(rows);
        done();
      },
      error: () => {
        this.classAssignments.set([]);
        done();
      },
    });

    this.api.get<WeeklyAssessment[]>('/academics/weekly-assessments', params).subscribe({
      next: (rows) => {
        this.assessments.set(rows);
        done();
      },
      error: () => {
        this.assessments.set([]);
        done();
      },
    });

    this.api.get<LearningSchedule[]>('/academics/learning-schedules', params).subscribe({
      next: (rows) => {
        this.schedules.set(rows);
        done();
      },
      error: () => {
        this.schedules.set([]);
        done();
      },
    });
  }

  formatWeek(dateStr: string): string {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  subjectLabel(item: { subject?: { name?: string; code?: string } }): string {
    return item.subject?.name || item.subject?.code || 'Subject';
  }

  fileDownloadUrl(fileUrl: string): string {
    const origin = environment.apiUrl.replace(/\/api$/, '');
    return `${origin}${fileUrl}`;
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
