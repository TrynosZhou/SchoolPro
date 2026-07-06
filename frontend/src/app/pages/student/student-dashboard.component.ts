import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { STUDENT_NAV_ITEMS } from '../../core/config/student-nav';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { formatStudentClassLabel } from '../../core/utils/class-display';
import { changePasswordDashboardLink } from '../../core/utils/change-password-route.util';

interface StudentDashboardData {
  student: {
    id: string;
    admissionNumber?: string;
    firstName: string;
    lastName: string;
    className?: string;
    formName?: string;
  } | null;
  currentTerm: { id: string; name: string } | null;
  balanceOwed: number;
  attendance: { status: string; count: string }[];
  recentAssessments: {
    id: string;
    topic: string;
    score?: number;
    maxScore?: number;
    weekStart: string;
    subjectName?: string;
  }[];
  recentSchedules: {
    id: string;
    weekStart: string;
    topic?: string;
    homework?: string;
    subjectName?: string;
    subjectCode?: string;
  }[];
  unreadMessages: number;
}

@Component({
  selector: 'app-student-dashboard',
  standalone: true,
  imports: [PortalLayoutComponent, RouterLink, DecimalPipe],
  templateUrl: './student-dashboard.component.html',
  styleUrl: './student-dashboard.component.scss',
})
export class StudentDashboardComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);

  readonly nav = STUDENT_NAV_ITEMS;

  data = signal<StudentDashboardData | null>(null);
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

  readonly studentName = computed(() => {
    const s = this.data()?.student;
    if (s) return `${s.firstName} ${s.lastName}`.trim();
    const u = this.auth.user();
    return u ? `${u.firstName} ${u.lastName}`.trim() : 'Student';
  });

  readonly classLabel = computed(() => {
    const s = this.data()?.student;
    if (!s) return '';
    return formatStudentClassLabel(s.className);
  });

  readonly attendancePercent = computed(() => {
    const rows = this.data()?.attendance ?? [];
    const present = Number(rows.find((r) => r.status === 'present')?.count || 0);
    const total = rows.reduce((sum, r) => sum + Number(r.count || 0), 0);
    if (!total) return null;
    return Math.round((present / total) * 100);
  });

  readonly statCards = computed(() => {
    const d = this.data();
    const pct = this.attendancePercent();
    return [
      {
        key: 'balance',
        title: 'Fees balance',
        value: d ? String(d.balanceOwed) : '—',
        caption: 'Outstanding on your account',
        icon: '💳',
        tone: 'amber',
        link: '/student/finance',
      },
      {
        key: 'attendance',
        title: 'Attendance',
        value: pct !== null ? `${pct}%` : '—',
        caption: 'Present in the last 30 days',
        icon: '📋',
        tone: 'teal',
        link: '/student/attendance',
      },
      {
        key: 'homework',
        title: 'Assignments',
        value: String(d?.recentAssessments?.length ?? 0),
        caption: 'Recent weekly assessments',
        icon: '📝',
        tone: 'indigo',
        link: '/student/homework',
      },
      {
        key: 'messages',
        title: 'Messages',
        value: String(d?.unreadMessages ?? 0),
        caption: 'Unread inbox items',
        icon: '💬',
        tone: 'blue',
        link: '/student/messages',
      },
    ];
  });

  readonly studentNav = STUDENT_NAV_ITEMS;
  readonly changePasswordLink = changePasswordDashboardLink('student');

  readonly quickLinks = [
    { title: 'Report cards', text: 'View term results and exam reports', icon: '📄', path: '/student/report-cards' },
    { title: 'Fees & invoices', text: 'Statement of account and receipts', icon: '💳', path: '/student/finance' },
    { title: 'Homework', text: 'Weekly tasks and learning schedules', icon: '📝', path: '/student/homework' },
    { title: 'Attendance', text: 'Your term attendance record', icon: '📋', path: '/student/attendance' },
    {
      title: this.changePasswordLink.label,
      text: 'Update your portal login password',
      icon: this.changePasswordLink.icon,
      path: this.changePasswordLink.path,
    },
  ];

  ngOnInit() {
    this.api.get<StudentDashboardData>('/dashboard/student').subscribe({
      next: (d) => {
        this.data.set(d);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  formatWeek(dateStr: string): string {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
}
