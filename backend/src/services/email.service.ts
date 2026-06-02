import { getIntegrationsConfig } from './integrations.service';

export interface SendEmailResult {
  sent: boolean;
  mock: boolean;
  error?: string;
}

/** Send transactional email when SMTP is configured; otherwise log to console. */
export async function sendTransactionalEmail(params: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<SendEmailResult> {
  const config = await getIntegrationsConfig();
  const email = config.email;

  if (!email.enabled || !email.host || !email.user || !email.password) {
    console.log(`[Email] To: ${params.to}\nSubject: ${params.subject}\n\n${params.text}`);
    return { sent: false, mock: true };
  }

  try {
    const nodemailer = await import('nodemailer');
    const transport = nodemailer.createTransport({
      host: email.host,
      port: email.port || 587,
      secure: email.secure,
      auth: {
        user: email.user,
        pass: email.password,
      },
    });

    const from = email.fromEmail
      ? `"${email.fromName || 'School Pro'}" <${email.fromEmail}>`
      : email.user;

    await transport.sendMail({
      from,
      to: params.to,
      subject: params.subject,
      text: params.text,
      html: params.html || params.text.replace(/\n/g, '<br>'),
    });

    return { sent: true, mock: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Email send failed';
    console.error('[Email] Send failed:', message);
    console.log(`[Email fallback] To: ${params.to}\nSubject: ${params.subject}\n\n${params.text}`);
    return { sent: false, mock: true, error: message };
  }
}
