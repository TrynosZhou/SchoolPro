import { NavSection } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../config/admin-nav';
import { ACCOUNTANT_NAV_SECTIONS } from '../config/accountant-nav';
import type { UserRole } from '../models';

export type StaffPortalBase = '/admin' | '/accountant';

export interface StaffPortalContext {
  portalTitle: string;
  basePath: StaffPortalBase;
  navSections: NavSection[];
  isAccountant: boolean;
}

export function resolveStaffPortalContext(routerUrl: string, role?: UserRole | null): StaffPortalContext {
  if (routerUrl.startsWith('/accountant') || role === 'accountant') {
    return {
      portalTitle: 'Accountant Portal',
      basePath: '/accountant',
      navSections: ACCOUNTANT_NAV_SECTIONS,
      isAccountant: true,
    };
  }
  return {
    portalTitle: 'Admin Portal',
    basePath: '/admin',
    navSections: ADMIN_NAV_SECTIONS,
    isAccountant: false,
  };
}

export function portalLink(basePath: string, segment: string): string {
  const clean = segment.replace(/^\//, '');
  return `${basePath}/${clean}`;
}
