import { NavItem } from '../../shared/portal-layout/portal-layout.component';

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
];
