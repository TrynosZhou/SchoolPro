import { NavItem, NavSection } from '../../shared/portal-layout/portal-layout.component';
import { CHANGE_PASSWORD_ICON, CHANGE_PASSWORD_LABEL, CHANGE_PASSWORD_PATHS } from '../utils/change-password-route.util';

/** Grouped sidebar navigation for the Student Portal. */
export const STUDENT_NAV_SECTIONS: NavSection[] = [
  {
    heading: 'Student Dashboard',
    items: [],
    path: '/student',
  },
  {
    heading: 'Academics',
    items: [
      { label: 'Report Cards', path: '/student/report-cards', icon: '📄' },
      { label: 'Homework', path: '/student/homework', icon: '📝' },
      { label: 'Attendance', path: '/student/attendance', icon: '📋' },
    ],
  },
  {
    heading: 'Finance',
    items: [
      { label: 'Fees & Invoices', path: '/student/finance', icon: '💳' },
    ],
  },
  {
    heading: 'Communication',
    items: [
      { label: 'Messages', path: '/student/messages', icon: '💬' },
      { label: 'Notifications', path: '/student/notifications', icon: '🔔' },
    ],
  },
  {
    heading: 'Account',
    items: [
      { label: CHANGE_PASSWORD_LABEL, path: CHANGE_PASSWORD_PATHS.student, icon: CHANGE_PASSWORD_ICON },
    ],
  },
];

/** Flat list (legacy). Prefer {@link STUDENT_NAV_SECTIONS} with portal `navSections`. */
export const STUDENT_NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', path: '/student', icon: '🏠' },
  ...STUDENT_NAV_SECTIONS.flatMap((section) => section.items),
];
