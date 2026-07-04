import { NavItem } from '../../shared/portal-layout/portal-layout.component';

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
];
