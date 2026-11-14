"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureDefaultRoles = ensureDefaultRoles;
exports.withTeacherBaseline = withTeacherBaseline;
exports.resolvePermissionsForUser = resolvePermissionsForUser;
exports.loadUserWithRole = loadUserWithRole;
exports.validatePermissionKeys = validatePermissionKeys;
exports.assertValidBaseRole = assertValidBaseRole;
const typeorm_1 = require("typeorm");
const data_source_1 = require("../config/data-source");
const permissions_1 = require("../config/permissions");
const entities_1 = require("../entities");
const enums_1 = require("../entities/enums");
const typeorm_helpers_1 = require("../utils/typeorm-helpers");
async function ensureDefaultRoles() {
    const roleRepo = data_source_1.AppDataSource.getRepository(entities_1.SchoolRole);
    const userRepo = data_source_1.AppDataSource.getRepository(entities_1.User);
    for (const baseRole of Object.values(enums_1.UserRole)) {
        const name = permissions_1.SYSTEM_ROLE_NAMES[baseRole];
        const defaults = permissions_1.DEFAULT_ROLE_PERMISSIONS[baseRole];
        let role = await roleRepo.findOne({ where: { name } });
        if (!role) {
            role = roleRepo.create({
                name,
                description: `Default ${name.toLowerCase()} portal access`,
                baseRole,
                permissions: defaults,
                isSystem: true,
            });
            await roleRepo.save(role);
            continue;
        }
        let dirty = false;
        if (role.baseRole !== baseRole) {
            role.baseRole = baseRole;
            dirty = true;
        }
        const permCount = role.permissions?.filter((p) => p?.trim()).length ?? 0;
        if (permCount === 0 && defaults.length > 0) {
            role.permissions = defaults;
            dirty = true;
        }
        if (role.isSystem &&
            (baseRole === enums_1.UserRole.PARENT || baseRole === enums_1.UserRole.STUDENT) &&
            permCount > 0 &&
            permCount < defaults.length) {
            role.permissions = defaults;
            dirty = true;
        }
        // Teacher portal menus are driven by permissions. Older databases hold a Teacher role that
        // pre-dates newer permissions, so top it up with any missing defaults (never removes any).
        if (baseRole === enums_1.UserRole.TEACHER) {
            const merged = mergePermissions(role.permissions, defaults);
            if (merged.length !== (role.permissions?.length ?? 0)) {
                role.permissions = merged;
                dirty = true;
            }
        }
        if (dirty)
            await roleRepo.save(role);
    }
    const roles = await roleRepo.find();
    const byBase = new Map(roles.map((r) => [r.baseRole, r]));
    for (const user of await userRepo.find({ where: { schoolRoleId: (0, typeorm_1.IsNull)() } })) {
        const match = byBase.get(user.role);
        if (match) {
            user.schoolRoleId = match.id;
            await userRepo.save(user);
        }
    }
}
function mergePermissions(current, extra) {
    return [...new Set([...(current ?? []).filter((p) => p?.trim()), ...extra])];
}
/**
 * Every teacher account gets the complete teacher menu set (dashboard, students, attendance,
 * examinations, academics, communication, timetable). A custom role assigned to a teacher can
 * ADD permissions on top of that baseline but can no longer hide standard teacher menus.
 */
function withTeacherBaseline(role, permissions) {
    if (role !== enums_1.UserRole.TEACHER)
        return permissions;
    return mergePermissions(permissions, permissions_1.DEFAULT_ROLE_PERMISSIONS[enums_1.UserRole.TEACHER]);
}
function resolvePermissionsForUser(user) {
    const base = user.schoolRole?.permissions?.length
        ? (0, permissions_1.sanitizePermissions)(user.schoolRole.permissions)
        : [...permissions_1.DEFAULT_ROLE_PERMISSIONS[user.role]];
    return withTeacherBaseline(user.role, base);
}
async function loadUserWithRole(userId) {
    return data_source_1.AppDataSource.getRepository(entities_1.User).findOne({
        where: { id: userId },
        relations: (0, typeorm_helpers_1.relations)('schoolRole', 'staffProfile', 'parentProfile', 'studentProfile'),
    });
}
function validatePermissionKeys(keys) {
    return (0, permissions_1.sanitizePermissions)(keys);
}
function assertValidBaseRole(role) {
    const value = String(role || '').toLowerCase();
    if (Object.values(enums_1.UserRole).includes(value)) {
        return value;
    }
    return null;
}
