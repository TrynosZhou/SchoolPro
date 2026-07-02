import { NavSection } from '../../shared/portal-layout/portal-layout.component';

/** Grouped sidebar navigation for all Admin Portal pages. */
export const ADMIN_NAV_SECTIONS: NavSection[] = [
  {
    heading: 'Dashboard',
    items: [],
    path: '/admin',
  },
  {
    heading: 'All Students',
    items: [
      { label: 'Students', path: '/admin/students', icon: '👥' },
      { label: 'Enrolment', path: '/admin/enrollment', icon: '🎓' },
      { label: 'Class List', path: '/admin/class-list', icon: '📋' },
      { label: 'Class Promotion', path: '/admin/class-promotion', icon: '⬆' },
    ],
  },
  {
    heading: 'All Parents',
    items: [
      { label: 'All Parents', path: '/admin/parents', icon: '👨‍👩‍👧' },
    ],
  },
  {
    heading: 'Attendance',
    items: [
      { label: 'Mark Register', path: '/admin/attendance/mark-register', icon: '☑' },
      { label: 'Attendance Report', path: '/admin/attendance/report', icon: '📊' },
    ],
  },
  {
    heading: 'All Teachers',
    items: [
      { label: 'Staff Directory', path: '/admin/staff', icon: '🧑' },
      { label: 'Staff Attendance', path: '/admin/staff', icon: '🗂' },
      { label: 'Payroll', path: '/admin/payroll', icon: '💰' },
    ],
  },
  {
    heading: 'Examinations',
    items: [
      { label: 'Record Marks', path: '/admin/exams', icon: '📝' },
      { label: 'Report Cards', path: '/admin/report-cards', icon: '📄' },
      { label: 'Mark Sheet', path: '/admin/mark-sheet', icon: '📑' },
      { label: 'Results Analysis', path: '/admin/results-analysis', icon: '📈' },
      { label: 'Ranking', path: '/admin/ranking', icon: '🏆' },
    ],
  },
  {
    heading: 'Finance',
    items: [
      { label: 'Billing', path: '/admin/billing', icon: '🧾' },
      { label: 'Payment', path: '/admin/payment', icon: '💳' },
      { label: 'Manage Fees', path: '/admin/manage-fees', icon: '💵' },
      { label: 'Student Balance', path: '/admin/student-balance', icon: '🧮' },
      { label: 'Exemption', path: '/admin/exemptions', icon: '🎫' },
      { label: 'Financial Books', path: '/admin/finance', icon: '📚' },
    ],
  },
  {
    heading: 'Fin. Reports',
    items: [
      { label: 'Student Ledger', path: '/admin/fin-reports/student-ledger', icon: '📒' },
      { label: 'Outstanding Invoices', path: '/admin/fin-reports/outstanding-invoices', icon: '🧾' },
      { label: 'Student Reconciliation', path: '/admin/fin-reports/student-reconciliation', icon: '⚖' },
      { label: 'Debtor Aging', path: '/admin/fin-reports/debtor-aging', icon: '⏳' },
      { label: 'Fee Collection & Revenue', path: '/admin/fin-reports/fee-collection-revenue', icon: '📉' },
      { label: 'General Ledger', path: '/admin/fin-reports/general-ledger', icon: '📗' },
    ],
  },
  {
    heading: 'Communication',
    items: [
      { label: 'Announcements', path: '/admin/communication/send', icon: '✉' },
      { label: 'Messages', path: '/admin/communication/inbox', icon: '📥' },
    ],
  },
  {
    heading: 'Timetable',
    items: [
      { label: 'Configure Periods', path: '/admin/timetable/configure-periods', icon: '⏱' },
      { label: 'Generate Timetable', path: '/admin/timetable/generate', icon: '📅' },
      { label: 'View Timetable', path: '/admin/timetable/view', icon: '👁' },
      { label: 'Teacher Schedule', path: '/admin/timetable/teacher-schedule', icon: '👨‍🏫' },
    ],
  },
  {
    heading: 'System Admin',
    items: [
      { label: 'School Settings', path: '/admin/settings', icon: '⚙' },
      { label: 'Academic Settings', path: '/admin/academic-settings', icon: '🧭' },
      { label: 'User Management', path: '/admin/user-management', icon: '👤' },
      { label: 'User Permissions', path: '/admin/user-permissions', icon: '🔐' },
      { label: 'Integrations', path: '/admin/integrations', icon: '🔌' },
    ],
  },
];
