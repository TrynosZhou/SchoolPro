import { AppDataSource } from '../config/data-source';
import { SchoolSettings } from '../entities';
import {
  DEFAULT_SECURITY_POLICY,
  normalizeSecurityPolicy,
  SecurityPolicy,
} from '../types/security-policy';

const SETTINGS_ID = 'default';
let cachedPolicy: SecurityPolicy | null = null;
let cacheTime = 0;
const CACHE_MS = 30_000;

export async function getSecurityPolicy(): Promise<SecurityPolicy> {
  const now = Date.now();
  if (cachedPolicy && now - cacheTime < CACHE_MS) return cachedPolicy;

  const repo = AppDataSource.getRepository(SchoolSettings);
  let settings = await repo.findOne({ where: { id: SETTINGS_ID } });
  if (!settings) {
    settings = await repo.save(
      repo.create({
        id: SETTINGS_ID,
        schoolName: 'School Pro Academy',
        securityPolicy: DEFAULT_SECURITY_POLICY,
      }),
    );
  }
  const policy = normalizeSecurityPolicy(settings.securityPolicy || DEFAULT_SECURITY_POLICY);
  if (!settings.securityPolicy) {
    settings.securityPolicy = policy;
    await repo.save(settings);
  }
  cachedPolicy = policy;
  cacheTime = now;
  return policy;
}

export function invalidateSecurityPolicyCache(): void {
  cachedPolicy = null;
  cacheTime = 0;
}
