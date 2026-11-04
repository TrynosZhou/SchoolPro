"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_ACCESS_MATRIX = exports.ACCESS_MODULES = void 0;
exports.mapUserRoleToAccessRole = mapUserRoleToAccessRole;
exports.getModuleDefinition = getModuleDefinition;
exports.getDefaultGrants = getDefaultGrants;
exports.scopeAllows = scopeAllows;
exports.canPerformAction = canPerformAction;
exports.buildMatrixPreview = buildMatrixPreview;
const enums_1 = require("../entities/enums");
/** All modules that can receive CRUD grants. Extend this list as new areas roll out. */
exports.ACCESS_MODULES = [
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
const ALL = { view: 'all', create: 'all', edit: 'all', delete: 'all' };
const NONE = { view: 'none', create: 'none', edit: 'none', delete: 'none' };
function grants(view, create = 'none', edit = 'none', deleteScope = 'none') {
    return { view, create, edit, delete: deleteScope };
}
/**
 * Default CRUD matrix per access role.
 * Phase 2 will enforce these at the API layer; Phase 1 exposes them for review only.
 */
exports.DEFAULT_ACCESS_MATRIX = {
    admin: {
        role: 'admin',
        label: 'Administrator',
        description: 'Full access to all modules and records.',
        modules: Object.fromEntries(exports.ACCESS_MODULES.map((m) => [m.id, { ...ALL }])),
    },
    accountant: {
        role: 'accountant',
        label: 'Accountant',
        description: 'Finance operations and student registration; no class enrolment.',
        modules: {
            communication: grants('none', 'none', 'none', 'none'),
            students: grants('all', 'all', 'all', 'none'),
            enrollment: grants('none', 'none', 'none', 'none'),
            admissions: grants('none', 'none', 'none', 'none'),
            attendance: grants('none', 'none', 'none', 'none'),
            academics: grants('none', 'none', 'none', 'none'),
            finance: grants('all', 'all', 'all', 'none'),
            staff: grants('none', 'none', 'none', 'none'),
            timetable: grants('none', 'none', 'none', 'none'),
            analytics: grants('none', 'none', 'none', 'none'),
            system: grants('none', 'none', 'none', 'none'),
            audit: grants('none', 'none', 'none', 'none'),
        },
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
function mapUserRoleToAccessRole(role) {
    switch (role) {
        case enums_1.UserRole.ACCOUNTANT:
            return 'accountant';
        case enums_1.UserRole.TEACHER:
            return 'teacher';
        case enums_1.UserRole.PARENT:
            return 'parent';
        case enums_1.UserRole.STUDENT:
            return 'student';
        case enums_1.UserRole.ADMIN:
        case enums_1.UserRole.DIRECTOR:
        case enums_1.UserRole.PRINCIPAL:
        default:
            return 'admin';
    }
}
function getModuleDefinition(moduleId) {
    return exports.ACCESS_MODULES.find((m) => m.id === moduleId);
}
function getDefaultGrants(accessRole, moduleId) {
    return exports.DEFAULT_ACCESS_MATRIX[accessRole]?.modules[moduleId] ?? { ...NONE };
}
/** Whether a scope grants the requested action (ignores record-level checks — Phase 2). */
function scopeAllows(scope, action) {
    if (scope === 'none')
        return false;
    if (scope === 'all')
        return true;
    // Scoped access: view/create/edit allowed per role rules; delete rarely granted outside admin.
    if (action === 'delete')
        return false;
    return scope === 'assigned' || scope === 'linked' || scope === 'self';
}
function canPerformAction(accessRole, moduleId, action) {
    const grantsForModule = getDefaultGrants(accessRole, moduleId);
    const scope = grantsForModule[action];
    return scopeAllows(scope, action);
}
/** Flat matrix rows for API / UI preview (Phase 1 confirmation). */
function buildMatrixPreview() {
    return {
        modules: exports.ACCESS_MODULES,
        roles: Object.values(exports.DEFAULT_ACCESS_MATRIX),
    };
}
