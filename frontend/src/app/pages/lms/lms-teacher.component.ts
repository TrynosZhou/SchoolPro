import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { AuthService } from '../../core/services/auth.service';
import { ApiService } from '../../core/services/api.service';
import {
  LmsApiService,
  LmsAssignment,
  LmsSubmission,
  LessonContent,
  VirtualClass,
} from '../../core/services/lms-api.service';
import { formatStudentClassLabel } from '../../core/utils/class-display';
import { loadTeacherClassOptions } from '../../core/utils/teacher-classes.util';
import { resolvePortalLayout } from '../../core/utils/portal-layout.util';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';

type Tab = 'assignments' | 'lessons' | 'virtual' | 'grade';

interface TermOption { id: string; name: string; isCurrent?: boolean }
interface SubjectOption { id: string; name: string }

@Component({
  selector: 'app-lms-teacher',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, DatePipe, RouterLink],
  templateUrl: './lms-teacher.component.html',
  styleUrl: './lms-teacher.component.scss',
})
export class LmsTeacherComponent implements OnInit {
  private api = inject(ApiService);
  private lms = inject(LmsApiService);
  private router = inject(Router);
  private auth = inject(AuthService);

  readonly formatStudentClassLabel = formatStudentClassLabel;
  readonly isAdmin = this.router.url.startsWith('/admin');
  readonly portalLayout = this.isAdmin
    ? { portalTitle: 'Admin Portal', navSections: ADMIN_NAV_SECTIONS }
    : resolvePortalLayout(this.router, { permissions: this.auth.user()?.permissions });
  readonly homePath = this.isAdmin ? '/admin' : '/teacher';
  readonly libraryPath = this.isAdmin ? '/admin/library' : '/teacher/library';

  tab = signal<Tab>('assignments');
  classes = signal<{ id: string; name: string }[]>([]);
  subjects = signal<SubjectOption[]>([]);
  terms = signal<TermOption[]>([]);
  assignments = signal<LmsAssignment[]>([]);
  lessons = signal<LessonContent[]>([]);
  virtualClasses = signal<VirtualClass[]>([]);
  submissions = signal<LmsSubmission[]>([]);
  selectedAssignmentId = signal('');

  selectedClassId = '';
  selectedSubjectId = '';
  selectedTermId = '';

  // Assignment form
  aTitle = '';
  aDescription = '';
  aDueAt = '';
  aMaxScore = '';
  aStatus: 'draft' | 'published' = 'published';
  aFile: File | null = null;

  // Lesson form
  lTitle = '';
  lDescription = '';
  lType: 'note' | 'link' | 'document' | 'video' = 'note';
  lUrl = '';
  lFile: File | null = null;

  // Virtual class form
  vTitle = '';
  vDescription = '';
  vStartsAt = '';
  vEndsAt = '';
  vJoinUrl = '';

  // Grading
  gradeValue = '';
  gradeFeedback = '';

  loading = signal(true);
  busy = signal(false);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  selectedAssignment = computed(() =>
    this.assignments().find((a) => a.id === this.selectedAssignmentId()) ?? null,
  );

  onClassChange(): void {
    this.refresh();
    this.loadSubjectsForClass();
  }

  loadSubjectsForClass(): void {
    if (!this.selectedClassId) {
      if (this.isAdmin) {
        this.api.get<SubjectOption[]>('/admin/subjects').subscribe({
          next: (rows) => this.subjects.set(rows),
          error: () => this.subjects.set([]),
        });
      }
      return;
    }
    this.api
      .get<SubjectOption[]>('/academics/homework-assignments/subjects', { classId: this.selectedClassId })
      .subscribe({
        next: (rows) => this.subjects.set(rows),
        error: () => {
          if (this.isAdmin) {
            this.api.get<SubjectOption[]>('/admin/subjects').subscribe({
              next: (rows) => this.subjects.set(rows),
              error: () => this.subjects.set([]),
            });
          } else {
            this.subjects.set([]);
          }
        },
      });
  }

