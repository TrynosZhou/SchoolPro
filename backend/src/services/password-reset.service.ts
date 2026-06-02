import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { IsNull, MoreThan, Not } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import { User } from '../entities';
import { env } from '../config/env';
import { getSecurityPolicy } from '../services/security-policy.service';
import { validatePasswordAgainstPolicy } from '../types/security-policy';
import { sendTransactionalEmail } from './email.service';
import { loadSchoolBranding } from './school-branding.service';
import { findActiveUserByLoginIdentifier, isLikelyEmail } from '../utils/user-auth';

const RESET_TOKEN_BYTES = 32;
const RESET_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

function buildResetUrl(rawToken: string): string {
  const base = env.frontendUrl.replace(/\/$/, '');
  return `${base}/login?reset=${encodeURIComponent(rawToken)}`;
}

export async function requestPasswordReset(identifier: string) {
  const genericMessage =
    'If an account exists for that username or email, password reset instructions have been sent.';

  const trimmed = identifier?.trim();
  if (!trimmed) {
    return { message: genericMessage };
  }

  const userRepo = AppDataSource.getRepository(User);
  const user = await findActiveUserByLoginIdentifier(trimmed);
  if (!user) {
    return { message: genericMessage };
  }

  if (!isLikelyEmail(user.email)) {
    return {
      message:
        'This account does not have a valid email on file. Contact your school administrator to reset your password.',
    };
  }

  const rawToken = crypto.randomBytes(RESET_TOKEN_BYTES).toString('hex');
  const tokenHash = await bcrypt.hash(rawToken, 10);

  user.passwordResetTokenHash = tokenHash;
  user.passwordResetExpires = new Date(Date.now() + RESET_EXPIRY_MS);
  user.failedLoginAttempts = 0;
  user.lockedUntil = null;
  await userRepo.save(user);

  const branding = await loadSchoolBranding();
  const schoolName = branding.schoolName || 'School Pro';
  const resetUrl = buildResetUrl(rawToken);
  const text =
    `Hello ${user.firstName},\n\n` +
    `We received a request to reset your password for ${schoolName}.\n\n` +
    `Open this link to choose a new password (valid for 1 hour):\n${resetUrl}\n\n` +
    `If you did not request this, you can ignore this email. Your password will not change.\n\n` +
    `— ${schoolName}`;

  const html =
    `<p>Hello ${user.firstName},</p>` +
    `<p>We received a request to reset your password for <strong>${schoolName}</strong>.</p>` +
    `<p><a href="${resetUrl}">Reset your password</a> (link expires in 1 hour).</p>` +
    `<p>If you did not request this, you can ignore this email.</p>`;

  const emailResult = await sendTransactionalEmail({
    to: user.email,
    subject: `${schoolName} — Reset your password`,
    text,
    html,
  });

  const response: {
    message: string;
    resetUrl?: string;
    emailSent?: boolean;
  } = { message: genericMessage };

  if (env.nodeEnv === 'development') {
    response.resetUrl = resetUrl;
    response.emailSent = emailResult.sent;
    console.log(`[Password reset] ${user.email} → ${resetUrl}`);
  }

  return response;
}

export async function resetPasswordWithToken(token: string, newPassword: string) {
  const raw = token?.trim();
  if (!raw) {
    throw new Error('Reset token is required.');
  }

  const policy = await getSecurityPolicy();
  const pwdErr = validatePasswordAgainstPolicy(newPassword, policy);
  if (pwdErr) {
    throw new Error(pwdErr);
  }

  const userRepo = AppDataSource.getRepository(User);
  const now = new Date();
  const candidates = await userRepo.find({
    where: {
      isActive: true,
      passwordResetTokenHash: Not(IsNull()),
      passwordResetExpires: MoreThan(now),
    },
  });

  let matched: User | null = null;
  for (const user of candidates) {
    if (!user.passwordResetTokenHash) continue;
    const ok = await bcrypt.compare(raw, user.passwordResetTokenHash);
    if (ok) {
      matched = user;
      break;
    }
  }

  if (!matched) {
    throw new Error('This reset link is invalid or has expired. Request a new password reset.');
  }

  matched.passwordHash = await bcrypt.hash(newPassword, 10);
  matched.passwordResetTokenHash = null;
  matched.passwordResetExpires = null;
  matched.failedLoginAttempts = 0;
  matched.lockedUntil = null;
  await userRepo.save(matched);

  return {
    message: 'Your password has been updated. You can sign in with your new password.',
  };
}
