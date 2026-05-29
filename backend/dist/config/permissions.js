"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SYSTEM_ROLE_NAMES = exports.PORTAL_ROLE_LABELS = exports.DEFAULT_ROLE_PERMISSIONS = exports.ALL_PERMISSION_KEYS = exports.PERMISSION_GROUPS = void 0;
exports.sanitizePermissions = sanitizePermissions;
const enums_1 = require("../entities/enums");
exports.PERMISSION_GROUPS = [
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
        ],
    },
];
exports.ALL_PERMISSION_KEYS = exports.PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key));
const ALL = [...exports.ALL_PERMISSION_KEYS];
exports.DEFAULT_ROLE_PERMISSIONS = {
    [enums_1.UserRole.DIRECTOR]: ALL,
    [enums_1.UserRole.ADMIN]: ALL,
    [enums_1.UserRole.PRINCIPAL]: ALL.filter((k) => k !== 'system.permissions' && k !== 'system.integrations'),
    [enums_1.UserRole.TEACHER]: [
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
    [enums_1.UserRole.PARENT]: [
        'portal.parent.children',
        'portal.parent.finance',
        'portal.parent.attendance',
        'portal.parent.report_cards',
        'portal.parent.messages',
    ],
    [enums_1.UserRole.STUDENT]: [
        'portal.student.dashboard',
        'portal.student.report_cards',
        'portal.student.attendance',
    ],
};
/** Human-readable portal access labels for all built-in roles */
exports.PORTAL_ROLE_LABELS = {
    [enums_1.UserRole.DIRECTOR]: 'Director',
    [enums_1.UserRole.PRINCIPAL]: 'Principal',
    [enums_1.UserRole.ADMIN]: 'Administrator',
    [enums_1.UserRole.TEACHER]: 'Teacher',
    [enums_1.UserRole.PARENT]: 'Parent',
    [enums_1.UserRole.STUDENT]: 'Student',
};
exports.SYSTEM_ROLE_NAMES = {
    [enums_1.UserRole.DIRECTOR]: 'Director',
    [enums_1.UserRole.PRINCIPAL]: 'Principal',
    [enums_1.UserRole.ADMIN]: 'Administrator',
    [enums_1.UserRole.TEACHER]: 'Teacher',
    [enums_1.UserRole.PARENT]: 'Parent',
    [enums_1.UserRole.STUDENT]: 'Student',
};
function sanitizePermissions(keys) {
    if (!Array.isArray(keys))
        return [];
    const allowed = new Set(exports.ALL_PERMISSION_KEYS);
    return [...new Set(keys.map((k) => String(k).trim()).filter((k) => allowed.has(k)))];
}