  ngOnInit(): void {
    loadTeacherClassOptions(this.api).subscribe({
      next: (classes) => {
        this.classes.set(classes);
        if (classes.length === 1) this.selectedClassId = classes[0].id;
        this.loading.set(false);
        this.loadSubjectsForClass();
        this.refresh();
      },
      error: () => this.loading.set(false),
    });

    this.api.get<TermOption[]>('/exams/terms').subscribe({
      next: (terms) => {
        const sorted = [...terms].sort((a, b) => Number(!!b.isCurrent) - Number(!!a.isCurrent));
        this.terms.set(sorted);
        this.selectedTermId = sorted.find((t) => t.isCurrent)?.id || sorted[0]?.id || '';
      },
    });
  }

  setTab(tab: Tab): void {
    this.tab.set(tab);
    this.refresh();
  }

  refresh(): void {
    if (this.tab() === 'assignments') this.loadAssignments();
    if (this.tab() === 'lessons') this.loadLessons();
    if (this.tab() === 'virtual') this.loadVirtual();
    if (this.tab() === 'grade' && this.selectedAssignmentId()) this.loadSubmissions();
  }

  loadAssignments(): void {
    const params: Record<string, string> = {};
    if (this.selectedClassId) params['classId'] = this.selectedClassId;
    if (this.selectedSubjectId) params['subjectId'] = this.selectedSubjectId;
    if (this.selectedTermId) params['termId'] = this.selectedTermId;
    this.lms.listAssignments(params).subscribe({
      next: (rows) => this.assignments.set(rows),
      error: () => this.assignments.set([]),
    });
  }

  loadLessons(): void {
    const params: Record<string, string> = {};
    if (this.selectedClassId) params['classId'] = this.selectedClassId;
    if (this.selectedSubjectId) params['subjectId'] = this.selectedSubjectId;
    this.lms.listLessons(params).subscribe({
      next: (rows) => this.lessons.set(rows),
      error: () => this.lessons.set([]),
    });
  }

  loadVirtual(): void {
    const params: Record<string, string> = {};
    if (this.selectedClassId) params['classId'] = this.selectedClassId;
    this.lms.listVirtualClasses(params).subscribe({
      next: (rows) => this.virtualClasses.set(rows),
      error: () => this.virtualClasses.set([]),
    });
  }

  loadSubmissions(): void {
    const id = this.selectedAssignmentId();
    if (!id) return;
    this.lms.listSubmissions(id).subscribe({
      next: (rows) => this.submissions.set(rows),
      error: () => this.submissions.set([]),
    });
  }

  onFile(event: Event, kind: 'a' | 'l'): void {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    if (kind === 'a') this.aFile = file;
    else this.lFile = file;
  }

  createAssignment(): void {
    if (!this.selectedClassId || !this.aTitle.trim()) {
      this.showToast('error', 'Class and title are required.');
      return;
    }
    const form = new FormData();
    form.append('classId', this.selectedClassId);
    if (this.selectedSubjectId) form.append('subjectId', this.selectedSubjectId);
    if (this.selectedTermId) form.append('termId', this.selectedTermId);
    form.append('title', this.aTitle.trim());
    if (this.aDescription.trim()) form.append('description', this.aDescription.trim());
    if (this.aDueAt) form.append('dueAt', new Date(this.aDueAt).toISOString());
    if (this.aMaxScore) form.append('maxScore', this.aMaxScore);
    form.append('status', this.aStatus);
    if (this.aFile) form.append('file', this.aFile);

    this.busy.set(true);
    this.lms.createAssignment(form).subscribe({
      next: () => {
        this.busy.set(false);
        this.aTitle = '';
        this.aDescription = '';
        this.aDueAt = '';
        this.aMaxScore = '';
        this.aFile = null;
        this.showToast('success', 'Assignment created.');
        this.loadAssignments();
      },
      error: (e) => {
        this.busy.set(false);
        this.showToast('error', e.error?.message || 'Failed to create assignment.');
      },
    });
  }

  publishAssignment(row: LmsAssignment): void {
    const form = new FormData();
    form.append('status', 'published');
    this.lms.updateAssignment(row.id, form).subscribe({
      next: () => {
        this.showToast('success', 'Assignment published.');
        this.loadAssignments();
      },
      error: (e) => this.showToast('error', e.error?.message || 'Failed to publish.'),
    });
  }

