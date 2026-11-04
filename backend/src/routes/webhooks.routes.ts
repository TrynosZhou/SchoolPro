import { Router, Response } from 'express';
import express from 'express';
import { updateNotificationLogByMessageSid } from '../services/notification-log.service';

const router = Router();

/** Twilio posts application/x-www-form-urlencoded status callbacks. */
router.use(express.urlencoded({ extended: false }));

/**
 * Twilio WhatsApp/SMS delivery status callback.
 * Expects MessageSid, MessageStatus, and optionally ErrorCode in the POST body.
 */
router.post('/whatsapp-status', async (req, res: Response) => {
  const messageSid = String(req.body?.MessageSid || '').trim();
  const messageStatus = String(req.body?.MessageStatus || '').trim();
  const errorCode = req.body?.ErrorCode;

  console.log(
    `[whatsapp-webhook] Status callback received: MessageSid=${messageSid}, MessageStatus=${messageStatus}, ErrorCode=${errorCode ?? 'n/a'}`,
  );

  if (!messageSid || !messageStatus) {
    console.warn('[whatsapp-webhook] Missing MessageSid or MessageStatus — ignoring');
    return res.status(400).send('MessageSid and MessageStatus are required');
  }

  try {
    await updateNotificationLogByMessageSid({ messageSid, messageStatus, errorCode });
    return res.status(200).send('');
  } catch (err) {
    console.error('[whatsapp-webhook] Failed to update notification_log:', err);
    // Return 200 so Twilio does not keep retrying on our DB errors.
    return res.status(200).send('');
  }
});

export default router;
