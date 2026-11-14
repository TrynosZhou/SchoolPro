import { UserRole } from '../entities/enums';

/** Staff roles with full finance module access. */
export const FINANCE_ROLES: UserRole[] = [
  UserRole.ADMIN,
  UserRole.DIRECTOR,
  UserRole.PRINCIPAL,
  UserRole.ACCOUNTANT,
];

/** Staff roles that may record payments, invoices, and fee catalog changes. */
export const FINANCE_WRITE_ROLES: UserRole[] = [
  UserRole.ADMIN,
  UserRole.ACCOUNTANT,
];

/** Staff roles that may register new students (not enrol into classes). */
export const STUDENT_REGISTRATION_ROLES: UserRole[] = [
  UserRole.ADMIN,
  UserRole.ACCOUNTANT,
];

/** Staff roles that may read school year/term metadata (finance filters, registration). */
export const SCHOOL_READ_ROLES: UserRole[] = FINANCE_ROLES;

/** Staff roles that may assign students to classes. */
export const ENROLLMENT_ROLES: UserRole[] = [
  UserRole.ADMIN,
  UserRole.DIRECTOR,
  UserRole.PRINCIPAL,
  UserRole.TEACHER,
];
