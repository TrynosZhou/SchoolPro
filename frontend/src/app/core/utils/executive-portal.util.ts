import { NavItem } from '../../shared/portal-layout/portal-layout.component';
import { DIRECTOR_NAV_ITEMS } from '../config/director-nav';
import { PRINCIPAL_NAV_ITEMS } from '../config/principal-nav';
import {
  changePasswordDashboardLink,
} from './change-password-route.util';
import type { UserRole } from '../models';

export interface ExecutivePortalContext {
  portalTitle: string;
  nav: NavItem[];
  basePath: '/director' | '/principal';
}

export function executivePortalForRole(role?: UserRole | null): ExecutivePortalContext {
  if (role === 'principal') {
    return {
      portalTitle: 'Principal Portal',
      nav: PRINCIPAL_NAV_ITEMS,
      basePath: '/principal',
    };
  }
  return {
    portalTitle: 'Director Portal',
    nav: DIRECTOR_NAV_ITEMS,
    basePath: '/director',
  };
}

export function executiveActionGroups(basePath: string, role: UserRole = 'director') {
  const accountLink = changePasswordDashboardLink(role);
  return [
    {
      title: 'Finance',
      links: [{ label: 'Financial Books', path: `${basePath}/finance`, icon: '💰' }],
    },
    {
      title: 'Operations',
      links: [
        { label: 'Attendance', path: `${basePath}/attendance`, icon: '📋' },
        { label: 'Academics Hub', path: `${basePath}/academics`, icon: '📚' },
        { label: 'Store & Inventory', path: `${basePath}/store`, icon: '🏪' },
      ],
    },
    {
      title: 'Examinations',
      links: [
        { label: 'Exam Marks', path: `${basePath}/exams`, icon: '📝' },
        { label: 'Report Cards', path: `${basePath}/report-cards`, icon: '📄' },
        { label: 'Mark Sheet', path: `${basePath}/mark-sheet`, icon: '📑' },
        { label: 'Results Analysis', path: `${basePath}/results-analysis`, icon: '📈' },
        { label: 'Ranking', path: `${basePath}/ranking`, icon: '🏆' },
        { label: 'Mark Entry Progress', path: `${basePath}/mark-entry-progress`, icon: '📊' },
      ],
    },
    {
      title: 'Account',
      links: [{ label: accountLink.label, path: accountLink.path, icon: accountLink.icon }],
    },
  ];
}

export function executiveAcademicModules(basePath: string) {
  return [
    {
      title: 'Exam Marks',
      description: 'Review and enter student examination marks by class, subject, and term.',
      path: `${basePath}/exams`,
      icon: '📝',
      tone: 'indigo',
    },
    {
      title: 'Report Cards',
      description: 'Generate, preview, and publish term report cards for students.',
      path: `${basePath}/report-cards`,
      icon: '📄',
      tone: 'blue',
    },
    {
      title: 'Mark Sheet',
      description: 'View consolidated class mark sheets across subjects.',
      path: `${basePath}/mark-sheet`,
      icon: '📑',
      tone: 'teal',
    },
    {
      title: 'Results Analysis',
      description: 'Analyse grade distribution and subject performance trends.',
      path: `${basePath}/results-analysis`,
      icon: '📈',
      tone: 'purple',
    },
    {
      title: 'Ranking',
      description: 'Review class and form rankings by examination session.',
      path: `${basePath}/ranking`,
      icon: '🏆',
      tone: 'amber',
    },
  ];
}
