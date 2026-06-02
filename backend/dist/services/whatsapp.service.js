"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendWhatsAppReminder = sendWhatsAppReminder;
exports.sendSmsMessage = sendSmsMessage;
const env_1 = require("../config/env");
const integrations_service_1 = require("./integrations.service");
async function sendTwilioMessage(params) {
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
    }
    catch (err) {
        console.error('Twilio message send failed:', err);
        return false;
    }
}
async function sendWhatsAppReminder(phone, message) {
    const whatsapp = await (0, integrations_service_1.getEffectiveWhatsApp)();
    if (whatsapp.useMock || !whatsapp.enabled) {
        console.log(`[WhatsApp mock] To: ${phone} | ${message}`);
        return true;
    }
    if (!whatsapp.from)
        return false;
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
async function sendSmsMessage(phone, message) {
    const whatsapp = await (0, integrations_service_1.getEffectiveWhatsApp)();
    const smsFrom = env_1.env.sms.from || (whatsapp.from?.replace(/^whatsapp:/i, '') ?? '');
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
