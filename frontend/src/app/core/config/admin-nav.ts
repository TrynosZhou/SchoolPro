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
      { label: 'Class Promotion', path: '/admin/class-promotion', icon: '⬆️' },
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
      { label: 'Results Analysis', path: '/admin/results-analysis', icon: '📈' },
      { label: 'Ranking', path: '/admin/ranking', icon: '🏆' },
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
      { label: 'Manage Fees', path: '/admin/manage-fees', icon: '💵' },
      { label: 'Student Balance', path: '/admin/student-balance', icon: '🧮' },
      { label: 'Financial Books', path: '/admin/finance', icon: '💰' },
    ],
  },
  {
    heading: 'Fin.Reports',
    items: [
      { label: 'Student Ledger', path: '/admin/fin-reports/student-ledger', icon: '📒' },
      { label: 'Outstanding Invoices', path: '/admin/fin-reports/outstanding-invoices', icon: '🧾' },
      { label: 'Student Reconcilliation', path: '/admin/fin-reports/student-reconciliation', icon: '⚖️' },
      { label: 'Debtor Aging', path: '/admin/fin-reports/debtor-aging', icon: '⏳' },
      { label: 'Fee Collection & Revenue', path: '/admin/fin-reports/fee-collection-revenue', icon: '📊' },
    ],
  },
  {
    heading: 'Communication',
    items: [
      { label: 'Send Message', path: '/admin/communication/send', icon: '✉️' },
      { label: 'Inbox', path: '/admin/communication/inbox', icon: '📥' },
    ],
  },
  {
    heading: 'Timetable',
    items: [
      { label: 'Configure Periods', path: '/admin/timetable/configure-periods', icon: '⏱️' },
      { label: 'Generate Timetable', path: '/admin/timetable/generate', icon: '📅' },
      { label: 'View Timetable', path: '/admin/timetable/view', icon: '👁️' },
    ],
  },
  {
    heading: 'System Administration',
    items: [
      { label: 'School Settings', path: '/admin/settings', icon: '⚙️' },
      { label: 'Academic Settings', path: '/admin/academic-settings', icon: '📚' },
    ],
  },
];
