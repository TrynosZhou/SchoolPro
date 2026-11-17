"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-nocheck
const express_1 = require("express");
const data_source_1 = require("../config/data-source");
const entities_1 = require("../entities");
const enums_1 = require("../entities/enums");
const auth_1 = require("../middleware/auth");
const typeorm_helpers_1 = require("../utils/typeorm-helpers");
const notification_settings_service_1 = require("../services/notification-settings.service");
const auto_notify_service_1 = require("../services/auto-notify.service");
const push_service_1 = require("../services/push.service");
const bulk_messaging_service_1 = require("../services/bulk-messaging.service");
const access_control_1 = require("../middleware/access-control");
const audit_log_service_1 = require("../services/audit-log.service");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
const STAFF_ROLES = [enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL];
const commView = (0, access_control_1.requireModuleAccess)('communication', 'view');
const commCreate = (0, access_control_1.requireModuleAccess)('communication', 'create');
/* ------------------------------------------------------------------ */
/* In-app notifications feed (all authenticated users)                 */
/* ------------------------------------------------------------------ */
router.get('/notifications', async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.Notification);
    const unreadOnly = String(req.query.unread || '') === '1';
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const where = { userId: req.user.userId };
    if (unreadOnly)
        where.isRead = false;
    const rows = await repo.find({ where, order: { createdAt: 'DESC' }, take: limit });
    res.json(rows);
});
router.get('/notifications/unread-count', async (req, res) => {
    const rows = await data_source_1.AppDataSource.query(`SELECT COUNT(*)::int AS count FROM notifications WHERE "userId" = $1 AND "isRead" = false`, [req.user.userId]);
    res.json({ count: Number(rows[0]?.count || 0) });
});
router.patch('/notifications/:id/read', async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.Notification);
    const n = await repo.findOne({ where: { id: String(req.params.id), userId: req.user.userId } });
    if (!n)
        return res.status(404).json({ message: 'Notification not found' });
    n.isRead = true;
    await repo.save(n);
    res.json(n);
});
router.post('/notifications/read-all', async (req, res) => {
    await data_source_1.AppDataSource.query(`UPDATE notifications SET "isRead" = true WHERE "userId" = $1 AND "isRead" = false`, [req.user.userId]);
    res.json({ ok: true });
});
router.delete('/notifications/:id', async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.Notification);
    const n = await repo.findOne({ where: { id: String(req.params.id), userId: req.user.userId } });
    if (!n)
        return res.status(404).json({ message: 'Notification not found' });
    await repo.remove(n);
    res.json({ ok: true });
});
/* ------------------------------------------------------------------ */
/* Automated notification settings (admin)                            */
/* ------------------------------------------------------------------ */
router.get('/notification-settings', (0, auth_1.authorize)(...STAFF_ROLES), async (_req, res) => {
    res.json(await (0, notification_settings_service_1.getNotificationSettings)());
});
router.patch('/notification-settings', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (req, res) => {
    const saved = await (0, notification_settings_service_1.saveNotificationSettings)(req.body || {});
    res.json(saved);
});
router.post('/fee-reminders/run', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (_req, res) => {
    const result = await (0, auto_notify_service_1.runFeeReminderJob)();
    res.json({ message: `Fee reminder scan complete. Sent ${result.reminders} reminder(s).`, ...result });
});
/* ------------------------------------------------------------------ */
/* Browser / PWA push subscriptions (all authenticated users)         */
/* ------------------------------------------------------------------ */
/** Public VAPID key the browser needs to subscribe, plus whether push is live. */
router.get('/push/public-key', async (_req, res) => {
    res.json({ publicKey: (0, push_service_1.getVapidPublicKey)(), enabled: (0, push_service_1.isPushConfigured)() });
});
/** Register (or refresh) a browser push subscription for the current user. */
router.post('/push/subscribe', async (req, res) => {
    const endpoint = String(req.body?.endpoint || '').trim();
    const p256dh = String(req.body?.keys?.p256dh || '').trim();
    const auth = String(req.body?.keys?.auth || '').trim();
    if (!endpoint || !p256dh || !auth) {
        return res.status(400).json({ message: 'endpoint and keys.p256dh / keys.auth are required' });
    }
    const repo = data_source_1.AppDataSource.getRepository(entities_1.PushSubscription);
    let sub = await repo.findOne({ where: { endpoint } });
    if (sub) {
        sub.userId = req.user.userId;
        sub.p256dh = p256dh;
        sub.auth = auth;
        sub.userAgent = String(req.headers['user-agent'] || '').slice(0, 255) || sub.userAgent;
    }
    else {
        sub = repo.create({
            userId: req.user.userId,
            endpoint,
            p256dh,
            auth,
            userAgent: String(req.headers['user-agent'] || '').slice(0, 255) || undefined,
        });
    }
    await repo.save(sub);
    res.status(201).json({ ok: true });
});
/** Remove a browser push subscription (e.g. user disabled notifications). */
router.post('/push/unsubscribe', async (req, res) => {
    const endpoint = String(req.body?.endpoint || '').trim();
    if (!endpoint)
        return res.status(400).json({ message: 'endpoint is required' });
    await data_source_1.AppDataSource.getRepository(entities_1.PushSubscription).delete({
        endpoint,
        userId: req.user.userId,
    });
    res.json({ ok: true });
});
/** Send a test push to the current user's devices. */
router.post('/push/test', async (req, res) => {
    const summary = await (0, push_service_1.sendPushToUsers)([req.user.userId], {
        title: 'School Pro',
        body: 'Browser notifications are now enabled on this device.',
        type: 'push_test',
        url: '/notifications',
    });
    if (summary.skipped) {
        return res.status(503).json({ message: 'Push is not configured on the server.', ...summary });
    }
    res.json(summary);
});
/* ------------------------------------------------------------------ */
/* Bulk SMS / email (admin/staff)                                     */
/* ------------------------------------------------------------------ */
router.get('/bulk/audiences', (0, auth_1.authorize)(...STAFF_ROLES), commView, async (_req, res) => {
    const classes = await data_source_1.AppDataSource.getRepository(entities_1.SchoolClass).find({
        relations: (0, typeorm_helpers_1.relations)('form'),
        order: { name: 'ASC' },
    });
    const forms = await data_source_1.AppDataSource.getRepository(entities_1.Form).find({ order: { name: 'ASC' } });
    res.json({
        classes: classes.map((c) => ({ id: c.id, name: c.name, formName: c.form?.name || null })),
        forms: forms.map((f) => ({ id: f.id, name: f.name })),
    });
});
function parseFilter(body) {
    const scope = String(body.scope || '');
    const audience = String(body.audience || 'parents');
    if (!['class', 'form', 'all', 'custom'].includes(scope))
        return null;
    if (!['parents', 'students', 'both'].includes(audience))
        return null;
    return {
        scope: scope,
        audience: audience,
        classId: body.classId ? String(body.classId) : undefined,
        formId: body.formId ? String(body.formId) : undefined,
        studentIds: Array.isArray(body.studentIds) ? body.studentIds : undefined,
    };
}
router.post('/bulk/preview', (0, auth_1.authorize)(...STAFF_ROLES), commView, async (req, res) => {
    const filter = parseFilter(req.body || {});
    if (!filter)
        return res.status(400).json({ message: 'Invalid audience selection' });
    res.json(await (0, bulk_messaging_service_1.previewAudience)(filter));
});
router.post('/bulk', (0, auth_1.authorize)(...STAFF_ROLES), commCreate, async (req, res) => {
    const filter = parseFilter(req.body || {});
    if (!filter)
        return res.status(400).json({ message: 'Invalid audience selection' });
    const subject = String(req.body?.subject || '').trim();
    const body = String(req.body?.body || '').trim();
    const channels = (Array.isArray(req.body?.channels) ? req.body.channels : [])
        .map((c) => String(c))
        .filter((c) => c === 'email' || c === 'sms');
    if (!subject || !body)
        return res.status(400).json({ message: 'Subject and message are required' });
    if (!channels.length)
        return res.status(400).json({ message: 'Select at least one channel (email or SMS)' });
    const preview = await (0, bulk_messaging_service_1.previewAudience)(filter);
    if (!preview.total) {
        return res.status(400).json({ message: 'No recipients match the selected audience' });
    }
    const bulk = await (0, bulk_messaging_service_1.sendBulkMessage)({
        senderId: req.user.userId,
        subject,
        body,
        channels,
        filter,
    });
    const audience = await (0, bulk_messaging_service_1.resolveAudienceRecipients)(filter);
    const uniqueStudentIds = [...new Set(audience.map((r) => r.studentId).filter(Boolean))];
    if (uniqueStudentIds.length) {
        void (0, audit_log_service_1.logAuditBulk)(uniqueStudentIds.map((studentId) => ({
            userId: req.user.userId,
            userRole: req.user.role,
            userEmail: req.user.email,
            action: 'create',
            module: 'communication',
            recordId: studentId,
            recordLabel: `${subject} (bulk)`,
            changes: [{ field: 'bulkMessageId', before: null, after: bulk.id }],
        })));
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
router.get('/bulk', (0, auth_1.authorize)(...STAFF_ROLES), commView, async (_req, res) => {
    const rows = await data_source_1.AppDataSource.getRepository(entities_1.BulkMessage).find({
        relations: (0, typeorm_helpers_1.relations)('sender'),
        order: { createdAt: 'DESC' },
        take: 100,
    });
    res.json(rows.map((b) => ({
        id: b.id,
        subject: b.subject,
        audienceLabel: b.audienceLabel,
        channels: b.channels,
        totalRecipients: b.totalRecipients,
        sentCount: b.sentCount,
        failedCount: b.failedCount,
        senderName: b.sender ? `${b.sender.firstName} ${b.sender.lastName}`.trim() : null,
        createdAt: b.createdAt,
    })));
});
router.get('/bulk/:id', (0, auth_1.authorize)(...STAFF_ROLES), commView, async (req, res) => {
    const bulk = await data_source_1.AppDataSource.getRepository(entities_1.BulkMessage).findOne({
        where: { id: String(req.params.id) },
        relations: (0, typeorm_helpers_1.relations)('sender'),
    });
    if (!bulk)
        return res.status(404).json({ message: 'Bulk message not found' });
    const recipients = await data_source_1.AppDataSource.getRepository(entities_1.BulkMessageRecipient).find({
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
exports.default = router;
