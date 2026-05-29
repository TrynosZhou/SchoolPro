import { Router } from '@angular/router';
import { NavItem, NavSection } from '../../shared/portal-layout/portal-layout.component';
import { DIRECTOR_NAV_ITEMS } from '../config/director-nav';
import { ADMIN_NAV_SECTIONS } from '../config/admin-nav';

export interface PortalLayoutConfig {
  portalTitle: string;
  navSections?: NavSection[];
  navItems?: NavItem[];
}

/** Resolve sidebar layout for director/principal routes vs default admin sections. */
export function resolveExecutivePortalLayout(router: Router, defaultTitle = 'Admin Portal'): PortalLayoutConfig {
  if (router.url.includes('/director')) {
    return { portalTitle: 'Director Portal', navItems: DIRECTOR_NAV_ITEMS };
  }
  if (router.url.includes('/principal')) {
    return {
      portalTitle: 'Principal Portal',
      navItems: [
        { label: 'Dashboard', path: '/principal', icon: '🏠' },
        { label: 'Exam Marks', path: '/principal/exams', icon: '📊' },
        { label: 'Report Cards', path: '/principal/report-cards', icon: '📄' },
        { label: 'Finance', path: '/principal/finance', icon: '💰' },
      ],
    };
  }
  return { portalTitle: defaultTitle, navSections: ADMIN_NAV_SECTIONS };
}
