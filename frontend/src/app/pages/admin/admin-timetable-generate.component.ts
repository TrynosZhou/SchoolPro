import { Component, computed, HostListener, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgStyle, NgTemplateOutlet } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';
import { TimetablePeriod, TimetablePeriodsService } from '../../core/services/timetable-periods.service';
import { classHeaderLabel } from '../../core/utils/class-display';
import {
  breakPeriodLabel,
  breakColumnVerticalLabel,
  breakPeriodHeaderTitle,
  dayGridLabel,
  formatPeriodRange,
  isBreakPeriod,
  lessonPeriodNumber,
  shortClassCode,
  teacherInitials,
  timetableSubjectShort,
} from '../../core/utils/timetable-grid-display';
import {
  buildTimetableTermVersionLabel,
  normalizeTimetableVersion,
  timetableTermPrefix,
} from '../../core/utils/timetable-term-label';
import { buildTeacherColorMap, teacherColorFor, TeacherColorStyle } from '../../core/utils/teacher-colors';

type ResultTab = 'teachers' | 'classes' | 'summary';
type EditorMode = 'teachers' | 'classes';
type EditorPdfMode = 'teachers' | 'classes';

interface TimetableSlotView {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  subjectCode?: string | null;
  subjectShort?: string | null;
  teacherId: string;
  teacherName: string;
  employeeNumber?: string;
  isLocked?: boolean;
}

interface TeacherTimetableView {
  teacherId: string;
  teacherName: string;
  employeeNumber: string;
  slotCount: number;
  classCount: number;
  subjectCount: number;
  slots: TimetableSlotView[];
}

interface ClassTimetableView {
  classId: string;
  className: string;
  slotCount: number;
  subjectCount: number;
  slots: TimetableSlotView[];
}

interface TeacherSummaryRow {
  teacherId: string;
  teacherName: string;
  employeeNumber: string;
  totalPeriods: number;
  classCount: number;
  subjectCount: number;
  assignments: {
    classId: string;
    className: string;
    subjectId: string;
    subjectName: string;
    weeklyPeriods: number;
    lessonLength: string;
    scheduledPeriods: number;
    requiredPeriods: number;
  }[];
}

interface GenerateTimetableResult {
  success: boolean;
  summary: {
    totalSlots: number;
    classesScheduled: number;
    teachersScheduled: number;
    assignmentsPlaced: number;
    assignmentsPartial: number;
    assignmentsFailed: number;
    capacityPerWeek: number;
    requiredSlots: number;
  };
  failures: {
    className: string;
    subjectName: string;
    teacherName: string;
    requiredPeriods: number;
    scheduledPeriods: number;
    reason: string;
  }[];
  teachers: TeacherTimetableView[];
  classes: ClassTimetableView[];
  teacherSummary: TeacherSummaryRow[];
}

const DAYS = [
  { value: 1, label: 'Monday', short: 'Mon' },
  { value: 2, label: 'Tuesday', short: 'Tue' },
  { value: 3, label: 'Wednesday', short: 'Wed' },
  { value: 4, label: 'Thursday', short: 'Thu' },
  { value: 5, label: 'Friday', short: 'Fri' },
];

