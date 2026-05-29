"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureDefaultRoles = ensureDefaultRoles;
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
function resolvePermissionsForUser(user) {
    if (user.schoolRole?.permissions?.length) {
        return (0, permissions_1.sanitizePermissions)(user.schoolRole.permissions);
    }
    return [...permissions_1.DEFAULT_ROLE_PERMISSIONS[user.role]];
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
