export interface PasswordPolicy {
  minPasswordLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumber: boolean;
  requireSpecialChar: boolean;
}

export function passwordPolicyRules(policy: PasswordPolicy | null): string[] {
  if (!policy) return ['Use a strong password you do not use elsewhere.'];
  const rules: string[] = [`At least ${policy.minPasswordLength} characters`];
  if (policy.requireUppercase) rules.push('One uppercase letter');
  if (policy.requireLowercase) rules.push('One lowercase letter');
  if (policy.requireNumber) rules.push('One number');
  if (policy.requireSpecialChar) rules.push('One special character');
  return rules;
}

/** Mirrors backend validatePasswordAgainstPolicy. */
export function validatePasswordAgainstPolicy(
  password: string,
  policy: PasswordPolicy | null,
): string | null {
  if (!policy) return null;
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

export function passwordRuleChecks(
  password: string,
  policy: PasswordPolicy | null,
): { label: string; met: boolean }[] {
  if (!policy) return [];
  const pwd = String(password || '');
  const checks: { label: string; met: boolean }[] = [
    { label: `At least ${policy.minPasswordLength} characters`, met: pwd.length >= policy.minPasswordLength },
  ];
  if (policy.requireUppercase) {
    checks.push({ label: 'One uppercase letter', met: /[A-Z]/.test(pwd) });
  }
  if (policy.requireLowercase) {
    checks.push({ label: 'One lowercase letter', met: /[a-z]/.test(pwd) });
  }
  if (policy.requireNumber) {
    checks.push({ label: 'One number', met: /\d/.test(pwd) });
  }
  if (policy.requireSpecialChar) {
    checks.push({ label: 'One special character', met: /[^A-Za-z0-9]/.test(pwd) });
  }
  return checks;
}
