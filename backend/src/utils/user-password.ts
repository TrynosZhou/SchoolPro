import bcrypt from 'bcryptjs';
import { User } from '../entities';
import { datePasswordCandidates } from './date-only';

/** Verify a password, including common date-of-birth format variants for student portal accounts. */
export async function verifyUserPassword(user: User, candidate: string): Promise<boolean> {
  const hash = user.passwordHash;
  if (!hash) return false;

  const candidates = datePasswordCandidates(candidate);
  for (const attempt of candidates) {
    if (await bcrypt.compare(attempt, hash)) return true;
  }
  return false;
}
