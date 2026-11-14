import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { firstValueFrom } from 'rxjs';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ApiService } from '../../core/services/api.service';
import { TimetableDisplaySettingsService } from '../../core/services/timetable-display-settings.service';
import { PARENT_NAV_ITEMS } from '../../core/config/parent-nav';
import { TimetablePeriod, TimetablePeriodsService } from '../../core/services/timetable-periods.service';
import { classHeaderLabel } from '../../core/utils/class-display';
import { formatTeacherTimetableName } from '../../core/utils/teacher-display';
import { buildTimetableTermVersionLabel } from '../../core/utils/timetable-term-label';
import {
  breakColumnVerticalLabel,
  breakPeriodLabel,
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

interface LinkedChild {
  linkId?: string;
  relationship?: string;
  student: {
    id: string;
    admissionNumber?: string;
    firstName: string;
    lastName: string;
    classId?: string | null;
    schoolClass?: { id?: string; name?: string; form?: { name?: string } } | null;
  };
}

interface TimetableEntry {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room?: string | null;
  subject?: { name: string; code?: string; short?: string | null };
  teacher?: {
    title?: string | null;
    user?: { title?: string | null; firstName: string; lastName: string };
  };
}

interface ChildTimetable {
  studentId: string;
  studentName: string;
  admissionNumber: string;
  classId: string;
  classLabel: string;
  entries: TimetableEntry[];
  error?: string;
}

const DAYS = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
];

/**
 * /parent/timetable — opened from the calendar icon in the top bar.
 * Fetches the class timetable of every linked child, shows it on screen and lets the
 * parent preview it (maximised) or download it as a PDF.
 */
