import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';
import { TimetablePeriod, TimetablePeriodsService } from '../../core/services/timetable-periods.service';
import {
  classLabelFromAllocation,
  dayLabelFromEnum,
  dayShortFromEnum,
  TeacherAllocationRow,
  TeacherWeeklySchedule,
  TIMETABLE_DAYS,
} from '../../core/services/teacher-allocation.service';
import {
  breakPeriodLabel,
  dayGridLabel,
  formatPeriodRange,
  isBreakPeriod,
  lessonPeriodNumber,
  shortClassCode,
  compactClassGridLabel,
  timetableSubjectShort,
} from '../../core/utils/timetable-grid-display';

interface StaffRow {
  id: string;
  employeeNumber?: string;
  user?: { firstName: string; lastName: string };
}

@Component({
  selector: 'app-admin-timetable-teacher-schedule',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, RouterLink],
  templateUrl: './admin-timetable-teacher-schedule.component.html',
  styleUrl: './admin-timetable-teacher-schedule.component.scss',
})
export class AdminTimetableTeacherScheduleComponent implements OnInit {
  private api = inject(ApiService);
  private periodsSvc = inject(TimetablePeriodsService);

  readonly adminNav = ADMIN_NAV_SECTIONS;
  readonly days = TIMETABLE_DAYS;
  readonly dayGridLabel = dayGridLabel;
  readonly formatPeriodRange = formatPeriodRange;
  readonly shortClassCode = shortClassCode;
  readonly timetableSubjectShort = timetableSubjectShort;
  readonly isBreakPeriod = isBreakPeriod;
  readonly breakPeriodLabel = breakPeriodLabel;
  readonly lessonPeriodNumber = lessonPeriodNumber;

  periods = signal<TimetablePeriod[]>([]);
  staff = signal<StaffRow[]>([]);
  schedule = signal<TeacherWeeklySchedule | null>(null);
  loadingStaff = signal(true);
  loading = signal(false);
  teacherId = '';

  selectedTeacherName = computed(() => {
    const s = this.staff().find((x) => x.id === this.teacherId);
    if (!s?.user) return '';
    return `${s.user.firstName} ${s.user.lastName}`.trim();
  });

  allocations = computed(() => this.schedule()?.allocations ?? []);

  stats = computed(() => {
    const s = this.schedule()?.summary;
    const rows = this.allocations();
    const daySet = new Set(rows.map((r) => r.dayOfWeek));
    return {
      slotCount: s?.slotCount ?? rows.length,
      classCount: s?.classCount ?? new Set(rows.map((r) => r.classId)).size,
      subjectCount: s?.subjectCount ?? new Set(rows.map((r) => r.subjectId)).size,
      daysFilled: daySet.size,
    };
  });

  ngOnInit() {
    this.periods.set(this.periodsSvc.load());
    this.api.get<StaffRow[]>('/admin/staff').subscribe({
      next: (rows) => {
        this.staff.set(rows);
        this.loadingStaff.set(false);
      },
      error: () => {
        this.staff.set([]);
        this.loadingStaff.set(false);
      },
    });
  }

  loadSchedule() {
    if (!this.teacherId) {
      this.schedule.set(null);
      return;
    }
    this.loading.set(true);
    this.api.get<TeacherWeeklySchedule>(`/timetable/teacher-allocation/schedule/${this.teacherId}`).subscribe({
      next: (data) => {
        this.schedule.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.schedule.set(null);
        this.loading.set(false);
      },
    });
  }

  allocationAt(day: number, period: TimetablePeriod): TeacherAllocationRow | undefined {
    const dayEnum = TIMETABLE_DAYS.find((d) => d.value === day)?.enum;
    if (!dayEnum) return undefined;
    return this.allocations().find(
      (a) =>
        a.dayOfWeek === dayEnum &&
        a.startTime === period.startTime &&
        a.endTime === period.endTime,
    );
  }

  dayLabel = dayLabelFromEnum;
  dayShort = dayShortFromEnum;
  classLabel = classLabelFromAllocation;

  subjectName(row: TeacherAllocationRow): string {
    return row.subject?.name || 'Subject';
  }

  subjectShortLabel(row: TeacherAllocationRow): string {
    return timetableSubjectShort(row.subject?.code, this.subjectName(row), row.subject?.short);
  }

  classShort(row: TeacherAllocationRow): string {
    return compactClassGridLabel(row.schoolClass?.name || classLabelFromAllocation(row));
  }
}
