import { UserRole } from '../entities/enums';

/** CRUD actions used across the access-control matrix. */
export type CrudAction = 'view' | 'create' | 'edit' | 'delete';

/** Data scope applied when a grant is not full-access. */
export type AccessScope = 'all' | 'assigned' | 'linked' | 'self' | 'none';

/**
 * The four portal roles this access-control rollout targets.
 * Director and Principal inherit the Admin profile (see mapUserRoleToAccessRole).
 */
export type AccessRole = 'admin' | 'teacher' | 'parent' | 'student';

export interface ModuleDefinition {
  id: string;
  label: string;
  description?: string;
  /** Optional legacy flat permission keys for gradual Phase 2 migration. */
  legacyKeys?: Partial<Record<CrudAction, string>>;
}

export interface CrudGrants {
  view: AccessScope;
  create: AccessScope;
  edit: AccessScope;
  delete: AccessScope;
}

export interface RoleModuleMatrix {
  role: AccessRole;
  label: string;
  description: string;
  modules: Record<string, CrudGrants>;
}

/** All modules that can receive CRUD grants. Extend this list as new areas roll out. */
export const ACCESS_MODULES: ModuleDefinition[] = [
  {
    id: 'communication',
    label: 'Communication / Messages',
    description: 'Direct messages, bulk SMS/email, notifications',
    legacyKeys: {
      view: 'communication.inbox',
      create: 'communication.send',
    },
  },
  {
    id: 'students',
    label: 'Student records',
    description: 'Student profiles, guardians, registration',
    legacyKeys: { view: 'students.view', create: 'students.manage', edit: 'students.manage', delete: 'students.manage' },
  },
  {
    id: 'enrollment',
    label: 'Enrolment',
    description: 'Class assignment and enrolment dates',
    legacyKeys: { view: 'students.view', create: 'enrollment.manage', edit: 'enrollment.manage' },
  },
  {
    id: 'admissions',
    label: 'Admissions',
    description: 'Online applications and status tracking',
  },
  {
    id: 'attendance',
    label: 'Attendance',
    description: 'Student and staff attendance registers',
    legacyKeys: {
      view: 'attendance.report',
      create: 'attendance.mark',
      edit: 'attendance.mark',
    },
  },
  {
    id: 'academics',
    label: 'Academics / Examinations',
    description: 'Marks, report cards, rankings, results analysis',
    legacyKeys: {
      view: 'academics.report_cards',
      create: 'academics.exams',
      edit: 'academics.exams',
    },
  },
  {
    id: 'finance',
    label: 'Finance / Fees',
    description: 'Billing, payments, invoices, financial reports',
    legacyKeys: {
      view: 'finance.billing',
      create: 'finance.billing',
      edit: 'finance.billing',
    },
  },
  {
    id: 'staff',
    label: 'Staff',
    description: 'Staff directory, assignments, payroll',
    legacyKeys: { view: 'staff.view', create: 'staff.manage', edit: 'staff.manage', delete: 'staff.manage' },
  },
  {
    id: 'timetable',
    label: 'Timetable',
    description: 'Period configuration, generation, schedules',
    legacyKeys: { view: 'timetable.view', create: 'timetable.manage', edit: 'timetable.manage' },
  },
  {
    id: 'analytics',
    label: 'Analytics & reporting',
    description: 'Demographics, retention, custom reports',
  },
  {
    id: 'system',
    label: 'System administration',
    description: 'Settings, integrations, roles, promotion rules',
    legacyKeys: {
      view: 'system.settings',
      create: 'system.settings',
      edit: 'system.settings',
      delete: 'system.permissions',
    },
  },
  {
    id: 'audit',
    label: 'Audit log',
    description: 'Read-only activity history (admin only)',
  },
];

const ALL: CrudGrants = { view: 'all', create: 'all', edit: 'all', delete: 'all' };
const NONE: CrudGrants = { view: 'none', create: 'none', edit: 'none', delete: 'none' };

function grants(
  view: AccessScope,
  create: AccessScope = 'none',
  edit: AccessScope = 'none',
  deleteScope: AccessScope = 'none',
): CrudGrants {
  return { view, create, edit, delete: deleteScope };
}

/**
 * Default CRUD matrix per access role.
 * Phase 2 will enforce these at the API layer; Phase 1 exposes them for review only.
 */
