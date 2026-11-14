import { AppDataSource } from '../config/data-source';
import { SchoolSettings } from '../entities';
import { env } from '../config/env';
import { tenantContext } from '../config/tenant-context';
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
/** Keyed by tenant so demo and production never share a cached copy. */
const cache = new Map<string, { config: IntegrationsConfig; time: number }>();
const CACHE_MS = 30_000;

function cacheKey(): string {
  return tenantContext.isDemo() ? 'demo' : 'prod';
}

export function invalidateIntegrationsCache(): void {
  cache.clear();
}

export async function getIntegrationsConfig(): Promise<IntegrationsConfig> {
  const key = cacheKey();
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && now - cached.time < CACHE_MS) return cached.config;

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

  cache.set(key, { config, time: now });
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

/** Twilio Account SIDs always look like ACxxxxxxxx (34 chars). Reject emails / placeholders. */
export function isValidTwilioAccountSid(sid: string | undefined | null): boolean {
  return /^AC[a-f0-9]{32}$/i.test(String(sid || '').trim());
}

export async function getEffectiveWhatsApp(): Promise<WhatsAppIntegration & { useMock: boolean }> {
  const config = await getIntegrationsConfig();
  const w = config.whatsapp;

  if (w.accountSid && w.authToken && w.from) {
    if (isValidTwilioAccountSid(w.accountSid)) {
      return { ...w, enabled: true, useMock: false };
    }
    console.warn(
      `[whatsapp] Integrations Account SID is not a valid Twilio SID (got "${String(w.accountSid).slice(0, 24)}…"). ` +
        'Expected format ACxxxxxxxx. Falling back to mock until Integrations is updated.',
    );
  }

  const envFrom = env.whatsapp.from || process.env.TWILIO_WHATSAPP_NUMBER || '';
  if (env.whatsapp.accountSid && env.whatsapp.authToken && envFrom) {
    if (isValidTwilioAccountSid(env.whatsapp.accountSid)) {
      return {
        enabled: true,
        accountSid: env.whatsapp.accountSid,
        authToken: env.whatsapp.authToken,
        from: envFrom,
        useMock: false,
      };
    }
    console.warn(
      '[whatsapp] TWILIO_ACCOUNT_SID in .env is not a valid Twilio SID. Falling back to mock.',
    );
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
