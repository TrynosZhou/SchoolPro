import { env } from '../config/env';

export async function sendWhatsAppReminder(
  phone: string,
  message: string
): Promise<boolean> {
  if (!env.whatsapp.enabled) {
    console.log(`[WhatsApp mock] To: ${phone} | ${message}`);
    return true;
  }
  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${env.whatsapp.accountSid}/Messages.json`;
    const body = new URLSearchParams({
      From: env.whatsapp.from,
      To: `whatsapp:${phone}`,
      Body: message,
    });
    const auth = Buffer.from(`${env.whatsapp.accountSid}:${env.whatsapp.authToken}`).toString('base64');
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
    console.error('WhatsApp send failed:', err);
    return false;
  }
}

