"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notifyNewMessage = notifyNewMessage;
const data_source_1 = require("../config/data-source");
const env_1 = require("../config/env");
const entities_1 = require("../entities");
const email_service_1 = require("./email.service");
/**
 * Notify the recipient of a newly-created direct message: always an in-app
 * notification, plus a best-effort email. Safe to call fire-and-forget — never
 * throws (failures are logged).
 */
async function notifyNewMessage(message) {
    try {
        const userRepo = data_source_1.AppDataSource.getRepository(entities_1.User);
        const sender = message.sender || (await userRepo.findOne({ where: { id: message.senderId } }));
        const senderName = sender
            ? `${sender.firstName} ${sender.lastName}`.trim()
            : 'Someone';
        const notifRepo = data_source_1.AppDataSource.getRepository(entities_1.Notification);
        await notifRepo.save(notifRepo.create({
            userId: message.recipientId,
            title: `New message from ${senderName}`,
            message: message.subject,
            type: 'message_received',
            metadata: {
                messageId: message.id,
                threadId: message.threadId,
                senderId: message.senderId,
            },
        }));
        const recipient = message.recipient || (await userRepo.findOne({ where: { id: message.recipientId } }));
        if (recipient?.email) {
            const settings = await data_source_1.AppDataSource.getRepository(entities_1.SchoolSettings).findOne({
                where: { id: 'default' },
            });
            const schoolName = settings?.schoolName || 'School Pro Academy';
            const portalUrl = env_1.env.frontendUrl.replace(/\/$/, '');
            await (0, email_service_1.sendTransactionalEmail)({
                to: recipient.email,
                subject: `${schoolName}: New message — ${message.subject}`,
                text: `You have a new message from ${senderName}.\n\n` +
                    `Subject: ${message.subject}\n\n${message.body}\n\n` +
                    `Sign in to ${portalUrl} to read and reply.`,
            });
        }
    }
    catch (err) {
        console.error('notifyNewMessage failed:', err);
    }
}
