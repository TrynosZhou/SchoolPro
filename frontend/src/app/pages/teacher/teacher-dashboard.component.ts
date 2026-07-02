import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { TEACHER_NAV_SECTIONS } from '../../core/config/teacher-nav';
import { ApiService } from '../../core/services/api.service';
import { formatStudentClassLabel } from '../../core/utils/class-display';
import { AuthService } from '../../core/services/auth.service';

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

  readonly teacherNav = TEACHER_NAV_SECTIONS;

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
    return u ? `${u.firstName} ${u.lastName}`.trim() : 'Teacher';
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
        { label: 'Class List', path: '/teacher/class-list', icon: '📋' },
        { label: 'Class Enrollment', path: '/teacher/enrollment', icon: '🎓' },
      ],
    },
    {
      title: 'Attendance',
      links: [
        { label: 'Mark Register', path: '/teacher/attendance/mark-register', icon: '✅' },
        { label: 'Attendance Report', path: '/teacher/attendance/report', icon: '📊' },
      ],
    },
    {
      title: 'Academics',
      links: [
        { label: 'Exam Marks', path: '/teacher/exams', icon: '📝' },
        { label: 'Report Cards', path: '/teacher/report-cards', icon: '📄' },
      ],
    },
  ];

  ngOnInit() {
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
