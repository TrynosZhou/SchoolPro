"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-nocheck
const express_1 = require("express");
const typeorm_1 = require("typeorm");
const data_source_1 = require("../config/data-source");
const permissions_1 = require("../config/permissions");
const entities_1 = require("../entities");
const enums_1 = require("../entities/enums");
const auth_1 = require("../middleware/auth");
const role_permissions_service_1 = require("../services/role-permissions.service");
const typeorm_helpers_1 = require("../utils/typeorm-helpers");
const router = (0, express_1.Router)();
const STAFF_PORTAL_ROLES = [enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.ADMIN, enums_1.UserRole.TEACHER];
const ALL_PORTAL_ROLES = Object.values(enums_1.UserRole);
router.use(auth_1.authenticate, (0, auth_1.authorize)(enums_1.UserRole.ADMIN));
router.get('/catalog', async (_req, res) => {
    await (0, role_permissions_service_1.ensureDefaultRoles)();
    res.json({ groups: permissions_1.PERMISSION_GROUPS, portalRoles: permissions_1.PORTAL_ROLE_LABELS });
});
router.get('/roles', async (_req, res) => {
    await (0, role_permissions_service_1.ensureDefaultRoles)();
    const roles = await data_source_1.AppDataSource.getRepository(entities_1.SchoolRole).find({
        order: { isSystem: 'DESC', name: 'ASC' },
    });
    const userCounts = await data_source_1.AppDataSource.getRepository(entities_1.User)
        .createQueryBuilder('u')
        .select('u.schoolRoleId', 'schoolRoleId')
        .addSelect('COUNT(*)', 'cnt')
        .where('u.schoolRoleId IS NOT NULL')
        .groupBy('u.schoolRoleId')
        .getRawMany();
    const countMap = new Map(userCounts.map((r) => [r.schoolRoleId, Number(r.cnt)]));
    res.json(roles.map((role) => ({
        ...role,
        baseRoleLabel: permissions_1.PORTAL_ROLE_LABELS[role.baseRole] ?? role.baseRole,
        userCount: countMap.get(role.id) ?? 0,
    })));
});
router.post('/roles', async (req, res) => {
    const { name, description, baseRole, permissions } = req.body;
    const trimmedName = String(name || '').trim();
    if (!trimmedName) {
        return res.status(400).json({ message: 'Role name is required' });
    }
    const portalRole = (0, role_permissions_service_1.assertValidBaseRole)(baseRole);
    if (!portalRole || !ALL_PORTAL_ROLES.includes(portalRole)) {
        return res.status(400).json({ message: 'A valid portal access level is required' });
    }
    const repo = data_source_1.AppDataSource.getRepository(entities_1.SchoolRole);
    const existing = await repo.findOne({ where: { name: trimmedName } });
    if (existing) {
        return res.status(409).json({ message: 'A role with this name already exists' });
    }
    const role = await repo.save(repo.create({
        name: trimmedName,
        description: description?.trim() || undefined,
        baseRole: portalRole,
        permissions: (0, permissions_1.sanitizePermissions)(permissions),
        isSystem: false,
    }));
    res.status(201).json(role);
});
router.patch('/roles/:id', async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.SchoolRole);
    const role = await repo.findOne({ where: { id: req.params.id } });
    if (!role)
        return res.status(404).json({ message: 'Role not found' });
    const { name, description, baseRole, permissions } = req.body;
    if (name !== undefined) {
        const trimmedName = String(name).trim();
        if (!trimmedName)
            return res.status(400).json({ message: 'Role name is required' });
        const clash = await repo.findOne({ where: { name: trimmedName } });
        if (clash && clash.id !== role.id) {
            return res.status(409).json({ message: 'A role with this name already exists' });
        }
        role.name = trimmedName;
    }
    if (description !== undefined)
        role.description = description?.trim() || undefined;
    if (baseRole !== undefined) {
        const portalRole = (0, role_permissions_service_1.assertValidBaseRole)(baseRole);
        if (!portalRole || !ALL_PORTAL_ROLES.includes(portalRole)) {
            return res.status(400).json({ message: 'Invalid portal access level' });
        }
        if (role.isSystem && portalRole !== role.baseRole) {
            return res.status(400).json({ message: 'Portal access level cannot be changed on system roles' });
        }
        role.baseRole = portalRole;
    }
    if (permissions !== undefined) {
        role.permissions = (0, permissions_1.sanitizePermissions)(permissions);
    }
    const saved = await repo.save(role);
    if (baseRole !== undefined || permissions !== undefined) {
        await data_source_1.AppDataSource.getRepository(entities_1.User).update({ schoolRoleId: saved.id }, { role: saved.baseRole });
    }
    res.json(saved);
});
router.delete('/roles/:id', async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.SchoolRole);
    const role = await repo.findOne({ where: { id: req.params.id } });
    if (!role)
        return res.status(404).json({ message: 'Role not found' });
    if (role.isSystem) {
        return res.status(400).json({ message: 'System roles cannot be deleted' });
    }
    const assigned = await data_source_1.AppDataSource.getRepository(entities_1.User).count({ where: { schoolRoleId: role.id } });
    if (assigned > 0) {
        return res.status(400).json({
            message: `Cannot delete role — ${assigned} user(s) are assigned. Reassign them first.`,
        });
    }
    await repo.remove(role);
    res.json({ message: 'Role deleted' });
});
router.get('/users', async (_req, res) => {
    await (0, role_permissions_service_1.ensureDefaultRoles)();
    const users = await data_source_1.AppDataSource.getRepository(entities_1.User).find({
        where: { role: (0, typeorm_1.In)(STAFF_PORTAL_ROLES), isActive: true },
        relations: (0, typeorm_helpers_1.relations)('schoolRole', 'staffProfile'),
        order: { lastName: 'ASC', firstName: 'ASC' },
    });
    const rows = users.map((u) => ({
        id: u.id,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        role: u.role,
        schoolRoleId: u.schoolRoleId ?? null,
        schoolRole: u.schoolRole
            ? { id: u.schoolRole.id, name: u.schoolRole.name, baseRole: u.schoolRole.baseRole }
            : null,
        employeeNumber: u.staffProfile?.employeeNumber ?? null,
        permissions: (0, role_permissions_service_1.resolvePermissionsForUser)(u),
    }));
    res.json(rows);
});
router.patch('/users/:id', async (req, res) => {
    const { schoolRoleId, role: portalRole } = req.body;
    const userRepo = data_source_1.AppDataSource.getRepository(entities_1.User);
    const user = await userRepo.findOne({
        where: { id: req.params.id },
        relations: (0, typeorm_helpers_1.relations)('schoolRole'),
    });
    if (!user)
        return res.status(404).json({ message: 'User not found' });
    if (!STAFF_PORTAL_ROLES.includes(user.role)) {
        return res.status(400).json({ message: 'Permissions can only be assigned to staff portal users' });
    }
    if (schoolRoleId !== undefined) {
        if (schoolRoleId === null || schoolRoleId === '') {
            user.schoolRoleId = undefined;
            user.schoolRole = undefined;
        }
        else {
            const schoolRole = await data_source_1.AppDataSource.getRepository(entities_1.SchoolRole).findOne({
                where: { id: schoolRoleId },
            });
            if (!schoolRole)
                return res.status(404).json({ message: 'Role not found' });
            user.schoolRoleId = schoolRole.id;
            user.schoolRole = schoolRole;
            user.role = schoolRole.baseRole;
        }
    }
    if (portalRole !== undefined && (schoolRoleId === undefined || schoolRoleId === null || schoolRoleId === '')) {
        const nextRole = (0, role_permissions_service_1.assertValidBaseRole)(portalRole);
        if (!nextRole || !STAFF_PORTAL_ROLES.includes(nextRole)) {
            return res.status(400).json({ message: 'Invalid portal role' });
        }
        user.role = nextRole;
    }
    const saved = await userRepo.save(user);
    const full = await (0, role_permissions_service_1.loadUserWithRole)(saved.id);
    res.json({
        id: full.id,
        email: full.email,
        firstName: full.firstName,
        lastName: full.lastName,
        role: full.role,
        schoolRoleId: full.schoolRoleId ?? null,
        schoolRole: full.schoolRole
            ? { id: full.schoolRole.id, name: full.schoolRole.name, baseRole: full.schoolRole.baseRole }
            : null,
        permissions: (0, role_permissions_service_1.resolvePermissionsForUser)(full),
    });
});
exports.default = router;
