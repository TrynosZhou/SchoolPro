import { UserRole } from '../../entities/enums';
import {
  confirmEnrollment, isTwoFactorAvailable, isTwoFactorEnabled,
  regenerateBackupCodes, revokeTwoFactor, verifyChallenge,
} from '../../services/two-factor.service';
import { generateTotp, generateTotpSecret } from '../../services/totp.service';

const user = (over: any = {}): any => ({ id: 'u1', email: 'a@b.com', role: UserRole.ADMIN, ...over });

describe('two-factor service', () => {
  it('is available only for admin, accountant, director and principal', () => {
    for (const role of [UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.DIRECTOR, UserRole.PRINCIPAL]) {
      expect(isTwoFactorAvailable({ role })).toBe(true);
    }
    for (const role of [UserRole.PARENT, UserRole.STUDENT, UserRole.TEACHER]) {
      expect(isTwoFactorAvailable({ role })).toBe(false);
    }
  });

  it('enrolment needs a valid code, then issues 10 single-use backup codes', async () => {
    const secret = generateTotpSecret();
    const u = user({ twoFactorPendingSecret: secret });
    expect(await confirmEnrollment(u, '000000')).toBeNull();
    expect(u.twoFactorEnabled).toBeFalsy();

    const codes = await confirmEnrollment(u, generateTotp(secret));
    expect(codes).toHaveLength(10);
    expect(u.twoFactorEnabled).toBe(true);
    expect(u.twoFactorSecret).toBe(secret);
    expect(u.twoFactorPendingSecret).toBeNull();
    expect(u.twoFactorBackupCodes).toHaveLength(10);
    expect(u.twoFactorBackupCodes[0]).not.toBe(codes![0]); // stored hashed
    expect(isTwoFactorEnabled(u)).toBe(true);
  });

  it('accepts a live TOTP and rejects a wrong one', async () => {
    const secret = generateTotpSecret();
    const u = user({ twoFactorSecret: secret, twoFactorEnabled: true });
    expect(await verifyChallenge(u, { code: generateTotp(secret) })).toBe(true);
    expect(await verifyChallenge(u, { code: '123456' })).toBe(false);
  });

  it('consumes a backup code exactly once', async () => {
    const secret = generateTotpSecret();
    const u = user({ twoFactorPendingSecret: secret });
    const codes = (await confirmEnrollment(u, generateTotp(secret)))!;

    expect(await verifyChallenge(u, { backupCode: codes[3].toLowerCase() })).toBe(true);
    expect(u.twoFactorBackupCodes).toHaveLength(9);
    expect(await verifyChallenge(u, { backupCode: codes[3] })).toBe(false); // reuse refused
    expect(await verifyChallenge(u, { backupCode: 'NOPE-NOPE' })).toBe(false);
  });

  it('regenerates backup codes only with a valid TOTP, and revoke clears everything', async () => {
    const secret = generateTotpSecret();
    const u = user({ twoFactorSecret: secret, twoFactorEnabled: true, twoFactorBackupCodes: ['x'] });
    expect(await regenerateBackupCodes(u, '000000')).toBeNull();
    expect(await regenerateBackupCodes(u, generateTotp(secret))).toHaveLength(10);

    revokeTwoFactor(u);
    expect(u.twoFactorEnabled).toBe(false);
    expect(u.twoFactorSecret).toBeNull();
    expect(u.twoFactorBackupCodes).toBeNull();
    expect(isTwoFactorEnabled(u)).toBe(false);
  });
});
