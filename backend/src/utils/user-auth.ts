import { FindOptionsRelations } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import { User } from '../entities';

export function normalizeLoginIdentifier(value: string): string {
  return String(value || '').trim().toLowerCase();
}

/** Resolve an active user by username or email (case-insensitive). */
export async function findActiveUserByLoginIdentifier(
  identifier: string,
  relations?: FindOptionsRelations<User>,
): Promise<User | null> {
  const normalized = normalizeLoginIdentifier(identifier);
  if (!normalized) return null;

  const userRepo = AppDataSource.getRepository(User);
  const qb = userRepo
    .createQueryBuilder('u')
    .where('u.isActive = :active', { active: true })
    .andWhere('(LOWER(u.username) = :id OR LOWER(u.email) = :id)', { id: normalized });

  if (relations) {
    for (const [key, value] of Object.entries(relations)) {
      if (value === true) {
        qb.leftJoinAndSelect(`u.${key}`, key);
      } else if (value && typeof value === 'object') {
        qb.leftJoinAndSelect(`u.${key}`, key);
      }
    }
  }

  return qb.getOne();
}

export function isLikelyEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
