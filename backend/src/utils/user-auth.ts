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

  const byUsername = await userRepo.findOne({
    where: { username: normalized, isActive: true },
    ...(relations ? { relations } : {}),
  });
  if (byUsername) return byUsername;

  return userRepo.findOne({
    where: { email: normalized, isActive: true },
    ...(relations ? { relations } : {}),
  });
}

export function isLikelyEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
