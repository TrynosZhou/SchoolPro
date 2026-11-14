import { Component, computed, HostListener, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { NgStyle } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';
import { TimetablePeriod, TimetablePeriodsService } from '../../core/services/timetable-periods.service';
import { buildTeacherColorMap, teacherColorFor } from '../../core/utils/teacher-colors';
import {
  isLunchBreakPeriod,
  compactClassGridLabel,
  formatPeriodRange,
  isBreakPeriod,
  lessonPeriodNumber,
  teacherInitials,
  timetableSubjectShort,
} from '../../core/utils/timetable-grid-display';

interface SlotView {
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
  room?: string | null;
  isLocked?: boolean;
}

interface TeacherView {
  teacherId: string;
  teacherName: string;
  employeeNumber: string;
  slots: SlotView[];
}

interface ClassView {
  classId: string;
  className: string;
  slots: SlotView[];
}

interface Snapshot {
  teachers: TeacherView[];
  classes: ClassView[];
}

type Mode = 'class' | 'teacher';
type CheckKind = 'ok' | 'self' | 'teacher' | 'class' | 'locked';

interface MoveCheck {
  kind: CheckKind;
  msg: string;
}

interface ClashItem {
  key: string;
  kind: 'teacher' | 'class';
  ownerId: string;
  ownerName: string;
  day: number;
  startTime: string;
  endTime: string;
  a: SlotView;
  b: SlotView;
}

interface PendingMove {
  slotId: string;
  day: number;
  periodId: string;
  msg: string;
}

interface UndoEntry {
  slotId: string;
  label: string;
  from: { dayOfWeek: number; startTime: string; endTime: string };
}

const DAYS = [
  { value: 1, label: 'Monday', short: 'Mon' },
  { value: 2, label: 'Tuesday', short: 'Tue' },
  { value: 3, label: 'Wednesday', short: 'Wed' },
  { value: 4, label: 'Thursday', short: 'Thu' },
  { value: 5, label: 'Friday', short: 'Fri' },
];

function hhmm(time: string): string {
  const [h, m] = String(time || '0:00').split(':');
  return `${String(h).padStart(2, '0')}:${String(m || '00').slice(0, 2).padStart(2, '0')}`;
}

function minutes(time: string): number {
  const [h, m] = String(time || '0:0').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return minutes(aStart) < minutes(bEnd) && minutes(bStart) < minutes(aEnd);
}

@Component({
  selector: 'app-admin-timetable-manual-entry',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, RouterLink, NgStyle],
  templateUrl: './admin-timetable-manual-entry.component.html',
  styleUrl: './admin-timetable-manual-entry.component.scss',
})
export class AdminTimetableManualEntryComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private periodsSvc = inject(TimetablePeriodsService);
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  readonly adminNav = ADMIN_NAV_SECTIONS;
  readonly days = DAYS;
  readonly formatPeriodRange = formatPeriodRange;
  readonly isBreakPeriod = isBreakPeriod;
  readonly lessonPeriodNumber = lessonPeriodNumber;

  periods = signal<TimetablePeriod[]>([]);
  snapshot = signal<Snapshot>({ teachers: [], classes: [] });
  loading = signal(true);
  loadError = signal(false);
  refreshing = signal(false);

  mode = signal<Mode>('class');
  selectedId = signal('');

  /** Card picked up by dragging or by clicking it (click a free period to drop it). */
  heldId = signal<string | null>(null);
  hoverKey = signal<string | null>(null);
  moving = signal(false);
  pending = signal<PendingMove | null>(null);
  undoStack = signal<UndoEntry[]>([]);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);
  clashPanelOpen = signal(true);

  readonly teachers = computed(() => this.snapshot().teachers);
  readonly classes = computed(() => this.snapshot().classes);

  /** Every lesson in the school timetable, de-duplicated by id. */
  readonly allSlots = computed<SlotView[]>(() => {
    const map = new Map<string, SlotView>();
    for (const c of this.classes()) for (const s of c.slots) map.set(s.id, s);
    for (const t of this.teachers()) for (const s of t.slots) if (!map.has(s.id)) map.set(s.id, s);
    return [...map.values()];
  });

  private readonly colorMap = computed(() => buildTeacherColorMap(this.teachers().map((t) => t.teacherId)));

  /** Lessons shown in the grid for the selected class / teacher. */
  readonly viewSlots = computed<SlotView[]>(() => {
    const id = this.selectedId();
    if (!id) return [];
    return this.allSlots().filter((s) => (this.mode() === 'class' ? s.classId === id : s.teacherId === id));
  });

  private readonly slotIndex = computed(() => {
    const map = new Map<string, SlotView[]>();
    for (const s of this.viewSlots()) {
      const key = `${s.dayOfWeek}|${hhmm(s.startTime)}|${hhmm(s.endTime)}`;
      const list = map.get(key);
      if (list) list.push(s);
      else map.set(key, [s]);
    }
    return map;
  });

  readonly heldSlot = computed(() => {
    const id = this.heldId();
    return id ? (this.allSlots().find((s) => s.id === id) ?? null) : null;
  });

  /** Clash status of every droppable period for the card being held. */
  readonly cellChecks = computed(() => {
    const held = this.heldSlot();
    const map = new Map<string, MoveCheck>();
    if (!held) return map;
    for (const d of this.days) {
      for (const p of this.periods()) {
        if (isBreakPeriod(p)) continue;
        map.set(this.cellKey(d.value, p), this.checkMove(held, d.value, p));
      }
    }
    return map;
  });

  /** Existing clashes anywhere in the timetable (teacher double-booked / class double-booked). */
  readonly clashes = computed<ClashItem[]>(() => {
    const slots = this.allSlots();
    const items: ClashItem[] = [];
    const seen = new Set<string>();
    const scan = (kind: 'teacher' | 'class') => {
      const groups = new Map<string, SlotView[]>();
      for (const s of slots) {
        const owner = kind === 'teacher' ? s.teacherId : s.classId;
        if (!owner) continue;
        const key = `${owner}|${s.dayOfWeek}`;
        const list = groups.get(key);
        if (list) list.push(s);
        else groups.set(key, [s]);
      }
      for (const list of groups.values()) {
        const sorted = [...list].sort((x, y) => minutes(x.startTime) - minutes(y.startTime));
        for (let i = 0; i < sorted.length; i++) {
          for (let j = i + 1; j < sorted.length; j++) {
            const a = sorted[i];
            const b = sorted[j];
            if (!overlaps(a.startTime, a.endTime, b.startTime, b.endTime)) continue;
            const key = `${kind}:${[a.id, b.id].sort().join(':')}`;
            if (seen.has(key)) continue;
            seen.add(key);
            items.push({
              key,
              kind,
              ownerId: kind === 'teacher' ? a.teacherId : a.classId,
              ownerName: kind === 'teacher' ? a.teacherName : a.className,
              day: a.dayOfWeek,
              startTime: a.startTime,
              endTime: a.endTime,
              a,
              b,
            });
          }
        }
      }
    };
    scan('teacher');
    scan('class');
    return items.sort((x, y) => x.day - y.day || minutes(x.startTime) - minutes(y.startTime));
  });

  readonly clashIds = computed(() => {
    const ids = new Set<string>();
    for (const c of this.clashes()) {
      ids.add(c.a.id);
      ids.add(c.b.id);
    }
    return ids;
  });

  readonly stats = computed(() => {
    const slots = this.allSlots();
    return {
      lessons: slots.length,
      locked: slots.filter((s) => s.isLocked).length,
      shown: this.viewSlots().length,
    };
  });

  readonly hasTimetable = computed(() => this.allSlots().length > 0);

  readonly selectedLabel = computed(() => {
    const id = this.selectedId();
    if (this.mode() === 'class') return this.classes().find((c) => c.classId === id)?.className ?? '';
    return this.teachers().find((t) => t.teacherId === id)?.teacherName ?? '';
  });

  /** Message in the status bar: explains the hovered period while a card is held. */
  readonly statusMessage = computed(() => {
    const held = this.heldSlot();
    if (!held) {
      return 'Drag a lesson card to another period — or click a card, then click the period to place it.';
    }
    const hover = this.hoverKey();
    const check = hover ? this.cellChecks().get(hover) : null;
    if (check) return check.msg;
    return `Holding ${held.subjectName} · ${this.classLabel(held.className)} (${held.teacherName}). Pick a highlighted period.`;
  });

  ngOnInit(): void {
    this.periods.set(this.periodsSvc.load());
    this.load();
  }

  ngOnDestroy(): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.pending()) {
      this.cancelPending();
      return;
    }
    if (this.heldId()) this.clearHold();
  }

  // ── Loading ──
  load(silent = false): void {
    if (silent) this.refreshing.set(true);
    else this.loading.set(true);
    this.api.get<Snapshot>('/timetable/generate/snapshot').subscribe({
      next: (data) => {
        this.snapshot.set({ teachers: data?.teachers ?? [], classes: data?.classes ?? [] });
        this.loadError.set(false);
        this.loading.set(false);
        this.refreshing.set(false);
        this.ensureSelection();
      },
      error: () => {
        this.loading.set(false);
        this.refreshing.set(false);
        this.loadError.set(true);
      },
    });
  }

  private ensureSelection(): void {
    const id = this.selectedId();
    if (this.mode() === 'class') {
      const list = this.classes();
      if (!list.some((c) => c.classId === id)) this.selectedId.set(list[0]?.classId ?? '');
    } else {
      const list = this.teachers();
      if (!list.some((t) => t.teacherId === id)) this.selectedId.set(list[0]?.teacherId ?? '');
    }
  }

  setMode(mode: Mode): void {
    if (this.mode() === mode) return;
    this.clearHold();
    this.mode.set(mode);
    this.selectedId.set('');
    this.ensureSelection();
  }

  onSelect(id: string): void {
    this.clearHold();
    this.selectedId.set(id);
  }

  // ── Display helpers ──
  /** Text shown (rotated) in the break / lunch columns. */
  breakTimeLabel(period: TimetablePeriod): string {
    return isLunchBreakPeriod(period) ? 'LUNCHTIME' : 'BREAKTIME';
  }

  cellKey(day: number, period: TimetablePeriod): string {
    return `${day}|${period.id}`;
  }

  slotsAt(day: number, period: TimetablePeriod): SlotView[] {
    return this.slotIndex().get(`${day}|${hhmm(period.startTime)}|${hhmm(period.endTime)}`) ?? [];
  }

  subjectShort(s: SlotView): string {
    return timetableSubjectShort(s.subjectCode, s.subjectName, s.subjectShort);
  }

  classLabel(name: string): string {
    return compactClassGridLabel(name) || name;
  }

  initials(name: string): string {
    return teacherInitials(name);
  }

  cardSub(s: SlotView): string {
    return this.mode() === 'class' ? this.initials(s.teacherName) : this.classLabel(s.className);
  }

  cardStyle(teacherId: string): Record<string, string> {
    const c = teacherColorFor(teacherId, this.colorMap());
    const style: Record<string, string> = { background: c.background, color: c.color };
    if (c.border) style['border-color'] = c.border;
    return style;
  }

  cardTitle(s: SlotView): string {
    return `${s.subjectName} · ${s.className} · ${s.teacherName}${s.isLocked ? ' · Locked' : ''}`;
  }

  dayShort(day: number): string {
    return DAYS.find((d) => d.value === day)?.short ?? `Day ${day}`;
  }

  cellState(day: number, period: TimetablePeriod): string {
    return this.cellChecks().get(this.cellKey(day, period))?.kind ?? '';
  }

  cellTitle(day: number, period: TimetablePeriod): string | null {
    return this.cellChecks().get(this.cellKey(day, period))?.msg ?? null;
  }

  clashText(c: ClashItem): string {
    const who = c.kind === 'teacher' ? `Teacher clash — ${c.ownerName}` : `Class clash — ${c.ownerName}`;
    const parts =
      c.kind === 'teacher'
        ? `${this.classLabel(c.a.className)} ${c.a.subjectName} ↔ ${this.classLabel(c.b.className)} ${c.b.subjectName}`
        : `${c.a.subjectName} (${c.a.teacherName}) ↔ ${c.b.subjectName} (${c.b.teacherName})`;
    return `${who} · ${this.dayShort(c.day)} ${hhmm(c.startTime)}–${hhmm(c.endTime)} · ${parts}`;
  }

  focusClash(c: ClashItem): void {
    this.clearHold();
    this.mode.set(c.kind === 'teacher' ? 'teacher' : 'class');
    this.selectedId.set(c.ownerId);
  }

  // ── Clash detection ──
  /** Works out what would happen if `slot` were placed in `day` / `period`. */
  private checkMove(slot: SlotView, day: number, period: TimetablePeriod): MoveCheck {
    const same =
      slot.dayOfWeek === day &&
      hhmm(slot.startTime) === hhmm(period.startTime) &&
      hhmm(slot.endTime) === hhmm(period.endTime);
    if (same) return { kind: 'self', msg: 'This is where the lesson already is.' };
    if (slot.isLocked) return { kind: 'locked', msg: 'This lesson is locked. Unlock it to move it.' };

    const when = `${this.dayShort(day)} ${hhmm(period.startTime)}–${hhmm(period.endTime)}`;
    const others = this.allSlots().filter(
      (s) => s.id !== slot.id && s.dayOfWeek === day && overlaps(s.startTime, s.endTime, period.startTime, period.endTime),
    );

    const classClash = others.find((s) => s.classId === slot.classId);
    if (classClash) {
      return {
        kind: 'class',
        msg: `Class clash: ${slot.className} already has ${classClash.subjectName} (${classClash.teacherName}) on ${when}.`,
      };
    }
    const teacherClash = others.find((s) => !!slot.teacherId && s.teacherId === slot.teacherId);
    if (teacherClash) {
      return {
        kind: 'teacher',
        msg: `Teacher clash: ${slot.teacherName} is already teaching ${teacherClash.className} (${teacherClash.subjectName}) on ${when}.`,
      };
    }
    return { kind: 'ok', msg: `Free: ${slot.className} and ${slot.teacherName} are both available on ${when}.` };
  }

  // ── Holding / dragging cards ──
  clearHold(): void {
    this.heldId.set(null);
    this.hoverKey.set(null);
  }

  onDragStart(slot: SlotView, event: DragEvent): void {
    if (slot.isLocked || this.moving()) {
      event.preventDefault();
      return;
    }
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', slot.id);
    }
    this.heldId.set(slot.id);
  }

  onDragEnd(): void {
    this.clearHold();
  }

  onCellDragOver(day: number, period: TimetablePeriod, event: DragEvent): void {
    if (!this.heldId()) return;
    event.preventDefault();
    const check = this.cellChecks().get(this.cellKey(day, period));
    if (event.dataTransfer) event.dataTransfer.dropEffect = check?.kind === 'class' || check?.kind === 'locked' ? 'none' : 'move';
    this.hoverKey.set(this.cellKey(day, period));
  }

  onCellHover(day: number, period: TimetablePeriod): void {
    if (this.heldId()) this.hoverKey.set(this.cellKey(day, period));
  }

  onCellDrop(day: number, period: TimetablePeriod, event: DragEvent): void {
    event.preventDefault();
    const id = event.dataTransfer?.getData('text/plain') || this.heldId();
    if (id) this.attemptMove(id, day, period);
  }

  /** Click a card: pick it up, put it down, or (when holding another card) try to place the held one here. */
  onCardActivate(slot: SlotView, day: number, period: TimetablePeriod, event: Event): void {
    event.stopPropagation();
    const held = this.heldId();
    if (held && held !== slot.id) {
      this.attemptMove(held, day, period);
      return;
    }
    if (slot.isLocked) {
      this.showToast('error', 'This lesson is locked. Unlock it to move it.');
      return;
    }
    this.heldId.set(held === slot.id ? null : slot.id);
  }

  /** Keyboard: Enter / Space on the card itself (not on its lock button). */
  onCardKey(slot: SlotView, day: number, period: TimetablePeriod, event: Event): void {
    if (event.target !== event.currentTarget) return;
    event.preventDefault();
    this.onCardActivate(slot, day, period, event);
  }

  onCellClick(day: number, period: TimetablePeriod): void {
    const held = this.heldId();
    if (held) this.attemptMove(held, day, period);
  }

  // ── Moving ──
  attemptMove(slotId: string, day: number, period: TimetablePeriod): void {
    if (this.moving() || isBreakPeriod(period)) return;
    const slot = this.allSlots().find((s) => s.id === slotId);
    if (!slot) return;

    const check = this.checkMove(slot, day, period);
    switch (check.kind) {
      case 'self':
        this.clearHold();
        return;
      case 'locked':
      case 'class':
        this.showToast('error', check.msg);
        return;
      case 'teacher':
        this.pending.set({ slotId, day, periodId: period.id, msg: check.msg });
        return;
      default:
        this.performMove(slotId, day, period, false);
    }
  }

  confirmPending(): void {
    const p = this.pending();
    if (!p) return;
    const period = this.periods().find((x) => x.id === p.periodId);
    this.pending.set(null);
    if (period) this.performMove(p.slotId, p.day, period, true);
  }

  pendingSlot(): SlotView | null {
    const p = this.pending();
    return p ? (this.allSlots().find((s) => s.id === p.slotId) ?? null) : null;
  }

  cancelPending(): void {
    this.pending.set(null);
    this.clearHold();
  }

  private performMove(slotId: string, day: number, period: TimetablePeriod, ignoreConflicts: boolean): void {
    const slot = this.allSlots().find((s) => s.id === slotId);
    if (!slot) return;
    const from = { dayOfWeek: slot.dayOfWeek, startTime: slot.startTime, endTime: slot.endTime };

    this.moving.set(true);
    this.api
      .patch(`/timetable/slots/${slotId}/move`, {
        dayOfWeek: day,
        startTime: period.startTime,
        endTime: period.endTime,
        ignoreConflicts,
      })
      .subscribe({
        next: () => {
          this.moving.set(false);
          this.patchSlot(slotId, { dayOfWeek: day, startTime: period.startTime, endTime: period.endTime });
          this.undoStack.update((stack) => [
            ...stack.slice(-19),
            { slotId, from, label: `${slot.subjectName} · ${this.classLabel(slot.className)}` },
          ]);
          this.clearHold();
          this.showToast(
            'success',
            ignoreConflicts
              ? `Moved ${slot.subjectName} to ${this.dayShort(day)} ${hhmm(period.startTime)} (clash accepted).`
              : `Moved ${slot.subjectName} to ${this.dayShort(day)} ${hhmm(period.startTime)}.`,
          );
        },
        error: (e) => {
          this.moving.set(false);
          const msg: string = e?.error?.message || 'Could not move the lesson.';
          if (e?.status === 409 && !ignoreConflicts) {
            // The server found a clash that is not visible in the loaded data — let the admin decide.
            this.pending.set({ slotId, day, periodId: period.id, msg });
            return;
          }
          this.showToast('error', msg);
        },
      });
  }

  undo(): void {
    const stack = this.undoStack();
    const last = stack[stack.length - 1];
    if (!last || this.moving()) return;
    this.moving.set(true);
    this.api
      .patch(`/timetable/slots/${last.slotId}/move`, { ...last.from, ignoreConflicts: true })
      .subscribe({
        next: () => {
          this.moving.set(false);
          this.patchSlot(last.slotId, last.from);
          this.undoStack.set(stack.slice(0, -1));
          this.showToast('success', `Undid move of ${last.label}.`);
        },
        error: (e) => {
          this.moving.set(false);
          this.showToast('error', e?.error?.message || 'Could not undo the move.');
        },
      });
  }

  toggleLock(slot: SlotView, event: Event): void {
    event.stopPropagation();
    const locked = !slot.isLocked;
    this.api.patch(`/timetable/slots/${slot.id}/lock`, { locked }).subscribe({
      next: () => {
        this.patchSlot(slot.id, { isLocked: locked });
        if (locked && this.heldId() === slot.id) this.clearHold();
      },
      error: (e) => this.showToast('error', e?.error?.message || 'Could not change the lesson lock.'),
    });
  }

  /** Updates a lesson in the loaded timetable without reloading everything. */
  private patchSlot(id: string, patch: Partial<SlotView>): void {
    const apply = (slots: SlotView[]) => slots.map((s) => (s.id === id ? { ...s, ...patch } : s));
    this.snapshot.update((snap) => ({
      teachers: snap.teachers.map((t) => ({ ...t, slots: apply(t.slots) })),
      classes: snap.classes.map((c) => ({ ...c, slots: apply(c.slots) })),
    }));
  }

  private showToast(type: 'success' | 'error', msg: string): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toast.set({ type, msg });
    this.toastTimer = setTimeout(() => this.toast.set(null), 4500);
  }
}
