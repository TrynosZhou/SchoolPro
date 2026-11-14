import { Component, EventEmitter, HostListener, inject, Input, OnInit, Output, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { TeacherAssignmentService } from '../../core/services/teacher-assignment.service';
import {
  AssignmentFormRow,
  ClassOption,
  LessonLength,
  SubjectOption,
  TeacherAssignment,
} from '../../core/models/teacher-assignment';
import { classHeaderLabel } from '../../core/utils/class-display';

interface AssignmentEditDraft {
  assignmentId: string;
  subjectId: string;
  weeklyPeriods: number;
  lessonLength: LessonLength;
  isSharedSplit: boolean;
}

/**
 * "Current assignments" modal for one teacher: lists the teacher's active class/subject
 * assignments and lets the admin add, edit, delete or reset them.
 *
 * Used on the Class Assignments page and on the Generate Timetable page (click a teacher's
 * initials). Emits `changed` after every successful change so the host page can refresh.
 */
@Component({
  selector: 'app-teacher-assignments-modal',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './teacher-assignments-modal.component.html',
  styleUrl: './teacher-assignments-modal.component.scss',
})
export class TeacherAssignmentsModalComponent implements OnInit {
  private api = inject(ApiService);
  private assignmentsApi = inject(TeacherAssignmentService);

  @Input({ required: true }) teacherId!: string;
  @Input() teacherName = '';
  @Input() employeeNumber = '';
  /** Optionally open straight into edit mode for this assignment. */
  @Input() editAssignmentId: string | null = null;

  @Output() closed = new EventEmitter<void>();
  @Output() changed = new EventEmitter<void>();

  readonly lessonLengths = [
    { value: 'single', label: 'Single' },
    { value: 'double', label: 'Double' },
    { value: 'triple', label: 'Triple' },
  ] as const;

  displayName = signal('');
  displayEmployeeNumber = signal('');
  totalPeriods = signal(0);

  classes = signal<ClassOption[]>([]);
  subjects = signal<SubjectOption[]>([]);
  assignments = signal<TeacherAssignment[]>([]);
  loading = signal(true);

  editingAssignmentId = signal<string | null>(null);
  editDraft = signal<AssignmentEditDraft | null>(null);
  saving = signal(false);

  addOpen = signal(false);
  addDraft = signal<AssignmentFormRow | null>(null);
  addSaving = signal(false);

  resetConfirmOpen = signal(false);
  resetConfirmText = signal('');
  resetting = signal(false);
  readonly resetConfirmReady = computed(() => this.resetConfirmText().trim() === 'RESET');

  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.displayName.set(this.teacherName);
    this.displayEmployeeNumber.set(this.employeeNumber);
    this.loadReferenceData();
    this.loadWorkloadRow();
    this.reloadAssignments(this.editAssignmentId);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.resetConfirmOpen()) {
      this.cancelReset();
      return;
    }
    this.close();
  }

  close(): void {
    if (this.resetting()) return;
    this.closed.emit();
  }

  // ── Data loading ──
  private loadReferenceData(): void {
    this.api.get<ClassOption[]>('/admin/classes').subscribe({
      next: (c) => this.classes.set(c),
      error: () => this.showToast('error', 'Failed to load classes'),
    });
    this.api.get<SubjectOption[]>('/admin/subjects').subscribe({
      next: (s) => this.subjects.set(s),
      error: () => this.showToast('error', 'Failed to load subjects'),
    });
  }

  /** Header details (name, staff number, periods / week) come from the workload summary. */
  private loadWorkloadRow(): void {
    this.assignmentsApi.workloadSummary().subscribe({
      next: (rows) => {
        const row = rows.find((r) => r.teacherId === this.teacherId);
        if (!row) return;
        this.totalPeriods.set(row.totalPeriods);
        if (row.teacherName) this.displayName.set(row.teacherName);
        if (row.employeeNumber) this.displayEmployeeNumber.set(row.employeeNumber);
      },
      error: () => {
        /* header falls back to the values passed in */
      },
    });
  }

  private reloadAssignments(openEditFor?: string | null): void {
    this.loading.set(true);
    this.assignmentsApi.list({ teacherId: this.teacherId }).subscribe({
      next: (rows) => {
        this.assignments.set(rows);
        this.loading.set(false);
        if (openEditFor) {
          const target = rows.find((a) => a.id === openEditFor);
          if (target) this.startEdit(target);
        }
      },
      error: () => {
        this.loading.set(false);
        this.showToast('error', 'Failed to load teacher assignments');
      },
    });
  }

  private refreshAfterChange(): void {
    this.loadWorkloadRow();
    this.reloadAssignments();
    this.changed.emit();
  }

  // ── Display helpers ──
  classLabel(c: ClassOption | { name: string; form?: { name: string } }): string {
    return classHeaderLabel(c);
  }

  roleLabel(role: string): string {
    return role === 'class_teacher' ? 'Class Teacher' : 'Subject Teacher';
  }

  integrityWarning(): string | null {
    const seen = new Set<string>();
    for (const row of this.assignments()) {
      if (seen.has(row.classId)) {
        return 'Data inconsistency detected: this teacher has more than one active assignment for the same class. End the duplicate rows to restore integrity.';
      }
      seen.add(row.classId);
    }
    return null;
  }

  hasLoadOutOfSync(): boolean {
    return this.assignments().some((row) => row.loadOutOfSync);
  }

  isDuplicateClassAssignment(assignment: TeacherAssignment): boolean {
    return this.assignments().some((row) => row.id !== assignment.id && row.classId === assignment.classId);
  }

  syncFromTeacherLoad(): void {
    this.assignmentsApi.syncTeacherLoad().subscribe({
      next: () => {
        this.refreshAfterChange();
        this.showToast('success', 'Assignments updated from Staff → Teacher Load');
      },
      error: () => this.showToast('error', 'Failed to sync from teacher load'),
    });
  }

  // ── Add ──
  openAdd(): void {
    this.cancelEdit();
    this.addDraft.set({
      teacherId: this.teacherId,
      classId: '',
      sectionId: '',
      subjectId: '',
      role: 'subject_teacher',
      weeklyPeriods: 1,
      lessonLength: 'single',
      isSharedSplit: false,
    });
    this.addOpen.set(true);
  }

  cancelAdd(): void {
    this.addOpen.set(false);
    this.addDraft.set(null);
    this.addSaving.set(false);
  }

  classesForAdd(): ClassOption[] {
    const taken = new Set(this.assignments().map((a) => a.classId));
    const draftClassId = this.addDraft()?.classId;
    return this.classes().filter((c) => !taken.has(c.id) || c.id === draftClassId);
  }

  addConflict(): string | null {
    const draft = this.addDraft();
    if (!draft?.classId) return null;
    return this.existingConflictMessage(draft.classId);
  }

  private existingConflictMessage(classId: string): string | null {
    const duplicate = this.assignments().some((a) => a.classId === classId);
    if (!duplicate) return null;
    const classOption = this.classes().find((c) => c.id === classId);
    const className = classOption ? this.classLabel(classOption) : 'this class';
    return `${this.displayName() || 'This teacher'} is already assigned to ${className}. Delete the existing assignment before adding it again.`;
  }

  saveAdd(forceReassign = false): void {
    const draft = this.addDraft();
    if (!draft) return;
    if (!draft.classId) {
      this.showToast('error', 'Select a class');
      return;
    }
    if (draft.role === 'subject_teacher' && !draft.subjectId) {
      this.showToast('error', 'Select a subject');
      return;
    }
    const conflict = this.existingConflictMessage(draft.classId);
    if (conflict) {
      this.showToast('error', conflict);
      return;
    }

    this.addSaving.set(true);
    this.assignmentsApi
      .bulkCreate({
        forceReassign,
        assignments: [
          {
            teacherId: this.teacherId,
            classId: draft.classId,
            sectionId: draft.sectionId || undefined,
            subjectId: draft.role === 'subject_teacher' ? draft.subjectId : undefined,
            role: draft.role,
            weeklyPeriods: draft.role === 'subject_teacher' ? draft.weeklyPeriods : 0,
            lessonLength: draft.lessonLength,
            isSharedSplit: draft.isSharedSplit,
          },
        ],
      })
      .subscribe({
        next: () => {
          this.cancelAdd();
          this.refreshAfterChange();
          this.showToast('success', 'Assignment added');
        },
        error: (e) => {
          this.addSaving.set(false);
          const msg = e.error?.message || 'Failed to add assignment';
          const isDuplicateClass =
            typeof msg === 'string' && msg.toLowerCase().includes('only be linked to a class once');
          if (e.status === 409 && !forceReassign && !isDuplicateClass && confirm(`${msg}\n\nForce reassign and continue?`)) {
            this.saveAdd(true);
            return;
          }
          this.showToast('error', msg);
        },
      });
  }

  // ── Edit ──
  startEdit(assignment: TeacherAssignment): void {
    this.cancelAdd();
    this.editingAssignmentId.set(assignment.id);
    this.editDraft.set({
      assignmentId: assignment.id,
      subjectId: assignment.subjectId || '',
      weeklyPeriods: assignment.weeklyPeriods,
      lessonLength: assignment.lessonLength,
      isSharedSplit: assignment.isSharedSplit,
    });
  }

  cancelEdit(): void {
    this.editingAssignmentId.set(null);
    this.editDraft.set(null);
    this.saving.set(false);
  }

  saveEdit(forceReassign = false): void {
    const draft = this.editDraft();
    if (!draft) return;
    const assignment = this.assignments().find((a) => a.id === draft.assignmentId);
    if (!assignment) return;

    const isSubject = assignment.role === 'subject_teacher';
    if (isSubject && !draft.subjectId) {
      this.showToast('error', 'Select a subject');
      return;
    }
    if (isSubject && draft.weeklyPeriods < 1) {
      this.showToast('error', 'Periods per week must be at least 1');
      return;
    }

    this.saving.set(true);
    const body: Record<string, unknown> = {
      weeklyPeriods: isSubject ? draft.weeklyPeriods : 0,
      lessonLength: draft.lessonLength,
      isSharedSplit: draft.isSharedSplit,
      forceReassign,
    };
    if (isSubject) body['subjectId'] = draft.subjectId;

    this.assignmentsApi.update(draft.assignmentId, body).subscribe({
      next: () => {
        this.cancelEdit();
        this.refreshAfterChange();
        this.showToast('success', 'Assignment updated');
      },
      error: (e) => {
        this.saving.set(false);
        const msg = e.error?.message || 'Failed to update assignment';
        if (e.status === 409 && !forceReassign && confirm(`${msg}\n\nForce reassign and continue?`)) {
          this.saveEdit(true);
          return;
        }
        this.showToast('error', msg);
      },
    });
  }

  // ── Delete ──
  deleteAssignment(assignment: TeacherAssignment): void {
    if (!confirm('Delete this assignment? The historical record will be kept.')) return;
    this.assignmentsApi.end(assignment.id).subscribe({
      next: () => {
        if (this.editingAssignmentId() === assignment.id) this.cancelEdit();
        this.refreshAfterChange();
        this.showToast('success', 'Assignment deleted');
      },
      error: (e) => this.showToast('error', e.error?.message || 'Failed to delete assignment'),
    });
  }

  // ── Reset (all of this teacher's assignments) ──
  openReset(): void {
    if (!this.assignments().length) {
      this.showToast('error', 'This teacher has no active assignments to reset');
      return;
    }
    this.resetConfirmText.set('');
    this.resetConfirmOpen.set(true);
  }

  cancelReset(): void {
    if (this.resetting()) return;
    this.resetConfirmOpen.set(false);
    this.resetConfirmText.set('');
  }

  confirmReset(): void {
    if (!this.resetConfirmReady() || this.resetting()) return;
    this.resetting.set(true);
    this.assignmentsApi.resetTeacher(this.teacherId, 'RESET').subscribe({
      next: (result) => {
        this.resetting.set(false);
        this.resetConfirmOpen.set(false);
        this.resetConfirmText.set('');
        this.cancelEdit();
        this.cancelAdd();
        this.refreshAfterChange();
        this.showToast('success', `Reset complete (${result.ended} assignment${result.ended === 1 ? '' : 's'} removed)`);
      },
      error: (e) => {
        this.resetting.set(false);
        this.showToast('error', e.error?.message || 'Failed to reset assignments');
      },
    });
  }

  private showToast(type: 'success' | 'error', msg: string): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toast.set({ type, msg });
    this.toastTimer = setTimeout(() => this.toast.set(null), 4500);
  }
}
