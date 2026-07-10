import { Router, Response } from 'express';
import { AppDataSource } from '../config/data-source';
import {
  BulkMessage,
  BulkMessageRecipient,
  Form,
  Notification,
  SchoolClass,
} from '../entities';
import { UserRole } from '../entities/enums';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { relations } from '../utils/typeorm-helpers';
import {
  getNotificationSettings,
  saveNotificationSettings,
} from '../services/notification-settings.service';
import { runFeeReminderJob } from '../services/auto-notify.service';
import {
  previewAudience,
  sendBulkMessage,
  resolveAudienceRecipients,
  BulkAudienceFilter,
  BulkChannel,
} from '../services/bulk-messaging.service';
import { requireModuleAccess } from '../middleware/access-control';
import { logAuditBulk } from '../services/audit-log.service';

const router = Router();
router.use(authenticate);

const STAFF_ROLES = [UserRole.ADMIN, UserRole.DIRECTOR, UserRole.PRINCIPAL] as const;
const commView = requireModuleAccess('communication', 'view');
const commCreate = requireModuleAccess('communication', 'create');

/* ------------------------------------------------------------------ */
/* In-app notifications feed (all authenticated users)                 */
/* ------------------------------------------------------------------ */

router.get('/notifications', async (req: AuthRequest, res: Response) => {
  const repo = AppDataSource.getRepository(Notification);
  const unreadOnly = String(req.query.unread || '') === '1';
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const where: Record<string, unknown> = { userId: req.user!.userId };
  if (unreadOnly) where.isRead = false;
  const rows = await repo.find({ where, order: { createdAt: 'DESC' }, take: limit });
  res.json(rows);
});

router.get('/notifications/unread-count', async (req: AuthRequest, res: Response) => {
  const rows = await AppDataSource.query(
    `SELECT COUNT(*)::int AS count FROM notifications WHERE "userId" = $1 AND "isRead" = false`,
    [req.user!.userId],
  );
  res.json({ count: Number(rows[0]?.count || 0) });
});

router.patch('/notifications/:id/read', async (req: AuthRequest, res: Response) => {
  const repo = AppDataSource.getRepository(Notification);
  const n = await repo.findOne({ where: { id: String(req.params.id), userId: req.user!.userId } });
  if (!n) return res.status(404).json({ message: 'Notification not found' });
  n.isRead = true;
  await repo.save(n);
  res.json(n);
});

router.post('/notifications/read-all', async (req: AuthRequest, res: Response) => {
  await AppDataSource.query(
    `UPDATE notifications SET "isRead" = true WHERE "userId" = $1 AND "isRead" = false`,
    [req.user!.userId],
  );
  res.json({ ok: true });
});

