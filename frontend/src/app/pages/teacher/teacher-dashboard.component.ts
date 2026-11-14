import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { buildTeacherNavSections } from '../../core/config/teacher-nav';
import { AuthService } from '../../core/services/auth.service';
import { ApiService } from '../../core/services/api.service';
import { formatStudentClassLabel, formatTitledFullName } from '../../core/utils/class-display';
import { isSchoolDay } from '../../core/utils/school-day.util';

interface TeacherAssignment {
  id: string;
  classId: string;
  className: string;
  formName: string;
  formLevel?: number;
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  studentCount: number;
  isClassTeacher: boolean;
}

interface ClassTeacherRow {
  classId: string;
  className: string;
  formName: string;
  formLevel?: number;
  studentCount: number;
  attendanceMarkedToday: boolean;
}

interface ScheduleSlot {
  id: string;
  startTime: string;
  endTime: string;
  room?: string;
  className: string;
  formName: string;
  subjectName: string;
}

interface TeacherDashboardData {
  staffId: string | null;
  currentTerm: { id: string; name: string } | null;
  stats: {
    assignedClasses: number;
    subjectsTeaching: number;
    totalStudents: number;
    unreadMessages: number;
  };
  assignments: TeacherAssignment[];
  classTeacherOf: ClassTeacherRow[];
  attendanceToday: { status: string; count: number }[];
  todaySchedule: ScheduleSlot[];
}

interface ClassSubjectRow {
  id: string;
  subjectName: string;
  subjectCode: string;
}

interface TeacherClassGroup {
  classId: string;
  className: string;
  classLabel: string;
  formName: string;
  formLevel: number;
  studentCount: number;
  isClassTeacher: boolean;
  attendanceMarkedToday: boolean;
  subjects: ClassSubjectRow[];
}

interface FormClassSection {
  formName: string;
  formLevel: number;
  classes: TeacherClassGroup[];
}

function parseFormLevel(formName: string, explicit?: number): number {
  if (explicit != null && Number.isFinite(explicit)) return Number(explicit);
  const match = String(formName || '').match(/(\d+)/);
  return match ? Number(match[1]) : 99;
}

function compareClassGroups(a: TeacherClassGroup, b: TeacherClassGroup): number {
  if (a.isClassTeacher !== b.isClassTeacher) return a.isClassTeacher ? -1 : 1;
  if (a.formLevel !== b.formLevel) return a.formLevel - b.formLevel;
  return a.className.localeCompare(b.className, undefined, { numeric: true, sensitivity: 'base' });
}

