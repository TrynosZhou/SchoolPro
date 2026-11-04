import { NavItem } from '../../shared/portal-layout/portal-layout.component';
import { CHANGE_PASSWORD_ICON, CHANGE_PASSWORD_LABEL, CHANGE_PASSWORD_PATHS } from '../utils/change-password-route.util';

/** Sidebar navigation for Director Portal pages. */
export const DIRECTOR_NAV_ITEMS: NavItem[] = [
  { label: 'Overview', path: '/director', icon: '📊' },
  { label: 'Finance', path: '/director/finance', icon: '💰' },
  { label: 'Payroll', path: '/director/payroll', icon: '🧾' },
  { label: 'Attendance', path: '/director/attendance', icon: '📋' },
  { label: 'Academics', path: '/director/academics', icon: '📚' },
  { label: 'Demographics', path: '/director/analytics/demographics', icon: '👥' },
  { label: 'Retention', path: '/director/analytics/retention', icon: '📉' },
  { label: 'Report Builder', path: '/director/analytics/report-builder', icon: '🧩' },
  { label: 'Store & Inventory', path: '/director/store', icon: '🏪' },
  { label: CHANGE_PASSWORD_LABEL, path: CHANGE_PASSWORD_PATHS.director, icon: CHANGE_PASSWORD_ICON },
];
