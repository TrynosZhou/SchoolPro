import { NavItem } from '../../shared/portal-layout/portal-layout.component';

/** Sidebar navigation for Parent Portal pages. */
export const PARENT_NAV_ITEMS: NavItem[] = [
  { label: 'My Children', path: '/parent', icon: '👨‍👩‍👧' },
  { label: 'Finance', path: '/parent/finance', icon: '💳' },
  { label: 'Attendance', path: '/parent/attendance', icon: '📋' },
  { label: 'Report Cards', path: '/parent/report-cards', icon: '📄' },
  { label: 'Messages', path: '/parent/messages', icon: '💬' },
  { label: 'Send Email', path: '/parent/send-email', icon: '✉️' },
];
