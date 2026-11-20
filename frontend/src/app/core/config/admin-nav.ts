import { NavSection } from '../../shared/portal-layout/portal-layout.component';

/**
 * Grouped sidebar navigation for all Admin Portal pages.
 * Each section is a major menu; its `items` are the sub-menus shown underneath.
 *
 * Ten major menus, arranged in four sidebar groups (see PortalLayoutComponent.sectionGroup):
 *   MAIN            Dashboard · Students and parents · Staff and HR
 *   ACADEMICS       Academics · Examinations
 *   ADMINISTRATION  Finance · Communication · Student welfare · Campus operations
 *   SYSTEM          Reports and system
 */
export const ADMIN_NAV_SECTIONS: NavSection[] = [
  // MAIN — overview and people
  { heading: 'Dashboard', path: '/admin', items: [] },
  {
    heading: 'Students and parents',
    items: [
      { label: 'All Students', path: '/admin/students' },
      { label: 'Admissions', path: '/admin/admissions' },
      { label: 'Enrolment', path: '/admin/enrollment' },
      { label: 'Class Promotion', path: '/admin/class-promotion' },
      { label: 'Parent Directory', path: '/admin/parents' },
      { label: 'Portal Accounts', path: '/admin/parent-accounts' },
      { label: 'Family Links', path: '/admin/family-links' },
      { label: 'Alumni', path: '/admin/alumni' },
    ],
  },
  {
    heading: 'Staff and HR',
    items: [
      { label: 'Staff Directory', path: '/admin/staff' },
      { label: 'Payroll', path: '/admin/payroll' },
      { label: 'Staff Attendance', path: '/admin/staff-attendance' },
      { label: 'Leave Requests', path: '/admin/leave-requests' },
      { label: 'Staff HR', path: '/admin/hr' },
    ],
  },

  // ACADEMICS — teaching, learning and assessment
  {
    heading: 'Academics',
    items: [
      { label: 'Class List', path: '/admin/class-list' },
      { label: 'Subjects', path: '/admin/academic-settings', queryParams: { tab: 'subjects' } },
      { label: 'Mark Register', path: '/admin/attendance/mark-register' },
      { label: 'Attendance Report', path: '/admin/attendance/report' },
      { label: 'View Timetable', path: '/admin/timetable/view' },
      { label: 'Class Assignments', path: '/admin/class-assignments' },
      { label: 'Manual Generate', path: '/admin/timetable/manual-entry' },
      { label: 'Rooms', path: '/admin/timetable/rooms' },
      { label: 'LMS', path: '/admin/lms' },
      { label: 'Library (digital)', path: '/admin/library' },
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

  // ADMINISTRATION — money, communication, welfare and campus
  {
    heading: 'Finance',
    items: [
      { label: 'Billing', path: '/admin/billing' },
      { label: 'Payment', path: '/admin/payment' },
      { label: 'Manage Fees', path: '/admin/manage-fees' },
      { label: 'Student Balance', path: '/admin/student-balance' },
      { label: 'Exemptions', path: '/admin/exemptions' },
      { label: 'Financial Books', path: '/admin/finance' },
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
      { label: 'Meetings', path: '/admin/meetings' },
      { label: 'Consent Forms', path: '/admin/consents' },
      { label: 'Surveys', path: '/admin/surveys' },
    ],
  },
  {
    heading: 'Student welfare',
    items: [
      { label: 'Discipline & Health', path: '/admin/welfare' },
      { label: 'Early Warning', path: '/admin/early-warning' },
      { label: 'Co-Curricular', path: '/admin/activities' },
      { label: 'Boarding & Hostel', path: '/admin/hostel' },
      { label: 'Transport', path: '/admin/transport' },
    ],
  },
  {
    heading: 'Campus operations',
    items: [
      { label: 'Calendar & Events', path: '/admin/calendar' },
      { label: 'Gate & Visitors', path: '/admin/gate' },
      { label: 'Library (physical)', path: '/admin/physical-library' },
      { label: 'Inventory & Assets', path: '/admin/inventory' },
      { label: 'ID Cards & QR', path: '/admin/id-cards' },
      { label: 'Certificates & Letters', path: '/admin/documents' },
    ],
  },

  // SYSTEM — analytics and configuration
  {
    heading: 'Reports and system',
    items: [
      { label: 'Demographics', path: '/admin/analytics/demographics' },
      { label: 'Report Builder', path: '/admin/analytics/report-builder' },
      { label: 'School Settings', path: '/admin/settings' },
      { label: 'Academic Settings', path: '/admin/academic-settings' },
      { label: 'User Management', path: '/admin/user-management' },
      { label: 'User Permissions', path: '/admin/user-permissions' },
      { label: 'Integrations', path: '/admin/integrations' },
      { label: 'Audit Trail', path: '/admin/audit-trail' },
    ],
  },
];
