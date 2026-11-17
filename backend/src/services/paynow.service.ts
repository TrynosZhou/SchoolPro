import crypto from 'crypto';
import { getIntegrationsConfig } from './integrations.service';

/**
 * Paynow (Zimbabwe) payment gateway integration.
 *
 * Protocol notes:
 *  - Requests/responses are application/x-www-form-urlencoded.
 *  - Integrity is protected with a SHA512 hash: concatenate the values of every
 *    field (in the order they appear, excluding `hash`), append the integration
 *    key, hash with SHA512 and upper-case the hex digest.
 *  - Web/card checkout posts to `initiatetransaction` and returns a browser URL.
 *  - EcoCash/OneMoney express checkout posts to `remotetransaction` and returns
 *    instructions that the payer confirms on their handset.
 */
const PAYNOW_WEB_URL = 'https://www.paynow.co.zw/interface/initiatetransaction';
const PAYNOW_MOBILE_URL = 'https://www.paynow.co.zw/interface/remotetransaction';

const PAYNOW_SUCCESS_STATUSES = ['paid', 'awaiting delivery', 'delivered'];

export type PaynowChannel = 'visa' | 'ecocash' | 'onemoney';

export interface PaynowConfig {
  enabled: boolean;
  integrationId: string;
  integrationKey: string;
}

export async function getPaynowConfig(): Promise<PaynowConfig> {
  const config = await getIntegrationsConfig();
  const payment = config.payment;
  return {
    enabled:
      payment.enabled &&
      payment.provider === 'paynow' &&
      !!payment.merchantId &&
      !!payment.apiKey,
    integrationId: payment.merchantId,
    integrationKey: payment.apiKey,
  };
}

export async function isPaynowConfigured(): Promise<boolean> {
  return (await getPaynowConfig()).enabled;
}

/** Compute the Paynow SHA512 hash for a set of fields (order preserved). */
export function computePaynowHash(
  values: Record<string, string | undefined | null>,
  integrationKey: string,
): string {
  const concatenated = Object.keys(values)
    .filter((key) => key !== 'hash')
    .map((key) => {
      const value = values[key];
      return value === undefined || value === null ? '' : String(value);
    })
    .join('');
  return crypto
    .createHash('sha512')
    .update(`${concatenated}${integrationKey}`)
    .digest('hex')
    .toUpperCase();
}

/** Verify a hash that came back from Paynow matches the payload. */
export function verifyPaynowHash(
  payload: Record<string, string>,
  integrationKey: string,
): boolean {
  const incoming = String(payload.hash || '').toUpperCase();
  if (!incoming) return false;
  const expected = computePaynowHash(payload, integrationKey);
  if (incoming.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(incoming), Buffer.from(expected));
}

/** Parse an application/x-www-form-urlencoded body, preserving field order. */
export function parseUrlEncoded(body: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const pair of String(body || '').split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const rawKey = eq === -1 ? pair : pair.slice(0, eq);
    const rawValue = eq === -1 ? '' : pair.slice(eq + 1);
    const key = decodeURIComponent(rawKey.replace(/\+/g, ' '));
    const value = decodeURIComponent(rawValue.replace(/\+/g, ' '));
    if (key) result[key] = value;
  }
  return result;
}

export function isPaynowSuccessStatus(status?: string): boolean {
  return PAYNOW_SUCCESS_STATUSES.includes(String(status || '').trim().toLowerCase());
}

export interface PaynowInitiateParams {
  reference: string;
  amount: number;
  channel: PaynowChannel;
  phone?: string;
  authEmail?: string;
  additionalInfo?: string;
  resultUrl: string;
  returnUrl: string;
}

export interface PaynowInitiateResult {
  ok: boolean;
  status: string;
  browserUrl?: string;
  pollUrl?: string;
  instructions?: string;
  paynowReference?: string;
  error?: string;
  raw: Record<string, string>;
}

export async function initiatePaynowTransaction(
  params: PaynowInitiateParams,
): Promise<PaynowInitiateResult> {
  const config = await getPaynowConfig();
  if (!config.enabled) {
    return {
      ok: false,
      status: 'Error',
      error: 'Paynow is not configured. Enable it under Admin → Integrations.',
      raw: {},
    };
  }

  const isMobile = params.channel === 'ecocash' || params.channel === 'onemoney';

  const fields: Record<string, string> = {
    id: config.integrationId,
    reference: params.reference,
    amount: Number(params.amount).toFixed(2),
    additionalinfo: params.additionalInfo || 'School fees',
    returnurl: params.returnUrl,
    resulturl: params.resultUrl,
  };
  if (params.authEmail) fields.authemail = params.authEmail;

  if (isMobile) {
    if (!params.phone) {
      return {
        ok: false,
        status: 'Error',
        error: 'A mobile number is required for EcoCash or OneMoney payments.',
        raw: {},
      };
    }
    fields.phone = params.phone;
    fields.method = params.channel;
  } else {
    fields.status = 'Message';
  }

  fields.hash = computePaynowHash(fields, config.integrationKey);

  const url = isMobile ? PAYNOW_MOBILE_URL : PAYNOW_WEB_URL;
  let body: string;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields).toString(),
    });
    body = await response.text();
  } catch (err) {
    return {
      ok: false,
      status: 'Error',
      error: err instanceof Error ? err.message : 'Failed to reach Paynow.',
      raw: {},
    };
  }

  const parsed = parseUrlEncoded(body);
  if (!verifyPaynowHash(parsed, config.integrationKey)) {
    return {
      ok: false,
      status: parsed.status || 'Error',
      error: 'Paynow response could not be verified (invalid hash).',
      raw: parsed,
    };
  }

  const status = String(parsed.status || '');
  if (status.trim().toLowerCase() !== 'ok') {
    return {
      ok: false,
      status,
      error: parsed.error || `Paynow returned status "${status}".`,
      raw: parsed,
    };
  }

  return {
    ok: true,
    status,
    browserUrl: parsed.browserurl || undefined,
    pollUrl: parsed.pollurl || undefined,
    instructions: parsed.instructions || undefined,
    paynowReference: parsed.paynowreference || parsed.reference || undefined,
    raw: parsed,
  };
}

export interface PaynowPollResult {
  ok: boolean;
  status: string;
  paynowReference?: string;
  raw: Record<string, string>;
}

export async function pollPaynowStatus(pollUrl: string): Promise<PaynowPollResult> {
  const config = await getPaynowConfig();
  if (!config.enabled) return { ok: false, status: 'Error', raw: {} };
  if (!pollUrl) return { ok: false, status: 'Error', raw: {} };

  let body: string;
  try {
    const response = await fetch(pollUrl, { method: 'POST' });
    body = await response.text();
  } catch {
    return { ok: false, status: 'Error', raw: {} };
  }

  const parsed = parseUrlEncoded(body);
  if (!verifyPaynowHash(parsed, config.integrationKey)) {
    return { ok: false, status: parsed.status || 'Error', raw: parsed };
  }
  return {
    ok: true,
    status: String(parsed.status || ''),
    paynowReference: parsed.paynowreference || undefined,
    raw: parsed,
  };
}
