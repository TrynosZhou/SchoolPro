import { Router } from '@angular/router';
import { NavItem, NavSection } from '../../shared/portal-layout/portal-layout.component';
import { DIRECTOR_NAV_ITEMS } from '../config/director-nav';
import { PRINCIPAL_NAV_ITEMS } from '../config/principal-nav';
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
    return { portalTitle: 'Principal Portal', navItems: PRINCIPAL_NAV_ITEMS };
  }
  return { portalTitle: defaultTitle, navSections: ADMIN_NAV_SECTIONS };
}
