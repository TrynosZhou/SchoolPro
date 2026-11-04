import { IsNull } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import {
  ALL_PERMISSION_KEYS,
  DEFAULT_ROLE_PERMISSIONS,
  SYSTEM_ROLE_NAMES,
  sanitizePermissions,
} from '../config/permissions';
import { SchoolRole, User } from '../entities';
import { UserRole } from '../entities/enums';
import { relations } from '../utils/typeorm-helpers';

export async function ensureDefaultRoles(): Promise<void> {
  const roleRepo = AppDataSource.getRepository(SchoolRole);
  const userRepo = AppDataSource.getRepository(User);

  for (const baseRole of Object.values(UserRole)) {
    const name = SYSTEM_ROLE_NAMES[baseRole];
    const defaults = DEFAULT_ROLE_PERMISSIONS[baseRole];
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
    if (
      role.isSystem &&
      (baseRole === UserRole.PARENT || baseRole === UserRole.STUDENT) &&
      permCount > 0 &&
      permCount < defaults.length
    ) {
      role.permissions = defaults;
      dirty = true;
    }
    if (dirty) await roleRepo.save(role);
  }

  const roles = await roleRepo.find();
  const byBase = new Map(roles.map((r) => [r.baseRole, r]));

  for (const user of await userRepo.find({ where: { schoolRoleId: IsNull() } })) {
    const match = byBase.get(user.role);
    if (match) {
      user.schoolRoleId = match.id;
      await userRepo.save(user);
    }
  }
}

export function resolvePermissionsForUser(user: User): string[] {
  if (user.schoolRole?.permissions?.length) {
    return sanitizePermissions(user.schoolRole.permissions);
  }
  return [...DEFAULT_ROLE_PERMISSIONS[user.role]];
}

export async function loadUserWithRole(userId: string): Promise<User | null> {
  return AppDataSource.getRepository(User).findOne({
    where: { id: userId },
    relations: relations('schoolRole', 'staffProfile', 'parentProfile', 'studentProfile'),
  });
}

export function validatePermissionKeys(keys: string[]): string[] {
  return sanitizePermissions(keys);
}

export function assertValidBaseRole(role: unknown): UserRole | null {
  const value = String(role || '').toLowerCase();
  if (Object.values(UserRole).includes(value as UserRole)) {
    return value as UserRole;
  }
  return null;
}
