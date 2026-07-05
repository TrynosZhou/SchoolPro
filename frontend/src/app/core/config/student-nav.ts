import { NavItem } from '../../shared/portal-layout/portal-layout.component';

/** Sidebar navigation for Student Portal pages. */
export const STUDENT_NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', path: '/student', icon: '🏠' },
  { label: 'Report Cards', path: '/student/report-cards', icon: '📄' },
  { label: 'Fees & Invoices', path: '/student/finance', icon: '💳' },
  { label: 'Homework', path: '/student/homework', icon: '📝' },
  { label: 'Attendance', path: '/student/attendance', icon: '📋' },
  { label: 'Messages', path: '/student/messages', icon: '💬' },
  { label: 'Notifications', path: '/student/notifications', icon: '🔔' },
];
