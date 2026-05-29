import { AppDataSource } from '../config/data-source';
import { SchoolSettings } from '../entities';
import { env } from '../config/env';
import {
  DEFAULT_INTEGRATIONS,
  IntegrationsConfig,
  IntegrationsPublic,
  integrationStatus,
  maskIntegrations,
  mergeIntegrations,
  normalizeIntegrations,
  WhatsAppIntegration,
} from '../types/integrations-config';

const SETTINGS_ID = 'default';
let cachedConfig: IntegrationsConfig | null = null;
let cacheTime = 0;
const CACHE_MS = 30_000;

export function invalidateIntegrationsCache(): void {
  cachedConfig = null;
  cacheTime = 0;
}

export async function getIntegrationsConfig(): Promise<IntegrationsConfig> {
  const now = Date.now();
  if (cachedConfig && now - cacheTime < CACHE_MS) return cachedConfig;

  const repo = AppDataSource.getRepository(SchoolSettings);
  let settings = await repo.findOne({ where: { id: SETTINGS_ID } });
  if (!settings) {
    settings = await repo.save(
      repo.create({
        id: SETTINGS_ID,
        schoolName: 'School Pro Academy',
        integrationsConfig: DEFAULT_INTEGRATIONS,
      }),
    );
  }

  let config = normalizeIntegrations(settings.integrationsConfig || DEFAULT_INTEGRATIONS);

  // Seed from .env when DB has no WhatsApp credentials yet
  if (!config.whatsapp.accountSid && env.whatsapp.accountSid) {
    config = normalizeIntegrations({
      ...config,
      whatsapp: {
        ...config.whatsapp,
        enabled: env.whatsapp.enabled || config.whatsapp.enabled,
        accountSid: env.whatsapp.accountSid,
        authToken: env.whatsapp.authToken,
        from: env.whatsapp.from,
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

export async function getIntegrationsPublic(): Promise<{
  integrations: IntegrationsPublic;
  status: Record<string, 'active' | 'configured' | 'disabled'>;
  envFallback: { whatsapp: boolean };
}> {
  const config = await getIntegrationsConfig();
  return {
    integrations: maskIntegrations(config),
    status: integrationStatus(config),
    envFallback: {
      whatsapp: !!(env.whatsapp.accountSid && !config.whatsapp.accountSid),
    },
  };
}

export async function saveIntegrationsConfig(
  patch: Partial<IntegrationsConfig>,
): Promise<IntegrationsPublic> {
  const repo = AppDataSource.getRepository(SchoolSettings);
  const settings = await repo.findOne({ where: { id: SETTINGS_ID } });
  if (!settings) throw new Error('School settings not found');

  const existing = await getIntegrationsConfig();
  settings.integrationsConfig = mergeIntegrations(existing, patch);
  await repo.save(settings);
  invalidateIntegrationsCache();

  return maskIntegrations(settings.integrationsConfig);
}

export async function getEffectiveWhatsApp(): Promise<WhatsAppIntegration & { useMock: boolean }> {
  const config = await getIntegrationsConfig();
  const w = config.whatsapp;

  if (w.enabled && w.accountSid && w.authToken && w.from) {
    return { ...w, useMock: false };
  }

  if (env.whatsapp.enabled && env.whatsapp.accountSid && env.whatsapp.authToken && env.whatsapp.from) {
    return {
      enabled: true,
      accountSid: env.whatsapp.accountSid,
      authToken: env.whatsapp.authToken,
      from: env.whatsapp.from,
      useMock: false,
    };
  }

  return { ...w, enabled: w.enabled || env.whatsapp.enabled, useMock: true };
}

export async function testCustomApiConnection(): Promise<{ ok: boolean; message: string; status?: number }> {
  const config = await getIntegrationsConfig();
  const api = config.customApi;
  if (!api.baseUrl) return { ok: false, message: 'Base URL is required' };

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (api.authType === 'bearer' && api.apiKey) {
    headers.Authorization = `Bearer ${api.apiKey}`;
  } else if (api.authType === 'api-key' && api.apiKey) {
    headers[api.apiKeyHeader || 'X-API-Key'] = api.apiKey;
  } else if (api.authType === 'basic' && api.username) {
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
  } catch (err) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : 'Connection failed';
    return { ok: false, message: msg };
  }
}

export async function testWebhookConnection(): Promise<{ ok: boolean; message: string }> {
  const config = await getIntegrationsConfig();
  const wh = config.webhook;
  if (!wh.url) return { ok: false, message: 'Webhook URL is required' };

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
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Webhook test failed';
    return { ok: false, message: msg };
  }
}
