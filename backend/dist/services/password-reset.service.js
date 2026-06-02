"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestPasswordReset = requestPasswordReset;
exports.resetPasswordWithToken = resetPasswordWithToken;
const crypto_1 = __importDefault(require("crypto"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const typeorm_1 = require("typeorm");
const data_source_1 = require("../config/data-source");
const entities_1 = require("../entities");
const env_1 = require("../config/env");
const security_policy_service_1 = require("../services/security-policy.service");
const security_policy_1 = require("../types/security-policy");
const email_service_1 = require("./email.service");
const school_branding_service_1 = require("./school-branding.service");
const user_auth_1 = require("../utils/user-auth");
const RESET_TOKEN_BYTES = 32;
const RESET_EXPIRY_MS = 60 * 60 * 1000; // 1 hour
function buildResetUrl(rawToken) {
    const base = env_1.env.frontendUrl.replace(/\/$/, '');
    return `${base}/login?reset=${encodeURIComponent(rawToken)}`;
}
async function requestPasswordReset(identifier) {
    const genericMessage = 'If an account exists for that username or email, password reset instructions have been sent.';
    const trimmed = identifier?.trim();
    if (!trimmed) {
        return { message: genericMessage };
    }
    const userRepo = data_source_1.AppDataSource.getRepository(entities_1.User);
    const user = await (0, user_auth_1.findActiveUserByLoginIdentifier)(trimmed);
    if (!user) {
        return { message: genericMessage };
    }
    if (!(0, user_auth_1.isLikelyEmail)(user.email)) {
        return {
            message: 'This account does not have a valid email on file. Contact your school administrator to reset your password.',
        };
    }
    const rawToken = crypto_1.default.randomBytes(RESET_TOKEN_BYTES).toString('hex');
    const tokenHash = await bcryptjs_1.default.hash(rawToken, 10);
    user.passwordResetTokenHash = tokenHash;
    user.passwordResetExpires = new Date(Date.now() + RESET_EXPIRY_MS);
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    await userRepo.save(user);
    const branding = await (0, school_branding_service_1.loadSchoolBranding)();
    const schoolName = branding.schoolName || 'School Pro';
    const resetUrl = buildResetUrl(rawToken);
    const text = `Hello ${user.firstName},\n\n` +
        `We received a request to reset your password for ${schoolName}.\n\n` +
        `Open this link to choose a new password (valid for 1 hour):\n${resetUrl}\n\n` +
        `If you did not request this, you can ignore this email. Your password will not change.\n\n` +
        `— ${schoolName}`;
    const html = `<p>Hello ${user.firstName},</p>` +
        `<p>We received a request to reset your password for <strong>${schoolName}</strong>.</p>` +
        `<p><a href="${resetUrl}">Reset your password</a> (link expires in 1 hour).</p>` +
        `<p>If you did not request this, you can ignore this email.</p>`;
    const emailResult = await (0, email_service_1.sendTransactionalEmail)({
        to: user.email,
        subject: `${schoolName} — Reset your password`,
        text,
        html,
    });
    const response = { message: genericMessage };
    if (env_1.env.nodeEnv === 'development') {
        response.resetUrl = resetUrl;
        response.emailSent = emailResult.sent;
        console.log(`[Password reset] ${user.email} → ${resetUrl}`);
    }
    return response;
}
async function resetPasswordWithToken(token, newPassword) {
    const raw = token?.trim();
    if (!raw) {
        throw new Error('Reset token is required.');
    }
    const policy = await (0, security_policy_service_1.getSecurityPolicy)();
    const pwdErr = (0, security_policy_1.validatePasswordAgainstPolicy)(newPassword, policy);
    if (pwdErr) {
        throw new Error(pwdErr);
    }
    const userRepo = data_source_1.AppDataSource.getRepository(entities_1.User);
    const now = new Date();
    const candidates = await userRepo.find({
        where: {
            isActive: true,
            passwordResetTokenHash: (0, typeorm_1.Not)((0, typeorm_1.IsNull)()),
            passwordResetExpires: (0, typeorm_1.MoreThan)(now),
        },
    });
    let matched = null;
    for (const user of candidates) {
        if (!user.passwordResetTokenHash)
            continue;
        const ok = await bcryptjs_1.default.compare(raw, user.passwordResetTokenHash);
        if (ok) {
            matched = user;
            break;
        }
    }
    if (!matched) {
        throw new Error('This reset link is invalid or has expired. Request a new password reset.');
    }
    matched.passwordHash = await bcryptjs_1.default.hash(newPassword, 10);
    matched.passwordResetTokenHash = null;
    matched.passwordResetExpires = null;
    matched.failedLoginAttempts = 0;
    matched.lockedUntil = null;
    await userRepo.save(matched);
    return {
        message: 'Your password has been updated. You can sign in with your new password.',
    };
}
