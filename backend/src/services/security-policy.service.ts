import { AppDataSource } from '../config/data-source';
import { SchoolSettings } from '../entities';
import { tenantContext } from '../config/tenant-context';
import {
  DEFAULT_SECURITY_POLICY,
  normalizeSecurityPolicy,
  SecurityPolicy,
} from '../types/security-policy';

const SETTINGS_ID = 'default';
/**
 * Keyed by tenant ("demo" | "prod") so a demo request can never be served a
 * stale in-memory copy of production's settings (or vice versa) within the
 * cache window — this module-level cache sits above the DataSource proxy, so
 * it needs its own tenant separation.
 */
const cache = new Map<string, { policy: SecurityPolicy; time: number }>();
const CACHE_MS = 30_000;

function cacheKey(): string {
  return tenantContext.isDemo() ? 'demo' : 'prod';
}

export async function getSecurityPolicy(): Promise<SecurityPolicy> {
  const key = cacheKey();
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && now - cached.time < CACHE_MS) return cached.policy;

  const repo = AppDataSource.getRepository(SchoolSettings);
  try {
    let settings = await repo.findOne({ where: { id: SETTINGS_ID } });
    if (!settings) {
      try {
        settings = await repo.save(
          repo.create({
            id: SETTINGS_ID,
            schoolName: 'School Pro Academy',
            securityPolicy: DEFAULT_SECURITY_POLICY,
          }),
        );
      } catch (insertErr) {
        console.warn('[security-policy] Could not auto-create default settings row (non-fatal, schema may still be initialising or DB read-only):', insertErr instanceof Error ? insertErr.message : String(insertErr));
        cache.set(key, { policy: DEFAULT_SECURITY_POLICY, time: now });
        return { ...DEFAULT_SECURITY_POLICY };
      }
    }
    const policy = normalizeSecurityPolicy(settings.securityPolicy || DEFAULT_SECURITY_POLICY);
    if (!settings.securityPolicy) {
      try {
        settings.securityPolicy = policy;
        await repo.save(settings);
      } catch (saveErr) {
        console.warn('[security-policy] Could not persist default policy (non-fatal):', saveErr instanceof Error ? saveErr.message : String(saveErr));
      }
    }
    cache.set(key, { policy, time: now });
    return policy;
  } catch (err) {
    console.warn('[security-policy] Falling back to DEFAULT_SECURITY_POLICY because DB lookup failed:', err instanceof Error ? err.message : String(err));
    return { ...DEFAULT_SECURITY_POLICY };
  }
}

export function invalidateSecurityPolicyCache(): void {
  cache.clear();
}
