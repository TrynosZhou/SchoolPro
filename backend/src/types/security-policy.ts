export interface SecurityPolicy {
  minPasswordLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumber: boolean;
  requireSpecialChar: boolean;
  maxLoginAttempts: number;
  lockoutDurationMinutes: number;
  sessionTimeoutMinutes: number;
  passwordExpiryDays: number;
  requirePasswordChangeOnFirstLogin: boolean;
}

export const DEFAULT_SECURITY_POLICY: SecurityPolicy = {
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

export function normalizeSecurityPolicy(raw: Partial<SecurityPolicy>): SecurityPolicy {
  return {
    minPasswordLength: Math.min(32, Math.max(6, Number(raw.minPasswordLength) || DEFAULT_SECURITY_POLICY.minPasswordLength)),
    requireUppercase: raw.requireUppercase !== false,
    requireLowercase: raw.requireLowercase !== false,
    requireNumber: raw.requireNumber !== false,
    requireSpecialChar: Boolean(raw.requireSpecialChar),
    maxLoginAttempts: Math.min(20, Math.max(3, Number(raw.maxLoginAttempts) || DEFAULT_SECURITY_POLICY.maxLoginAttempts)),
    lockoutDurationMinutes: Math.min(1440, Math.max(5, Number(raw.lockoutDurationMinutes) || DEFAULT_SECURITY_POLICY.lockoutDurationMinutes)),
    sessionTimeoutMinutes: Math.min(10080, Math.max(15, Number(raw.sessionTimeoutMinutes) || DEFAULT_SECURITY_POLICY.sessionTimeoutMinutes)),
    passwordExpiryDays: Math.min(365, Math.max(0, Number(raw.passwordExpiryDays) || 0)),
    requirePasswordChangeOnFirstLogin: Boolean(raw.requirePasswordChangeOnFirstLogin),
  };
}

export function validateSecurityPolicy(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return 'Invalid security policy';
  const p = normalizeSecurityPolicy(raw as Partial<SecurityPolicy>);
  if (p.maxLoginAttempts < 3) return 'Maximum login attempts must be at least 3';
  if (p.lockoutDurationMinutes < 5) return 'Lockout duration must be at least 5 minutes';
  return null;
}

export function validatePasswordAgainstPolicy(password: string, policy: SecurityPolicy): string | null {
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

export function sessionTimeoutToJwtExpires(minutes: number): string {
  if (minutes >= 1440 && minutes % 1440 === 0) return `${minutes / 1440}d`;
  if (minutes >= 60 && minutes % 60 === 0) return `${minutes / 60}h`;
  return `${minutes}m`;
}

export function passwordPolicySummary(policy: SecurityPolicy): string[] {
  const rules: string[] = [`At least ${policy.minPasswordLength} characters`];
  if (policy.requireUppercase) rules.push('One uppercase letter');
  if (policy.requireLowercase) rules.push('One lowercase letter');
  if (policy.requireNumber) rules.push('One number');
  if (policy.requireSpecialChar) rules.push('One special character');
  return rules;
}