export const DEFAULT_ACCESS_MATRIX: Record<AccessRole, RoleModuleMatrix> = {
  admin: {
    role: 'admin',
    label: 'Administrator',
    description: 'Full access to all modules and records.',
    modules: Object.fromEntries(ACCESS_MODULES.map((m) => [m.id, { ...ALL }])),
  },
  teacher: {
    role: 'teacher',
    label: 'Teacher',
    description: 'Access limited to assigned classes/subjects and their students.',
    modules: {
      communication: grants('assigned', 'assigned', 'assigned', 'none'),
      students: grants('assigned', 'none', 'assigned', 'none'),
      enrollment: grants('assigned', 'assigned', 'assigned', 'none'),
      admissions: grants('none', 'none', 'none', 'none'),
      attendance: grants('assigned', 'assigned', 'assigned', 'none'),
      academics: grants('assigned', 'assigned', 'assigned', 'none'),
      finance: grants('none', 'none', 'none', 'none'),
      staff: grants('none', 'none', 'none', 'none'),
      timetable: grants('assigned', 'none', 'none', 'none'),
      analytics: grants('assigned', 'none', 'none', 'none'),
      system: grants('none', 'none', 'none', 'none'),
      audit: grants('none', 'none', 'none', 'none'),
    },
  },
  parent: {
    role: 'parent',
    label: 'Parent',
    description: 'Access limited to linked children\'s records only.',
    modules: {
      communication: grants('linked', 'linked', 'none', 'none'),
      students: grants('linked', 'none', 'none', 'none'),
      enrollment: grants('none', 'none', 'none', 'none'),
      admissions: grants('linked', 'linked', 'none', 'none'),
      attendance: grants('linked', 'none', 'none', 'none'),
      academics: grants('linked', 'none', 'none', 'none'),
      finance: grants('linked', 'none', 'none', 'none'),
      staff: grants('none', 'none', 'none', 'none'),
      timetable: grants('linked', 'none', 'none', 'none'),
      analytics: grants('none', 'none', 'none', 'none'),
      system: grants('none', 'none', 'none', 'none'),
      audit: grants('none', 'none', 'none', 'none'),
    },
  },
  student: {
    role: 'student',
    label: 'Student',
    description: 'Read-only access to own records where appropriate.',
    modules: {
      communication: grants('self', 'self', 'none', 'none'),
      students: grants('self', 'none', 'none', 'none'),
      enrollment: grants('none', 'none', 'none', 'none'),
      admissions: grants('none', 'none', 'none', 'none'),
      attendance: grants('self', 'none', 'none', 'none'),
      academics: grants('self', 'none', 'none', 'none'),
      finance: grants('self', 'none', 'none', 'none'),
      staff: grants('none', 'none', 'none', 'none'),
      timetable: grants('self', 'none', 'none', 'none'),
      analytics: grants('none', 'none', 'none', 'none'),
      system: grants('none', 'none', 'none', 'none'),
      audit: grants('none', 'none', 'none', 'none'),
    },
  },
};

/** Map a stored UserRole to the four access-control profiles. */
export function mapUserRoleToAccessRole(role: UserRole): AccessRole {
  switch (role) {
    case UserRole.TEACHER:
      return 'teacher';
    case UserRole.PARENT:
      return 'parent';
    case UserRole.STUDENT:
      return 'student';
    case UserRole.ADMIN:
    case UserRole.DIRECTOR:
    case UserRole.PRINCIPAL:
    default:
      return 'admin';
  }
}

export function getModuleDefinition(moduleId: string): ModuleDefinition | undefined {
  return ACCESS_MODULES.find((m) => m.id === moduleId);
}

export function getDefaultGrants(accessRole: AccessRole, moduleId: string): CrudGrants {
  return DEFAULT_ACCESS_MATRIX[accessRole]?.modules[moduleId] ?? { ...NONE };
}

/** Whether a scope grants the requested action (ignores record-level checks — Phase 2). */
export function scopeAllows(scope: AccessScope, action: CrudAction): boolean {
  if (scope === 'none') return false;
  if (scope === 'all') return true;
  // Scoped access: view/create/edit allowed per role rules; delete rarely granted outside admin.
  if (action === 'delete') return false;
  return scope === 'assigned' || scope === 'linked' || scope === 'self';
}

export function canPerformAction(
  accessRole: AccessRole,
  moduleId: string,
  action: CrudAction,
): boolean {
  const grantsForModule = getDefaultGrants(accessRole, moduleId);
  const scope = grantsForModule[action];
  return scopeAllows(scope, action);
}

/** Flat matrix rows for API / UI preview (Phase 1 confirmation). */
export function buildMatrixPreview(): {
  modules: ModuleDefinition[];
  roles: RoleModuleMatrix[];
} {
  return {
    modules: ACCESS_MODULES,
    roles: Object.values(DEFAULT_ACCESS_MATRIX),
  };
}
