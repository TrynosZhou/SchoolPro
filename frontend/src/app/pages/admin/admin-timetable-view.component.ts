import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';
import { TimetablePeriodsService } from '../../core/services/timetable-periods.service';

interface ClassRow { id: string; name: string; form?: { name: string }; }
interface TimetableEntry {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room?: string;
  subject?: { name: string };
  teacher?: { user?: { firstName: string; lastName: string } };
}

const DAY_LABELS: Record<number, string> = {
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
  7: 'Sunday',
};

@Component({
  selector: 'app-admin-timetable-view',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, RouterLink],
  templateUrl: './admin-timetable-view.component.html',
  styleUrl: './admin-timetable-periods.component.scss',
})
export class AdminTimetableViewComponent implements OnInit {
  private api = inject(ApiService);
  private periodsSvc = inject(TimetablePeriodsService);
  readonly adminNav = ADMIN_NAV_SECTIONS;
  readonly dayLabels = DAY_LABELS;

  classes = signal<ClassRow[]>([]);
  entries = signal<TimetableEntry[]>([]);
  loading = signal(false);
  classId = '';

  ngOnInit() {
    this.periodsSvc.load();
    this.api.get<ClassRow[]>('/admin/classes').subscribe({ next: (rows) => this.classes.set(rows) });
  }

  loadTimetable() {
    if (!this.classId) return;
    this.loading.set(true);
    this.api.get<TimetableEntry[]>('/academics/timetable', { classId: this.classId }).subscribe({
      next: (rows) => {
        this.entries.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.entries.set([]);
        this.loading.set(false);
      },
    });
  }

  entriesForDay(day: number): TimetableEntry[] {
    return this.entries()
      .filter((e) => e.dayOfWeek === day)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }

  teacherName(e: TimetableEntry): string {
    const u = e.teacher?.user;
    return u ? `${u.firstName} ${u.lastName}` : '—';
  }
}