@Component({
  selector: 'app-admin-timetable-generate',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, RouterLink, NgStyle, NgTemplateOutlet],
  templateUrl: './admin-timetable-generate.component.html',
  styleUrl: './admin-timetable-generate.component.scss',
})
export class AdminTimetableGenerateComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private periodsSvc = inject(TimetablePeriodsService);
  private sanitizer = inject(DomSanitizer);
  private slotMoveHintTimer: ReturnType<typeof setTimeout> | null = null;
  private pdfObjectUrl: string | null = null;

  readonly adminNav = ADMIN_NAV_SECTIONS;
  readonly days = DAYS;

  readonly dayGridLabel = dayGridLabel;
  readonly formatPeriodRange = formatPeriodRange;
  readonly shortClassCode = shortClassCode;
  readonly timetableSubjectShort = timetableSubjectShort;
  readonly teacherInitials = teacherInitials;
  readonly isBreakPeriod = isBreakPeriod;
  readonly breakPeriodLabel = breakPeriodLabel;
  readonly breakPeriodHeaderTitle = breakPeriodHeaderTitle;
  readonly breakColumnVerticalLabel = breakColumnVerticalLabel;
  readonly lessonPeriodNumber = lessonPeriodNumber;

  periods = signal<TimetablePeriod[]>([]);
  lessonPeriods = computed(() => this.periods().filter((p) => p.slotType === 'lesson'));
  result = signal<GenerateTimetableResult | null>(null);
  loading = signal(true);
  generating = signal(false);
  summaryPdfLoading = signal(false);
  teacherPdfLoading = signal(false);
  classPdfLoading = signal(false);
  editorPdfLoading = signal(false);
  replaceExisting = true;
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);
  resultTab = signal<ResultTab>('teachers');
  selectedTeacherId = '';
  selectedClassId = '';
  draggingSlotId = signal<string | null>(null);
  dragOverKey = signal<string | null>(null);
  slotMoving = signal(false);
  slotContextMenu = signal<{ x: number; y: number; slot: TimetableSlotView } | null>(null);
  slotMoveHint = signal<{ x: number; y: number; msg: string; above?: boolean } | null>(null);
  slotLockUpdating = signal(false);
  editorWindow = signal<EditorMode | null>(null);
  editorPdfMode = signal<EditorPdfMode>('teachers');
  pdfPreviewOpen = signal(false);
  pdfPreviewUrl = signal<SafeResourceUrl | null>(null);
  pdfPreviewTitle = signal('');
  pdfDownloadName = signal('timetable.pdf');
  termName = signal<string | null>(null);
  yearName = signal<string | null>(null);
  timetableVersion = signal('1');
  versionSaving = signal(false);

  termPrefix = computed(() => timetableTermPrefix(this.termName(), this.yearName()));
  termVersionLabel = computed(() =>
    buildTimetableTermVersionLabel(this.termName(), this.yearName(), this.timetableVersion()),
  );

  summary = computed(() => this.result()?.summary ?? null);
  failures = computed(() => this.result()?.failures ?? []);
  teachers = computed(() => this.result()?.teachers ?? []);
  classes = computed(() => this.result()?.classes ?? []);
  teacherSummary = computed(() => this.result()?.teacherSummary ?? []);

  selectedTeacher = computed(() =>
    this.teachers().find((t) => t.teacherId === this.selectedTeacherId) ?? null,
  );

  selectedClass = computed(() =>
    this.classes().find((c) => c.classId === this.selectedClassId) ?? null,
  );

  hasResult = computed(() => (this.result()?.summary.totalSlots ?? 0) > 0);

  summaryGridTeachers = computed(() => {
    return this.teachers().map((t) => ({
      teacherId: t.teacherId,
      label: this.teacherInitials(t.teacherName),
      name: t.teacherName,
      employeeNumber: t.employeeNumber,
      slots: t.slots,
    }));
  });

  teacherColorMap = computed(() =>
    buildTeacherColorMap(this.teachers().map((t) => t.teacherId)),
  );

  teacherLegendItems = computed(() =>
    this.teachers().map((t) => ({
      teacherId: t.teacherId,
      label: t.teacherName,
      style: teacherColorFor(t.teacherId, this.teacherColorMap()),
    })),
  );

  editorTitle = computed(() => {
    const mode = this.editorWindow();
    if (mode === 'teachers') return 'Teacher Timetable';
    if (mode === 'classes') return 'Class Timetable';
    return '';
  });

  ngOnInit() {
    this.periods.set(this.periodsSvc.load());
    this.loadTimetableContext();
    this.loadSnapshot();
  }

  private loadTimetableContext() {
    this.api
      .get<{
        termVersionLabel?: string;
        termName?: string | null;
        yearName?: string | null;
        timetableVersion?: string;
      }>('/timetable/context')
      .subscribe({
        next: (ctx) => {
          this.termName.set(ctx.termName ?? null);
          this.yearName.set(ctx.yearName ?? null);
          if (ctx.timetableVersion) {
            this.timetableVersion.set(normalizeTimetableVersion(ctx.timetableVersion));
          }
        },
        error: () => {
          this.termName.set(null);
          this.yearName.set(null);
          this.timetableVersion.set('1');
        },
      });
  }

  onTimetableVersionInput(value: string) {
    this.timetableVersion.set(String(value ?? '').slice(0, 32));
  }

  saveTimetableVersion() {
    const version = normalizeTimetableVersion(this.timetableVersion());
    if (version !== this.timetableVersion()) {
      this.timetableVersion.set(version);
    }
    this.versionSaving.set(true);
    this.api.patch<{ timetableVersion?: string }>('/timetable/version', { version }).subscribe({
      next: (res) => {
        this.versionSaving.set(false);
        if (res.timetableVersion) {
          this.timetableVersion.set(normalizeTimetableVersion(res.timetableVersion));
        }
      },
      error: () => {
        this.versionSaving.set(false);
      },
    });
  }

  ngOnDestroy() {
    document.body.style.overflow = '';
    this.closeSlotMoveHint();
    this.closePdfPreview();
  }

  loadSnapshot() {
    this.loading.set(true);
    const openEditorMode = this.editorWindow();
    this.api.get<GenerateTimetableResult>('/timetable/generate/snapshot').subscribe({
      next: (data) => {
        this.applyResult(data);
        this.loading.set(false);
        if (this.hasResult()) {
          if (!openEditorMode) {
            this.resultTab.set('teachers');
          }
        } else {
          this.closeEditor();
        }
      },
      error: () => {
        this.result.set(null);
        this.loading.set(false);
      },
    });
  }

  generateTimetable() {
    const periods = this.lessonPeriods();
    if (!periods.length) {
      this.showToast('error', 'Configure lesson periods before generating.');
      return;
    }
    this.generating.set(true);
    this.api
      .post<GenerateTimetableResult>('/timetable/generate', {
        periods: periods.map((p) => ({
          name: p.name,
          startTime: p.startTime,
          endTime: p.endTime,
        })),
        replaceExisting: this.replaceExisting,
        timetableVersion: normalizeTimetableVersion(this.timetableVersion()),
      })
      .subscribe({
        next: (data) => {
          this.applyResult(data);
          this.generating.set(false);
          if (data.summary?.totalSlots) {
            this.resultTab.set('teachers');
          }
          if (data.success) {
            this.showToast('success', `Timetable generated — ${data.summary.totalSlots} slots placed.`);
          } else if (data.summary.totalSlots > 0) {
            this.showToast(
              'error',
              `Timetable partially generated (${data.failures.length} assignment issue(s)). See warnings below.`,
            );
          } else {
            this.showToast('error', data.failures[0]?.reason || 'Could not generate timetable.');
          }
        },
        error: (e) => {
          this.generating.set(false);
          this.showToast('error', e.error?.message || 'Failed to generate timetable.');
        },
      });
  }

  private applyResult(data: GenerateTimetableResult) {
    this.result.set(data);
    if (data.teachers.length) {
      if (!data.teachers.some((t) => t.teacherId === this.selectedTeacherId)) {
        this.selectedTeacherId = data.teachers[0].teacherId;
      }
    } else {
      this.selectedTeacherId = '';
    }
    if (data.classes.length) {
      if (!data.classes.some((c) => c.classId === this.selectedClassId)) {
        this.selectedClassId = data.classes[0].classId;
      }
    } else {
      this.selectedClassId = '';
    }
  }

  setTab(tab: ResultTab) {
    this.resultTab.set(tab);
    this.closeSlotContextMenu();
    this.closeSlotMoveHint();
  }

  openEditor(mode: EditorMode) {
    if (!this.hasResult()) {
      this.showToast('error', 'Generate a timetable before opening the editor.');
      return;
    }
    this.editorWindow.set(mode);
    this.editorPdfMode.set(mode);
    this.resultTab.set(mode);
    document.body.style.overflow = 'hidden';
  }

  closeEditor() {
    this.editorWindow.set(null);
    document.body.style.overflow = '';
    this.closeSlotContextMenu();
    this.closeSlotMoveHint();
  }

  dayLabel(day: number): string {
    return DAYS.find((d) => d.value === day)?.label || `Day ${day}`;
  }

  dayShort(day: number): string {
    return DAYS.find((d) => d.value === day)?.short || `${day}`;
  }

  classDisplayName(name: string): string {
    return classHeaderLabel({ name });
  }

  lessonLengthLabel(length: string): string {
    if (length === 'double') return 'Double';
    if (length === 'triple') return 'Triple';
    return 'Single';
  }

  slotAt(slots: TimetableSlotView[], day: number, period: TimetablePeriod): TimetableSlotView | undefined {
    return slots.find(
      (s) => s.dayOfWeek === day && s.startTime === period.startTime && s.endTime === period.endTime,
    );
  }

  cellKey(day: number, period: TimetablePeriod): string {
    return `${day}|${period.startTime}|${period.endTime}`;
  }

  teacherRowStyle(teacherId: string): Record<string, string> {
    const style = teacherColorFor(teacherId, this.teacherColorMap());
    return this.colorStyleToCss(style);
  }

  cardStyle(teacherId: string): Record<string, string> {
    const style = teacherColorFor(teacherId, this.teacherColorMap());
    return this.colorStyleToCss(style);
  }

  private colorStyleToCss(style: TeacherColorStyle): Record<string, string> {
    const css: Record<string, string> = {
      background: style.background,
      color: style.color,
    };
    if (style.border) css['border-color'] = style.border;
    return css;
  }

  cardHasBorder(teacherId: string): boolean {
    return !!teacherColorFor(teacherId, this.teacherColorMap()).border;
  }

  findSlotById(slotId: string): TimetableSlotView | undefined {
    for (const teacher of this.teachers()) {
      const hit = teacher.slots.find((s) => s.id === slotId);
      if (hit) return hit;
    }
    for (const cls of this.classes()) {
      const hit = cls.slots.find((s) => s.id === slotId);
      if (hit) return hit;
    }
    return undefined;
  }

  onCardDragStart(slot: TimetableSlotView, event: DragEvent) {
    this.closeSlotMoveHint();
    if (slot.isLocked) {
      event.preventDefault();
      this.showSlotMoveHint(
        'This lesson is locked and cannot be moved.',
        (event.target as HTMLElement)?.closest('.lesson-card') as HTMLElement | null,
        event,
      );
      return;
    }
    event.dataTransfer?.setData('text/plain', slot.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    this.draggingSlotId.set(slot.id);
  }

  onCardContextMenu(slot: TimetableSlotView, event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.slotContextMenu.set({ x: event.clientX, y: event.clientY, slot });
  }

  closeSlotContextMenu() {
    this.slotContextMenu.set(null);
  }

  setSlotLocked(slot: TimetableSlotView, locked: boolean) {
    if (this.slotLockUpdating()) return;
    this.closeSlotContextMenu();
    this.slotLockUpdating.set(true);
    this.api.patch(`/timetable/slots/${slot.id}/lock`, { locked }).subscribe({
      next: () => {
        this.slotLockUpdating.set(false);
        this.loadSnapshot();
      },
      error: (e) => {
        this.slotLockUpdating.set(false);
        this.showToast('error', e.error?.message || 'Could not update lesson lock.');
      },
    });
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (target.closest('.slot-context-menu')) return;
    this.closeSlotContextMenu();
  }

  @HostListener('document:keydown.escape')
  onEscapeKey() {
    if (this.slotMoveHint()) {
      this.closeSlotMoveHint();
      return;
    }
    if (this.slotContextMenu()) {
      this.closeSlotContextMenu();
      return;
    }
    if (this.editorWindow()) {
      this.closeEditor();
      return;
    }
    if (this.pdfPreviewOpen()) {
      this.closePdfPreview();
      return;
    }
  }

  onCardDragEnd() {
    this.draggingSlotId.set(null);
    this.dragOverKey.set(null);
  }

  onCellDragOver(day: number, period: TimetablePeriod, event: DragEvent) {
    if (isBreakPeriod(period)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    this.dragOverKey.set(this.cellKey(day, period));
  }

  onCellDragLeave(day: number, period: TimetablePeriod) {
    if (this.dragOverKey() === this.cellKey(day, period)) {
      this.dragOverKey.set(null);
    }
  }

  onCellDrop(
    ownerId: string,
    day: number,
    period: TimetablePeriod,
    mode: 'teacher' | 'class',
    slots: TimetableSlotView[],
    event: DragEvent,
  ) {
    event.preventDefault();
    this.dragOverKey.set(null);
    const dropCell = event.currentTarget as HTMLElement | null;
    if (isBreakPeriod(period) || this.slotMoving()) return;

    const slotId = event.dataTransfer?.getData('text/plain') || this.draggingSlotId();
    if (!slotId) return;

    const slot = this.findSlotById(slotId);
    if (!slot) return;

    if (slot.isLocked) {
      this.showSlotMoveHint(
        'This lesson is locked and cannot be moved.',
        this.moveHintAnchor(dropCell),
        event,
      );
      return;
    }

    if (mode === 'teacher' && slot.teacherId !== ownerId) {
      this.showSlotMoveHint(
        'Drag lessons along the same teacher row only.',
        this.moveHintAnchor(dropCell),
        event,
      );
      return;
    }
    if (mode === 'class' && slot.classId !== ownerId) {
      this.showSlotMoveHint(
        'Drag lessons along the same class row only.',
        this.moveHintAnchor(dropCell),
        event,
      );
      return;
    }

    const occupied = this.slotAt(slots, day, period);
    if (occupied && occupied.id !== slotId) {
      this.showSlotMoveHint(
        'That period already has a lesson.',
        dropCell,
        event,
      );
      return;
    }

    if (
      slot.dayOfWeek === day &&
      slot.startTime === period.startTime &&
      slot.endTime === period.endTime
    ) {
      return;
    }

    this.closeSlotMoveHint();
    this.slotMoving.set(true);
    this.api
      .patch(`/timetable/slots/${slotId}/move`, {
        dayOfWeek: day,
        startTime: period.startTime,
        endTime: period.endTime,
      })
      .subscribe({
        next: () => {
          this.slotMoving.set(false);
          this.draggingSlotId.set(null);
          this.loadSnapshot();
        },
        error: (e) => {
          this.slotMoving.set(false);
          this.showSlotMoveHint(
            e.error?.message || 'Could not move lesson.',
            this.moveHintAnchor(dropCell),
            event,
          );
        },
      });
  }

  slotsForDay(slots: TimetableSlotView[], day: number): TimetableSlotView[] {
    return slots
      .filter((s) => s.dayOfWeek === day)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }

  assignmentStatus(scheduled: number, required: number): 'ok' | 'partial' | 'missing' {
    if (scheduled >= required) return 'ok';
    if (scheduled > 0) return 'partial';
    return 'missing';
  }

  requiredPeriodsFor(row: TeacherSummaryRow): number {
    return row.assignments.reduce((s, a) => s + a.requiredPeriods, 0);
  }

  periodIndexLabel(index: number): string | number {
    const period = this.periods()[index];
    if (isBreakPeriod(period)) return breakPeriodHeaderTitle(period);
    const value = lessonPeriodNumber(this.periods(), index);
    if (value === null) return breakPeriodHeaderTitle(period);
    return value;
  }

  gridRowLabelHeader(mode: 'teachers' | 'classes'): string {
    return mode === 'teachers' ? 'TR' : 'Class';
  }

  gridRowCount(mode: 'teachers' | 'classes'): number {
    return mode === 'teachers' ? this.summaryGridTeachers().length : this.classes().length;
  }

  summaryCell(teacher: { slots: TimetableSlotView[] }, day: number, period: TimetablePeriod): string {
    if (isBreakPeriod(period)) return '';
    const matches = teacher.slots.filter(
      (s) => s.dayOfWeek === day && s.startTime === period.startTime && s.endTime === period.endTime,
    );
    if (!matches.length) return '';
    return [...new Set(matches.map((s) => shortClassCode(s.className)).filter(Boolean))].join('/');
  }

  previewSummaryPdf() {
    this.exportSummaryPdf(true);
  }

  downloadSummaryPdf() {
    this.exportSummaryPdf(false);
  }

  previewTeacherPdf() {
    this.exportTeacherPdf(true);
  }

  downloadTeacherPdf() {
    this.exportTeacherPdf(false);
  }

  previewClassPdf() {
    this.exportClassPdf(true);
  }

  downloadClassPdf() {
    this.exportClassPdf(false);
  }

  previewEditorPdf() {
    if (!this.editorWindow()) return;
    if (this.editorPdfMode() === 'teachers') {
      this.exportAllTeachersPdf(true);
      return;
    }
    this.exportAllClassesPdf(true);
  }

  private exportAllTeachersPdf(preview: boolean) {
    if (!this.hasResult()) {
      this.showToast('error', 'Generate a timetable before exporting the PDF.');
      return;
    }
    this.editorPdfLoading.set(true);
    const params: Record<string, string> = {
      periods: this.periodsPayload(),
    };
    if (preview) params['preview'] = 'true';
    this.exportGridPdf('/timetable/generate/teachers/all/pdf', params, preview, 'all-teacher-timetables.pdf', () =>
      this.editorPdfLoading.set(false),
    preview ? `All teacher timetables · ${this.termVersionLabel()}` : 'All teacher timetables',
    );
  }

  private exportAllClassesPdf(preview: boolean) {
    if (!this.hasResult()) {
      this.showToast('error', 'Generate a timetable before exporting the PDF.');
      return;
    }
    this.editorPdfLoading.set(true);
    const params: Record<string, string> = {
      periods: this.periodsPayload(),
    };
    if (preview) params['preview'] = 'true';
    this.exportGridPdf('/timetable/generate/classes/all/pdf', params, preview, 'all-class-timetables.pdf', () =>
      this.editorPdfLoading.set(false),
    preview ? `All class timetables · ${this.termVersionLabel()}` : 'All class timetables',
    );
  }

  private periodsPayload(): string {
    return JSON.stringify(
      this.periods().map((p) => ({
        name: p.name,
        startTime: p.startTime,
        endTime: p.endTime,
        slotType: p.slotType,
      })),
    );
  }

  private exportTeacherPdf(preview: boolean) {
    if (!this.selectedTeacherId) {
      this.showToast('error', 'Select a teacher first.');
      return;
    }
    this.teacherPdfLoading.set(true);
    const params: Record<string, string> = {
      teacherId: this.selectedTeacherId,
      periods: this.periodsPayload(),
    };
    if (preview) params['preview'] = 'true';
    this.exportGridPdf('/timetable/generate/teacher/pdf', params, preview, `timetable-teacher.pdf`, () =>
      this.teacherPdfLoading.set(false),
    preview ? this.teacherPdfPreviewTitle() : 'Teacher timetable',
    );
  }

  private exportClassPdf(preview: boolean) {
    if (!this.selectedClassId) {
      this.showToast('error', 'Select a class first.');
      return;
    }
    this.classPdfLoading.set(true);
    const params: Record<string, string> = {
      classId: this.selectedClassId,
      periods: this.periodsPayload(),
    };
    if (preview) params['preview'] = 'true';
    this.exportGridPdf('/timetable/generate/class/pdf', params, preview, `timetable-class.pdf`, () =>
      this.classPdfLoading.set(false),
    preview ? this.classPdfPreviewTitle() : 'Class timetable',
    );
  }

  private exportGridPdf(
    path: string,
    params: Record<string, string>,
    preview: boolean,
    downloadName: string,
    onDone: () => void,
    previewTitle = 'Timetable PDF',
  ) {
    this.api.getBlob(path, params).subscribe({
      next: (blob) => {
        onDone();
        if (blob.type && !blob.type.includes('pdf')) {
          this.showToast('error', 'Server did not return a PDF file.');
          return;
        }
        if (preview) {
          this.openPdfPreview(blob, downloadName, previewTitle);
          return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = downloadName;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: (e) => {
        onDone();
        this.showToast('error', e.error?.message || 'Failed to generate PDF.');
      },
    });
  }

  downloadPdfPreview() {
    if (!this.pdfObjectUrl) return;
    const a = document.createElement('a');
    a.href = this.pdfObjectUrl;
    a.download = this.pdfDownloadName();
    a.click();
  }

  closePdfPreview() {
    this.pdfPreviewOpen.set(false);
    this.revokePdfObjectUrl();
    document.body.style.overflow = '';
  }

  private openPdfPreview(blob: Blob, downloadName: string, title: string) {
    this.revokePdfObjectUrl();
    this.pdfObjectUrl = URL.createObjectURL(blob);
    this.pdfDownloadName.set(downloadName);
    this.pdfPreviewTitle.set(title);
    this.pdfPreviewUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(this.pdfObjectUrl));
    this.pdfPreviewOpen.set(true);
    document.body.style.overflow = 'hidden';
  }

  private revokePdfObjectUrl() {
    if (this.pdfObjectUrl) {
      URL.revokeObjectURL(this.pdfObjectUrl);
      this.pdfObjectUrl = null;
    }
    this.pdfPreviewUrl.set(null);
  }

  private teacherPdfPreviewTitle(): string {
    const teacher = this.teachers().find((t) => t.teacherId === this.selectedTeacherId);
    return teacher ? `Teacher: ${teacher.teacherName}` : 'Teacher timetable';
  }

  private classPdfPreviewTitle(): string {
    const cls = this.classes().find((c) => c.classId === this.selectedClassId);
    return cls ? `Class: ${this.classDisplayName(cls.className)}` : 'Class timetable';
  }

  private exportSummaryPdf(preview: boolean) {
    if (!this.hasResult()) {
      this.showToast('error', 'Generate a timetable before exporting the summary PDF.');
      return;
    }
    this.summaryPdfLoading.set(true);
    const params: Record<string, string> = {
      periods: this.periodsPayload(),
    };
    if (preview) params['preview'] = 'true';

    this.exportGridPdf('/timetable/generate/summary/pdf', params, preview, 'teacher-summary-timetable.pdf', () =>
      this.summaryPdfLoading.set(false),
    preview ? `Summary timetable · ${this.termVersionLabel()}` : 'Summary timetable',
    );
  }

  private moveHintAnchor(dropCell: HTMLElement | null): HTMLElement | null {
    return (document.querySelector('.lesson-card.dragging') as HTMLElement | null) ?? dropCell;
  }

  private showSlotMoveHint(
    msg: string,
    anchor?: HTMLElement | null,
    event?: MouseEvent | DragEvent,
  ) {
    if (this.slotMoveHintTimer) {
      clearTimeout(this.slotMoveHintTimer);
      this.slotMoveHintTimer = null;
    }

    let x = event?.clientX ?? window.innerWidth / 2;
    let y = event?.clientY ?? window.innerHeight / 2;
    let above = false;

    if (anchor) {
      const rect = anchor.getBoundingClientRect();
      x = rect.left + rect.width / 2;
      y = rect.bottom + 6;
      const maxY = window.innerHeight - 12;
      if (y > maxY) {
        y = rect.top - 6;
        above = true;
      }
    }

    this.slotMoveHint.set({ x, y, msg, above });
    this.slotMoveHintTimer = setTimeout(() => this.closeSlotMoveHint(), 5000);
  }

  closeSlotMoveHint() {
    if (this.slotMoveHintTimer) {
      clearTimeout(this.slotMoveHintTimer);
      this.slotMoveHintTimer = null;
    }
    this.slotMoveHint.set(null);
  }

  private showToast(type: 'success' | 'error', msg: string) {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 5000);
  }
}
