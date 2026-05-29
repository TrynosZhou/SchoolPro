"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSecurityPolicy = getSecurityPolicy;
exports.invalidateSecurityPolicyCache = invalidateSecurityPolicyCache;
const data_source_1 = require("../config/data-source");
const entities_1 = require("../entities");
const security_policy_1 = require("../types/security-policy");
const SETTINGS_ID = 'default';
let cachedPolicy = null;
let cacheTime = 0;
const CACHE_MS = 30000;
async function getSecurityPolicy() {
    const now = Date.now();
    if (cachedPolicy && now - cacheTime < CACHE_MS)
        return cachedPolicy;
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
    cachedPolicy = policy;
    cacheTime = now;
    return policy;
}
function invalidateSecurityPolicyCache() {
    cachedPolicy = null;
    cacheTime = 0;
}
