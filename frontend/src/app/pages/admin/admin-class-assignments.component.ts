import { Component, computed, HostListener, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { TeacherAssignmentsModalComponent } from '../../shared/teacher-assignments-modal/teacher-assignments-modal.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';
import { TeacherAssignmentService } from '../../core/services/teacher-assignment.service';
import { TimetablePeriodsService } from '../../core/services/timetable-periods.service';
import {
  AssignmentFormRow,
  ClassOption,
  StaffOption,
  SubjectOption,
  TeacherAssignment,
  TeacherWeeklySchedule,
  WorkloadSummaryRow,
} from '../../core/models/teacher-assignment';
import { classHeaderLabel } from '../../core/utils/class-display';
import { blobErrorMessage } from '../../core/utils/blob-error.util';

type Tab = 'assignments' | 'timetable' | 'workload';

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
  imports: [PortalLayoutComponent, FormsModule, TeacherAssignmentsModalComponent],
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
  scheduleGenerating = signal(false);

  /** Assigned lessons for the selected teacher that are not (fully) on the timetable yet. */
  readonly pendingLoad = computed(() =>
    (this.schedule()?.load ?? []).filter((l) => l.scheduledPeriods < l.requiredPeriods),
  );
  readonly hasSubjectAssignments = computed(() => (this.schedule()?.load?.length ?? 0) > 0);
  pdfPreviewOpen = signal(false);
  pdfPreviewUrl = signal<SafeResourceUrl | null>(null);
  pdfPreviewTitle = signal('');
  pdfDownloadName = signal('timetable-teacher.pdf');

  assignmentsModalTeacher = signal<WorkloadSummaryRow | null>(null);
  modalEditAssignmentId = signal<string | null>(null);
  teacherResetting = signal(false);
  resetConfirmOpen = signal(false);
  resetConfirmText = signal('');

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
    // The assignments modal handles its own Escape key.
    if (this.resetConfirmOpen()) {
      this.cancelResetConfirm();
      return;
    }
    if (!this.assignmentsModalTeacher() && this.pdfPreviewOpen()) {
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
    this.modalEditAssignmentId.set(editAssignmentId ?? null);
    this.assignmentsModalTeacher.set(row);
    document.body.style.overflow = 'hidden';
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

  closeTeacherAssignmentsModal(): void {
    this.assignmentsModalTeacher.set(null);
    this.modalEditAssignmentId.set(null);
    if (!this.pdfPreviewOpen()) {
      document.body.style.overflow = '';
    }
  }

  /** The shared modal changed something (add / edit / delete / reset): refresh this page's data. */
  onAssignmentsModalChanged(): void {
    this.refreshAfterAssignmentChange();
  }

  openResetAllConfirm(): void {
    this.resetConfirmText.set('');
    this.resetConfirmOpen.set(true);
  }

  cancelResetConfirm(): void {
    if (this.teacherResetting()) return;
    this.resetConfirmOpen.set(false);
    this.resetConfirmText.set('');
  }

  confirmResetAssignments(): void {
    if (!this.resetConfirmReady() || this.teacherResetting()) return;
    this.teacherResetting.set(true);
    this.assignmentsApi.resetAll('RESET').subscribe({
      next: (result) => this.finishResetSuccess(result.ended),
      error: (e) => this.finishResetError(e),
    });
  }

  private finishResetSuccess(ended: number): void {
    this.teacherResetting.set(false);
    this.resetConfirmOpen.set(false);
    this.resetConfirmText.set('');
    this.formRows.set([this.emptyRow()]);
    this.filterTeacherId.set('');
    this.filterClassId.set('');
    this.loadAssignments();
    this.loadWorkload();
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
        this.showToast('success', 'Assignments updated from Staff → Teacher Load');
      },
      error: () => this.showToast('error', 'Failed to sync from teacher load'),
    });
  }

  private refreshAfterAssignmentChange(): void {
    this.assignmentsApi.workloadSummary().subscribe({
      next: (rows) => {
        this.workload.set(rows);
        this.loadAssignments();
      },
      error: () => this.showToast('error', 'Failed to refresh assignments'),
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

  /**
   * Adds the selected teacher's missing lessons to the school timetable without touching
   * lessons that are already scheduled (append mode, restricted to this teacher).
   */
  generateLessonsForTeacher(): void {
    const teacherId = this.scheduleTeacherId();
    if (!teacherId) return;
    const lessonPeriods = this.periodsSvc.load().filter((p) => p.slotType !== 'break');
    if (!lessonPeriods.length) {
      this.showToast('error', 'Configure lesson periods first (Timetable → Configure Periods).');
      return;
    }
    this.scheduleGenerating.set(true);
    this.api
      .post<{ success: boolean; failures: { reason: string }[]; summary: { totalSlots: number } }>(
        '/timetable/generate',
        {
          periods: lessonPeriods.map((p) => ({ name: p.name, startTime: p.startTime, endTime: p.endTime })),
          replaceExisting: false,
          teacherId,
        },
      )
      .subscribe({
        next: (res) => {
          this.scheduleGenerating.set(false);
          if (res.success) {
            this.showToast('success', 'Lessons added to the timetable for this teacher.');
          } else {
            this.showToast(
              'error',
              res.failures?.[0]?.reason || 'Some lessons could not be placed. See Timetable → Generate.',
            );
          }
          this.loadTeacherSchedule();
        },
        error: async (e) => {
          this.scheduleGenerating.set(false);
          this.showToast('error', await blobErrorMessage(e, 'Could not generate lessons for this teacher.'));
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
      error: async (e) => {
        this.schedulePdfLoading.set(false);
        this.showToast('error', await blobErrorMessage(e, 'Failed to generate timetable PDF.'));
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
