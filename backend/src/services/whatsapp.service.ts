import { env } from '../config/env';
import { getEffectiveWhatsApp } from './integrations.service';
import { tenantContext } from '../config/tenant-context';

export type TwilioSendResult = {
  success: boolean;
  sid?: string;
  error?: string;
  mocked?: boolean;
};

function buildResultBody(params: {
  examName: string;
  studentName: string;
  score: string | number;
  portalLink: string;
}): string {
  return `Hello, results for ${params.examName} have been published. ${params.studentName} scored ${params.score}. View full details: ${params.portalLink}`;
}

function getStatusCallbackUrl(): string {
  if (env.whatsapp.statusCallbackUrl?.trim()) {
    return env.whatsapp.statusCallbackUrl.trim();
  }
  if (env.apiPublicUrl?.trim()) {
    return `${env.apiPublicUrl.trim().replace(/\/$/, '')}/webhooks/whatsapp-status`;
  }
  return '';
}

async function sendTwilioMessage(params: {
  accountSid: string;
  authToken: string;
  from: string;
  to: string;
  body?: string;
  contentSid?: string;
  contentVariables?: string;
}): Promise<TwilioSendResult> {
  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${params.accountSid}/Messages.json`;
    const form = new URLSearchParams({
      From: params.from,
      To: params.to,
    });
    if (params.contentSid) {
      form.set('ContentSid', params.contentSid);
      if (params.contentVariables) form.set('ContentVariables', params.contentVariables);
    } else if (params.body) {
      form.set('Body', params.body);
    }
    const statusCallback = getStatusCallbackUrl();
    if (statusCallback) form.set('StatusCallback', statusCallback);

    const auth = Buffer.from(`${params.accountSid}:${params.authToken}`).toString('base64');
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form,
    });
    const payload = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
    if (!res.ok) {
      return {
        success: false,
        error: payload.message || `Twilio HTTP ${res.status}`,
      };
    }
    return { success: true, sid: payload.sid };
  } catch (err) {
    console.error('Twilio message send failed:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown Twilio send error',
    };
  }
}

function normalizeWhatsAppFrom(from: string): string {
  const trimmed = from.trim();
  if (!trimmed) return '';
  return trimmed.startsWith('whatsapp:') ? trimmed : `whatsapp:${trimmed}`;
}

export async function sendWhatsAppReminder(
  phone: string,
  message: string,
): Promise<boolean> {
  // Demo sessions never reach a real Twilio account, regardless of shared config.
  if (tenantContext.isDemo()) {
    console.log(`[WhatsApp DEMO MOCK] To: ${phone} | ${message}`);
    return true;
  }

  const whatsapp = await getEffectiveWhatsApp();

  if (whatsapp.useMock || !whatsapp.enabled) {
    console.log(`[WhatsApp mock] To: ${phone} | ${message}`);
    return true;
  }

  if (!whatsapp.from) return false;
  const to = phone.startsWith('whatsapp:') ? phone : `whatsapp:${phone}`;
  const result = await sendTwilioMessage({
    accountSid: whatsapp.accountSid,
    authToken: whatsapp.authToken,
    from: normalizeWhatsAppFrom(whatsapp.from),
    to,
    body: message,
  });
  return result.success;
}

/** SMS via Twilio (uses TWILIO_SMS_FROM or a non-whatsapp From number). */
export async function sendSmsMessage(phone: string, message: string): Promise<boolean> {
  if (tenantContext.isDemo()) {
    console.log(`[SMS DEMO MOCK] To: ${phone} | ${message}`);
    return true;
  }

  const whatsapp = await getEffectiveWhatsApp();
  const smsFrom = env.sms.from || (whatsapp.from?.replace(/^whatsapp:/i, '') ?? '');

  if (whatsapp.useMock || !whatsapp.enabled || !smsFrom) {
    console.log(`[SMS mock] To: ${phone} | ${message}`);
    return true;
  }

  const to = phone.replace(/^whatsapp:/i, '');
  const result = await sendTwilioMessage({
    accountSid: whatsapp.accountSid,
    authToken: whatsapp.authToken,
    from: smsFrom,
    to,
    body: message,
  });
  return result.success;
}

/**
 * Exam-result WhatsApp send using Integrations (or .env) Twilio credentials.
 * Returns structured success so publish counters can track real delivery.
 */
export async function sendResultWhatsApp(params: {
  parentPhone: string;
  studentName: string;
  examName: string;
  score: string | number;
  portalLink: string;
}): Promise<TwilioSendResult> {
  if (tenantContext.isDemo()) {
    console.log(`[WhatsApp DEMO MOCK] result → ${params.parentPhone}`);
    return { success: true, sid: `DEMO-WA-${Date.now()}`, mocked: true };
  }

  const whatsapp = await getEffectiveWhatsApp();
  const body = buildResultBody(params);
  const to = params.parentPhone.startsWith('whatsapp:')
    ? params.parentPhone
    : `whatsapp:${params.parentPhone}`;

  if (whatsapp.useMock || !whatsapp.accountSid || !whatsapp.authToken || !whatsapp.from) {
    console.log(`[WhatsApp mock] result → ${to} | ${body}`);
    return { success: true, sid: `MOCK-WA-${Date.now()}`, mocked: true };
  }

  const templateMode = env.whatsapp.useTemplate;
  if (templateMode && !env.whatsapp.contentSid) {
    return {
      success: false,
      error: 'WHATSAPP_USE_TEMPLATE is enabled but TWILIO_CONTENT_SID is not set.',
    };
  }

  console.log(
    `[whatsapp] Sending result notification (${templateMode ? 'template' : 'raw body'}) to ${to}`,
  );

  if (templateMode) {
    return sendTwilioMessage({
      accountSid: whatsapp.accountSid,
      authToken: whatsapp.authToken,
      from: normalizeWhatsAppFrom(whatsapp.from),
      to,
      contentSid: env.whatsapp.contentSid,
      contentVariables: JSON.stringify({
        1: params.examName,
        2: params.studentName,
        3: String(params.score),
        4: params.portalLink,
      }),
    });
  }

  return sendTwilioMessage({
    accountSid: whatsapp.accountSid,
    authToken: whatsapp.authToken,
    from: normalizeWhatsAppFrom(whatsapp.from),
    to,
    body,
  });
}

/** Exam-result SMS send (fallback or primary when WhatsApp is not allowed). */
export async function sendResultSms(params: {
  parentPhone: string;
  studentName: string;
  examName: string;
  score: string | number;
  portalLink: string;
}): Promise<TwilioSendResult> {
  if (tenantContext.isDemo()) {
    console.log(`[SMS DEMO MOCK] result → ${params.parentPhone}`);
    return { success: true, sid: `DEMO-SMS-${Date.now()}`, mocked: true };
  }

  const whatsapp = await getEffectiveWhatsApp();
  const smsFrom = env.sms.from || (whatsapp.from?.replace(/^whatsapp:/i, '') ?? '');
  const to = String(params.parentPhone || '').replace(/^whatsapp:/i, '').trim();
  const body = buildResultBody(params);

  if (!to) {
    return { success: false, error: 'Invalid parent phone number for SMS.' };
  }

  if (whatsapp.useMock || !whatsapp.accountSid || !whatsapp.authToken || !smsFrom) {
    console.log(`[SMS mock] result → ${to} | ${body}`);
    return { success: true, sid: `MOCK-SMS-${Date.now()}`, mocked: true };
  }

  console.log(`[sms] Sending result notification to ${to}`);
  return sendTwilioMessage({
    accountSid: whatsapp.accountSid,
    authToken: whatsapp.authToken,
    from: smsFrom,
    to,
    body,
  });
}
