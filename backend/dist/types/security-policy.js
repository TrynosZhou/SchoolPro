"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_SECURITY_POLICY = void 0;
exports.normalizeSecurityPolicy = normalizeSecurityPolicy;
exports.validateSecurityPolicy = validateSecurityPolicy;
exports.validatePasswordAgainstPolicy = validatePasswordAgainstPolicy;
exports.sessionTimeoutToJwtExpires = sessionTimeoutToJwtExpires;
exports.passwordPolicySummary = passwordPolicySummary;
exports.DEFAULT_SECURITY_POLICY = {
    minPasswordLength: 8,
    requireUppercase: true,
    requireLowercase: true,
    requireNumber: true,
    requireSpecialChar: false,
    maxLoginAttempts: 5,
    lockoutDurationMinutes: 15,
    sessionTimeoutMinutes: 480,
    passwordExpiryDays: 0,
    requirePasswordChangeOnFirstLogin: false,
};
function normalizeSecurityPolicy(raw) {
    return {
        minPasswordLength: Math.min(32, Math.max(6, Number(raw.minPasswordLength) || exports.DEFAULT_SECURITY_POLICY.minPasswordLength)),
        requireUppercase: raw.requireUppercase !== false,
        requireLowercase: raw.requireLowercase !== false,
        requireNumber: raw.requireNumber !== false,
        requireSpecialChar: Boolean(raw.requireSpecialChar),
        maxLoginAttempts: Math.min(20, Math.max(3, Number(raw.maxLoginAttempts) || exports.DEFAULT_SECURITY_POLICY.maxLoginAttempts)),
        lockoutDurationMinutes: Math.min(1440, Math.max(5, Number(raw.lockoutDurationMinutes) || exports.DEFAULT_SECURITY_POLICY.lockoutDurationMinutes)),
        sessionTimeoutMinutes: Math.min(10080, Math.max(15, Number(raw.sessionTimeoutMinutes) || exports.DEFAULT_SECURITY_POLICY.sessionTimeoutMinutes)),
        passwordExpiryDays: Math.min(365, Math.max(0, Number(raw.passwordExpiryDays) || 0)),
        requirePasswordChangeOnFirstLogin: Boolean(raw.requirePasswordChangeOnFirstLogin),
    };
}
function validateSecurityPolicy(raw) {
    if (!raw || typeof raw !== 'object')
        return 'Invalid security policy';
    const p = normalizeSecurityPolicy(raw);
    if (p.maxLoginAttempts < 3)
        return 'Maximum login attempts must be at least 3';
    if (p.lockoutDurationMinutes < 5)
        return 'Lockout duration must be at least 5 minutes';
    return null;
}
function validatePasswordAgainstPolicy(password, policy) {
    const pwd = String(password || '');
    if (pwd.length < policy.minPasswordLength) {
        return `Password must be at least ${policy.minPasswordLength} characters`;
    }
    if (policy.requireUppercase && !/[A-Z]/.test(pwd)) {
        return 'Password must include an uppercase letter';
    }
    if (policy.requireLowercase && !/[a-z]/.test(pwd)) {
        return 'Password must include a lowercase letter';
    }
    if (policy.requireNumber && !/\d/.test(pwd)) {
        return 'Password must include a number';
    }
    if (policy.requireSpecialChar && !/[^A-Za-z0-9]/.test(pwd)) {
        return 'Password must include a special character';
    }
    return null;
}
function sessionTimeoutToJwtExpires(minutes) {
    if (minutes >= 1440 && minutes % 1440 === 0)
        return `${minutes / 1440}d`;
    if (minutes >= 60 && minutes % 60 === 0)
        return `${minutes / 60}h`;
    return `${minutes}m`;
}
function passwordPolicySummary(policy) {
    const rules = [`At least ${policy.minPasswordLength} characters`];
    if (policy.requireUppercase)
        rules.push('One uppercase letter');
    if (policy.requireLowercase)
        rules.push('One lowercase letter');
    if (policy.requireNumber)
        rules.push('One number');
    if (policy.requireSpecialChar)
        rules.push('One special character');
    return rules;
}
