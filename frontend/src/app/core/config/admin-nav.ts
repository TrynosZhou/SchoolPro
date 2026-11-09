import { NavSection } from '../../shared/portal-layout/portal-layout.component';

/**
 * Grouped sidebar navigation for all Admin Portal pages.
 * Each section is a major menu; its `items` are the sub-menus shown underneath.
 */
export const ADMIN_NAV_SECTIONS: NavSection[] = [
  // MAIN — overview, people and school structure
  { heading: 'Dashboard', path: '/admin', items: [] },
  {
    heading: 'Students',
    items: [
      { label: 'All Students', path: '/admin/students' },
      { label: 'Admissions', path: '/admin/admissions' },
      { label: 'Enrolment', path: '/admin/enrollment' },
      { label: 'Class Promotion', path: '/admin/class-promotion' },
    ],
  },
  { heading: 'Parents', path: '/admin/parents', items: [] },
  {
    heading: 'Staff',
    items: [
      { label: 'Staff Directory', path: '/admin/staff' },
      { label: 'Payroll', path: '/admin/payroll' },
      { label: 'Leave Requests', path: '/admin/staff-attendance' },
    ],
  },

  // ACADEMICS — teaching and learning
  {
    heading: 'Academics',
    items: [
      { label: 'Class List', path: '/admin/class-list' },
      { label: 'Subjects', path: '/admin/academic-settings' },
    ],
  },
  {
    heading: 'Attendance',
    items: [
      { label: 'Mark Register', path: '/admin/attendance/mark-register' },
      { label: 'Attendance Report', path: '/admin/attendance/report' },
    ],
  },
  {
    heading: 'Examinations',
    items: [
      { label: 'Input Marks', path: '/admin/exams' },
      { label: 'Report Cards', path: '/admin/report-cards' },
      { label: 'Mark Sheet', path: '/admin/mark-sheet' },
      { label: 'Results Analysis', path: '/admin/results-analysis' },
      { label: 'Ranking', path: '/admin/ranking' },
      { label: 'Mark Entry Progress', path: '/admin/mark-entry-progress' },
    ],
  },
  {
    heading: 'Timetable',
    items: [
      { label: 'View Timetable', path: '/admin/timetable/view' },
      { label: 'Class Assignments', path: '/admin/class-assignments' },
    ],
  },
  {
    heading: 'Learning',
    items: [
      { label: 'LMS', path: '/admin/lms' },
      { label: 'Library', path: '/admin/library' },
    ],
  },

  // ADMINISTRATION — finance and communication
  {
    heading: 'Finance',
    items: [
      { label: 'Billing', path: '/admin/billing' },
      { label: 'Payment', path: '/admin/payment' },
      { label: 'Manage Fees', path: '/admin/manage-fees' },
      { label: 'Student Balance', path: '/admin/student-balance' },
      { label: 'Exemptions', path: '/admin/exemptions' },
      { label: 'Financial Books', path: '/admin/finance' },
    ],
  },
  {
    heading: 'Fin. Reports',
    items: [
      { label: 'Student Ledger', path: '/admin/fin-reports/student-ledger' },
      { label: 'Outstanding Invoices', path: '/admin/fin-reports/outstanding-invoices' },
      { label: 'Reconciliation', path: '/admin/fin-reports/student-reconciliation' },
      { label: 'Debtor Aging', path: '/admin/fin-reports/debtor-aging' },
      { label: 'Fee Collection', path: '/admin/fin-reports/fee-collection-revenue' },
      { label: 'General Ledger', path: '/admin/fin-reports/general-ledger' },
    ],
  },
  {
    heading: 'Communication',
    items: [
      { label: 'Announcements', path: '/admin/communication/send' },
      { label: 'Messages', path: '/admin/communication/inbox' },
      { label: 'Bulk SMS / Email', path: '/admin/communication/bulk' },
      { label: 'Notices', path: '/admin/communication/notifications' },
      { label: 'Notification Settings', path: '/admin/communication/notification-settings' },
    ],
  },

  // SYSTEM — analytics and configuration
  {
    heading: 'Analytics & Reporting',
    items: [
      { label: 'Demographics', path: '/admin/analytics/demographics' },
      { label: 'Report Builder', path: '/admin/analytics/report-builder' },
    ],
  },
  {
    heading: 'System Admin',
    items: [
      { label: 'School Settings', path: '/admin/settings' },
      { label: 'User Management', path: '/admin/user-management' },
      { label: 'User Permissions', path: '/admin/user-permissions' },
      { label: 'Integrations', path: '/admin/integrations' },
      { label: 'Audit Trail', path: '/admin/audit-trail' },
    ],
  },
];
