import { AppDataSource } from '../config/data-source';
import { env } from '../config/env';
import { Message, Notification, SchoolSettings, User } from '../entities';
import { sendTransactionalEmail } from './email.service';

/**
 * Notify the recipient of a newly-created direct message: always an in-app
 * notification, plus a best-effort email. Safe to call fire-and-forget — never
 * throws (failures are logged).
 */
export async function notifyNewMessage(message: Message): Promise<void> {
  try {
    const userRepo = AppDataSource.getRepository(User);
    const sender =
      message.sender || (await userRepo.findOne({ where: { id: message.senderId } }));
    const senderName = sender
      ? `${sender.firstName} ${sender.lastName}`.trim()
      : 'Someone';

    const notifRepo = AppDataSource.getRepository(Notification);
    await notifRepo.save(
      notifRepo.create({
        userId: message.recipientId,
        title: `New message from ${senderName}`,
        message: message.subject,
        type: 'message_received',
        metadata: {
          messageId: message.id,
          threadId: message.threadId,
          senderId: message.senderId,
        },
      }),
    );

    const recipient =
      message.recipient || (await userRepo.findOne({ where: { id: message.recipientId } }));
    if (recipient?.email) {
      const settings = await AppDataSource.getRepository(SchoolSettings).findOne({
        where: { id: 'default' },
      });
      const schoolName = settings?.schoolName || 'School Pro Academy';
      const portalUrl = env.frontendUrl.replace(/\/$/, '');
      await sendTransactionalEmail({
        to: recipient.email,
        subject: `${schoolName}: New message — ${message.subject}`,
        text:
          `You have a new message from ${senderName}.\n\n` +
          `Subject: ${message.subject}\n\n${message.body}\n\n` +
          `Sign in to ${portalUrl} to read and reply.`,
      });
    }
  } catch (err) {
    console.error('notifyNewMessage failed:', err);
  }
}
