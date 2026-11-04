"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_2 = __importDefault(require("express"));
const notification_log_service_1 = require("../services/notification-log.service");
const router = (0, express_1.Router)();
/** Twilio posts application/x-www-form-urlencoded status callbacks. */
router.use(express_2.default.urlencoded({ extended: false }));
/**
 * Twilio WhatsApp/SMS delivery status callback.
 * Expects MessageSid, MessageStatus, and optionally ErrorCode in the POST body.
 */
router.post('/whatsapp-status', async (req, res) => {
    const messageSid = String(req.body?.MessageSid || '').trim();
    const messageStatus = String(req.body?.MessageStatus || '').trim();
    const errorCode = req.body?.ErrorCode;
    console.log(`[whatsapp-webhook] Status callback received: MessageSid=${messageSid}, MessageStatus=${messageStatus}, ErrorCode=${errorCode ?? 'n/a'}`);
    if (!messageSid || !messageStatus) {
        console.warn('[whatsapp-webhook] Missing MessageSid or MessageStatus — ignoring');
        return res.status(400).send('MessageSid and MessageStatus are required');
    }
    try {
        await (0, notification_log_service_1.updateNotificationLogByMessageSid)({ messageSid, messageStatus, errorCode });
        return res.status(200).send('');
    }
    catch (err) {
        console.error('[whatsapp-webhook] Failed to update notification_log:', err);
        // Return 200 so Twilio does not keep retrying on our DB errors.
        return res.status(200).send('');
    }
});
exports.default = router;
