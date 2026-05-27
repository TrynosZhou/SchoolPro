import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import {
  TIMETABLE_MAX_BREAKS,
  TIMETABLE_MIN_BREAKS,
  TimetablePeriod,
  TimetablePeriodsService,
} from '../../core/services/timetable-periods.service';

@Component({
  selector: 'app-admin-timetable-configure-periods',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, RouterLink],
  templateUrl: './admin-timetable-configure-periods.component.html',
  styleUrl: './admin-timetable-periods.component.scss',
})
export class AdminTimetableConfigurePeriodsComponent implements OnInit {
  private periodsSvc = inject(TimetablePeriodsService);
  readonly adminNav = ADMIN_NAV_SECTIONS;
  readonly minBreaks = TIMETABLE_MIN_BREAKS;
  readonly maxBreaks = TIMETABLE_MAX_BREAKS;

  periods = signal<TimetablePeriod[]>([]);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  lessonDraft = { name: '', startTime: '08:00', endTime: '08:40' };
  breakDraft = { name: '', startTime: '09:20', endTime: '09:35' };

  breakCount = computed(() => this.periodsSvc.countBreaks(this.periods()));
  lessonCount = computed(() => this.periods().filter((p) => p.slotType === 'lesson').length);
  canAddBreak = computed(() => this.breakCount() < TIMETABLE_MAX_BREAKS);
  canRemoveBreak = computed(() => this.breakCount() > TIMETABLE_MIN_BREAKS);
  breaksValid = computed(() => {
    const n = this.breakCount();
    return n >= TIMETABLE_MIN_BREAKS && n <= TIMETABLE_MAX_BREAKS;
  });

  ngOnInit() {
    this.periods.set(this.sortSlots(this.periodsSvc.load()));
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
    this.periodsSvc.save(this.sortSlots(this.periods()));
    this.showToast('success', 'Period and break configuration saved.');
  }

  resetDefaults() {
    this.periods.set(this.sortSlots(this.periodsSvc.resetDefaults()));
    this.showToast('success', 'Restored default lessons and breaks.');
  }

  slotTypeLabel(p: TimetablePeriod): string {
    return p.slotType === 'break' ? 'Break' : 'Lesson';
  }

  updateLessonTime(id: string, field: 'startTime' | 'endTime', value: string) {
    const current = this.periods().find((p) => p.id === id);
    if (!current || current.slotType !== 'lesson') return;

    const updated: TimetablePeriod = { ...current, [field]: value };
    if (updated.startTime >= updated.endTime) {
      this.showToast('error', `${updated.name}: finish time must be after start time.`);
      return;
    }

    const list = this.periods().map((p) => (p.id === id ? updated : p));
    this.periods.set(this.sortSlots(list));
  }

  private sortSlots(list: TimetablePeriod[]): TimetablePeriod[] {
    return [...list].sort((a, b) => a.startTime.localeCompare(b.startTime));
  }

  private showToast(type: 'success' | 'error', msg: string) {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 4000);
  }
}
