"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.invalidateIntegrationsCache = invalidateIntegrationsCache;
exports.getIntegrationsConfig = getIntegrationsConfig;
exports.getIntegrationsPublic = getIntegrationsPublic;
exports.saveIntegrationsConfig = saveIntegrationsConfig;
exports.getEffectiveWhatsApp = getEffectiveWhatsApp;
exports.testCustomApiConnection = testCustomApiConnection;
exports.testWebhookConnection = testWebhookConnection;
const data_source_1 = require("../config/data-source");
const entities_1 = require("../entities");
const env_1 = require("../config/env");
const integrations_config_1 = require("../types/integrations-config");
const SETTINGS_ID = 'default';
let cachedConfig = null;
let cacheTime = 0;
const CACHE_MS = 30000;
function invalidateIntegrationsCache() {
    cachedConfig = null;
    cacheTime = 0;
}
async function getIntegrationsConfig() {
    const now = Date.now();
    if (cachedConfig && now - cacheTime < CACHE_MS)
        return cachedConfig;
    const repo = data_source_1.AppDataSource.getRepository(entities_1.SchoolSettings);
    let settings = await repo.findOne({ where: { id: SETTINGS_ID } });
    if (!settings) {
        settings = await repo.save(repo.create({
            id: SETTINGS_ID,
            schoolName: 'School Pro Academy',
            integrationsConfig: integrations_config_1.DEFAULT_INTEGRATIONS,
        }));
    }
    let config = (0, integrations_config_1.normalizeIntegrations)(settings.integrationsConfig || integrations_config_1.DEFAULT_INTEGRATIONS);
    // Seed from .env when DB has no WhatsApp credentials yet
    if (!config.whatsapp.accountSid && env_1.env.whatsapp.accountSid) {
        config = (0, integrations_config_1.normalizeIntegrations)({
            ...config,
            whatsapp: {
                ...config.whatsapp,
                enabled: env_1.env.whatsapp.enabled || config.whatsapp.enabled,
                accountSid: env_1.env.whatsapp.accountSid,
                authToken: env_1.env.whatsapp.authToken,
                from: env_1.env.whatsapp.from,
            },
        });
    }
    if (!settings.integrationsConfig) {
        settings.integrationsConfig = config;
        await repo.save(settings);
    }
    cachedConfig = config;
    cacheTime = now;
    return config;
}
async function getIntegrationsPublic() {
    const config = await getIntegrationsConfig();
    return {
        integrations: (0, integrations_config_1.maskIntegrations)(config),
        status: (0, integrations_config_1.integrationStatus)(config),
        envFallback: {
            whatsapp: !!(env_1.env.whatsapp.accountSid && !config.whatsapp.accountSid),
        },
    };
}
async function saveIntegrationsConfig(patch) {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.SchoolSettings);
    const settings = await repo.findOne({ where: { id: SETTINGS_ID } });
    if (!settings)
        throw new Error('School settings not found');
    const existing = await getIntegrationsConfig();
    settings.integrationsConfig = (0, integrations_config_1.mergeIntegrations)(existing, patch);
    await repo.save(settings);
    invalidateIntegrationsCache();
    return (0, integrations_config_1.maskIntegrations)(settings.integrationsConfig);
}
async function getEffectiveWhatsApp() {
    const config = await getIntegrationsConfig();
    const w = config.whatsapp;
    if (w.enabled && w.accountSid && w.authToken && w.from) {
        return { ...w, useMock: false };
    }
    if (env_1.env.whatsapp.enabled && env_1.env.whatsapp.accountSid && env_1.env.whatsapp.authToken && env_1.env.whatsapp.from) {
        return {
            enabled: true,
            accountSid: env_1.env.whatsapp.accountSid,
            authToken: env_1.env.whatsapp.authToken,
            from: env_1.env.whatsapp.from,
            useMock: false,
        };
    }
    return { ...w, enabled: w.enabled || env_1.env.whatsapp.enabled, useMock: true };
}
async function testCustomApiConnection() {
    const config = await getIntegrationsConfig();
    const api = config.customApi;
    if (!api.baseUrl)
        return { ok: false, message: 'Base URL is required' };
    const headers = { Accept: 'application/json' };
    if (api.authType === 'bearer' && api.apiKey) {
        headers.Authorization = `Bearer ${api.apiKey}`;
    }
    else if (api.authType === 'api-key' && api.apiKey) {
        headers[api.apiKeyHeader || 'X-API-Key'] = api.apiKey;
    }
    else if (api.authType === 'basic' && api.username) {
        headers.Authorization = `Basic ${Buffer.from(`${api.username}:${api.password}`).toString('base64')}`;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), api.timeoutMs);
    try {
        const res = await fetch(api.baseUrl, {
            method: 'GET',
            headers,
            signal: controller.signal,
        });
        clearTimeout(timer);
        return {
            ok: res.ok || res.status < 500,
            status: res.status,
            message: res.ok
                ? `Connected successfully (HTTP ${res.status})`
                : `Reachable but returned HTTP ${res.status}`,
        };
    }
    catch (err) {
        clearTimeout(timer);
        const msg = err instanceof Error ? err.message : 'Connection failed';
        return { ok: false, message: msg };
    }
}
async function testWebhookConnection() {
    const config = await getIntegrationsConfig();
    const wh = config.webhook;
    if (!wh.url)
        return { ok: false, message: 'Webhook URL is required' };
    try {
        const res = await fetch(wh.url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(wh.secret ? { 'X-Webhook-Secret': wh.secret } : {}),
            },
            body: JSON.stringify({
                event: 'integration.test',
                timestamp: new Date().toISOString(),
                source: 'school-pro',
                message: 'Test ping from School Pro Integrations',
            }),
        });
        return {
            ok: res.ok || res.status < 500,
            message: res.ok
                ? `Webhook accepted (HTTP ${res.status})`
                : `Webhook reachable but returned HTTP ${res.status}`,
        };
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : 'Webhook test failed';
        return { ok: false, message: msg };
    }
}