@Component({
  selector: 'app-teacher-dashboard',
  standalone: true,
  imports: [PortalLayoutComponent, RouterLink],
  templateUrl: './teacher-dashboard.component.html',
  styleUrl: './teacher-dashboard.component.scss',
})
export class TeacherDashboardComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);

  get teacherNav() {
    return buildTeacherNavSections(this.auth.user()?.permissions);
  }

  data = signal<TeacherDashboardData | null>(null);
  readonly schoolName = signal('School Pro');
  loading = signal(true);

  readonly todayLabel = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date());

  readonly greetingPeriod = computed(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'morning';
    if (hour < 17) return 'afternoon';
    return 'evening';
  });

  readonly teacherName = computed(() => {
    const u = this.auth.user();
    if (!u) return 'Teacher';
    const titled = formatTitledFullName(u.firstName, u.lastName, u.gender);
    return titled || 'Teacher';
  });

  readonly statCards = computed(() => {
    const s = this.data()?.stats;
    return [
      {
        key: 'classes',
        title: 'Classes',
        value: String(s?.assignedClasses ?? 0),
        caption: 'Classes you teach or lead',
        tone: 'lavender',
        path: '/teacher/class-list',
      },
      {
        key: 'subjects',
        title: 'Subjects',
        value: String(s?.subjectsTeaching ?? 0),
        caption: 'Active teaching assignments',
        tone: 'mint',
        path: '/teacher/exams',
      },
      {
        key: 'students',
        title: 'Students',
        value: String(s?.totalStudents ?? 0),
        caption: 'Learners across your classes',
        tone: 'sky',
        path: '/teacher/class-list',
      },
      {
        key: 'messages',
        title: 'Messages',
        value: String(s?.unreadMessages ?? 0),
        caption: 'Unread inbox items',
        tone: 'peach',
        path: '/teacher/messages',
      },
    ];
  });

  readonly attendanceTotal = computed(() =>
    (this.data()?.attendanceToday ?? []).reduce((sum, row) => sum + Number(row.count || 0), 0),
  );

  readonly attendance = computed(() => {
    const rows = this.data()?.attendanceToday ?? [];
    const sum = (match: string) =>
      rows.filter((r) => r.status.toLowerCase().includes(match)).reduce((n, r) => n + Number(r.count || 0), 0);
    const total = rows.reduce((n, r) => n + Number(r.count || 0), 0);
    const present = sum('present');
    const late = sum('late');
    const absent = sum('absent');
    const pct = (n: number) => (total ? Math.round((n / total) * 1000) / 10 : 0);
    return {
      total,
      present,
      late,
      absent,
      presentPct: pct(present),
      latePct: pct(late),
      absentPct: pct(absent),
      rate: total ? Math.round((present / total) * 100) : null,
    };
  });

  readonly classBars = computed(() => {
    const groups = this.classGroups();
    const max = Math.max(1, ...groups.map((g) => g.studentCount));
    return groups.slice(0, 8).map((g) => ({
      classId: g.classId,
      label: g.classLabel,
      students: g.studentCount,
      pct: Math.round((g.studentCount / max) * 100),
    }));
  });

  readonly attendanceLessSummary = computed(() => {
    const n = this.classGroups().length;
    return `${n} class${n === 1 ? '' : 'es'} you teach or lead`;
  });

  /** Registers are not marked on weekends, so no reminder is shown on Saturday or Sunday. */
  readonly attendancePendingClasses = computed(() => {
    if (!isSchoolDay(new Date().toLocaleDateString('en-CA'))) return [];
    return (this.data()?.classTeacherOf ?? []).filter((c) => !c.attendanceMarkedToday);
  });

  /** Unified class list: subject assignments + homeroom-only classes, sorted by form. */
  readonly classGroups = computed((): TeacherClassGroup[] => {
    const d = this.data();
    const map = new Map<string, TeacherClassGroup>();
    const homeroomByClass = new Map(
      (d?.classTeacherOf ?? []).map((c) => [c.classId, c]),
    );

    for (const a of d?.assignments ?? []) {
      if (!map.has(a.classId)) {
        const homeroom = homeroomByClass.get(a.classId);
        map.set(a.classId, {
          classId: a.classId,
          className: a.className,
          classLabel: formatStudentClassLabel(a.className),
          formName: a.formName || '—',
          formLevel: parseFormLevel(a.formName, a.formLevel),
          studentCount: a.studentCount,
          isClassTeacher: Boolean(a.isClassTeacher),
          attendanceMarkedToday: homeroom?.attendanceMarkedToday ?? false,
          subjects: [],
        });
      }
      const group = map.get(a.classId)!;
      group.subjects.push({
        id: a.id,
        subjectName: a.subjectName,
        subjectCode: a.subjectCode,
      });
      group.isClassTeacher = group.isClassTeacher || a.isClassTeacher;
      group.studentCount = Math.max(group.studentCount, a.studentCount);
    }

    for (const c of d?.classTeacherOf ?? []) {
      if (!map.has(c.classId)) {
        map.set(c.classId, {
          classId: c.classId,
          className: c.className,
          classLabel: formatStudentClassLabel(c.className),
          formName: c.formName || '—',
          formLevel: parseFormLevel(c.formName, c.formLevel),
          studentCount: c.studentCount,
          isClassTeacher: true,
          attendanceMarkedToday: c.attendanceMarkedToday,
          subjects: [],
        });
      } else {
        const group = map.get(c.classId)!;
        group.isClassTeacher = true;
        group.attendanceMarkedToday = c.attendanceMarkedToday;
        group.studentCount = Math.max(group.studentCount, c.studentCount);
      }
    }

    const groups = [...map.values()];
    for (const g of groups) {
      g.subjects.sort((x, y) =>
        x.subjectName.localeCompare(y.subjectName, undefined, { sensitivity: 'base' }),
      );
    }
    return groups.sort(compareClassGroups);
  });

  readonly homeroomClasses = computed(() =>
    this.classGroups().filter((g) => g.isClassTeacher),
  );

  readonly subjectFormSections = computed((): FormClassSection[] => {
    const sectionMap = new Map<string, TeacherClassGroup[]>();
    for (const group of this.classGroups()) {
      if (group.isClassTeacher) continue;
      const key = group.formName?.trim() || 'Other';
      if (!sectionMap.has(key)) sectionMap.set(key, []);
      sectionMap.get(key)!.push(group);
    }
    return [...sectionMap.entries()]
      .map(([formName, classes]) => ({
        formName,
        formLevel: classes[0]?.formLevel ?? 99,
        classes: [...classes].sort(compareClassGroups),
      }))
      .sort(
        (a, b) =>
          a.formLevel - b.formLevel ||
          a.formName.localeCompare(b.formName, undefined, { numeric: true }),
      );
  });

  /** Dashboard quick-link cards: identical to the sidebar menus (same source, same filtering). */
  readonly visibleActionGroups = computed(() =>
    buildTeacherNavSections(this.auth.user()?.permissions)
      .filter((section) => section.items.length > 0)
      .map((section) => ({ title: section.heading, links: section.items })),
  );

  ngOnInit() {
    this.api.get<{ gender?: string | null; permissions?: string[] }>('/auth/me').subscribe({
      next: (profile) => {
        if (profile.gender != null) {
          this.auth.patchUser({ gender: profile.gender });
        }
        if (Array.isArray(profile.permissions)) {
          this.auth.patchUser({ permissions: profile.permissions });
        }
      },
    });

    this.api.get<{ schoolName: string | null }>('/dashboard/school-links').subscribe({
      next: (d) => {
        if (d?.schoolName) this.schoolName.set(d.schoolName);
      },
      error: () => {},
    });

    this.api.get<TeacherDashboardData>('/dashboard/teacher').subscribe({
      next: (d) => {
        this.data.set(d);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  classLabel(row: ClassTeacherRow | TeacherAssignment | ScheduleSlot): string {
    return formatStudentClassLabel(row.className);
  }

  attendanceTone(status: string): string {
    const s = status.toLowerCase();
    if (s.includes('present')) return 'present';
    if (s.includes('absent')) return 'absent';
    if (s.includes('late')) return 'late';
    if (s.includes('excus')) return 'excused';
    return '';
  }

  isNow(slot: ScheduleSlot): boolean {
    const toMin = (v: string) => {
      const [h, m] = (v || '').split(':').map(Number);
      return Number.isNaN(h) ? NaN : h * 60 + (m || 0);
    };
    const now = new Date();
    const cur = now.getHours() * 60 + now.getMinutes();
    return cur >= toMin(slot.startTime) && cur < toMin(slot.endTime);
  }

  formatTime(value: string): string {
    if (!value) return '—';
    const [h, m] = value.split(':').map(Number);
    if (Number.isNaN(h)) return value;
    const period = h >= 12 ? 'PM' : 'AM';
    const hour = h % 12 || 12;
    return `${hour}:${String(m ?? 0).padStart(2, '0')} ${period}`;
  }
}
