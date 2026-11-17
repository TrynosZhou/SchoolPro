import { In } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import { Staff, Student, User } from '../entities';
import { relations } from './typeorm-helpers';

/** Resolve student display names for a set of ids. */
export async function studentNames(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean) as string[])];
  const map = new Map<string, string>();
  if (!unique.length) return map;
  const rows = await AppDataSource.getRepository(Student).find({
    where: { id: In(unique) },
    select: { id: true, firstName: true, lastName: true, admissionNumber: true },
  });
  for (const s of rows) {
    map.set(s.id, `${s.firstName} ${s.lastName}`.trim());
  }
  return map;
}

/** Resolve staff display names via their user account. */
export async function staffNames(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean) as string[])];
  const map = new Map<string, string>();
  if (!unique.length) return map;
  const rows = await AppDataSource.getRepository(Staff).find({
    where: { id: In(unique) },
    relations: relations('user'),
  });
  for (const s of rows) {
    const name = s.user
      ? `${(s.user as User).firstName || ''} ${(s.user as User).lastName || ''}`.trim()
      : '';
    map.set(s.id, name || s.employeeNumber || s.id);
  }
  return map;
}

/** Resolve user display names (any role). */
export async function userNames(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean) as string[])];
  const map = new Map<string, string>();
  if (!unique.length) return map;
  const rows = await AppDataSource.getRepository(User).find({
    where: { id: In(unique) },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
  for (const u of rows) {
    map.set(u.id, `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email || u.id);
  }
  return map;
}
