import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { resolvePortalLayout } from '../../core/utils/portal-layout.util';
import { TimetablePeriod, TimetablePeriodsService } from '../../core/services/timetable-periods.service';
import { TeacherAllocationRow, TeacherWeeklySchedule, TIMETABLE_DAYS } from '../../core/services/teacher-allocation.service';
import {
  breakColumnVerticalLabel,
  breakPeriodLabel,
  compactClassGridLabel,
  dayGridLabel,
  formatPeriodRange,
  isBreakPeriod,
  lessonPeriodNumber,
  timetableSubjectShort,
} from '../../core/utils/timetable-grid-display';
import {
  buildTimetablePdfBlob,
  TimetablePdfCell,
  TimetablePdfColumn,
  TimetablePdfOptions,
  TimetablePdfRow,
} from '../../core/utils/timetable-pdf.util';

/**
 * /teacher/timetable — opened from the calendar icon in the top bar.
 * Generates and displays the logged-in teacher's weekly timetable and lets them
 * preview (maximised by default) or download it as a PDF.
 */
@Component({
  selector: 'app-teacher-timetable',
  standalone: true,
  imports: [PortalLayoutComponent],
  templateUrl: './teacher-timetable.component.html',
  styleUrl: './teacher-timetable.component.scss',
})
export class TeacherTimetableComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private router = inject(Router);
  private sanitizer = inject(DomSanitizer);
  private periodsSvc = inject(TimetablePeriodsService);
  private pdfObjectUrl: string | null = null;

  readonly portalLayout = resolvePortalLayout(this.router, { permissions: this.auth.user()?.permissions });
  readonly days = TIMETABLE_DAYS;
  readonly dayGridLabel = dayGridLabel;
  readonly formatPeriodRange = formatPeriodRange;
  readonly isBreakPeriod = isBreakPeriod;
  readonly breakPeriodLabel = breakPeriodLabel;
  readonly breakColumnVerticalLabel = breakColumnVerticalLabel;
  readonly lessonPeriodNumber = lessonPeriodNumber;

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly schedule = signal<TeacherWeeklySchedule | null>(null);
  readonly basePeriods = signal<TimetablePeriod[]>([]);
  readonly schoolName = signal('School Pro Academy');
  readonly termVersionLabel = signal('');

  readonly pdfLoading = signal(false);
  readonly pdfPreviewOpen = signal(false);
  readonly pdfPreviewUrl = signal<SafeResourceUrl | null>(null);
  readonly toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  readonly allocations = computed(() => this.schedule()?.allocations ?? []);

  readonly teacherName = computed(() => {
    const u = this.schedule()?.teacher?.user;
    if (u) return `${u.firstName} ${u.lastName}`.trim();
    const me = this.auth.user();
    return me ? `${me.firstName} ${me.lastName}`.trim() : '';
  });

  /**
   * Configured periods, plus any lesson time found in the teacher's allocations that the
   * configured periods don't contain, so no lesson is ever dropped from the grid.
   */
  readonly periods = computed<TimetablePeriod[]>(() => {
    const base = [...this.basePeriods()];
    const known = new Set(base.map((p) => `${p.startTime}|${p.endTime}`));
    const extra: TimetablePeriod[] = [];
    for (const a of this.allocations()) {
      const key = `${a.startTime}|${a.endTime}`;
      if (!known.has(key)) {
        known.add(key);
        extra.push({ id: `x-${key}`, name: 'Lesson', startTime: a.startTime, endTime: a.endTime, slotType: 'lesson' });
      }
    }
    return [...base, ...extra].sort((a, b) => a.startTime.localeCompare(b.startTime));
  });

  readonly stats = computed(() => {
    const rows = this.allocations();
    const s = this.schedule()?.summary;
    return {
      lessons: s?.slotCount ?? rows.length,
      classes: s?.classCount ?? new Set(rows.map((r) => r.classId)).size,
      subjects: s?.subjectCount ?? new Set(rows.map((r) => r.subjectId)).size,
      days: new Set(rows.map((r) => r.dayOfWeek)).size,
    };
  });

  readonly hasLessons = computed(() => this.allocations().length > 0);

  ngOnInit() {
    this.basePeriods.set(this.periodsSvc.load());
    this.api.get<{ schoolName: string | null }>('/dashboard/school-links').subscribe({
      next: (d) => d?.schoolName && this.schoolName.set(d.schoolName),
      error: () => {},
    });
    this.api.get<{ termVersionLabel?: string }>('/timetable/context').subscribe({
      next: (c) => this.termVersionLabel.set(c?.termVersionLabel || ''),
      error: () => {},
    });
    void this.load();
  }

  ngOnDestroy() {
    this.revokePdfUrl();
  }

  /** Generates the timetable for the logged-in teacher. */
  async load() {
    this.loading.set(true);
    this.error.set(null);
    try {
      let staffId = this.auth.user()?.staffId || '';
      if (!staffId) {
        const dash = await firstValueFrom(this.api.get<{ staffId: string | null }>('/dashboard/teacher'));
        staffId = dash?.staffId || '';
      }
      if (!staffId) {
        this.error.set('Your account is not linked to a staff profile, so no timetable can be generated.');
        return;
      }
      const data = await firstValueFrom(
        this.api.get<TeacherWeeklySchedule>(`/timetable/teacher-allocation/schedule/${staffId}`),
      );
      this.schedule.set(data);
    } catch (err) {
      const e = err as { error?: { message?: string } };
      this.schedule.set(null);
      this.error.set(e?.error?.message || 'Could not load your timetable. Please try again.');
    } finally {
      this.loading.set(false);
    }
  }

  allocationAt(day: number, period: TimetablePeriod): TeacherAllocationRow | undefined {
    const dayEnum = TIMETABLE_DAYS.find((d) => d.value === day)?.enum;
    if (!dayEnum) return undefined;
    return this.allocations().find(
      (a) => a.dayOfWeek === dayEnum && a.startTime === period.startTime && a.endTime === period.endTime,
    );
  }

  subjectShort(a: TeacherAllocationRow): string {
    return timetableSubjectShort(a.subject?.code, a.subject?.name || 'Subject', a.subject?.short);
  }

  classShort(a: TeacherAllocationRow): string {
    return compactClassGridLabel(a.schoolClass?.name || '');
  }

  // ── PDF ────────────────────────────────────────────────────────────────────

  private pdfOptions(): TimetablePdfOptions {
    const periods = this.periods();
    const columns: TimetablePdfColumn[] = periods.map((p, i) => {
      const brk = isBreakPeriod(p);
      return {
        header: brk ? breakPeriodLabel(p) : String(lessonPeriodNumber(periods, i) ?? ''),
        time: formatPeriodRange(p),
        isBreak: brk,
      };
    });
    const rows: TimetablePdfRow[] = TIMETABLE_DAYS.map((d) => ({
      label: dayGridLabel(d.value),
      cells: periods.map((p): TimetablePdfCell => {
        if (isBreakPeriod(p)) return { isBreak: true, breakLabel: breakColumnVerticalLabel(p) };
        const a = this.allocationAt(d.value, p);
        if (!a) return {};
        return {
          topLeft: this.subjectShort(a),
          main: this.classShort(a),
          bottomCenter: a.timetableEntry?.room || undefined,
        };
      }),
    }));
    return {
      title: this.schoolName(),
      subtitle: this.termVersionLabel(),
      heading: `Teacher: ${this.teacherName()}`,
      columns,
      rows,
      fileName: this.pdfFileName(),
    };
  }

  pdfFileName(): string {
    const slug = this.teacherName()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return `${slug || 'my'}-teacher-timetable.pdf`;
  }

  /** Opens the PDF preview. The overlay is maximised (full screen) by default. */
  async previewPdf() {
    if (!this.hasLessons()) return;
    this.pdfLoading.set(true);
    try {
      const blob = await buildTimetablePdfBlob(this.pdfOptions());
      this.revokePdfUrl();
      this.pdfObjectUrl = URL.createObjectURL(blob);
      this.pdfPreviewUrl.set(
        this.sanitizer.bypassSecurityTrustResourceUrl(`${this.pdfObjectUrl}#toolbar=1&navpanes=0&view=FitH`),
      );
      this.pdfPreviewOpen.set(true);
    } catch {
      this.showToast('error', 'Could not generate the PDF. Please try again.');
    } finally {
      this.pdfLoading.set(false);
    }
  }

  openPreviewInNewTab() {
    if (!this.pdfObjectUrl) return;
    const w = window.open(this.pdfObjectUrl, '_blank', 'noopener,noreferrer');
    if (!w) this.showToast('error', 'Pop-up blocked. Allow pop-ups to open the PDF in a new tab.');
  }

  async downloadPdf() {
    if (!this.hasLessons()) return;
    this.pdfLoading.set(true);
    try {
      const blob = await buildTimetablePdfBlob(this.pdfOptions());
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = this.pdfFileName();
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      this.showToast('success', 'Timetable PDF downloaded.');
    } catch {
      this.showToast('error', 'Could not generate the PDF. Please try again.');
    } finally {
      this.pdfLoading.set(false);
    }
  }

  closePdfPreview() {
    this.pdfPreviewOpen.set(false);
    this.revokePdfUrl();
  }

  private revokePdfUrl() {
    if (this.pdfObjectUrl) {
      URL.revokeObjectURL(this.pdfObjectUrl);
      this.pdfObjectUrl = null;
    }
    this.pdfPreviewUrl.set(null);
  }

  private showToast(type: 'success' | 'error', msg: string) {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 4500);
  }
}
