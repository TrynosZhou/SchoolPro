import { UserRole } from '../entities/enums';

export interface DemoAccountDef {
  /** Matches the request body's `role` field on POST /api/auth/demo-login. */
  role: UserRole;
  username: string;
  email: string;
  /** Plaintext — intentionally documented/public; this account only ever touches the demo database. */
  password: string;
  firstName: string;
  lastName: string;
  label: string;
  description: string;
}

/**
 * Fixed, well-known demo accounts. Shared by the seed script (which creates/hashes
 * them in the demo database) and the `/api/auth/demo-login` route (which validates
 * against them) so the two can never drift out of sync.
 */
export const DEMO_ACCOUNTS: DemoAccountDef[] = [
  {
    role: UserRole.ADMIN,
    username: 'demo.admin',
    email: 'demo.admin@schoolpro.demo',
    password: 'DemoAdmin@2026',
    firstName: 'Alex',
    lastName: 'Admin',
    label: 'Admin',
    description: 'Full school administration — students, staff, billing, settings.',
  },
  {
    role: UserRole.ACCOUNTANT,
    username: 'demo.accountant',
    email: 'demo.accountant@schoolpro.demo',
    password: 'DemoAccountant@2026',
    firstName: 'Anesu',
    lastName: 'Accountant',
    label: 'Accountant',
    description: 'Fee collection, invoices, payments and financial reports.',
  },
  {
    role: UserRole.TEACHER,
    username: 'demo.teacher',
    email: 'demo.teacher@schoolpro.demo',
    password: 'DemoTeacher@2026',
    firstName: 'Taona',
    lastName: 'Teacher',
    label: 'Teacher',
    description: 'Class register, attendance, exam marks and timetable.',
  },
  {
    role: UserRole.PARENT,
    username: 'demo.parent',
    email: 'demo.parent@schoolpro.demo',
    password: 'DemoParent@2026',
    firstName: 'Patience',
    lastName: 'Parent',
    label: 'Parent',
    description: "Track a child's attendance, grades, fees and announcements.",
  },
  {
    role: UserRole.STUDENT,
    username: 'demo.student',
    email: 'demo.student@schoolpro.demo',
    password: 'DemoStudent@2026',
    firstName: 'Simba',
    lastName: 'Student',
    label: 'Student',
    description: 'Timetable, results, fee balance and school announcements.',
  },
];

export function findDemoAccount(role: string | undefined): DemoAccountDef | undefined {
  return DEMO_ACCOUNTS.find((a) => a.role === role);
}