router.delete('/notifications/:id', async (req: AuthRequest, res: Response) => {
  const repo = AppDataSource.getRepository(Notification);
  const n = await repo.findOne({ where: { id: String(req.params.id), userId: req.user!.userId } });
  if (!n) return res.status(404).json({ message: 'Notification not found' });
  await repo.remove(n);
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ */
/* Automated notification settings (admin)                            */
/* ------------------------------------------------------------------ */

router.get('/notification-settings', authorize(...STAFF_ROLES), async (_req, res: Response) => {
  res.json(await getNotificationSettings());
});

router.patch('/notification-settings', authorize(UserRole.ADMIN), async (req, res: Response) => {
  const saved = await saveNotificationSettings(req.body || {});
  res.json(saved);
});

router.post('/fee-reminders/run', authorize(UserRole.ADMIN), async (_req, res: Response) => {
  const result = await runFeeReminderJob();
  res.json({ message: `Fee reminder scan complete. Sent ${result.reminders} reminder(s).`, ...result });
});

/* ------------------------------------------------------------------ */
/* Bulk SMS / email (admin/staff)                                     */
/* ------------------------------------------------------------------ */

router.get('/bulk/audiences', authorize(...STAFF_ROLES), commView, async (_req, res: Response) => {
  const classes = await AppDataSource.getRepository(SchoolClass).find({
    relations: relations('form'),
    order: { name: 'ASC' },
  });
  const forms = await AppDataSource.getRepository(Form).find({ order: { name: 'ASC' } });
  res.json({
    classes: classes.map((c) => ({ id: c.id, name: c.name, formName: c.form?.name || null })),
    forms: forms.map((f) => ({ id: f.id, name: f.name })),
  });
});

function parseFilter(body: Record<string, unknown>): BulkAudienceFilter | null {
  const scope = String(body.scope || '');
  const audience = String(body.audience || 'parents');
  if (!['class', 'form', 'all', 'custom'].includes(scope)) return null;
  if (!['parents', 'students', 'both'].includes(audience)) return null;
  return {
    scope: scope as BulkAudienceFilter['scope'],
    audience: audience as BulkAudienceFilter['audience'],
    classId: body.classId ? String(body.classId) : undefined,
    formId: body.formId ? String(body.formId) : undefined,
    studentIds: Array.isArray(body.studentIds) ? (body.studentIds as string[]) : undefined,
  };
}

router.post('/bulk/preview', authorize(...STAFF_ROLES), commView, async (req: AuthRequest, res: Response) => {
  const filter = parseFilter(req.body || {});
  if (!filter) return res.status(400).json({ message: 'Invalid audience selection' });
  res.json(await previewAudience(filter));
});

router.post('/bulk', authorize(...STAFF_ROLES), commCreate, async (req: AuthRequest, res: Response) => {
  const filter = parseFilter(req.body || {});
  if (!filter) return res.status(400).json({ message: 'Invalid audience selection' });

  const subject = String(req.body?.subject || '').trim();
  const body = String(req.body?.body || '').trim();
  const channels = (Array.isArray(req.body?.channels) ? req.body.channels : [])
    .map((c: unknown) => String(c))
    .filter((c: string) => c === 'email' || c === 'sms') as BulkChannel[];

  if (!subject || !body) return res.status(400).json({ message: 'Subject and message are required' });
  if (!channels.length) return res.status(400).json({ message: 'Select at least one channel (email or SMS)' });

  const preview = await previewAudience(filter);
  if (!preview.total) {
    return res.status(400).json({ message: 'No recipients match the selected audience' });
  }

  const bulk = await sendBulkMessage({
    senderId: req.user!.userId,
    subject,
    body,
    channels,
    filter,
  });

  const audience = await resolveAudienceRecipients(filter);
  const uniqueStudentIds = [...new Set(audience.map((r) => r.studentId).filter(Boolean))];
  if (uniqueStudentIds.length) {
    void logAuditBulk(
      uniqueStudentIds.map((studentId) => ({
        userId: req.user!.userId,
        userRole: req.user!.role,
        userEmail: req.user!.email,
        action: 'create' as const,
        module: 'communication',
        recordId: studentId,
        recordLabel: `${subject} (bulk)`,
        changes: [{ field: 'bulkMessageId', before: null, after: bulk.id }],
      })),
    );
  }

  res.status(201).json({
    id: bulk.id,
    subject: bulk.subject,
    audienceLabel: bulk.audienceLabel,
    channels: bulk.channels,
    totalRecipients: bulk.totalRecipients,
    sentCount: bulk.sentCount,
    failedCount: bulk.failedCount,
    createdAt: bulk.createdAt,
  });
});

router.get('/bulk', authorize(...STAFF_ROLES), commView, async (_req, res: Response) => {
  const rows = await AppDataSource.getRepository(BulkMessage).find({
    relations: relations('sender'),
    order: { createdAt: 'DESC' },
    take: 100,
  });
  res.json(
    rows.map((b) => ({
      id: b.id,
      subject: b.subject,
      audienceLabel: b.audienceLabel,
      channels: b.channels,
      totalRecipients: b.totalRecipients,
      sentCount: b.sentCount,
      failedCount: b.failedCount,
      senderName: b.sender ? `${b.sender.firstName} ${b.sender.lastName}`.trim() : null,
      createdAt: b.createdAt,
    })),
  );
});

router.get('/bulk/:id', authorize(...STAFF_ROLES), commView, async (req: AuthRequest, res: Response) => {
  const bulk = await AppDataSource.getRepository(BulkMessage).findOne({
    where: { id: String(req.params.id) },
    relations: relations('sender'),
  });
  if (!bulk) return res.status(404).json({ message: 'Bulk message not found' });
  const recipients = await AppDataSource.getRepository(BulkMessageRecipient).find({
    where: { bulkMessageId: bulk.id },
    order: { createdAt: 'ASC' },
  });
  res.json({
    id: bulk.id,
    subject: bulk.subject,
    body: bulk.body,
    audienceLabel: bulk.audienceLabel,
    channels: bulk.channels,
    totalRecipients: bulk.totalRecipients,
    sentCount: bulk.sentCount,
    failedCount: bulk.failedCount,
    senderName: bulk.sender ? `${bulk.sender.firstName} ${bulk.sender.lastName}`.trim() : null,
    createdAt: bulk.createdAt,
    recipients: recipients.map((r) => ({
      id: r.id,
      recipientName: r.recipientName,
      recipientType: r.recipientType,
      channel: r.channel,
      destination: r.destination,
      status: r.status,
      error: r.error,
    })),
  });
});

export default router;
