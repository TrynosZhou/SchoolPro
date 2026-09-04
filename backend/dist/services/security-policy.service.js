"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSecurityPolicy = getSecurityPolicy;
exports.invalidateSecurityPolicyCache = invalidateSecurityPolicyCache;
const data_source_1 = require("../config/data-source");
const entities_1 = require("../entities");
const tenant_context_1 = require("../config/tenant-context");
const security_policy_1 = require("../types/security-policy");
const SETTINGS_ID = 'default';
/**
 * Keyed by tenant ("demo" | "prod") so a demo request can never be served a
 * stale in-memory copy of production's settings (or vice versa) within the
 * cache window — this module-level cache sits above the DataSource proxy, so
 * it needs its own tenant separation.
 */
const cache = new Map();
const CACHE_MS = 30000;
function cacheKey() {
    return tenant_context_1.tenantContext.isDemo() ? 'demo' : 'prod';
}
async function getSecurityPolicy() {
    const key = cacheKey();
    const now = Date.now();
    const cached = cache.get(key);
    if (cached && now - cached.time < CACHE_MS)
        return cached.policy;
    const repo = data_source_1.AppDataSource.getRepository(entities_1.SchoolSettings);
    let settings = await repo.findOne({ where: { id: SETTINGS_ID } });
    if (!settings) {
        settings = await repo.save(repo.create({
            id: SETTINGS_ID,
            schoolName: 'School Pro Academy',
            securityPolicy: security_policy_1.DEFAULT_SECURITY_POLICY,
        }));
    }
    const policy = (0, security_policy_1.normalizeSecurityPolicy)(settings.securityPolicy || security_policy_1.DEFAULT_SECURITY_POLICY);
    if (!settings.securityPolicy) {
        settings.securityPolicy = policy;
        await repo.save(settings);
    }
    cache.set(key, { policy, time: now });
    return policy;
}
function invalidateSecurityPolicyCache() {
    cache.clear();
}
