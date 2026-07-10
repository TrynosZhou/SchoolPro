import { NavSection } from '../../shared/portal-layout/portal-layout.component';
import { CHANGE_PASSWORD_ICON, CHANGE_PASSWORD_LABEL, CHANGE_PASSWORD_PATHS } from '../utils/change-password-route.util';

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
      { label: 'Admissions', path: '/admin/admissions', icon: '📝' },
      { label: 'Enrolment', path: '/admin/enrollment', icon: '🎓' },
      { label: 'Class List', path: '/admin/class-list', icon: '📋' },
      { label: 'Class Promotion', path: '/admin/class-promotion', icon: '⬆' },
    ],
  },
  {
    heading: 'All Parents',
    items: [
      { label: 'Parents', path: '/admin/parents', icon: '👨‍👩‍👧' },
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
      { label: 'Class Assignments', path: '/admin/class-assignments', icon: '📚' },
      { label: 'Staff Attendance', path: '/admin/staff-attendance', icon: '🗂' },
      { label: 'Payroll', path: '/admin/payroll', icon: '💰' },
    ],
  },
  {
    heading: 'Examinations',
    items: [
      { label: 'Input Marks', path: '/admin/exams', icon: '📝' },
      { label: 'Report Cards', path: '/admin/report-cards', icon: '📄' },
      { label: 'Mark Sheet', path: '/admin/mark-sheet', icon: '📑' },
      { label: 'Results Analysis', path: '/admin/results-analysis', icon: '📈' },
      { label: 'Ranking', path: '/admin/ranking', icon: '🏆' },
      { label: 'Mark Entry Progress', path: '/admin/mark-entry-progress', icon: '📊' },
    ],
  },
  {
    heading: 'Learning',
    items: [
      { label: 'LMS', path: '/admin/lms', icon: '💻' },
      { label: 'Digital Library', path: '/admin/library', icon: '📚' },
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
    heading: 'Analytics & Reporting',
    items: [
      { label: 'Demographics', path: '/admin/analytics/demographics', icon: '📊' },
      { label: 'Retention & Dropout', path: '/admin/analytics/retention', icon: '📉' },
      { label: 'Report Builder', path: '/admin/analytics/report-builder', icon: '🧩' },
    ],
  },
  {
    heading: 'Communication',
    items: [
      { label: 'Announcements', path: '/admin/communication/send', icon: '✉' },
      { label: 'Messages', path: '/admin/communication/inbox', icon: '📥' },
      { label: 'Bulk SMS / Email', path: '/admin/communication/bulk', icon: '📣' },
      { label: 'Notifications', path: '/admin/communication/notifications', icon: '🔔' },
      { label: 'Notification Settings', path: '/admin/communication/notification-settings', icon: '🔧' },
    ],
  },
  {
    heading: 'Timetable',
    items: [
      { label: 'Configure Periods', path: '/admin/timetable/configure-periods', icon: '⏱' },
      { label: 'Generate Timetable', path: '/admin/timetable/generate', icon: '📅' },
      { label: 'Teacher Schedule', path: '/admin/timetable/teacher-schedule', icon: '👨‍🏫' },
      { label: 'Class Schedule', path: '/admin/timetable/view', icon: '👁' },
    ],
  },
  {
    heading: 'System Admin',
    items: [
      { label: 'School Settings', path: '/admin/settings', icon: '⚙' },
      { label: 'Academic Settings', path: '/admin/academic-settings', icon: '🧭' },
      { label: 'User Management', path: '/admin/user-management', icon: '👤' },
      { label: CHANGE_PASSWORD_LABEL, path: CHANGE_PASSWORD_PATHS.admin, icon: CHANGE_PASSWORD_ICON },
      { label: 'User Permissions', path: '/admin/user-permissions', icon: '🔐' },
      { label: 'Audit Trail', path: '/admin/audit-trail', icon: '📜' },
      { label: 'Integrations', path: '/admin/integrations', icon: '🔌' },
    ],
  },
];
