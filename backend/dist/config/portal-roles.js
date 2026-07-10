"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ENROLLMENT_ROLES = exports.SCHOOL_READ_ROLES = exports.STUDENT_REGISTRATION_ROLES = exports.FINANCE_WRITE_ROLES = exports.FINANCE_ROLES = void 0;
const enums_1 = require("../entities/enums");
/** Staff roles with full finance module access. */
exports.FINANCE_ROLES = [
    enums_1.UserRole.ADMIN,
    enums_1.UserRole.DIRECTOR,
    enums_1.UserRole.PRINCIPAL,
    enums_1.UserRole.ACCOUNTANT,
];
/** Staff roles that may record payments, invoices, and fee catalog changes. */
exports.FINANCE_WRITE_ROLES = [
    enums_1.UserRole.ADMIN,
    enums_1.UserRole.ACCOUNTANT,
];
/** Staff roles that may register new students (not enrol into classes). */
exports.STUDENT_REGISTRATION_ROLES = [
    enums_1.UserRole.ADMIN,
    enums_1.UserRole.ACCOUNTANT,
];
/** Staff roles that may read school year/term metadata (finance filters, registration). */
exports.SCHOOL_READ_ROLES = exports.FINANCE_ROLES;
/** Staff roles that may assign students to classes. */
exports.ENROLLMENT_ROLES = [
    enums_1.UserRole.ADMIN,
    enums_1.UserRole.DIRECTOR,
    enums_1.UserRole.PRINCIPAL,
    enums_1.UserRole.TEACHER,
];