@Component({
  selector: 'app-parent-timetable',
  standalone: true,
  imports: [PortalLayoutComponent],
  templateUrl: './parent-timetable.component.html',
  styleUrl: './parent-timetable.component.scss',
})
export class ParentTimetableComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private sanitizer = inject(DomSanitizer);
  private periodsSvc = inject(TimetablePeriodsService);
  readonly display = inject(TimetableDisplaySettingsService);
  private pdfObjectUrl: string | null = null;

  readonly nav = PARENT_NAV_ITEMS;
  readonly days = DAYS;
  readonly dayGridLabel = dayGridLabel;
  readonly formatPeriodRange = formatPeriodRange;
  readonly isBreakPeriod = isBreakPeriod;
  readonly breakPeriodLabel = breakPeriodLabel;
  readonly breakColumnVerticalLabel = breakColumnVerticalLabel;
  readonly lessonPeriodNumber = lessonPeriodNumber;

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly timetables = signal<ChildTimetable[]>([]);
  readonly basePeriods = signal<TimetablePeriod[]>([]);
  readonly schoolName = signal('School Pro Academy');
  readonly termVersionLabel = signal(buildTimetableTermVersionLabel());

  readonly pdfLoading = signal<string | null>(null);
  readonly pdfPreviewOpen = signal(false);
  readonly pdfPreviewUrl = signal<SafeResourceUrl | null>(null);
  readonly previewChild = signal<ChildTimetable | null>(null);
  readonly toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  /** Configured periods plus any lesson time found in the entries, so no lesson is dropped. */
  readonly periodsByChild = computed(() => {
    const map: Record<string, TimetablePeriod[]> = {};
    for (const t of this.timetables()) {
      const base = [...this.basePeriods()];
      const known = new Set(base.map((p) => `${p.startTime}|${p.endTime}`));
      for (const e of t.entries) {
        const key = `${e.startTime}|${e.endTime}`;
        if (!known.has(key)) {
          known.add(key);
          base.push({ id: `x-${key}`, name: 'Lesson', startTime: e.startTime, endTime: e.endTime, slotType: 'lesson' } as TimetablePeriod);
        }
      }
      map[t.studentId] = base.sort((a, b) => a.startTime.localeCompare(b.startTime));
    }
    return map;
  });

  ngOnInit() {
    this.basePeriods.set(this.periodsSvc.load());
    this.api.get<{ schoolName: string | null }>('/dashboard/school-links').subscribe({
      next: (d) => d?.schoolName && this.schoolName.set(d.schoolName),
      error: () => {},
    });
    this.api.get<{ termVersionLabel?: string }>('/timetable/context').subscribe({
      next: (c) => c?.termVersionLabel && this.termVersionLabel.set(c.termVersionLabel),
      error: () => {},
    });
    void this.load();
  }

  ngOnDestroy() {
    this.revokePdfUrl();
  }

  periodsFor(t: ChildTimetable): TimetablePeriod[] {
    return this.periodsByChild()[t.studentId] ?? this.basePeriods();
  }

  hasLessons(t: ChildTimetable): boolean {
    return t.entries.length > 0;
  }

  /** Fetches the class timetable of every linked child. */
  async load() {
    this.loading.set(true);
    this.error.set(null);
    try {
      const children = await firstValueFrom(this.api.get<LinkedChild[]>('/students/parent/my-children'));
      const rows: ChildTimetable[] = [];
      for (const link of children || []) {
        const s = link.student;
        let classId = s.classId || s.schoolClass?.id || '';
        let className = s.schoolClass?.name || '';
        if (!classId) {
          try {
            const full = await firstValueFrom(this.api.get<LinkedChild['student']>(`/students/${s.id}`));
            classId = full?.classId || full?.schoolClass?.id || '';
            className = full?.schoolClass?.name || className;
          } catch {
            /* handled below */
          }
        }
        const row: ChildTimetable = {
          studentId: s.id,
          studentName: `${s.firstName} ${s.lastName}`.trim(),
          admissionNumber: s.admissionNumber || '',
          classId,
          classLabel: className ? classHeaderLabel({ name: className }) : '',
          entries: [],
        };
        if (!classId) {
          row.error = 'This child is not assigned to a class yet, so there is no class timetable.';
        } else {
          try {
            row.entries = await firstValueFrom(this.api.get<TimetableEntry[]>('/academics/timetable', { classId }));
          } catch {
            row.error = 'Could not load the timetable for this class. Please try again.';
          }
        }
        rows.push(row);
      }
      this.timetables.set(rows);
      if (!rows.length) this.error.set('No children are linked to your account yet. Link a child from the dashboard.');
    } catch (err) {
      const e = err as { error?: { message?: string } };
      this.timetables.set([]);
      this.error.set(e?.error?.message || 'Could not load the timetables. Please try again.');
    } finally {
      this.loading.set(false);
    }
  }

  entryAt(t: ChildTimetable, day: number, period: TimetablePeriod): TimetableEntry | undefined {
    return t.entries.find((e) => e.dayOfWeek === day && e.startTime === period.startTime && e.endTime === period.endTime);
  }

  subjectShort(e: TimetableEntry): string {
    return timetableSubjectShort(e.subject?.code, e.subject?.name || 'Subject', e.subject?.short);
  }

  teacherName(e: TimetableEntry): string {
    const t = e.teacher;
    const u = t?.user;
    if (!u) return '';
    // Title + surname + first initial, e.g. "Mr Zhou T"
    return formatTeacherTimetableName({
      title: t?.title ?? u.title,
      firstName: u.firstName,
      lastName: u.lastName,
    });
  }

  // ── PDF ────────────────────────────────────────────────────────────────────

  private pdfOptions(t: ChildTimetable): TimetablePdfOptions {
    const periods = this.periodsFor(t);
    const columns: TimetablePdfColumn[] = periods.map((p, i) => {
      const brk = isBreakPeriod(p);
      return {
        header: brk ? breakPeriodLabel(p) : String(lessonPeriodNumber(periods, i) ?? ''),
        time: formatPeriodRange(p),
        isBreak: brk,
      };
    });
    const rows: TimetablePdfRow[] = DAYS.map((d) => ({
      label: dayGridLabel(d.value),
      cells: periods.map((p): TimetablePdfCell => {
        if (isBreakPeriod(p)) return { isBreak: true, breakLabel: breakColumnVerticalLabel(p) };
        const e = this.entryAt(t, d.value, p);
        if (!e) return {};
        return {
          topRight: e.room || undefined,
          main: this.subjectShort(e),
          bottomRight: this.teacherName(e) || undefined,
        };
      }),
    }));
    return {
      title: this.schoolName(),
      subtitle: this.termVersionLabel(),
      heading: t.classLabel ? `${t.classLabel} — ${t.studentName}` : t.studentName,
      columns,
      rows,
      fileName: this.pdfFileName(t),
      fontScale: { bottomRight: this.display.teacherFactor() },
    };
  }

  pdfFileName(t: ChildTimetable): string {
    const slug = `${t.studentName} ${t.classLabel}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return `${slug || 'class'}-class-timetable.pdf`;
  }

  /** Opens the PDF preview, maximised by default. */
  async previewPdf(t: ChildTimetable) {
    if (!this.hasLessons(t)) return;
    this.pdfLoading.set(t.studentId);
    try {
      const blob = await buildTimetablePdfBlob(this.pdfOptions(t));
      this.revokePdfUrl();
      this.pdfObjectUrl = URL.createObjectURL(blob);
      this.pdfPreviewUrl.set(
        this.sanitizer.bypassSecurityTrustResourceUrl(`${this.pdfObjectUrl}#toolbar=1&navpanes=0&view=FitH`),
      );
      this.previewChild.set(t);
      this.pdfPreviewOpen.set(true);
    } catch {
      this.showToast('error', 'Could not generate the PDF. Please try again.');
    } finally {
      this.pdfLoading.set(null);
    }
  }

  openPreviewInNewTab() {
    if (!this.pdfObjectUrl) return;
    const w = window.open(this.pdfObjectUrl, '_blank', 'noopener,noreferrer');
    if (!w) this.showToast('error', 'Pop-up blocked. Allow pop-ups to open the PDF in a new tab.');
  }

  async downloadPdf(t: ChildTimetable | null) {
    if (!t || !this.hasLessons(t)) return;
    this.pdfLoading.set(t.studentId);
    try {
      const blob = await buildTimetablePdfBlob(this.pdfOptions(t));
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = this.pdfFileName(t);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      this.showToast('success', 'Timetable PDF downloaded.');
    } catch {
      this.showToast('error', 'Could not generate the PDF. Please try again.');
    } finally {
      this.pdfLoading.set(null);
    }
  }

  closePdfPreview() {
    this.pdfPreviewOpen.set(false);
    this.previewChild.set(null);
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
