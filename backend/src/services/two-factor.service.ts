import bcrypt from 'bcryptjs';
import QRCode from 'qrcode';
import { User } from '../entities';
import { UserRole } from '../entities/enums';
import {
  buildOtpAuthUrl,
  generateBackupCodes,
  generateTotpSecret,
  normalizeBackupCode,
  verifyTotp,
} from './totp.service';

/**
 * Two-factor authentication (TOTP + single-use backup codes) for privileged
 * staff accounts: director, principal, admin and accountant.
 */
export const TWO_FACTOR_ROLES: UserRole[] = [
  UserRole.DIRECTOR,
  UserRole.PRINCIPAL,
  UserRole.ADMIN,
  UserRole.ACCOUNTANT,
];

const BACKUP_CODE_COUNT = 10;
const ISSUER = 'School Pro';

export function isTwoFactorAvailable(user: Pick<User, 'role'>): boolean {
  return TWO_FACTOR_ROLES.includes(user.role);
}

export function isTwoFactorEnabled(
  user: Pick<User, 'role' | 'twoFactorEnabled' | 'twoFactorSecret'>,
): boolean {
  return isTwoFactorAvailable(user) && !!user.twoFactorEnabled && !!user.twoFactorSecret;
}

export interface EnrollmentStart {
  secret: string;
  otpauthUrl: string;
  qrDataUrl: string;
}

/** Generate a fresh secret and the QR code the user scans to enrol. */
export async function startEnrollment(user: User): Promise<EnrollmentStart> {
  const secret = generateTotpSecret();
  const otpauthUrl = buildOtpAuthUrl({
    secret,
    accountName: user.email,
    issuer: ISSUER,
  });
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 220 });
  return { secret, otpauthUrl, qrDataUrl };
}

/** Enable 2FA once the user proves they can generate a code, and issue backup codes. */
export async function confirmEnrollment(user: User, code: string): Promise<string[] | null> {
  const pending = user.twoFactorPendingSecret;
  if (!pending) return null;
  if (!verifyTotp(pending, code)) return null;

  const backupCodes = generateBackupCodes(BACKUP_CODE_COUNT);
  user.twoFactorSecret = pending;
  user.twoFactorPendingSecret = null;
  user.twoFactorEnabled = true;
  user.twoFactorEnabledAt = new Date();
  user.twoFactorBackupCodes = await hashAll(backupCodes);
  return backupCodes;
}

export function revokeTwoFactor(user: User): void {
  user.twoFactorEnabled = false;
  user.twoFactorSecret = null;
  user.twoFactorPendingSecret = null;
  user.twoFactorBackupCodes = null;
  user.twoFactorEnabledAt = null;
}

/** Verify a live TOTP code, then replace the backup-code set. */
export async function regenerateBackupCodes(user: User, code: string): Promise<string[] | null> {
  if (!user.twoFactorSecret || !verifyTotp(user.twoFactorSecret, code)) return null;
  const backupCodes = generateBackupCodes(BACKUP_CODE_COUNT);
  user.twoFactorBackupCodes = await hashAll(backupCodes);
  return backupCodes;
}

export interface ChallengeSubmission {
  code?: string;
  backupCode?: string;
}

/**
 * Verify a login challenge: either the 6-digit authenticator code, or one of the
 * backup codes (which is consumed so it can never be reused).
 */
export async function verifyChallenge(
  user: User,
  submission: ChallengeSubmission,
): Promise<boolean> {
  if (!user.twoFactorSecret) return false;

  if (submission.backupCode) {
    const remaining = await consumeBackupCode(user, submission.backupCode);
    if (!remaining) return false;
    user.twoFactorBackupCodes = remaining;
    return true;
  }

  return verifyTotp(user.twoFactorSecret, String(submission.code || ''));
}

/** Returns the remaining hashes if the code matched, otherwise null. */
async function consumeBackupCode(user: User, rawCode: string): Promise<string[] | null> {
  const hashes = user.twoFactorBackupCodes || [];
  if (!hashes.length) return null;
  const normalized = normalizeBackupCode(rawCode);

  for (let i = 0; i < hashes.length; i++) {
    if (await bcrypt.compare(normalized, hashes[i])) {
      return [...hashes.slice(0, i), ...hashes.slice(i + 1)];
    }
  }
  return null;
}

function hashAll(codes: string[]): Promise<string[]> {
  // Hash the canonical (dash-stripped) form so verification matches regardless of
  // whether the user types the dash shown in the "XXXX-XXXX" grouping.
  return Promise.all(codes.map((code) => bcrypt.hash(normalizeBackupCode(code), 10)));
}
