import type { UserRole } from '../models';

/** Canonical change-password route for each portal role. */
export const CHANGE_PASSWORD_PATHS = {
  admin: '/admin/change-password',
  director: '/director/change-password',
  principal: '/principal/change-password',
  accountant: '/accountant/change-password',
  teacher: '/teacher/change-password',
  parent: '/parent/change-password',
  student: '/student/change-password',
} as const satisfies Record<UserRole, string>;

export const CHANGE_PASSWORD_LABEL = 'Change Password';
export const CHANGE_PASSWORD_ICON = '🔐';

export function changePasswordPathForRole(role?: UserRole | null): string | null {
  if (!role) return null;
  return CHANGE_PASSWORD_PATHS[role] ?? null;
}

export function changePasswordQueryParamsForRole(_role?: UserRole | null): Record<string, string> | null {
  return null;
}

export function changePasswordDashboardLink(role: UserRole): {
  label: string;
  path: string;
  icon: string;
} {
  return {
    label: CHANGE_PASSWORD_LABEL,
    path: CHANGE_PASSWORD_PATHS[role],
    icon: CHANGE_PASSWORD_ICON,
  };
}
