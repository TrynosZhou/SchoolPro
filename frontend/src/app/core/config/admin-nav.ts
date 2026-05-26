import { NavSection } from '../../shared/portal-layout/portal-layout.component';

/** Grouped sidebar navigation for all Admin Portal pages. */
export const ADMIN_NAV_SECTIONS: NavSection[] = [
  {
    heading: 'Overview',
    items: [{ label: 'Dashboard', path: '/admin', icon: '🏠' }],
  },
  {
    heading: 'Students',
    items: [
      { label: 'Register Students', path: '/admin/students', icon: '📝' },
      { label: 'Class Enrollment', path: '/admin/enrollment', icon: '🎓' },
      { label: 'Class List', path: '/admin/class-list', icon: '📋' },
    ],
  },
  {
    heading: 'Attendance',
    items: [
      { label: 'Mark Register', path: '/admin/attendance/mark-register', icon: '✅' },
      { label: 'Attendance Report', path: '/admin/attendance/report', icon: '📊' },
    ],
  },
  {
    heading: 'Academics',
    items: [
      { label: 'Exam Marks', path: '/admin/exams', icon: '📊' },
      { label: 'Report Cards', path: '/admin/report-cards', icon: '📄' },
      { label: 'Mark Sheet', path: '/admin/mark-sheet', icon: '📑' },
      { label: 'Classes & Subjects', path: '/admin/settings', icon: '📚' },
    ],
  },
  {
    heading: 'Human Resources',
    items: [
      { label: 'Staff Directory', path: '/admin/staff', icon: '👩‍🏫' },
      { label: 'Staff Attendance', path: '/admin/staff', icon: '📋' },
    ],
  },
  {
    heading: 'Finance',
    items: [
      { label: 'Billing & Payments', path: '/admin/billing', icon: '💳' },
      { label: 'Financial Books', path: '/admin/finance', icon: '💰' },
    ],
  },
  {
    heading: 'Configuration',
    items: [{ label: 'School Settings', path: '/admin/settings', icon: '⚙️' }],
  },
];
