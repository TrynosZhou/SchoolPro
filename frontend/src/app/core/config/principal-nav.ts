import { NavItem } from '../../shared/portal-layout/portal-layout.component';
import { CHANGE_PASSWORD_ICON, CHANGE_PASSWORD_LABEL, CHANGE_PASSWORD_PATHS } from '../utils/change-password-route.util';

/** Sidebar navigation for Principal Portal pages. */
export const PRINCIPAL_NAV_ITEMS: NavItem[] = [
  { label: 'Overview', path: '/principal', icon: '📊' },
  { label: 'Finance', path: '/principal/finance', icon: '💰' },
  { label: 'Payroll', path: '/principal/payroll', icon: '🧾' },
  { label: 'Attendance', path: '/principal/attendance', icon: '📋' },
  { label: 'Academics', path: '/principal/academics', icon: '📚' },
  { label: 'Demographics', path: '/principal/analytics/demographics', icon: '👥' },
  { label: 'Retention', path: '/principal/analytics/retention', icon: '📉' },
  { label: 'Report Builder', path: '/principal/analytics/report-builder', icon: '🧩' },
  { label: 'Store & Inventory', path: '/principal/store', icon: '🏪' },
  { label: CHANGE_PASSWORD_LABEL, path: CHANGE_PASSWORD_PATHS.principal, icon: CHANGE_PASSWORD_ICON },
];
