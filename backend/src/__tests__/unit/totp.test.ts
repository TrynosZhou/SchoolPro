import {
  base32Decode, base32Encode, buildOtpAuthUrl, generateBackupCodes,
  generateTotp, generateTotpSecret, normalizeBackupCode, verifyTotp,
} from '../../services/totp.service';

// RFC 6238 Appendix B secret "12345678901234567890" in Base32.
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('TOTP', () => {
  afterEach(() => jest.useRealTimers());

  it('round-trips base32', () => {
    const buf = Buffer.from('hello world');
    expect(base32Decode(base32Encode(buf)).toString()).toBe('hello world');
  });

  it('matches RFC 6238 test vectors (6 digits)', () => {
    expect(generateTotp(RFC_SECRET, 59)).toBe('287082');
    expect(generateTotp(RFC_SECRET, 1111111109)).toBe('081804');
    expect(generateTotp(RFC_SECRET, 1234567890)).toBe('005924');
  });

  it('verifies the current code and tolerates ±1 step of drift', () => {
    jest.useFakeTimers().setSystemTime(new Date(1234567890 * 1000));
    expect(verifyTotp(RFC_SECRET, '005924')).toBe(true);
    expect(verifyTotp(RFC_SECRET, generateTotp(RFC_SECRET, 1234567890 - 30))).toBe(true);
    expect(verifyTotp(RFC_SECRET, generateTotp(RFC_SECRET, 1234567890 + 30))).toBe(true);
  });

  it('rejects stale, malformed and wrong codes', () => {
    jest.useFakeTimers().setSystemTime(new Date(1234567890 * 1000));
    expect(verifyTotp(RFC_SECRET, generateTotp(RFC_SECRET, 1234567890 - 120))).toBe(false);
    expect(verifyTotp(RFC_SECRET, '12345')).toBe(false);
    expect(verifyTotp(RFC_SECRET, 'abcdef')).toBe(false);
    expect(verifyTotp('', '005924')).toBe(false);
  });

  it('generates 160-bit secrets and an authenticator-compatible URI', () => {
    const secret = generateTotpSecret();
    expect(base32Decode(secret)).toHaveLength(20);
    const url = buildOtpAuthUrl({ secret, accountName: 'a@b.com', issuer: 'School Pro' });
    expect(url).toMatch(/^otpauth:\/\/totp\/School%20Pro%3Aa%40b\.com\?/);
    expect(url).toContain(`secret=${secret}`);
    expect(url).toContain('digits=6');
    expect(url).toContain('period=30');
  });

  it('generates unique backup codes in XXXX-XXXX form and normalises input', () => {
    const codes = generateBackupCodes(10);
    expect(new Set(codes).size).toBe(10);
    codes.forEach((c) => expect(c).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/));
    expect(normalizeBackupCode(' ab12-cd34 ')).toBe(normalizeBackupCode('AB12CD34'));
  });
});
