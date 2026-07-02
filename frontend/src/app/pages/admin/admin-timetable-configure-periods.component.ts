import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import {
  TIMETABLE_MAX_BREAKS,
  TIMETABLE_MAX_LESSONS_PER_DAY,
  TIMETABLE_MIN_BREAKS,
  TIMETABLE_MIN_LESSONS_PER_DAY,
  TimetablePeriod,
  TimetablePeriodsService,
  TimetableTemplateSettings,
} from '../../core/services/timetable-periods.service';

type ViewMode = 'table' | 'cards' | 'timeline';
type ScheduleFilter = 'all' | 'lesson' | 'break';
type AddPanel = 'lesson' | 'break' | null;

@Component({
  selector: 'app-admin-timetable-configure-periods',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule],
  templateUrl: './admin-timetable-configure-periods.component.html',
  styleUrl: './admin-timetable-configure-periods.component.scss',
})
export class AdminTimetableConfigurePeriodsComponent implements OnInit {
  private periodsSvc = inject(TimetablePeriodsService);
  readonly adminNav = ADMIN_NAV_SECTIONS;
  readonly breakCountOptions = Array.from(
    { length: TIMETABLE_MAX_BREAKS - TIMETABLE_MIN_BREAKS + 1 },
    (_, i) => TIMETABLE_MIN_BREAKS + i,
  );

  readonly minBreaks = TIMETABLE_MIN_BREAKS;
  readonly maxBreaks = TIMETABLE_MAX_BREAKS;
  readonly minLessonsPerDay = TIMETABLE_MIN_LESSONS_PER_DAY;
  readonly maxLessonsPerDay = TIMETABLE_MAX_LESSONS_PER_DAY;

