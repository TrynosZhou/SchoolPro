import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { STUDENT_NAV_SECTIONS } from '../../core/config/student-nav';
import {
  LmsApiService,
  LmsAssignment,
  LmsSubmission,
  LessonContent,
  VirtualClass,
} from '../../core/services/lms-api.service';

type Tab = 'assignments' | 'lessons' | 'classes';

@Component({
  selector: 'app-lms-student',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, DatePipe, RouterLink],
  templateUrl: './lms-student.component.html',
  styleUrl: './lms-student.component.scss',
})
export class LmsStudentComponent implements OnInit {
  private lms = inject(LmsApiService);

  readonly navSections = STUDENT_NAV_SECTIONS;
  tab = signal<Tab>('assignments');

  assignments = signal<LmsAssignment[]>([]);
  lessons = signal<LessonContent[]>([]);
  virtualClasses = signal<VirtualClass[]>([]);
  mySubs = signal<Record<string, LmsSubmission | null>>({});

  selectedId = signal<string | null>(null);
  textAnswer = '';
  file: File | null = null;

  loading = signal(true);
  busy = signal(false);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  ngOnInit(): void {
    this.loadAll();
  }

  setTab(tab: Tab): void {
    this.tab.set(tab);
  }

  loadAll(): void {
    this.loading.set(true);
    this.lms.listAssignments().subscribe({
      next: (rows) => {
        this.assignments.set(rows);
        this.loading.set(false);
        for (const a of rows) this.fetchMySub(a.id);
      },
      error: () => {
        this.assignments.set([]);
        this.loading.set(false);
      },
    });
    this.lms.listLessons().subscribe({
      next: (rows) => this.lessons.set(rows),
      error: () => this.lessons.set([]),
    });
    this.lms.listVirtualClasses().subscribe({
      next: (rows) => this.virtualClasses.set(rows),
      error: () => this.virtualClasses.set([]),
    });
  }

  fetchMySub(assignmentId: string): void {
    this.lms.mySubmission(assignmentId).subscribe({
      next: (row) => this.mySubs.update((m) => ({ ...m, [assignmentId]: row })),
      error: () => this.mySubs.update((m) => ({ ...m, [assignmentId]: null })),
    });
  }

  openSubmit(a: LmsAssignment): void {
    this.selectedId.set(a.id);
    this.textAnswer = this.mySubs()[a.id]?.textAnswer || '';
    this.file = null;
  }

  onFile(event: Event): void {
    this.file = (event.target as HTMLInputElement).files?.[0] ?? null;
  }

  submit(): void {
    const id = this.selectedId();
    if (!id) return;
    if (!this.textAnswer.trim() && !this.file) {
      this.showToast('error', 'Add a text answer and/or a file.');
      return;
    }
    const form = new FormData();
    if (this.textAnswer.trim()) form.append('textAnswer', this.textAnswer.trim());
    if (this.file) form.append('file', this.file);
    this.busy.set(true);
    this.lms.submitAssignment(id, form).subscribe({
      next: (row) => {
        this.busy.set(false);
        this.mySubs.update((m) => ({ ...m, [id]: row }));
        this.selectedId.set(null);
        this.showToast('success', row.status === 'late' ? 'Submitted (marked late).' : 'Submitted successfully.');
      },
      error: (e) => {
        this.busy.set(false);
        this.showToast('error', e.error?.message || 'Submission failed.');
      },
    });
  }

  href(url?: string | null): string | null {
    return this.lms.fileUrl(url);
  }

  private showToast(type: 'success' | 'error', msg: string): void {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 4000);
  }
}
