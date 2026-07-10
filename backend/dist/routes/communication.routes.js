"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const data_source_1 = require("../config/data-source");
const entities_1 = require("../entities");
const enums_1 = require("../entities/enums");
const auth_1 = require("../middleware/auth");
const typeorm_helpers_1 = require("../utils/typeorm-helpers");
const notification_settings_service_1 = require("../services/notification-settings.service");
const auto_notify_service_1 = require("../services/auto-notify.service");
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