  periods = signal<TimetablePeriod[]>([]);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);
  saving = signal(false);
  generatingTemplate = signal(false);
  viewMode = signal<ViewMode>('table');
  scheduleFilter = signal<ScheduleFilter>('all');
  addPanel = signal<AddPanel>(null);
  editingId = signal<string | null>(null);
  scheduleSearch = signal('');

  templateSettings: TimetableTemplateSettings = {
    periodsPerDay: 6,
    dayStart: '08:00',
    lessonMinutes: 40,
    breakCount: TIMETABLE_MIN_BREAKS,
    breakMinutes: [15, 15],
  };

  lessonDraft = { name: '', startTime: '08:00', endTime: '08:40' };
  breakDraft = { name: '', startTime: '09:20', endTime: '09:35' };
  editDraft = { name: '', startTime: '', endTime: '' };

  breakCount = computed(() => this.periodsSvc.countBreaks(this.periods()));
  lessonCount = computed(() => this.periods().filter((p) => p.slotType === 'lesson').length);
  canAddBreak = computed(() => this.breakCount() < TIMETABLE_MAX_BREAKS);
  canRemoveBreak = computed(() => this.breakCount() > TIMETABLE_MIN_BREAKS);
  breaksValid = computed(() => {
    const n = this.breakCount();
    return n >= TIMETABLE_MIN_BREAKS && n <= TIMETABLE_MAX_BREAKS;
  });

  dayStats = computed(() => {
    const list = this.periods();
    if (!list.length) {
      return { start: '—', end: '—', totalMin: 0, lessonMin: 0, breakMin: 0, spanLabel: '—' };
    }
    const starts = list.map((p) => this.timeToMinutes(p.startTime));
    const ends = list.map((p) => this.timeToMinutes(p.endTime));
    const startMin = Math.min(...starts);
    const endMin = Math.max(...ends);
    let lessonMin = 0;
    let breakMin = 0;
    for (const p of list) {
      const dur = this.timeToMinutes(p.endTime) - this.timeToMinutes(p.startTime);
      if (p.slotType === 'break') breakMin += dur;
      else lessonMin += dur;
    }
    return {
      start: this.minutesToTime(startMin),
      end: this.minutesToTime(endMin),
      totalMin: endMin - startMin,
      lessonMin,
      breakMin,
      spanLabel: this.formatDuration(endMin - startMin),
    };
  });

  filteredPeriods = computed(() => {
    const q = this.scheduleSearch().trim().toLowerCase();
    const filter = this.scheduleFilter();
    return this.periods().filter((p) => {
      if (filter === 'lesson' && p.slotType !== 'lesson') return false;
      if (filter === 'break' && p.slotType !== 'break') return false;
      if (!q) return true;
      return `${p.name} ${p.startTime} ${p.endTime} ${p.slotType}`.toLowerCase().includes(q);
    });
  });

  timelineMeta = computed(() => {
    const list = this.periods();
    if (!list.length) return { startMin: 0, endMin: 0, span: 1 };
    const starts = list.map((p) => this.timeToMinutes(p.startTime));
    const ends = list.map((p) => this.timeToMinutes(p.endTime));
    const startMin = Math.min(...starts);
    const endMin = Math.max(...ends);
    return { startMin, endMin, span: Math.max(endMin - startMin, 1) };
  });

  templateDayPreview(): {
    lessonCount: number;
    breakCount: number;
    start: string;
    end: string;
    breakSummary: string;
  } {
    const preview = this.periodsSvc.generateTemplate(this.templateSettings);
    if (!preview.length) {
      return { lessonCount: 0, breakCount: 0, start: '—', end: '—', breakSummary: '—' };
    }
    const breaks = preview.filter((p) => p.slotType === 'break');
    const breakSummary = breaks
      .map((b) => {
        const min = this.timeToMinutes(b.endTime) - this.timeToMinutes(b.startTime);
        return `${b.name} ${min}m`;
      })
      .join(' · ');
    return {
      lessonCount: preview.filter((p) => p.slotType === 'lesson').length,
      breakCount: breaks.length,
      start: preview[0].startTime,
      end: preview[preview.length - 1].endTime,
      breakSummary,
    };
  }

  breakTemplateLabel(index: number): string {
    return this.periodsSvc.breakName(index);
  }

  onTemplateBreakCountChange() {
    this.syncTemplateBreakMinutes();
  }

  syncTemplateBreakMinutes() {
    const count = Math.max(
      this.minBreaks,
      Math.min(this.maxBreaks, Math.round(Number(this.templateSettings.breakCount) || this.minBreaks)),
    );
    this.templateSettings.breakCount = count;
    const current = [...(this.templateSettings.breakMinutes || [])];
    const fallback = current[current.length - 1] ?? 15;
    while (current.length < count) {
      current.push(fallback);
    }
    this.templateSettings.breakMinutes = current.slice(0, count);
  }

  ngOnInit() {
    this.templateSettings = this.periodsSvc.loadTemplateSettings();
    this.syncTemplateBreakMinutes();
    const loaded = this.sortSlots(this.periodsSvc.load());
    this.periods.set(loaded);
    const lessons = loaded.filter((p) => p.slotType === 'lesson');
    const breaks = loaded.filter((p) => p.slotType === 'break');
    if (lessons.length > 0) {
      this.templateSettings = { ...this.templateSettings, periodsPerDay: lessons.length };
    }
    if (breaks.length >= this.minBreaks && breaks.length <= this.maxBreaks) {
      this.templateSettings = {
        ...this.templateSettings,
        breakCount: breaks.length,
        breakMinutes: breaks.map(
          (b) => this.timeToMinutes(b.endTime) - this.timeToMinutes(b.startTime),
        ),
      };
      this.syncTemplateBreakMinutes();
    }
  }

  generateDayTemplate() {
    const count = Math.round(Number(this.templateSettings.periodsPerDay) || 0);
    if (count < this.minLessonsPerDay || count > this.maxLessonsPerDay) {
      this.showToast(
        'error',
        `Enter between ${this.minLessonsPerDay} and ${this.maxLessonsPerDay} periods per day.`,
      );
      return;
    }

    const hasExisting = this.periods().length > 0;
    if (
      hasExisting &&
      !confirm(
        `Generate a new template with ${count} lesson periods? This replaces the current daily schedule (you can still edit times before saving).`,
      )
    ) {
      return;
    }

    this.generatingTemplate.set(true);
    this.syncTemplateBreakMinutes();
    this.periodsSvc.saveTemplateSettings(this.templateSettings);
    const generated = this.sortSlots(this.periodsSvc.generateTemplate(this.templateSettings));
    this.periods.set(generated);
    this.scheduleSearch.set('');
    this.scheduleFilter.set('all');
    this.addPanel.set(null);
    this.cancelEdit();
    this.generatingTemplate.set(false);
    this.showToast(
      'success',
      `Generated template with ${count} lesson periods and ${this.templateSettings.breakCount} breaks. Adjust times below, then save.`,
    );
  }

  addLesson() {
    const name = this.lessonDraft.name.trim();
    if (!name) {
      this.showToast('error', 'Enter a lesson period name.');
      return;
    }
    if (this.lessonDraft.startTime >= this.lessonDraft.endTime) {
      this.showToast('error', 'End time must be after start time.');
      return;
    }
    const next: TimetablePeriod = {
      id: crypto.randomUUID(),
      name,
      startTime: this.lessonDraft.startTime,
      endTime: this.lessonDraft.endTime,
      slotType: 'lesson',
    };
    this.periods.set(this.sortSlots([...this.periods(), next]));
    this.lessonDraft = { name: '', startTime: '08:00', endTime: '08:40' };
    this.addPanel.set(null);
    this.showToast('success', 'Lesson period added.');
  }

  addBreak() {
    if (!this.canAddBreak()) {
      this.showToast('error', `Maximum ${TIMETABLE_MAX_BREAKS} breaks allowed.`);
      return;
    }
    const name = this.breakDraft.name.trim() || `Break ${this.breakCount() + 1}`;
    if (this.breakDraft.startTime >= this.breakDraft.endTime) {
      this.showToast('error', 'Break end time must be after start time.');
      return;
    }
    const next: TimetablePeriod = {
      id: crypto.randomUUID(),
      name,
      startTime: this.breakDraft.startTime,
      endTime: this.breakDraft.endTime,
      slotType: 'break',
    };
    this.periods.set(this.sortSlots([...this.periods(), next]));
    this.breakDraft = { name: '', startTime: '09:20', endTime: '09:35' };
    this.addPanel.set(null);
    this.showToast('success', 'Break added between lessons.');
  }

  removeSlot(id: string) {
    const slot = this.periods().find((p) => p.id === id);
    if (!slot) return;
    if (slot.slotType === 'break' && !this.canRemoveBreak()) {
      this.showToast('error', `At least ${TIMETABLE_MIN_BREAKS} breaks are required between lessons.`);
      return;
    }
    this.periods.set(this.periods().filter((p) => p.id !== id));
    this.showToast('success', slot.slotType === 'break' ? 'Break removed.' : 'Lesson period removed.');
  }

  saveAll() {
    const err = this.periodsSvc.validateBreakCount(this.periods());
    if (err) {
      this.showToast('error', err);
      return;
    }
    this.saving.set(true);
    this.syncTemplateBreakMinutes();
    this.periodsSvc.saveTemplateSettings(this.templateSettings);
    this.periodsSvc.save(this.sortSlots(this.periods()));
    setTimeout(() => {
      this.saving.set(false);
      this.showToast('success', 'Period and break configuration saved.');
    }, 300);
  }

  resetDefaults() {
    this.periods.set(this.sortSlots(this.periodsSvc.resetDefaults()));
    this.templateSettings = this.periodsSvc.loadTemplateSettings();
    this.syncTemplateBreakMinutes();
    this.scheduleSearch.set('');
    this.scheduleFilter.set('all');
    this.showToast('success', 'Restored default lessons and breaks.');
  }

  toggleAddPanel(panel: AddPanel) {
    this.cancelEdit();
    this.addPanel.set(this.addPanel() === panel ? null : panel);
  }

  isEditing(id: string): boolean {
    return this.editingId() === id;
  }

  startEdit(p: TimetablePeriod) {
    this.addPanel.set(null);
    this.editingId.set(p.id);
    this.editDraft = { name: p.name, startTime: p.startTime, endTime: p.endTime };
  }

  cancelEdit() {
    this.editingId.set(null);
    this.editDraft = { name: '', startTime: '', endTime: '' };
  }

  saveEdit() {
    const id = this.editingId();
    if (!id) return;

    const current = this.periods().find((p) => p.id === id);
    if (!current) return;

    const name = this.editDraft.name.trim();
    if (!name) {
      this.showToast('error', `Enter a ${current.slotType === 'break' ? 'break' : 'lesson'} name.`);
      return;
    }
    if (this.editDraft.startTime >= this.editDraft.endTime) {
      this.showToast('error', 'End time must be after start time.');
      return;
    }

    const updated: TimetablePeriod = {
      ...current,
      name,
      startTime: this.editDraft.startTime,
      endTime: this.editDraft.endTime,
    };
    this.periods.set(this.sortSlots(this.periods().map((p) => (p.id === id ? updated : p))));
    this.cancelEdit();
    this.showToast('success', current.slotType === 'break' ? 'Break updated.' : 'Lesson period updated.');
  }

  updateSlotName(id: string, name: string) {
    const current = this.periods().find((p) => p.id === id);
    if (!current) return;

    const trimmed = name.trim();
    if (!trimmed) {
      this.showToast('error', 'Name cannot be empty.');
      return;
    }

    const updated: TimetablePeriod = { ...current, name: trimmed };
    this.periods.set(this.sortSlots(this.periods().map((p) => (p.id === id ? updated : p))));
  }

  slotTypeLabel(p: TimetablePeriod): string {
    return p.slotType === 'break' ? 'Break' : 'Lesson';
  }

  slotDurationLabel(p: TimetablePeriod): string {
    const min = this.timeToMinutes(p.endTime) - this.timeToMinutes(p.startTime);
    return this.formatDuration(min);
  }

  timelineStyle(p: TimetablePeriod): Record<string, string> {
    const { startMin, span } = this.timelineMeta();
    const left = ((this.timeToMinutes(p.startTime) - startMin) / span) * 100;
    const width = ((this.timeToMinutes(p.endTime) - this.timeToMinutes(p.startTime)) / span) * 100;
    return {
      left: `${left}%`,
      width: `${Math.max(width, 2)}%`,
    };
  }

  updateSlotTime(id: string, field: 'startTime' | 'endTime', value: string) {
    const current = this.periods().find((p) => p.id === id);
    if (!current) return;

    const updated: TimetablePeriod = { ...current, [field]: value };
    if (updated.startTime >= updated.endTime) {
      this.showToast('error', `${updated.name}: finish time must be after start time.`);
      return;
    }

    const list = this.periods().map((p) => (p.id === id ? updated : p));
    this.periods.set(this.sortSlots(list));
  }

  clearScheduleSearch() {
    this.scheduleSearch.set('');
  }

  private sortSlots(list: TimetablePeriod[]): TimetablePeriod[] {
    return [...list].sort((a, b) => a.startTime.localeCompare(b.startTime));
  }

  private timeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  }

  private minutesToTime(min: number): string {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  private formatDuration(min: number): string {
    if (min < 60) return `${min}m`;
    const h = Math.floor(min / 60);
    const rem = min % 60;
    return rem ? `${h}h ${rem}m` : `${h}h`;
  }

  private showToast(type: 'success' | 'error', msg: string) {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 4000);
  }
}