  deleteAssignment(row: LmsAssignment): void {
    if (!confirm(`Delete "${row.title}"?`)) return;
    this.lms.deleteAssignment(row.id).subscribe({
      next: () => {
        this.showToast('success', 'Assignment deleted.');
        this.loadAssignments();
      },
      error: (e) => this.showToast('error', e.error?.message || 'Delete failed.'),
    });
  }

  openGrade(row: LmsAssignment): void {
    this.selectedAssignmentId.set(row.id);
    this.tab.set('grade');
    this.loadSubmissions();
  }

  createLesson(): void {
    if (!this.selectedSubjectId || !this.lTitle.trim()) {
      this.showToast('error', 'Subject and title are required.');
      return;
    }
    const form = new FormData();
    if (this.selectedClassId) form.append('classId', this.selectedClassId);
    form.append('subjectId', this.selectedSubjectId);
    if (this.selectedTermId) form.append('termId', this.selectedTermId);
    form.append('title', this.lTitle.trim());
    if (this.lDescription.trim()) form.append('description', this.lDescription.trim());
    form.append('contentType', this.lType);
    if (this.lUrl.trim()) form.append('externalUrl', this.lUrl.trim());
    form.append('isPublished', 'true');
    if (this.lFile) form.append('file', this.lFile);

    this.busy.set(true);
    this.lms.createLesson(form).subscribe({
      next: () => {
        this.busy.set(false);
        this.lTitle = '';
        this.lDescription = '';
        this.lUrl = '';
        this.lFile = null;
        this.showToast('success', 'Lesson content uploaded.');
        this.loadLessons();
      },
      error: (e) => {
        this.busy.set(false);
        this.showToast('error', e.error?.message || 'Failed to upload lesson.');
      },
    });
  }

  deleteLesson(id: string): void {
    if (!confirm('Delete this lesson content?')) return;
    this.lms.deleteLesson(id).subscribe({
      next: () => {
        this.showToast('success', 'Lesson deleted.');
        this.loadLessons();
      },
      error: (e) => this.showToast('error', e.error?.message || 'Delete failed.'),
    });
  }

  createVirtual(): void {
    if (!this.selectedClassId || !this.vTitle.trim() || !this.vStartsAt || !this.vJoinUrl.trim()) {
      this.showToast('error', 'Class, title, start time, and join URL are required.');
      return;
    }
    this.busy.set(true);
    this.lms
      .createVirtualClass({
        classId: this.selectedClassId,
        subjectId: this.selectedSubjectId || undefined,
        title: this.vTitle.trim(),
        description: this.vDescription.trim() || undefined,
        startsAt: new Date(this.vStartsAt).toISOString(),
        endsAt: this.vEndsAt ? new Date(this.vEndsAt).toISOString() : undefined,
        provider: 'manual',
        joinUrl: this.vJoinUrl.trim(),
      })
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.vTitle = '';
          this.vDescription = '';
          this.vStartsAt = '';
          this.vEndsAt = '';
          this.vJoinUrl = '';
          this.showToast('success', 'Virtual class scheduled.');
          this.loadVirtual();
        },
        error: (e) => {
          this.busy.set(false);
          this.showToast('error', e.error?.message || 'Failed to schedule class.');
        },
      });
  }

  deleteVirtual(id: string): void {
    if (!confirm('Cancel/delete this virtual class?')) return;
    this.lms.deleteVirtualClass(id).subscribe({
      next: () => {
        this.showToast('success', 'Virtual class removed.');
        this.loadVirtual();
      },
      error: (e) => this.showToast('error', e.error?.message || 'Delete failed.'),
    });
  }

  grade(sub: LmsSubmission): void {
    const grade = Number(this.gradeValue);
    if (Number.isNaN(grade) || grade < 0) {
      this.showToast('error', 'Enter a valid grade.');
      return;
    }
    this.lms.gradeSubmission(sub.id, { grade, feedback: this.gradeFeedback.trim() || undefined }).subscribe({
      next: () => {
        this.gradeValue = '';
        this.gradeFeedback = '';
        this.showToast('success', 'Submission graded.');
        this.loadSubmissions();
      },
      error: (e) => this.showToast('error', e.error?.message || 'Grading failed.'),
    });
  }

  attachmentHref(url?: string | null): string | null {
    return this.lms.fileUrl(url);
  }

  private showToast(type: 'success' | 'error', msg: string): void {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 4000);
  }
}
