import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { buildTeacherNavSections } from '../../core/config/teacher-nav';
import { AuthService } from '../../core/services/auth.service';
import { ApiService } from '../../core/services/api.service';
import { formatStudentClassLabel, formatTitledFullName } from '../../core/utils/class-display';
import { changePasswordDashboardLink } from '../../core/utils/change-password-route.util';

interface TeacherAssignment {
  id: string;
  classId: string;
  className: string;
  formName: string;
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
  loading = signal(true);

  readonly todayLabel = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date());

  readonly greeting = computed(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
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
        icon: '🏫',
        tone: 'teal',
      },
      {
        key: 'subjects',
        title: 'Subjects',
        value: String(s?.subjectsTeaching ?? 0),
        caption: 'Active teaching assignments',
        icon: '📚',
        tone: 'indigo',
      },
      {
        key: 'students',
        title: 'Students',
        value: String(s?.totalStudents ?? 0),
        caption: 'Learners across your classes',
        icon: '👥',
        tone: 'blue',
      },
      {
        key: 'messages',
        title: 'Messages',
        value: String(s?.unreadMessages ?? 0),
        caption: 'Unread inbox items',
        icon: '💬',
        tone: 'amber',
      },
    ];
  });

  readonly attendanceTotal = computed(() =>
    (this.data()?.attendanceToday ?? []).reduce((sum, row) => sum + Number(row.count || 0), 0),
  );

  readonly attendancePendingClasses = computed(() =>
    (this.data()?.classTeacherOf ?? []).filter((c) => !c.attendanceMarkedToday),
  );

  readonly groupedAssignments = computed(() => {
    const map = new Map<string, { classId: string; classLabel: string; subjects: TeacherAssignment[]; studentCount: number; isClassTeacher: boolean }>();
    for (const a of this.data()?.assignments ?? []) {
      const key = a.classId;
      const classLabel = formatStudentClassLabel(a.className);
      if (!map.has(key)) {
        map.set(key, {
          classId: a.classId,
          classLabel,
          subjects: [],
          studentCount: a.studentCount,
          isClassTeacher: a.isClassTeacher,
        });
      }
      const group = map.get(key)!;
      group.subjects.push(a);
      group.isClassTeacher = group.isClassTeacher || a.isClassTeacher;
    }
    return [...map.values()];
  });

  readonly actionGroups = [
    {
      title: 'Students',
      links: [
        { label: 'Class List', path: '/teacher/class-list', icon: '📋', permission: 'students.view' },
        { label: 'Class Enrollment', path: '/teacher/enrollment', icon: '🎓', permission: 'enrollment.manage' },
      ],
    },
    {
      title: 'Attendance',
      links: [
        { label: 'Mark Register', path: '/teacher/attendance/mark-register', icon: '✅', permission: 'attendance.mark' },
        { label: 'Attendance Report', path: '/teacher/attendance/report', icon: '📊', permission: 'attendance.report' },
      ],
    },
    {
      title: 'Examinations',
      links: [
        { label: 'Input Marks', path: '/teacher/exams', icon: '📝', permission: 'academics.exams' },
        { label: 'Report Cards', path: '/teacher/report-cards', icon: '📄', permission: 'academics.report_cards' },
        { label: 'Mark Sheet', path: '/teacher/mark-sheet', icon: '📑', permission: 'academics.mark_sheet' },
        { label: 'Results Analysis', path: '/teacher/results-analysis', icon: '📈', permission: 'academics.results' },
        { label: 'Ranking', path: '/teacher/ranking', icon: '🏆', permission: 'academics.ranking' },
        { label: 'Mark Entry Progress', path: '/teacher/mark-entry-progress', icon: '📊', permission: 'academics.exams' },
      ],
    },
    {
      title: 'Academics',
      links: [
        { label: 'Record Book', path: '/teacher/record-book', icon: '📒', permission: 'academics.exams' },
        { label: 'Assignments', path: '/teacher/assignments', icon: '📤', permission: 'academics.exams' },
      ],
    },
    {
      title: 'Account',
      links: [{ ...changePasswordDashboardLink('teacher'), permission: undefined }],
    },
  ];

  readonly visibleActionGroups = computed(() => {
    const granted = new Set(this.auth.user()?.permissions ?? []);
    const isClassTeacher = (this.data()?.classTeacherOf?.length ?? 0) > 0;
    const allowed = (permission?: string) => !permission || granted.has(permission);
    return this.actionGroups
      .map((group) => ({
        ...group,
        links: group.links.filter((link) => {
          if (link.path === '/teacher/attendance/mark-register' && !isClassTeacher) return false;
          if (link.path === '/teacher/enrollment' && !isClassTeacher) return false;
          return allowed(link.permission);
        }),
      }))
      .filter((group) => group.links.length > 0);
  });

  ngOnInit() {
    this.api.get<{ gender?: string | null }>('/auth/me').subscribe({
      next: (profile) => {
        if (profile.gender != null) {
          this.auth.patchUser({ gender: profile.gender });
        }
      },
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

  formatTime(value: string): string {
    if (!value) return '—';
    const [h, m] = value.split(':').map(Number);
    if (Number.isNaN(h)) return value;
    const period = h >= 12 ? 'PM' : 'AM';
    const hour = h % 12 || 12;
    return `${hour}:${String(m ?? 0).padStart(2, '0')} ${period}`;
  }
}
