import { Component, computed, HostListener, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';
import { TeacherAssignmentService } from '../../core/services/teacher-assignment.service';
import { TimetablePeriodsService } from '../../core/services/timetable-periods.service';
import {
  AssignmentFormRow,
  ClassOption,
  LessonLength,
  StaffOption,
  SubjectOption,
  TeacherAssignment,
  TeacherWeeklySchedule,
  WorkloadSummaryRow,
} from '../../core/models/teacher-assignment';
import { classHeaderLabel } from '../../core/utils/class-display';

type Tab = 'assignments' | 'timetable' | 'workload';

interface AssignmentEditDraft {
  assignmentId: string;
  subjectId: string;
  weeklyPeriods: number;
  lessonLength: LessonLength;
  isSharedSplit: boolean;
}

const DAYS: { key: string; label: string }[] = [
  { key: 'MONDAY', label: 'Mon' },
  { key: 'TUESDAY', label: 'Tue' },
  { key: 'WEDNESDAY', label: 'Wed' },
  { key: 'THURSDAY', label: 'Thu' },
  { key: 'FRIDAY', label: 'Fri' },
  { key: 'SATURDAY', label: 'Sat' },
  { key: 'SUNDAY', label: 'Sun' },
];

@Component({
  selector: 'app-admin-class-assignments',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule],
  templateUrl: './admin-class-assignments.component.html',
  styleUrl: './admin-class-assignments.component.scss',
})
export class AdminClassAssignmentsComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private assignmentsApi = inject(TeacherAssignmentService);
  private periodsSvc = inject(TimetablePeriodsService);
  private sanitizer = inject(DomSanitizer);
  private route = inject(ActivatedRoute);
  private pdfObjectUrl: string | null = null;

  readonly adminNav = ADMIN_NAV_SECTIONS;
  readonly days = DAYS;
  readonly lessonLengths = [
    { value: 'single', label: 'Single' },
    { value: 'double', label: 'Double' },
    { value: 'triple', label: 'Triple' },
  ] as const;

  activeTab = signal<Tab>('assignments');
  loading = signal(true);
  submitting = signal(false);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  staff = signal<StaffOption[]>([]);
  classes = signal<ClassOption[]>([]);
  subjects = signal<SubjectOption[]>([]);
  assignments = signal<TeacherAssignment[]>([]);
  workload = signal<WorkloadSummaryRow[]>([]);

  filterTeacherId = signal('');
  filterClassId = signal('');
  scheduleTeacherId = signal('');
  schedule = signal<TeacherWeeklySchedule | null>(null);
  scheduleLoading = signal(false);
  schedulePdfLoading = signal(false);
  pdfPreviewOpen = signal(false);
  pdfPreviewUrl = signal<SafeResourceUrl | null>(null);
  pdfPreviewTitle = signal('');
  pdfDownloadName = signal('timetable-teacher.pdf');

  assignmentsModalTeacher = signal<WorkloadSummaryRow | null>(null);
  modalAssignments = signal<TeacherAssignment[]>([]);
  modalAssignmentsLoading = signal(false);
  editingAssignmentId = signal<string | null>(null);
  editDraft = signal<AssignmentEditDraft | null>(null);
  assignmentSaving = signal(false);
  modalAddOpen = signal(false);
  modalAddDraft = signal<AssignmentFormRow | null>(null);
  modalAddSaving = signal(false);
  teacherResetting = signal(false);
  resetConfirmOpen = signal(false);
  resetConfirmText = signal('');
  resetScope = signal<'all' | 'teacher' | null>(null);
  resetTargetTeacher = signal<WorkloadSummaryRow | null>(null);

  readonly resetConfirmReady = computed(() => this.resetConfirmText().trim() === 'RESET');

  formRows = signal<AssignmentFormRow[]>([this.emptyRow()]);

  filteredAssignments = computed(() => {
    const teacherId = this.filterTeacherId();
    const classId = this.filterClassId();
    return this.assignments().filter((a) => {
      if (teacherId && a.teacherId !== teacherId) return false;
      if (classId && a.classId !== classId) return false;
      return true;
    });
  });

  ngOnInit(): void {
    this.reloadAll();
    const teacherId = this.route.snapshot.queryParamMap.get('teacherId') || '';
    if (teacherId) {
      this.openTeacherAssignmentsFromRoute(teacherId);
    }
  }

  /** Deep-link support: open a teacher's "Current assignments" modal (e.g. from Generate Timetable). */
  private openTeacherAssignmentsFromRoute(teacherId: string): void {
    this.assignmentsApi.workloadSummary().subscribe({
      next: (rows) => {
        this.workload.set(rows);
        const row = rows.find((r) => r.teacherId === teacherId);
        this.openTeacherAssignmentsModal(row ?? this.workloadRowForTeacher(teacherId, 0));
      },
      error: () => {
        this.openTeacherAssignmentsModal(this.workloadRowForTeacher(teacherId, 0));
      },
    });
  }

  ngOnDestroy(): void {
    document.body.style.overflow = '';
    this.closePdfPreview();
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.resetConfirmOpen()) {
      this.cancelResetConfirm();
      return;
    }
    if (this.assignmentsModalTeacher()) {
      this.closeTeacherAssignmentsModal();
      return;
    }
    if (this.pdfPreviewOpen()) {
      this.closePdfPreview();
    }
  }

  setTab(tab: Tab): void {
    this.activeTab.set(tab);
    if (tab === 'workload') {
      this.loadWorkload();
    }
  }

  reloadAll(): void {
    this.loading.set(true);
    this.api.get<StaffOption[]>('/admin/staff', { status: 'active' }).subscribe({
      next: (list) => {
        this.staff.set(list.filter((s) => ['teacher', 'principal', 'admin'].includes(s.user.role)));
        this.api.get<ClassOption[]>('/admin/classes').subscribe({
          next: (c) => {
            this.classes.set(c);
            this.api.get<SubjectOption[]>('/admin/subjects').subscribe({
              next: (sub) => {
                this.subjects.set(sub);
                this.loadAssignments();
              },
              error: () => this.finishLoadError(),
            });
          },
          error: () => this.finishLoadError(),
        });
      },
      error: () => this.finishLoadError(),
    });
  }

  private finishLoadError(): void {
    this.loading.set(false);
    this.showToast('error', 'Failed to load reference data');
  }

  loadAssignments(): void {
    this.assignmentsApi.list().subscribe({
      next: (rows) => {
        this.assignments.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.showToast('error', 'Failed to load assignments');
      },
    });
  }

  loadWorkload(): void {
    this.assignmentsApi.workloadSummary().subscribe({
      next: (rows) => {
        this.workload.set(rows);
        this.loadAssignments();
      },
      error: () => this.showToast('error', 'Failed to load workload summary'),
    });
  }

  openTeacherAssignmentsModal(row: WorkloadSummaryRow, editAssignmentId?: string): void {
    this.assignmentsModalTeacher.set(row);
    this.modalAssignmentsLoading.set(true);
    this.cancelModalAddAssignment();
    document.body.style.overflow = 'hidden';
    this.assignmentsApi.list({ teacherId: row.teacherId }).subscribe({
      next: (rows) => {
        this.modalAssignments.set(rows);
        this.modalAssignmentsLoading.set(false);
        if (editAssignmentId) {
          const target = rows.find((assignment) => assignment.id === editAssignmentId);
          if (target) this.startEditAssignment(target);
        }
      },
      error: () => {
        this.modalAssignmentsLoading.set(false);
        this.showToast('error', 'Failed to load teacher assignments');
      },
    });
  }

  editAssignmentFromList(assignment: TeacherAssignment): void {
    const teacherRow = this.workload().find((row) => row.teacherId === assignment.teacherId);
    const fallback: WorkloadSummaryRow = {
      teacherId: assignment.teacherId,
      employeeNumber: assignment.teacher?.employeeNumber || '',
      teacherName: this.staffName(assignment.teacherId),
      totalPeriods: 0,
      minThreshold: 0,
      maxThreshold: null,
      status: 'balanced',
      assignmentCount: 0,
    };
    this.openTeacherAssignmentsModal(teacherRow || fallback, assignment.id);
  }

  openResetAllConfirm(): void {
    this.resetScope.set('all');
    this.resetTargetTeacher.set(null);
    this.resetConfirmText.set('');
    this.resetConfirmOpen.set(true);
  }

  openResetConfirm(explicitTeacherId: string): void {
    const teacherId = explicitTeacherId || this.assignmentsModalTeacher()?.teacherId || '';
    if (!teacherId) return;

    const assignmentCount = this.assignments().filter((a) => a.teacherId === teacherId).length;
    if (!assignmentCount) {
      this.showToast('error', 'This teacher has no active assignments to reset');
      return;
    }

    this.resetScope.set('teacher');
    this.resetTargetTeacher.set(this.workloadRowForTeacher(teacherId, assignmentCount));
    this.resetConfirmText.set('');
    this.resetConfirmOpen.set(true);
  }

  cancelResetConfirm(): void {
    if (this.teacherResetting()) return;
    this.resetConfirmOpen.set(false);
    this.resetConfirmText.set('');
    this.resetScope.set(null);
    this.resetTargetTeacher.set(null);
  }

  confirmResetAssignments(): void {
    if (!this.resetConfirmReady() || this.teacherResetting()) return;

    const scope = this.resetScope();
    if (scope === 'all') {
      this.teacherResetting.set(true);
      this.assignmentsApi.resetAll('RESET').subscribe({
        next: (result) => this.finishResetSuccess(result.ended, 'all'),
        error: (e) => this.finishResetError(e),
      });
      return;
    }

    const teacher = this.resetTargetTeacher();
    if (!teacher) return;

    this.teacherResetting.set(true);
    this.assignmentsApi.resetTeacher(teacher.teacherId, 'RESET').subscribe({
      next: (result) => this.finishResetSuccess(result.ended, 'teacher', teacher.teacherId),
      error: (e) => this.finishResetError(e),
    });
  }

  private finishResetSuccess(ended: number, scope: 'all' | 'teacher', teacherId?: string): void {
    this.teacherResetting.set(false);
    this.resetConfirmOpen.set(false);
    this.resetConfirmText.set('');
    this.resetScope.set(null);
    this.resetTargetTeacher.set(null);
    this.cancelEditAssignment();
    this.cancelModalAddAssignment();
    this.formRows.set([this.emptyRow()]);
    this.filterTeacherId.set('');
    this.filterClassId.set('');
    if (scope === 'all') {
      this.loadAssignments();
      this.loadWorkload();
      if (this.assignmentsModalTeacher()) {
        this.reloadModalAssignments();
      }
    } else if (teacherId) {
      this.refreshAfterAssignmentChange(teacherId);
    }
    this.showToast('success', `Reset complete (${ended} assignment${ended === 1 ? '' : 's'} removed)`);
  }

  private finishResetError(e: { error?: { message?: string } }): void {
    this.teacherResetting.set(false);
    this.showToast('error', e.error?.message || 'Failed to reset assignments');
  }

  private workloadRowForTeacher(teacherId: string, assignmentCount: number): WorkloadSummaryRow {
    const fromWorkload = this.workload().find((row) => row.teacherId === teacherId);
    if (fromWorkload) return fromWorkload;

    const member = this.staff().find((s) => s.id === teacherId);
    return {
      teacherId,
      employeeNumber: member?.employeeNumber || '',
      teacherName: this.staffName(teacherId),
      totalPeriods: 0,
      minThreshold: 0,
      maxThreshold: null,
      status: 'balanced',
      assignmentCount,
    };
  }

  syncAssignmentsFromTeacherLoad(): void {
    this.assignmentsApi.syncTeacherLoad().subscribe({
      next: () => {
        this.loadAssignments();
        this.loadWorkload();
        const teacherId = this.assignmentsModalTeacher()?.teacherId;
        if (teacherId) this.reloadModalAssignments();
        this.showToast('success', 'Assignments updated from Staff → Teacher Load');
      },
      error: () => this.showToast('error', 'Failed to sync from teacher load'),
    });
  }

  closeTeacherAssignmentsModal(): void {
    this.cancelResetConfirm();
    this.cancelEditAssignment();
    this.cancelModalAddAssignment();
    this.assignmentsModalTeacher.set(null);
    this.modalAssignments.set([]);
    if (!this.pdfPreviewOpen()) {
      document.body.style.overflow = '';
    }
  }

  openModalAddAssignment(): void {
    const teacher = this.assignmentsModalTeacher();
    if (!teacher) return;
    this.cancelEditAssignment();
    this.modalAddDraft.set({
      teacherId: teacher.teacherId,
      classId: '',
      sectionId: '',
      subjectId: '',
      role: 'subject_teacher',
      weeklyPeriods: 1,
      lessonLength: 'single',
      isSharedSplit: false,
    });
    this.modalAddOpen.set(true);
  }

  cancelModalAddAssignment(): void {
    this.modalAddOpen.set(false);
    this.modalAddDraft.set(null);
    this.modalAddSaving.set(false);
  }

  classesForModalAdd(): ClassOption[] {
    const teacherId = this.assignmentsModalTeacher()?.teacherId;
    const draftClassId = this.modalAddDraft()?.classId;
    if (!teacherId) return this.classes();

    const taken = new Set<string>();
    for (const assignment of this.modalAssignments()) {
      taken.add(assignment.classId);
    }
    for (const assignment of this.assignments()) {
      if (assignment.teacherId === teacherId && assignment.isActive && !assignment.endDate) {
        taken.add(assignment.classId);
      }
    }

    return this.classes().filter((c) => !taken.has(c.id) || c.id === draftClassId);
  }

  modalAddConflict(): string | null {
    const draft = this.modalAddDraft();
    const teacherId = this.assignmentsModalTeacher()?.teacherId;
    if (!draft?.classId || !teacherId) return null;
    return this.existingAssignmentConflictMessage(teacherId, draft.classId);
  }

  saveModalAddAssignment(forceReassign = false): void {
    const draft = this.modalAddDraft();
    const teacherId = this.assignmentsModalTeacher()?.teacherId;
    if (!draft || !teacherId) return;

    if (!draft.classId) {
      this.showToast('error', 'Select a class');
      return;
    }
    if (draft.role === 'subject_teacher' && !draft.subjectId) {
      this.showToast('error', 'Select a subject');
      return;
    }

    const conflict = this.existingAssignmentConflictMessage(teacherId, draft.classId);
    if (conflict) {
      this.showToast('error', conflict);
      return;
    }

    this.modalAddSaving.set(true);
    this.assignmentsApi
      .bulkCreate({
        forceReassign,
        assignments: [
          {
            teacherId,
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
          this.modalAddSaving.set(false);
          this.cancelModalAddAssignment();
          this.refreshAfterAssignmentChange(teacherId);
          this.showToast('success', 'Assignment added');
        },
        error: (e) => {
          this.modalAddSaving.set(false);
          const msg = e.error?.message || 'Failed to add assignment';
          const isDuplicateClass =
            typeof msg === 'string' && msg.toLowerCase().includes('only be linked to a class once');
          if (e.status === 409 && !forceReassign && !isDuplicateClass && confirm(`${msg}\n\nForce reassign and continue?`)) {
            this.saveModalAddAssignment(true);
            return;
          }
          this.showToast('error', msg);
        },
      });
  }

  modalIntegrityWarning(): string | null {
    const rows = this.modalAssignments();
    const seen = new Set<string>();
    for (const row of rows) {
      if (seen.has(row.classId)) {
        return 'Data inconsistency detected: this teacher has more than one active assignment for the same class. End the duplicate rows to restore integrity.';
      }
      seen.add(row.classId);
    }
    return null;
  }

  modalHasLoadOutOfSync(): boolean {
    return this.modalAssignments().some((row) => row.loadOutOfSync);
  }

  isDuplicateClassAssignment(assignment: TeacherAssignment): boolean {
    return this.modalAssignments().some(
      (row) => row.id !== assignment.id && row.classId === assignment.classId,
    );
  }

  startEditAssignment(assignment: TeacherAssignment): void {
    this.editingAssignmentId.set(assignment.id);
    this.editDraft.set({
      assignmentId: assignment.id,
      subjectId: assignment.subjectId || '',
      weeklyPeriods: assignment.weeklyPeriods,
      lessonLength: assignment.lessonLength,
      isSharedSplit: assignment.isSharedSplit,
    });
  }

  cancelEditAssignment(): void {
    this.editingAssignmentId.set(null);
    this.editDraft.set(null);
    this.assignmentSaving.set(false);
  }

  saveEditAssignment(forceReassign = false): void {
    const draft = this.editDraft();
    if (!draft) return;

    const assignment = this.modalAssignments().find((row) => row.id === draft.assignmentId);
    if (!assignment) return;

    if (assignment.role === 'subject_teacher' && !draft.subjectId) {
      this.showToast('error', 'Select a subject');
      return;
    }

    if (assignment.role === 'subject_teacher' && draft.weeklyPeriods < 1) {
      this.showToast('error', 'Periods per week must be at least 1');
      return;
    }

    this.assignmentSaving.set(true);
    const body: Record<string, unknown> = {
      weeklyPeriods: assignment.role === 'subject_teacher' ? draft.weeklyPeriods : 0,
      lessonLength: draft.lessonLength,
      isSharedSplit: draft.isSharedSplit,
      forceReassign,
    };
    if (assignment.role === 'subject_teacher') {
      body['subjectId'] = draft.subjectId;
    }

    this.assignmentsApi.update(draft.assignmentId, body).subscribe({
      next: () => {
        this.assignmentSaving.set(false);
        this.cancelEditAssignment();
        this.refreshAfterAssignmentChange(this.assignmentsModalTeacher()?.teacherId);
        this.showToast('success', 'Assignment updated');
      },
      error: (e) => {
        this.assignmentSaving.set(false);
        const msg = e.error?.message || 'Failed to update assignment';
        if (e.status === 409 && !forceReassign && confirm(`${msg}\n\nForce reassign and continue?`)) {
          this.saveEditAssignment(true);
          return;
        }
        this.showToast('error', msg);
      },
    });
  }

  deleteAssignmentFromModal(assignment: TeacherAssignment): void {
    if (!confirm('Delete this assignment? The historical record will be kept.')) return;
    const teacherId = this.assignmentsModalTeacher()?.teacherId;
    this.assignmentsApi.end(assignment.id).subscribe({
      next: () => {
        if (this.editingAssignmentId() === assignment.id) {
          this.cancelEditAssignment();
        }
        this.refreshAfterAssignmentChange(teacherId);
        this.showToast('success', 'Assignment deleted');
      },
      error: (e) => this.showToast('error', e.error?.message || 'Failed to delete assignment'),
    });
  }

  private refreshAfterAssignmentChange(teacherId?: string): void {
    this.assignmentsApi.workloadSummary().subscribe({
      next: (rows) => {
        this.workload.set(rows);
        if (teacherId) {
          const updated = rows.find((row) => row.teacherId === teacherId);
          if (updated) this.assignmentsModalTeacher.set(updated);
          this.reloadModalAssignments();
        }
        this.loadAssignments();
      },
      error: () => this.showToast('error', 'Failed to refresh assignments'),
    });
  }

  private reloadModalAssignments(): void {
    const teacherRow = this.assignmentsModalTeacher();
    if (!teacherRow) return;
    this.modalAssignmentsLoading.set(true);
    this.assignmentsApi.list({ teacherId: teacherRow.teacherId }).subscribe({
      next: (rows) => {
        this.modalAssignments.set(rows);
        this.modalAssignmentsLoading.set(false);
      },
      error: () => {
        this.modalAssignmentsLoading.set(false);
        this.showToast('error', 'Failed to refresh assignments');
      },
    });
  }

  loadTeacherSchedule(): void {
    const teacherId = this.scheduleTeacherId();
    if (!teacherId) {
      this.schedule.set(null);
      return;
    }
    this.scheduleLoading.set(true);
    this.assignmentsApi.teacherSchedule(teacherId).subscribe({
      next: (data) => {
        this.schedule.set(data);
        this.scheduleLoading.set(false);
      },
      error: () => {
        this.scheduleLoading.set(false);
        this.showToast('error', 'Failed to load teacher schedule');
      },
    });
  }

  previewTeacherTimetablePdf(): void {
    const teacherId = this.scheduleTeacherId();
    if (!teacherId) {
      this.showToast('error', 'Select a teacher first.');
      return;
    }
    this.schedulePdfLoading.set(true);
    const params: Record<string, string> = {
      teacherId,
      periods: this.periodsPayload(),
      preview: 'true',
    };
    this.api.getBlob('/timetable/generate/teacher/pdf', params).subscribe({
      next: (blob) => {
        this.schedulePdfLoading.set(false);
        if (blob.type && !blob.type.includes('pdf')) {
          this.showToast('error', 'Server did not return a PDF file.');
          return;
        }
        const safeName = this.staffName(teacherId).replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-') || 'teacher';
        this.openPdfPreview(blob, `timetable-teacher-${safeName}.pdf`, `Teacher: ${this.staffName(teacherId)}`);
      },
      error: (e) => {
        this.schedulePdfLoading.set(false);
        this.showToast('error', e.error?.message || 'Failed to generate timetable PDF.');
      },
    });
  }

  downloadPdfPreview(): void {
    if (!this.pdfObjectUrl) return;
    const a = document.createElement('a');
    a.href = this.pdfObjectUrl;
    a.download = this.pdfDownloadName();
    a.click();
  }

  closePdfPreview(): void {
    this.pdfPreviewOpen.set(false);
    this.revokePdfObjectUrl();
    document.body.style.overflow = '';
  }

  private openPdfPreview(blob: Blob, downloadName: string, title: string): void {
    this.revokePdfObjectUrl();
    this.pdfObjectUrl = URL.createObjectURL(blob);
    this.pdfDownloadName.set(downloadName);
    this.pdfPreviewTitle.set(title);
    this.pdfPreviewUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(this.pdfObjectUrl));
    this.pdfPreviewOpen.set(true);
    document.body.style.overflow = 'hidden';
  }

  private revokePdfObjectUrl(): void {
    if (this.pdfObjectUrl) {
      URL.revokeObjectURL(this.pdfObjectUrl);
      this.pdfObjectUrl = null;
    }
    this.pdfPreviewUrl.set(null);
  }

  private periodsPayload(): string {
    return JSON.stringify(
      this.periodsSvc.load().map((p) => ({
        name: p.name,
        startTime: p.startTime,
        endTime: p.endTime,
        slotType: p.slotType,
      })),
    );
  }

  addFormRow(): void {
    this.formRows.update((rows) => [...rows, this.emptyRow()]);
  }

  removeFormRow(index: number): void {
    this.formRows.update((rows) => rows.filter((_, i) => i !== index));
  }

  submitAssignments(forceReassign = false): void {
    const rows = this.formRows().filter((r) => r.teacherId && r.classId && (r.role === 'class_teacher' || r.subjectId));
    if (!rows.length) {
      this.showToast('error', 'Add at least one complete assignment row');
      return;
    }

    const duplicateMessage = this.findDuplicateTeacherClassMessage(rows);
    if (duplicateMessage) {
      this.showToast('error', duplicateMessage);
      return;
    }

    this.submitting.set(true);
    this.assignmentsApi
      .bulkCreate({
        forceReassign,
        assignments: rows.map((r) => ({
          teacherId: r.teacherId,
          classId: r.classId,
          sectionId: r.sectionId || undefined,
          subjectId: r.role === 'subject_teacher' ? r.subjectId : undefined,
          role: r.role,
          weeklyPeriods: r.role === 'subject_teacher' ? r.weeklyPeriods : 0,
          lessonLength: r.lessonLength,
          isSharedSplit: r.isSharedSplit,
        })),
      })
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.formRows.set([this.emptyRow()]);
          this.loadAssignments();
          this.loadWorkload();
          this.showToast('success', 'Assignments saved');
        },
        error: (e) => {
          this.submitting.set(false);
          const msg = e.error?.message || 'Failed to save assignments';
          const isDuplicateClass =
            typeof msg === 'string' && msg.toLowerCase().includes('only be linked to a class once');
          if (e.status === 409 && !forceReassign && !isDuplicateClass && confirm(`${msg}\n\nForce reassign and continue?`)) {
            this.submitAssignments(true);
            return;
          }
          this.showToast('error', msg);
        },
      });
  }

  endAssignment(assignment: TeacherAssignment): void {
    if (!confirm('Delete this assignment? The historical record will be kept.')) return;
    this.assignmentsApi.end(assignment.id).subscribe({
      next: () => {
        this.refreshAfterAssignmentChange();
        this.showToast('success', 'Assignment deleted');
      },
      error: (e) => this.showToast('error', e.error?.message || 'Failed to delete assignment'),
    });
  }

  staffName(id: string): string {
    const s = this.staff().find((x) => x.id === id);
    return s ? `${s.user.firstName} ${s.user.lastName}`.trim() : id;
  }

  classLabel(c: ClassOption | { name: string; form?: { name: string } }): string {
    return classHeaderLabel(c);
  }

  classesForRow(rowIndex: number): ClassOption[] {
    const row = this.formRows()[rowIndex];
    if (!row?.teacherId) return this.classes();
    const blocked = this.takenClassIdsForTeacher(row.teacherId, rowIndex);
    return this.classes().filter((c) => !blocked.has(c.id) || c.id === row.classId);
  }

  rowClassConflict(rowIndex: number): string | null {
    const row = this.formRows()[rowIndex];
    if (!row?.teacherId || !row.classId) return null;
    return this.duplicateTeacherClassMessage(row.teacherId, row.classId, rowIndex);
  }

  private takenClassIdsForTeacher(teacherId: string, excludeRowIndex?: number): Set<string> {
    const taken = new Set<string>();
    for (const assignment of this.assignments()) {
      if (assignment.teacherId === teacherId && assignment.isActive && !assignment.endDate) {
        taken.add(assignment.classId);
      }
    }
    this.formRows().forEach((row, index) => {
      if (index === excludeRowIndex) return;
      if (row.teacherId === teacherId && row.classId) {
        taken.add(row.classId);
      }
    });
    return taken;
  }

  private findDuplicateTeacherClassMessage(
    rows: AssignmentFormRow[],
  ): string | null {
    const seen = new Set<string>();
    for (const row of rows) {
      const key = `${row.teacherId}:${row.classId}`;
      if (seen.has(key)) {
        return this.duplicateTeacherClassInFormMessage(row.teacherId, row.classId);
      }
      seen.add(key);
      const conflict = this.existingAssignmentConflictMessage(row.teacherId, row.classId);
      if (conflict) return conflict;
    }
    return null;
  }

  private duplicateTeacherClassMessage(
    teacherId: string,
    classId: string,
    excludeRowIndex: number,
  ): string | null {
    const duplicateInOtherFormRows = this.formRows().some(
      (row, index) =>
        index !== excludeRowIndex &&
        row.teacherId === teacherId &&
        row.classId === classId,
    );
    if (duplicateInOtherFormRows) {
      return this.duplicateTeacherClassInFormMessage(teacherId, classId);
    }

    return this.existingAssignmentConflictMessage(teacherId, classId);
  }

  private duplicateTeacherClassInFormMessage(teacherId: string, classId: string): string {
    const classOption = this.classes().find((c) => c.id === classId);
    const className = classOption ? this.classLabel(classOption) : 'this class';
    const teacherName = this.staffName(teacherId);
    return `${teacherName} is already selected for ${className} in another row. Each teacher can only be linked to a class once.`;
  }

  private existingAssignmentConflictMessage(
    teacherId: string,
    classId: string,
  ): string | null {
    const classOption = this.classes().find((c) => c.id === classId);
    const className = classOption ? this.classLabel(classOption) : 'this class';
    const teacherName = this.staffName(teacherId);

    const duplicateExisting = this.assignments().some(
      (assignment) =>
        assignment.teacherId === teacherId &&
        assignment.classId === classId &&
        assignment.isActive &&
        !assignment.endDate,
    );
    if (duplicateExisting) {
      return `${teacherName} is already assigned to ${className}. Delete the existing assignment before adding it again.`;
    }

    return null;
  }

  roleLabel(role: string): string {
    return role === 'class_teacher' ? 'Class Teacher' : 'Subject Teacher';
  }

  workloadBadge(status: string): string {
    if (status === 'overload') return 'overload';
    if (status === 'underload') return 'underload';
    return 'balanced';
  }

  slotsForDay(day: string): TeacherWeeklySchedule['slots'] {
    const linked = (this.schedule()?.slots || []).filter((s) => s.dayOfWeek === day);
    if (linked.length) return linked;
    return this.timetableRowsAsSlots(day);
  }

  private timetableRowsAsSlots(day: string): TeacherWeeklySchedule['slots'] {
    const dayNum = this.dayKeyToInt(day);
    const rows = (this.schedule()?.timetableRows || []).filter((r) => r.dayOfWeek === dayNum);
    const periodIndex = new Map<string, number>();
    let next = 1;
    for (const row of this.schedule()?.timetableRows || []) {
      if (!periodIndex.has(row.startTime)) {
        periodIndex.set(row.startTime, next);
        next += 1;
      }
    }
    return rows.map((row) => ({
      id: row.id,
      teacherAssignmentId: '',
      dayOfWeek: day as TeacherWeeklySchedule['slots'][0]['dayOfWeek'],
      periodNumber: periodIndex.get(row.startTime) ?? 1,
      startTime: row.startTime,
      endTime: row.endTime,
      assignment: {
        id: '',
        teacherId: '',
        classId: row.classId,
        role: 'subject_teacher' as const,
        startDate: '',
        isActive: true,
        weeklyPeriods: 0,
        lessonLength: 'single' as const,
        isSharedSplit: false,
        schoolClass: row.schoolClass ? { id: row.classId, name: row.schoolClass.name } : undefined,
        subject: row.subject ? { id: '', name: row.subject.name } : undefined,
      },
    }));
  }

  private dayKeyToInt(day: string): number {
    const order = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
    const idx = order.indexOf(day);
    return idx >= 0 ? idx + 1 : 1;
  }

  private emptyRow(): AssignmentFormRow {
    return {
      teacherId: '',
      classId: '',
      sectionId: '',
      subjectId: '',
      role: 'subject_teacher',
      weeklyPeriods: 1,
      lessonLength: 'single',
      isSharedSplit: false,
    };
  }

  private showToast(type: 'success' | 'error', msg: string): void {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 4500);
  }
}
