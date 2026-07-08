import { UserRole } from '../entities/enums';

export interface PermissionDefinition {
  key: string;
  label: string;
  description?: string;
}

export interface PermissionGroup {
  id: string;
  label: string;
  permissions: PermissionDefinition[];
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    id: 'students',
    label: 'Students',
    permissions: [
      { key: 'students.view', label: 'View students' },
      { key: 'students.manage', label: 'Register & edit students' },
      { key: 'enrollment.manage', label: 'Class enrolment' },
    ],
  },
  {
    id: 'attendance',
    label: 'Attendance',
    permissions: [
      { key: 'attendance.mark', label: 'Mark attendance register' },
      { key: 'attendance.report', label: 'Attendance reports' },
      { key: 'attendance.staff', label: 'Staff attendance' },
    ],
  },
  {
    id: 'staff',
    label: 'Staff',
    permissions: [
      { key: 'staff.view', label: 'View staff directory' },
      { key: 'staff.manage', label: 'Manage staff accounts' },
    ],
  },
  {
    id: 'academics',
    label: 'Academics',
    permissions: [
      { key: 'academics.exams', label: 'Exam marks entry' },
      { key: 'academics.report_cards', label: 'Report cards' },
      { key: 'academics.mark_sheet', label: 'Mark sheets' },
      { key: 'academics.results', label: 'Results analysis' },
      { key: 'academics.ranking', label: 'Rankings' },
      { key: 'academics.settings', label: 'Academic settings' },
    ],
  },
  {
    id: 'finance',
    label: 'Finance',
    permissions: [
      { key: 'finance.billing', label: 'Billing & payments' },
      { key: 'finance.fees', label: 'Manage fees' },
      { key: 'finance.books', label: 'Financial books' },
      { key: 'finance.reports', label: 'Financial reports' },
      { key: 'finance.student_balance', label: 'Student balances' },
    ],
  },
  {
    id: 'communication',
    label: 'Communication',
    permissions: [
      { key: 'communication.send', label: 'Send messages' },
      { key: 'communication.inbox', label: 'Message inbox' },
    ],
  },
  {
    id: 'timetable',
    label: 'Timetable',
    permissions: [
      { key: 'timetable.manage', label: 'Configure & generate timetable' },
      { key: 'timetable.view', label: 'View timetable' },
    ],
  },
  {
    id: 'system',
    label: 'System',
    permissions: [
      { key: 'system.settings', label: 'School settings' },
      { key: 'system.integrations', label: 'Integrations' },
      { key: 'system.permissions', label: 'User permissions & roles' },
      { key: 'system.promotion', label: 'Class promotion rules' },
    ],
  },
  {
    id: 'parent_portal',
    label: 'Parent portal',
    permissions: [
      { key: 'portal.parent.children', label: 'View linked children' },
      { key: 'portal.parent.finance', label: 'Financial statements' },
      { key: 'portal.parent.attendance', label: 'Child attendance' },
      { key: 'portal.parent.report_cards', label: 'Report cards' },
      { key: 'portal.parent.messages', label: 'Messages' },
    ],
  },
  {
    id: 'student_portal',
    label: 'Student portal',
    permissions: [
      { key: 'portal.student.dashboard', label: 'Student dashboard' },
      { key: 'portal.student.report_cards', label: 'Own report cards' },
      { key: 'portal.student.attendance', label: 'Own attendance' },
      { key: 'portal.student.messages', label: 'Messages' },
    ],
  },
];

export const ALL_PERMISSION_KEYS = PERMISSION_GROUPS.flatMap((g) =>
  g.permissions.map((p) => p.key),
);

const ALL = [...ALL_PERMISSION_KEYS];

export const DEFAULT_ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  [UserRole.DIRECTOR]: ALL,
  [UserRole.ADMIN]: ALL,
  [UserRole.PRINCIPAL]: ALL.filter((k) => k !== 'system.permissions' && k !== 'system.integrations'),
  [UserRole.ACCOUNTANT]: [
    'students.view',
    'students.manage',
    'finance.billing',
    'finance.fees',
    'finance.books',
    'finance.reports',
    'finance.student_balance',
  ],
  [UserRole.TEACHER]: [
    'students.view',
    'enrollment.manage',
    'attendance.mark',
    'attendance.report',
    'academics.exams',
    'academics.report_cards',
    'academics.mark_sheet',
    'academics.results',
    'academics.ranking',
    'communication.send',
    'communication.inbox',
    'timetable.view',
  ],
  [UserRole.PARENT]: [
    'portal.parent.children',
    'portal.parent.finance',
    'portal.parent.attendance',
    'portal.parent.report_cards',
    'portal.parent.messages',
  ],
  [UserRole.STUDENT]: [
    'portal.student.dashboard',
    'portal.student.report_cards',
    'portal.student.attendance',
    'portal.student.messages',
  ],
};

/** Human-readable portal access labels for all built-in roles */
export const PORTAL_ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.DIRECTOR]: 'Director',
  [UserRole.PRINCIPAL]: 'Principal',
  [UserRole.ADMIN]: 'Administrator',
  [UserRole.ACCOUNTANT]: 'Accountant',
  [UserRole.TEACHER]: 'Teacher',
  [UserRole.PARENT]: 'Parent',
  [UserRole.STUDENT]: 'Student',
};

export const SYSTEM_ROLE_NAMES: Record<UserRole, string> = {
  [UserRole.DIRECTOR]: 'Director',
  [UserRole.PRINCIPAL]: 'Principal',
  [UserRole.ADMIN]: 'Administrator',
  [UserRole.ACCOUNTANT]: 'Accountant',
  [UserRole.TEACHER]: 'Teacher',
  [UserRole.PARENT]: 'Parent',
  [UserRole.STUDENT]: 'Student',
};

export function sanitizePermissions(keys: unknown): string[] {
  if (!Array.isArray(keys)) return [];
  const allowed = new Set(ALL_PERMISSION_KEYS);
  return [...new Set(keys.map((k) => String(k).trim()).filter((k) => allowed.has(k)))];
}
