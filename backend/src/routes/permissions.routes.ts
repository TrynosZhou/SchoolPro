// @ts-nocheck
import { Router, Response } from 'express';
import { In } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import { PERMISSION_GROUPS, PORTAL_ROLE_LABELS, sanitizePermissions } from '../config/permissions';
import { SchoolRole, User } from '../entities';
import { UserRole } from '../entities/enums';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import {
  assertValidBaseRole,
  ensureDefaultRoles,
  loadUserWithRole,
  resolvePermissionsForUser,
} from '../services/role-permissions.service';
import { relations } from '../utils/typeorm-helpers';

const router = Router();

const STAFF_PORTAL_ROLES = [UserRole.DIRECTOR, UserRole.PRINCIPAL, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.TEACHER];
const ALL_PORTAL_ROLES = Object.values(UserRole);

router.use(authenticate, authorize(UserRole.ADMIN));

router.get('/catalog', async (_req, res: Response) => {
  await ensureDefaultRoles();
  res.json({ groups: PERMISSION_GROUPS, portalRoles: PORTAL_ROLE_LABELS });
});

router.get('/roles', async (_req, res: Response) => {
  await ensureDefaultRoles();
  const roles = await AppDataSource.getRepository(SchoolRole).find({
    order: { isSystem: 'DESC', name: 'ASC' },
  });
  const userCounts = await AppDataSource.getRepository(User)
    .createQueryBuilder('u')
    .select('u.schoolRoleId', 'schoolRoleId')
    .addSelect('COUNT(*)', 'cnt')
    .where('u.schoolRoleId IS NOT NULL')
    .groupBy('u.schoolRoleId')
    .getRawMany();
  const countMap = new Map(userCounts.map((r) => [r.schoolRoleId, Number(r.cnt)]));
  res.json(
    roles.map((role) => ({
      ...role,
      baseRoleLabel: PORTAL_ROLE_LABELS[role.baseRole] ?? role.baseRole,
      userCount: countMap.get(role.id) ?? 0,
    })),
  );
});

router.post('/roles', async (req, res: Response) => {
  const { name, description, baseRole, permissions } = req.body;
  const trimmedName = String(name || '').trim();
  if (!trimmedName) {
    return res.status(400).json({ message: 'Role name is required' });
  }
  const portalRole = assertValidBaseRole(baseRole);
  if (!portalRole || !ALL_PORTAL_ROLES.includes(portalRole)) {
    return res.status(400).json({ message: 'A valid portal access level is required' });
  }

  const repo = AppDataSource.getRepository(SchoolRole);
  const existing = await repo.findOne({ where: { name: trimmedName } });
  if (existing) {
    return res.status(409).json({ message: 'A role with this name already exists' });
  }

  const role = await repo.save(
    repo.create({
      name: trimmedName,
      description: description?.trim() || undefined,
      baseRole: portalRole,
      permissions: sanitizePermissions(permissions),
      isSystem: false,
    }),
  );
  res.status(201).json(role);
});

router.patch('/roles/:id', async (req, res: Response) => {
  const repo = AppDataSource.getRepository(SchoolRole);
  const role = await repo.findOne({ where: { id: req.params.id } });
  if (!role) return res.status(404).json({ message: 'Role not found' });

  const { name, description, baseRole, permissions } = req.body;
  if (name !== undefined) {
    const trimmedName = String(name).trim();
    if (!trimmedName) return res.status(400).json({ message: 'Role name is required' });
    const clash = await repo.findOne({ where: { name: trimmedName } });
    if (clash && clash.id !== role.id) {
      return res.status(409).json({ message: 'A role with this name already exists' });
    }
    role.name = trimmedName;
  }
  if (description !== undefined) role.description = description?.trim() || undefined;
  if (baseRole !== undefined) {
    const portalRole = assertValidBaseRole(baseRole);
    if (!portalRole || !ALL_PORTAL_ROLES.includes(portalRole)) {
      return res.status(400).json({ message: 'Invalid portal access level' });
    }
    if (role.isSystem && portalRole !== role.baseRole) {
      return res.status(400).json({ message: 'Portal access level cannot be changed on system roles' });
    }
    role.baseRole = portalRole;
  }
  if (permissions !== undefined) {
    role.permissions = sanitizePermissions(permissions);
  }

  const saved = await repo.save(role);

  if (baseRole !== undefined || permissions !== undefined) {
    await AppDataSource.getRepository(User).update(
      { schoolRoleId: saved.id },
      { role: saved.baseRole },
    );
  }

  res.json(saved);
});

router.delete('/roles/:id', async (req, res: Response) => {
  const repo = AppDataSource.getRepository(SchoolRole);
  const role = await repo.findOne({ where: { id: req.params.id } });
  if (!role) return res.status(404).json({ message: 'Role not found' });
  if (role.isSystem) {
    return res.status(400).json({ message: 'System roles cannot be deleted' });
  }

  const assigned = await AppDataSource.getRepository(User).count({ where: { schoolRoleId: role.id } });
  if (assigned > 0) {
    return res.status(400).json({
      message: `Cannot delete role — ${assigned} user(s) are assigned. Reassign them first.`,
    });
  }

  await repo.remove(role);
  res.json({ message: 'Role deleted' });
});

router.get('/users', async (_req, res: Response) => {
  await ensureDefaultRoles();
  const users = await AppDataSource.getRepository(User).find({
    where: { role: In(STAFF_PORTAL_ROLES), isActive: true },
    relations: relations('schoolRole', 'staffProfile'),
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
      permissions: resolvePermissionsForUser(u),
    }));

  res.json(rows);
});

router.patch('/users/:id', async (req: AuthRequest, res: Response) => {
  const { schoolRoleId, role: portalRole } = req.body;
  const userRepo = AppDataSource.getRepository(User);
  const user = await userRepo.findOne({
    where: { id: req.params.id },
    relations: relations('schoolRole'),
  });
  if (!user) return res.status(404).json({ message: 'User not found' });
  if (!STAFF_PORTAL_ROLES.includes(user.role)) {
    return res.status(400).json({ message: 'Permissions can only be assigned to staff portal users' });
  }

  if (schoolRoleId !== undefined) {
    if (schoolRoleId === null || schoolRoleId === '') {
      user.schoolRoleId = undefined;
      user.schoolRole = undefined;
    } else {
      const schoolRole = await AppDataSource.getRepository(SchoolRole).findOne({
        where: { id: schoolRoleId },
      });
      if (!schoolRole) return res.status(404).json({ message: 'Role not found' });
      user.schoolRoleId = schoolRole.id;
      user.schoolRole = schoolRole;
      user.role = schoolRole.baseRole;
    }
  }

  if (portalRole !== undefined && (schoolRoleId === undefined || schoolRoleId === null || schoolRoleId === '')) {
    const nextRole = assertValidBaseRole(portalRole);
    if (!nextRole || !STAFF_PORTAL_ROLES.includes(nextRole)) {
      return res.status(400).json({ message: 'Invalid portal role' });
    }
    user.role = nextRole;
  }

  const saved = await userRepo.save(user);
  const full = await loadUserWithRole(saved.id);
  res.json({
    id: full!.id,
    email: full!.email,
    firstName: full!.firstName,
    lastName: full!.lastName,
    role: full!.role,
    schoolRoleId: full!.schoolRoleId ?? null,
    schoolRole: full!.schoolRole
      ? { id: full!.schoolRole.id, name: full!.schoolRole.name, baseRole: full!.schoolRole.baseRole }
      : null,
    permissions: resolvePermissionsForUser(full!),
  });
});

export default router;
