import { NavItem } from '../../shared/portal-layout/portal-layout.component';
import { CHANGE_PASSWORD_ICON, CHANGE_PASSWORD_LABEL, CHANGE_PASSWORD_PATHS } from '../utils/change-password-route.util';

/** Sidebar navigation for Student Portal pages. */
export const STUDENT_NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', path: '/student', icon: '🏠' },
  { label: 'Report Cards', path: '/student/report-cards', icon: '📄' },
  { label: 'Fees & Invoices', path: '/student/finance', icon: '💳' },
  { label: 'Homework', path: '/student/homework', icon: '📝' },
  { label: 'Attendance', path: '/student/attendance', icon: '📋' },
  { label: 'Messages', path: '/student/messages', icon: '💬' },
  { label: 'Notifications', path: '/student/notifications', icon: '🔔' },
  { label: CHANGE_PASSWORD_LABEL, path: CHANGE_PASSWORD_PATHS.student, icon: CHANGE_PASSWORD_ICON },
];
