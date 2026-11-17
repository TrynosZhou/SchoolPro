import { Component, computed, HostListener, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { NgStyle } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';
import { TimetablePeriod, TimetablePeriodsService } from '../../core/services/timetable-periods.service';
import {
  isLunchBreakPeriod,
  compactClassGridLabel,
  formatPeriodRange,
  dayGridLabel,
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

/** Sentinel value for the "All" selection, showing every class / teacher at once. */
const ALL = '__all__';

/** Saturated lesson-card palette, cycled per teacher (matches the classic desktop timetable look). */
const CARD_PALETTE = [
  '#22c3f0',
  '#2fa53a',
  '#a24be0',
  '#d9742b',
  '#c7d12b',
  '#f2a0a0',
  '#4fc4bf',
  '#f0e46b',
  '#3d7fe0',
  '#d6457a',
  '#8fb31f',
  '#b58b5e',
];

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

interface CtxMenu {
  x: number;
  y: number;
  slot: SlotView;
  day: number;
  period: TimetablePeriod;
}

interface RoomRecord {
  id: string;
  name: string;
  code?: string | null;
  capacity?: number | null;
}

interface LessonChange {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room?: string | null;
  isLocked?: boolean;
  remove?: boolean;
}

type DialogKind = 'remove' | 'delete-row' | 'edit' | 'classroom' | 'test' | 'quick';

interface DialogState {
  kind: DialogKind;
  slot: SlotView;
}

interface TestRow {
  day: number;
  label: string;
  kind: CheckKind;
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
  readonly ALL = ALL;
  readonly formatPeriodRange = formatPeriodRange;
  readonly isBreakPeriod = isBreakPeriod;
  readonly lessonPeriodNumber = lessonPeriodNumber;

  periods = signal<TimetablePeriod[]>([]);
  snapshot = signal<Snapshot>({ teachers: [], classes: [] });
  loading = signal(true);
  loadError = signal(false);
  refreshing = signal(false);

  mode = signal<Mode>('teacher');
  selectedId = signal<string>(ALL);

  /** Card picked up by dragging or by clicking it (click a free period to drop it). */
  heldId = signal<string | null>(null);
  hoverKey = signal<string | null>(null);
  moving = signal(false);
  bulkLockBusy = signal(false);
  pending = signal<PendingMove | null>(null);
  undoStack = signal<UndoEntry[]>([]);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);
  clashPanelOpen = signal(true);
  /** Right-click menu opened on a lesson card. */
  ctxMenu = signal<CtxMenu | null>(null);
  /** Which submenu (View, Find, …) is currently expanded in the context menu. */
  ctxSub = signal<string | null>(null);
  /** Dialog opened from the right-click menu (remove, edit, test, quick changes…). */
  dialog = signal<DialogState | null>(null);
  dialogBusy = signal(false);
  editDay = signal(1);
  editPeriodId = signal('');
  editRoom = signal('');
  masterRooms = signal<RoomRecord[]>([]);

  readonly teachers = computed(() => this.snapshot().teachers);
  readonly classes = computed(() => this.snapshot().classes);

  readonly allSelected = computed(() => this.selectedId() === ALL);

  /** Rows for the master "All" grid: every class or every teacher. */
  readonly rows = computed<Array<{ id: string; name: string }>>(() => {
    if (this.mode() === 'class') {
      return this.classes().map((c) => ({ id: c.classId, name: c.className }));
    }
    return this.teachers().map((t) => ({ id: t.teacherId, name: t.teacherName }));
  });

  /** Lesson periods that can hold lessons (breaks excluded), used as the master grid's columns. */
  readonly lessonPeriods = computed(() => this.periods().filter((p) => !isBreakPeriod(p)));

  /** Every lesson in the school timetable, de-duplicated by id. */
  readonly allSlots = computed<SlotView[]>(() => {
    const map = new Map<string, SlotView>();
    for (const c of this.classes()) for (const s of c.slots) map.set(s.id, s);
    for (const t of this.teachers()) for (const s of t.slots) if (!map.has(s.id)) map.set(s.id, s);
    return [...map.values()];
  });

  /** Stable palette index per teacher (sorted ids), so each teacher keeps the same card colour. */
  private readonly teacherIndex = computed(() => {
    const ids = [...new Set(this.teachers().map((t) => t.teacherId).filter(Boolean))].sort();
    return new Map(ids.map((id, i) => [id, i] as const));
  });

  /** Lessons shown in the grid for the selected class / teacher (or all, when "All" is selected). */
  readonly viewSlots = computed<SlotView[]>(() => {
    if (this.allSelected()) return this.allSlots();
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

  /** Room names from the master list (Timetable → Rooms). */
  readonly rooms = computed<string[]>(() => this.masterRooms().map((r) => r.name));

  /** Room choices for a lesson's dropdown: the master list, plus its current room if it is not on the list yet. */
  roomChoices(slot: SlotView): string[] {
    const list = this.rooms();
    const current = (slot.room || '').trim();
    return current && !list.includes(current) ? [...list, current] : list;
  }

  readonly hasTimetable = computed(() => this.allSlots().length > 0);

  readonly selectedLabel = computed(() => {
    if (this.allSelected()) {
      return this.mode() === 'class' ? 'All classes' : 'All teachers';
    }
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
    this.loadRooms();
  }

  loadRooms(): void {
    this.api.get<RoomRecord[]>('/timetable/rooms').subscribe({
      next: (rows) => this.masterRooms.set(rows ?? []),
      error: () => this.masterRooms.set([]),
    });
  }

  ngOnDestroy(): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    if (this.ctxMenu()) this.closeCtxMenu();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.ctxMenu()) {
      this.closeCtxMenu();
      return;
    }
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
    if (id === ALL) return; // keep the master grid after reload
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
    this.selectedId.set(ALL);
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

  /** Lessons for a specific row (class or teacher) at a day/period — used by the "All" master grid. */
  slotsForRow(entityId: string, day: number, period: TimetablePeriod): SlotView[] {
    const start = hhmm(period.startTime);
    const end = hhmm(period.endTime);
    const modeIsClass = this.mode() === 'class';
    return this.allSlots().filter(
      (s) =>
        (modeIsClass ? s.classId === entityId : s.teacherId === entityId) &&
        s.dayOfWeek === day &&
        hhmm(s.startTime) === start &&
        hhmm(s.endTime) === end,
    );
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

  /** Row label: teacher initials (e.g. "De") or compact class code. */
  rowLabel(name: string): string {
    return this.mode() === 'class' ? this.classLabel(name) : this.initials(name);
  }

  /** Main text on a lesson card: the class code when viewing teachers, the subject when viewing classes. */
  cardMain(s: SlotView): string {
    return this.mode() === 'class' ? this.subjectShort(s) : this.classLabel(s.className);
  }

  /** Secondary text on a lesson card. */
  cardSub(s: SlotView): string {
    return this.mode() === 'class' ? this.initials(s.teacherName) : this.subjectShort(s);
  }

  cardStyle(teacherId: string): Record<string, string> {
    const idx = this.teacherIndex().get(teacherId) ?? 0;
    return { background: CARD_PALETTE[idx % CARD_PALETTE.length], color: '#000' };
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
    this.closeCtxMenu();
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
    this.closeCtxMenu();
    const held = this.heldId();
    if (held) this.attemptMove(held, day, period);
  }

  // ── Right-click menu ──
  onCardContext(slot: SlotView, day: number, period: TimetablePeriod, event: Event): void {
    const mouse = event as MouseEvent;
    event.preventDefault();
    event.stopPropagation();
    const x = Math.min(mouse.clientX, window.innerWidth - 240);
    const y = Math.min(mouse.clientY, window.innerHeight - 440);
    this.ctxSub.set(null);
    this.ctxMenu.set({ x: Math.max(8, x), y: Math.max(8, y), slot, day, period });
  }

  closeCtxMenu(): void {
    this.ctxMenu.set(null);
    this.ctxSub.set(null);
  }

  ctxTitle(m: CtxMenu): string {
    const num = this.periodNumberOf(m.period) ?? '?';
    return `${this.subjectShort(m.slot)} (${this.classLabel(m.slot.className)}) - ${dayGridLabel(m.day)}:${num}`;
  }

  menuToggleLock(event: Event): void {
    const m = this.ctxMenu();
    if (!m) return;
    this.closeCtxMenu();
    this.toggleLock(m.slot, event);
  }

  menuSetView(mode: Mode): void {
    this.closeCtxMenu();
    this.clearHold();
    this.mode.set(mode);
    this.selectedId.set(ALL);
  }

  /** "Lesson grid" and "Find" both jump to the class or teacher of the right-clicked lesson. */
  menuJumpTo(target: 'class' | 'teacher'): void {
    const m = this.ctxMenu();
    if (!m) return;
    this.closeCtxMenu();
    this.clearHold();
    this.mode.set(target);
    this.selectedId.set(target === 'class' ? m.slot.classId : m.slot.teacherId);
  }

  // ── Context-menu actions ──
  dayLabel(day: number): string {
    return DAYS.find((d) => d.value === day)?.label ?? `Day ${day}`;
  }

  slotTime(s: SlotView): string {
    return `${hhmm(s.startTime)}–${hhmm(s.endTime)}`;
  }

  periodNumberOf(period: TimetablePeriod): number | null {
    return lessonPeriodNumber(this.periods(), this.periods().indexOf(period));
  }

  /** Every lesson period across the week, in order (breaks excluded). */
  private orderedCells(): Array<{ day: number; period: TimetablePeriod }> {
    const out: Array<{ day: number; period: TimetablePeriod }> = [];
    for (const d of this.days) for (const p of this.lessonPeriods()) out.push({ day: d.value, period: p });
    return out;
  }

  private periodFor(slot: SlotView): TimetablePeriod | undefined {
    return this.lessonPeriods().find(
      (p) => hhmm(p.startTime) === hhmm(slot.startTime) && hhmm(p.endTime) === hhmm(slot.endTime),
    );
  }

  menuOpen(kind: DialogKind): void {
    const m = this.ctxMenu();
    if (!m) return;
    this.closeCtxMenu();
    this.openDialog(kind, m.slot);
  }

  menuRemove(): void {
    this.menuOpen('remove');
  }

  menuDeleteRow(): void {
    this.menuOpen('delete-row');
  }

  menuSetRoom(room: string): void {
    const m = this.ctxMenu();
    if (!m) return;
    this.closeCtxMenu();
    this.applyLessonChanges(
      [{ slot: m.slot, change: { dayOfWeek: m.slot.dayOfWeek, startTime: m.slot.startTime, endTime: m.slot.endTime, room, isLocked: m.slot.isLocked } }],
      room ? `Moved ${m.slot.subjectName} to room ${room}.` : `Cleared the room for ${m.slot.subjectName}.`,
    );
  }

  /** Move to the next / previous free period in the week. */
  menuQuickMove(direction: 1 | -1): void {
    const m = this.ctxMenu();
    if (!m) return;
    this.closeCtxMenu();
    const cells = this.orderedCells();
    const current = cells.findIndex(
      (c) => c.day === m.slot.dayOfWeek && hhmm(c.period.startTime) === hhmm(m.slot.startTime),
    );
    for (let i = current + direction; i >= 0 && i < cells.length; i += direction) {
      const c = cells[i];
      if (this.checkMove(m.slot, c.day, c.period).kind === 'ok') {
        this.attemptMove(m.slot.id, c.day, c.period);
        return;
      }
    }
    this.showToast('error', `No free period ${direction > 0 ? 'later' : 'earlier'} in the week for ${m.slot.subjectName}.`);
  }

  pickQuickSlot(day: number, period: TimetablePeriod): void {
    const d = this.dialog();
    this.dialog.set(null);
    if (d) this.attemptMove(d.slot.id, day, period);
  }

  /** Free periods (no clash) where the dialog's lesson could go. */
  quickOptions(slot: SlotView): Array<{ day: number; period: TimetablePeriod }> {
    return this.orderedCells().filter((c) => this.checkMove(slot, c.day, c.period).kind === 'ok');
  }

  /** Test result for every lesson period of the week. */
  testRows(slot: SlotView): TestRow[] {
    return this.orderedCells().map((c) => {
      const check = this.checkMove(slot, c.day, c.period);
      return {
        day: c.day,
        label: `${DAYS.find((d) => d.value === c.day)?.short ?? ''} P${this.periodNumberOf(c.period) ?? '?'}`,
        kind: check.kind,
        msg: check.msg,
      };
    });
  }

  private openDialog(kind: DialogKind, slot: SlotView): void {
    const period = this.periodFor(slot);
    this.editDay.set(slot.dayOfWeek);
    this.editPeriodId.set(period?.id ?? '');
    this.editRoom.set(slot.room ?? '');
    this.dialog.set({ kind, slot });
  }

  closeDialog(): void {
    if (this.dialogBusy()) return;
    this.dialog.set(null);
  }

  dialogTitle(kind: DialogKind): string {
    switch (kind) {
      case 'remove': return 'Remove lesson';
      case 'delete-row': return 'Delete row';
      case 'edit': return 'Edit lesson';
      case 'classroom': return 'Classroom';
      case 'test': return 'Test lesson';
      case 'quick': return 'Quick changes';
    }
  }

  /** Lessons that a "Delete row" removes: the same teacher, class and subject, skipping locked ones. */
  deleteRowTargets(slot: SlotView): { removable: SlotView[]; locked: number } {
    const same = this.allSlots().filter(
      (s) => s.teacherId === slot.teacherId && s.classId === slot.classId && s.subjectId === slot.subjectId,
    );
    return { removable: same.filter((s) => !s.isLocked), locked: same.filter((s) => s.isLocked).length };
  }

  confirmRemove(): void {
    const d = this.dialog();
    if (!d) return;
    const s = d.slot;
    this.applyLessonChanges(
      [{ slot: s, change: { dayOfWeek: s.dayOfWeek, startTime: s.startTime, endTime: s.endTime, remove: true } }],
      `Removed ${s.subjectName} (${s.className}) from the timetable.`,
    );
  }

  confirmDeleteRow(): void {
    const d = this.dialog();
    if (!d) return;
    const targets = this.deleteRowTargets(d.slot).removable;
    if (!targets.length) {
      this.showToast('error', 'Every lesson in this row is locked. Unlock them first.');
      return;
    }
    this.applyLessonChanges(
      targets.map((s) => ({
        slot: s,
        change: { dayOfWeek: s.dayOfWeek, startTime: s.startTime, endTime: s.endTime, remove: true },
      })),
      `Deleted ${targets.length} lesson${targets.length === 1 ? '' : 's'} of ${d.slot.subjectName} for ${d.slot.className}.`,
    );
  }

  confirmEdit(): void {
    const d = this.dialog();
    if (!d) return;
    const period = this.lessonPeriods().find((p) => p.id === this.editPeriodId());
    if (!period) {
      this.showToast('error', 'Choose a period.');
      return;
    }
    const room = this.editRoom().trim();
    this.applyLessonChanges(
      [
        {
          slot: d.slot,
          change: {
            dayOfWeek: this.editDay(),
            startTime: period.startTime,
            endTime: period.endTime,
            room,
            isLocked: d.slot.isLocked,
          },
        },
      ],
      `Saved ${d.slot.subjectName} (${d.slot.className}).`,
    );
  }

  confirmClassroom(): void {
    const d = this.dialog();
    if (!d) return;
    const room = this.editRoom().trim();
    this.applyLessonChanges(
      [
        {
          slot: d.slot,
          change: {
            dayOfWeek: d.slot.dayOfWeek,
            startTime: d.slot.startTime,
            endTime: d.slot.endTime,
            room,
            isLocked: d.slot.isLocked,
          },
        },
      ],
      room ? `Room set to ${room}.` : 'Room cleared.',
    );
  }

  /** Saves lesson changes through the existing per-teacher endpoint (atomic per teacher). */
  private applyLessonChanges(
    items: Array<{ slot: SlotView; change: Omit<LessonChange, 'id'> }>,
    success: string,
  ): void {
    const byTeacher = new Map<string, LessonChange[]>();
    for (const { slot, change } of items) {
      const list = byTeacher.get(slot.teacherId) ?? [];
      list.push({ id: slot.id, ...change });
      byTeacher.set(slot.teacherId, list);
    }
    const jobs = [...byTeacher.entries()];
    this.dialogBusy.set(true);
    this.moving.set(true);

    const fail = (msg: string) => {
      this.dialogBusy.set(false);
      this.moving.set(false);
      this.showToast('error', msg);
      this.load(true);
    };
    const succeed = () => {
      this.dialogBusy.set(false);
      this.moving.set(false);
      this.dialog.set(null);
      this.clearHold();
      this.showToast('success', success);
      this.load(true);
    };
    const run = (i: number): void => {
      if (i >= jobs.length) return succeed();
      const [teacherId, lessons] = jobs[i];
      this.api.put(`/timetable/teachers/${teacherId}/lessons`, { lessons, ignoreConflicts: false }).subscribe({
        next: () => run(i + 1),
        error: (e) => fail(e?.error?.message || 'Could not save the change.'),
      });
    };
    run(0);
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

  /** Locks every lesson in the timetable (locked = true) or unlocks every lesson (locked = false). */
  setAllLocked(locked: boolean): void {
    if (this.bulkLockBusy() || this.moving()) return;
    this.bulkLockBusy.set(true);
    this.api.patch<{ updated: number; isLocked: boolean }>('/timetable/slots/lock-bulk', { locked }).subscribe({
      next: (res) => {
        this.bulkLockBusy.set(false);
        this.clearHold();
        this.closeCtxMenu();
        this.load(true);
        const changed = res?.updated ?? 0;
        this.showToast(
          'success',
          locked
            ? `Locked ${changed} lesson${changed === 1 ? '' : 's'}.`
            : `Unlocked ${changed} lesson${changed === 1 ? '' : 's'}.`,
        );
      },
      error: (e) => {
        this.bulkLockBusy.set(false);
        this.showToast('error', e?.error?.message || 'Could not change the locks.');
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
