import { NavSection } from '../../shared/portal-layout/portal-layout.component';

/** Grouped sidebar navigation for Teacher Portal pages. */
export const TEACHER_NAV_SECTIONS: NavSection[] = [
  {
    heading: 'Overview',
    items: [{ label: 'Dashboard', path: '/teacher', icon: '🏠' }],
  },
  {
    heading: 'Students',
    items: [
      { label: 'Class List', path: '/teacher/class-list', icon: '📋' },
      { label: 'Class Enrollment', path: '/teacher/enrollment', icon: '🎓' },
    ],
  },
  {
    heading: 'Attendance',
    items: [
      { label: 'Mark Register', path: '/teacher/attendance/mark-register', icon: '✅' },
      { label: 'Attendance Report', path: '/teacher/attendance/report', icon: '📊' },
    ],
  },
  {
    heading: 'Academics',
    items: [
      { label: 'Exam Marks', path: '/teacher/exams', icon: '📝' },
      { label: 'Report Cards', path: '/teacher/report-cards', icon: '📄' },
    ],
  },
  {
    heading: 'Communication',
    items: [
      { label: 'Messages', path: '/teacher/messages', icon: '💬' },
      { label: 'Notifications', path: '/teacher/notifications', icon: '🔔' },
    ],
  },
];
