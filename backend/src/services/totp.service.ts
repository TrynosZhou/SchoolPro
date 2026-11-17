import crypto from 'crypto';

/**
 * RFC 6238 TOTP (and the RFC 4226 HOTP core) implemented with Node's crypto.
 *
 * Authenticator apps (Google Authenticator, Authy, Microsoft Authenticator, …)
 * speak the `otpauth://totp` URI scheme with a Base32 secret, SHA-1 and a
 * 30-second step, 6 digits — which is exactly what this module produces.
 */
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(input: string): Buffer {
  const clean = String(input || '').replace(/[\s=-]/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** 160-bit Base32 secret, as recommended by RFC 4226 §4. */
export function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

function hotp(key: Buffer, counter: number): string {
  const buffer = Buffer.alloc(8);
  buffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buffer.writeUInt32BE(counter >>> 0, 4);
  const digest = crypto.createHmac('sha1', key).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

export function generateTotp(
  secret: string,
  atSeconds = Math.floor(Date.now() / 1000),
): string {
  return hotp(base32Decode(secret), Math.floor(atSeconds / TOTP_PERIOD_SECONDS));
}

/** Verify a 6-digit code, tolerating clock drift of ±`window` steps (default ±30s). */
export function verifyTotp(secret: string, token: string, window = 1): boolean {
  const code = String(token || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(code)) return false;
  const key = base32Decode(secret);
  if (!key.length) return false;
  const counter = Math.floor(Date.now() / 1000 / TOTP_PERIOD_SECONDS);
  for (let drift = -window; drift <= window; drift++) {
    if (safeEqual(hotp(key, counter + drift), code)) return true;
  }
  return false;
}

/** The `otpauth://totp` URI an authenticator app scans from a QR code. */
export function buildOtpAuthUrl(params: {
  secret: string;
  accountName: string;
  issuer: string;
}): string {
  const label = encodeURIComponent(`${params.issuer}:${params.accountName}`);
  const query = new URLSearchParams({
    secret: params.secret,
    issuer: params.issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${query.toString()}`;
}

// Backup codes avoid ambiguous glyphs (no 0/O/1/I) so they can be read aloud.
const BACKUP_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateBackupCodes(count = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    let raw = '';
    for (let j = 0; j < 8; j++) {
      raw += BACKUP_CODE_ALPHABET[crypto.randomInt(BACKUP_CODE_ALPHABET.length)];
    }
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4)}`);
  }
  return codes;
}

export function normalizeBackupCode(code: string): string {
  // Strip spaces and the displayed "XXXX-XXXX" grouping so a code verifies whether
  // the user types the dash or the bare characters.
  return String(code || '').trim().toUpperCase().replace(/[\s-]+/g, '');
}
