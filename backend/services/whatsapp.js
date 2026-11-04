// NOTE: TWILIO_WHATSAPP_NUMBER should currently be set to your Twilio WhatsApp sandbox number; replace it with your production WhatsApp sender number later.
require('dotenv').config();

const twilio = require('twilio');

const {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_WHATSAPP_NUMBER,
  TWILIO_SMS_FROM,
  TWILIO_CONTENT_SID,
  WHATSAPP_USE_TEMPLATE,
  TWILIO_STATUS_CALLBACK_URL,
  API_PUBLIC_URL,
} = process.env;

function useApprovedTemplate() {
  return WHATSAPP_USE_TEMPLATE === 'true' || WHATSAPP_USE_TEMPLATE === '1';
}

function buildRawBody({ examName, studentName, score, portalLink }) {
  return `Hello, results for ${examName} have been published. ${studentName} scored ${score}. View full details: ${portalLink}`;
}

/**
 * Maps notification fields to Twilio Content Template variables.
 * Register your template in Twilio Console with placeholders {{1}}–{{4}}:
 *   {{1}} = exam name, {{2}} = student name, {{3}} = score, {{4}} = portal link
 */
function buildContentVariables({ examName, studentName, score, portalLink }) {
  return JSON.stringify({
    1: examName,
    2: studentName,
    3: String(score),
    4: portalLink,
  });
}

function getStatusCallbackUrl() {
  if (TWILIO_STATUS_CALLBACK_URL && TWILIO_STATUS_CALLBACK_URL.trim()) {
    return TWILIO_STATUS_CALLBACK_URL.trim();
  }
  if (API_PUBLIC_URL && API_PUBLIC_URL.trim()) {
    return `${API_PUBLIC_URL.trim().replace(/\/$/, '')}/webhooks/whatsapp-status`;
  }
  return '';
}

function normalizeSmsPhone(parentPhone) {
  return String(parentPhone || '').replace(/^whatsapp:/i, '').trim();
}

function attachStatusCallback(payload) {
  const statusCallback = getStatusCallbackUrl();
  if (statusCallback) {
    payload.statusCallback = statusCallback;
  } else {
    console.warn(
      '[whatsapp] No statusCallback URL configured (set TWILIO_STATUS_CALLBACK_URL or API_PUBLIC_URL)',
    );
  }
  return payload;
}

/**
 * Send an exam result notification to a parent's WhatsApp number.
 *
 * @param {Object} params
 * @param {string} params.parentPhone - Parent's phone number in E.164 format (e.g. 2637XXXXXXX). Can optionally include the `whatsapp:` prefix.
 * @param {string} params.studentName - Student's full name.
 * @param {string} params.examName - Name of the exam.
 * @param {string|number} params.score - Result score or grade to display.
 * @param {string} params.portalLink - URL to the parent portal results page.
 * @returns {Promise<{success: boolean, sid?: string, error?: string}>}
 */
async function sendResultNotification({
  parentPhone,
  studentName,
  examName,
  score,
  portalLink,
}) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_WHATSAPP_NUMBER) {
    const msg = 'Missing one or more Twilio WhatsApp environment variables (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_NUMBER).';
    console.error(msg);
    return { success: false, error: msg };
  }

  const templateMode = useApprovedTemplate();
  if (templateMode && !TWILIO_CONTENT_SID) {
    const msg = 'WHATSAPP_USE_TEMPLATE is enabled but TWILIO_CONTENT_SID is not set.';
    console.error(msg);
    return { success: false, error: msg };
  }

  const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

  const to = parentPhone.startsWith('whatsapp:')
    ? parentPhone
    : `whatsapp:${parentPhone}`;

  const payload = templateMode
    ? {
        from: TWILIO_WHATSAPP_NUMBER,
        to,
        contentSid: TWILIO_CONTENT_SID,
        contentVariables: buildContentVariables({ examName, studentName, score, portalLink }),
      }
    : {
        from: TWILIO_WHATSAPP_NUMBER,
        to,
        body: buildRawBody({ examName, studentName, score, portalLink }),
      };

  console.log(
    `[whatsapp] Sending result notification (${templateMode ? 'template' : 'raw body'}) to ${to}`,
  );

  try {
    const message = await client.messages.create(attachStatusCallback(payload));
    return { success: true, sid: message.sid };
  } catch (err) {
    console.error('Failed to send WhatsApp result notification via Twilio:', err);
    return { success: false, error: err.message || 'Unknown error sending WhatsApp message' };
  }
}

/**
 * Send an exam result notification via plain SMS (fallback when WhatsApp is unavailable).
 *
 * @param {Object} params
 * @param {string} params.parentPhone - Parent's phone number in E.164 format.
 * @param {string} params.studentName - Student's full name.
 * @param {string} params.examName - Name of the exam.
 * @param {string|number} params.score - Result score or grade to display.
 * @param {string} params.portalLink - URL to the parent portal results page.
 * @returns {Promise<{success: boolean, sid?: string, error?: string}>}
 */
async function sendSmsFallback({
  parentPhone,
  studentName,
  examName,
  score,
  portalLink,
}) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_SMS_FROM) {
    const msg = 'Missing one or more Twilio SMS environment variables (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_SMS_FROM).';
    console.error(msg);
    return { success: false, error: msg };
  }

  const to = normalizeSmsPhone(parentPhone);
  if (!to) {
    const msg = 'Invalid parent phone number for SMS fallback.';
    console.error(msg);
    return { success: false, error: msg };
  }

  const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  const body = buildRawBody({ examName, studentName, score, portalLink });

  console.log(`[sms] Sending result notification fallback to ${to}`);

  try {
    const message = await client.messages.create(
      attachStatusCallback({
        from: TWILIO_SMS_FROM,
        to,
        body,
      }),
    );
    return { success: true, sid: message.sid };
  } catch (err) {
    console.error('Failed to send SMS result notification via Twilio:', err);
    return { success: false, error: err.message || 'Unknown error sending SMS message' };
  }
}

module.exports = {
  sendResultNotification,
  sendSmsFallback,
};
