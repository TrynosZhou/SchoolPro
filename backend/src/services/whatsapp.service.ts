import { env } from '../config/env';
import { getEffectiveWhatsApp } from './integrations.service';

async function sendTwilioMessage(params: {
  accountSid: string;
  authToken: string;
  from: string;
  to: string;
  body: string;
}): Promise<boolean> {
  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${params.accountSid}/Messages.json`;
    const body = new URLSearchParams({
      From: params.from,
      To: params.to,
      Body: params.body,
    });
    const auth = Buffer.from(`${params.accountSid}:${params.authToken}`).toString('base64');
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    return res.ok;
  } catch (err) {
    console.error('Twilio message send failed:', err);
    return false;
  }
}

export async function sendWhatsAppReminder(
  phone: string,
  message: string
): Promise<boolean> {
  const whatsapp = await getEffectiveWhatsApp();

  if (whatsapp.useMock || !whatsapp.enabled) {
    console.log(`[WhatsApp mock] To: ${phone} | ${message}`);
    return true;
  }

  if (!whatsapp.from) return false;
  const to = phone.startsWith('whatsapp:') ? phone : `whatsapp:${phone}`;
  return sendTwilioMessage({
    accountSid: whatsapp.accountSid,
    authToken: whatsapp.authToken,
    from: whatsapp.from,
    to,
    body: message,
  });
}

/** SMS via Twilio (uses TWILIO_SMS_FROM or a non-whatsapp From number). */
export async function sendSmsMessage(phone: string, message: string): Promise<boolean> {
  const whatsapp = await getEffectiveWhatsApp();
  const smsFrom = env.sms.from || (whatsapp.from?.replace(/^whatsapp:/i, '') ?? '');

  if (whatsapp.useMock || !whatsapp.enabled || !smsFrom) {
    console.log(`[SMS mock] To: ${phone} | ${message}`);
    return true;
  }

  const to = phone.replace(/^whatsapp:/i, '');
  return sendTwilioMessage({
    accountSid: whatsapp.accountSid,
    authToken: whatsapp.authToken,
    from: smsFrom,
    to,
    body: message,
  });
}
