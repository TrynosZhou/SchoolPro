import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { formatStudentClassLabel } from '../../core/utils/class-display';
import { loadTeacherClassOptions } from '../../core/utils/teacher-classes.util';
import { resolvePortalLayout } from '../../core/utils/portal-layout.util';
import { environment } from '../../../environments/environment';

interface TermOption {
  id: string;
  name: string;
  isCurrent?: boolean;
}

interface HomeworkAssignmentRow {
  id: string;
  classId: string;
  className?: string;
  subjectName?: string | null;
  title: string;
  instructions?: string | null;
  originalFileName: string;
  fileUrl: string;
  fileSize: number;
  dueDate?: string | null;
  createdAt: string;
}

@Component({
  selector: 'app-teacher-assignments',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule],
  templateUrl: './teacher-assignments.component.html',
  styleUrl: './teacher-assignments.component.scss',
})
export class TeacherAssignmentsComponent implements OnInit {
  private api = inject(ApiService);
  private router = inject(Router);
  private auth = inject(AuthService);

  readonly formatStudentClassLabel = formatStudentClassLabel;
  readonly portalLayout = resolvePortalLayout(this.router, {
    permissions: this.auth.user()?.permissions,
  });

  classes = signal<{ id: string; name: string }[]>([]);
  assignments = signal<HomeworkAssignmentRow[]>([]);

  selectedClassId = '';
  selectedTermId = '';
  title = '';
  instructions = '';
  selectedFile: File | null = null;
  selectedFileName = '';

  loading = signal(true);
  loadingList = signal(false);
  submitting = signal(false);
  statusMessage = signal('');
  statusError = signal(false);

  ngOnInit() {
    loadTeacherClassOptions(this.api).subscribe({
      next: (classes) => {
        this.classes.set(classes);
        if (classes.length === 1) {
          this.selectedClassId = classes[0].id;
          this.loadAssignments();
        }
      },
    });

    this.api.get<TermOption[]>('/exams/terms').subscribe({
      next: (terms) => {
        const sorted = [...terms].sort((a, b) => {
          if (a.isCurrent && !b.isCurrent) return -1;
          if (!a.isCurrent && b.isCurrent) return 1;
          return a.name.localeCompare(b.name);
        });
        const current = sorted.find((t) => t.isCurrent);
        this.selectedTermId = current?.id || sorted[0]?.id || '';
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  onClassChange() {
    this.loadAssignments();
  }

  loadAssignments() {
    if (!this.selectedClassId) {
      this.assignments.set([]);
      return;
    }
    this.loadingList.set(true);
    const params: Record<string, string> = { classId: this.selectedClassId };
    if (this.selectedTermId) params['termId'] = this.selectedTermId;
    this.api.get<HomeworkAssignmentRow[]>('/academics/homework-assignments', params).subscribe({
      next: (rows) => {
        this.assignments.set(rows);
        this.loadingList.set(false);
      },
      error: () => {
        this.assignments.set([]);
        this.loadingList.set(false);
      },
    });
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    this.selectedFile = input.files?.[0] ?? null;
    this.selectedFileName = this.selectedFile?.name ?? '';
    this.statusMessage.set('');
    this.statusError.set(false);
  }

  submitAssignment() {
    this.statusMessage.set('');
    this.statusError.set(false);

    if (!this.selectedClassId) {
      this.statusMessage.set('Select a class.');
      this.statusError.set(true);
      return;
    }
    if (!this.selectedTermId) {
      this.statusMessage.set('No active term found. Contact the administrator.');
      this.statusError.set(true);
      return;
    }
    if (!this.title.trim()) {
      this.statusMessage.set('Enter an assignment title.');
      this.statusError.set(true);
      return;
    }
    if (!this.selectedFile) {
      this.statusMessage.set('Choose a file to upload.');
      this.statusError.set(true);
      return;
    }

    const form = new FormData();
    form.append('classId', this.selectedClassId);
    form.append('termId', this.selectedTermId);
    form.append('title', this.title.trim());
    if (this.instructions.trim()) form.append('instructions', this.instructions.trim());
    form.append('file', this.selectedFile);

    this.submitting.set(true);
    this.api.postFormData<HomeworkAssignmentRow>('/academics/homework-assignments', form).subscribe({
      next: () => {
        this.submitting.set(false);
        this.title = '';
        this.instructions = '';
        this.selectedFile = null;
        this.selectedFileName = '';
        this.statusMessage.set('Assignment sent to the class. Students will see it on their portal.');
        this.statusError.set(false);
        this.loadAssignments();
      },
      error: (err) => {
        this.submitting.set(false);
        this.statusMessage.set(err.error?.message || 'Failed to post assignment.');
        this.statusError.set(true);
      },
    });
  }

  fileDownloadUrl(fileUrl: string): string {
    const origin = environment.apiUrl.replace(/\/api$/, '');
    return `${origin}${fileUrl}`;
  }

  formatDate(value?: string | null): string {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  selectedClassLabel(): string {
    const match = this.classes().find((c) => c.id === this.selectedClassId);
    return match ? this.formatStudentClassLabel(match.name) : 'class';
  }
}
