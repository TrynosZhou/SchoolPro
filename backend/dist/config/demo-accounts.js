"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEMO_ACCOUNTS = void 0;
exports.findDemoAccount = findDemoAccount;
const enums_1 = require("../entities/enums");
/**
 * Fixed, well-known demo accounts. Shared by the seed script (which creates/hashes
 * them in the demo database) and the `/api/auth/demo-login` route (which validates
 * against them) so the two can never drift out of sync.
 */
exports.DEMO_ACCOUNTS = [
    {
        role: enums_1.UserRole.ADMIN,
        username: 'demo.admin',
        email: 'demo.admin@schoolpro.demo',
        password: 'DemoAdmin@2026',
        firstName: 'Alex',
        lastName: 'Admin',
        label: 'Admin',
        description: 'Full school administration — students, staff, billing, settings.',
    },
    {
        role: enums_1.UserRole.ACCOUNTANT,
        username: 'demo.accountant',
        email: 'demo.accountant@schoolpro.demo',
        password: 'DemoAccountant@2026',
        firstName: 'Anesu',
        lastName: 'Accountant',
        label: 'Accountant',
        description: 'Fee collection, invoices, payments and financial reports.',
    },
    {
        role: enums_1.UserRole.TEACHER,
        username: 'demo.teacher',
        email: 'demo.teacher@schoolpro.demo',
        password: 'DemoTeacher@2026',
        firstName: 'Taona',
        lastName: 'Teacher',
        label: 'Teacher',
        description: 'Class register, attendance, exam marks and timetable.',
    },
    {
        role: enums_1.UserRole.PARENT,
        username: 'demo.parent',
        email: 'demo.parent@schoolpro.demo',
        password: 'DemoParent@2026',
        firstName: 'Patience',
        lastName: 'Parent',
        label: 'Parent',
        description: "Track a child's attendance, grades, fees and announcements.",
    },
    {
        role: enums_1.UserRole.STUDENT,
        username: 'demo.student',
        email: 'demo.student@schoolpro.demo',
        password: 'DemoStudent@2026',
        firstName: 'Simba',
        lastName: 'Student',
        label: 'Student',
        description: 'Timetable, results, fee balance and school announcements.',
    },
];
function findDemoAccount(role) {
    return exports.DEMO_ACCOUNTS.find((a) => a.role === role);
}
