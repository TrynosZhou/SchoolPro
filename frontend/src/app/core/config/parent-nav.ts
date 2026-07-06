import { NavItem } from '../../shared/portal-layout/portal-layout.component';
import { CHANGE_PASSWORD_ICON, CHANGE_PASSWORD_LABEL, CHANGE_PASSWORD_PATHS } from '../utils/change-password-route.util';

/** Sidebar navigation for Parent Portal pages. */
export const PARENT_NAV_ITEMS: NavItem[] = [
  { label: 'My Children', path: '/parent', icon: '👨‍👩‍👧' },
  { label: 'Finance', path: '/parent/finance', icon: '💳' },
  { label: 'Attendance', path: '/parent/attendance', icon: '📋' },
  { label: 'Report Cards', path: '/parent/report-cards', icon: '📄' },
  { label: 'Messages', path: '/parent/messages', icon: '💬' },
  { label: 'Notifications', path: '/parent/notifications', icon: '🔔' },
  { label: 'Send Email', path: '/parent/send-email', icon: '✉️' },
  { label: CHANGE_PASSWORD_LABEL, path: CHANGE_PASSWORD_PATHS.parent, icon: CHANGE_PASSWORD_ICON },
  { label: 'Apply for a Child', path: '/apply', icon: '🎓', queryParams: { prefill: 1 } },
];
