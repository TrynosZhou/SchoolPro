"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPublicationStatus = getPublicationStatus;
exports.listPublishedExamTypesForTerm = listPublishedExamTypesForTerm;
exports.publishResults = publishResults;
exports.unpublishResults = unpublishResults;
const typeorm_1 = require("typeorm");
const data_source_1 = require("../config/data-source");
const env_1 = require("../config/env");
const entities_1 = require("../entities");
const typeorm_helpers_1 = require("../utils/typeorm-helpers");
const whatsapp_service_1 = require("./whatsapp.service");
const email_service_1 = require("./email.service");
const notification_settings_service_1 = require("./notification-settings.service");
const result_notification_service_1 = require("./result-notification.service");
function normalizePhone(phone) {
    const trimmed = phone.trim();
    if (!trimmed)
        return '';
    if (trimmed.startsWith('+'))
        return trimmed;
    if (trimmed.startsWith('0'))
        return `+263${trimmed.slice(1)}`;
    return `+${trimmed}`;
}
function buildResultsMessage(schoolName, termName, examTypeName) {
    const portalUrl = env_1.env.frontendUrl.replace(/\/$/, '');
    return (`${schoolName}: ${examTypeName} results for ${termName} have been published and are ready to view. ` +
        `Sign in to School Pro (${portalUrl}) to open your child's report card.`);
}
async function getPublicationStatus(termId, examTypeId) {
    const reportRepo = data_source_1.AppDataSource.getRepository(entities_1.ReportCard);
    const pubRepo = data_source_1.AppDataSource.getRepository(entities_1.ResultsPublication);
    const readyReportCardCount = await reportRepo.count({
        where: { termId, examTypeId },
    });
    const publication = await pubRepo.findOne({
        where: { termId, examTypeId },
        relations: (0, typeorm_helpers_1.relations)('publishedBy'),
    });
    const publishedCount = await reportRepo.count({
        where: { termId, examTypeId, isPublished: true },
    });
    return {
        termId,
        examTypeId,
        isPublished: !!publication && publishedCount > 0,
        publishedAt: publication?.publishedAt?.toISOString(),
        reportCardCount: publishedCount,
        readyReportCardCount,
        publishedByName: publication?.publishedBy
            ? `${publication.publishedBy.firstName} ${publication.publishedBy.lastName}`.trim()
            : undefined,
        whatsappSent: publication?.whatsappSent,
        smsSent: publication?.smsSent,
    };
}
async function listPublishedExamTypesForTerm(termId) {
    const pubRepo = data_source_1.AppDataSource.getRepository(entities_1.ResultsPublication);
    const rows = await pubRepo.find({
        where: { termId },
        relations: (0, typeorm_helpers_1.relations)('examType'),
        order: { publishedAt: 'DESC' },
    });
    return rows.map((p) => ({
        id: p.examTypeId,
        name: p.examType?.name || 'Exam',
        publishedAt: p.publishedAt,
    }));
}
async function publishResults(params) {
    const { termId, examTypeId, publishedByUserId, notifyWhatsApp = true, notifySms = true } = params;
    const term = await data_source_1.AppDataSource.getRepository(entities_1.Term).findOne({ where: { id: termId } });
    if (!term)
        throw new Error('Term not found');
    const examType = await data_source_1.AppDataSource.getRepository(entities_1.ExamType).findOne({ where: { id: examTypeId } });
    if (!examType)
        throw new Error('Exam type not found');
    const reportRepo = data_source_1.AppDataSource.getRepository(entities_1.ReportCard);
    const reports = await reportRepo.find({
        where: { termId, examTypeId },
        relations: (0, typeorm_helpers_1.relations)('student'),
    });
    if (!reports.length) {
        throw new Error('No report cards found for this term and exam type. Generate report cards from the Report Cards page first.');
    }
    await reportRepo.update({ termId, examTypeId }, { isPublished: true });
    const settings = await data_source_1.AppDataSource.getRepository(entities_1.SchoolSettings).findOne({ where: { id: 'default' } });
    const schoolName = settings?.schoolName || 'School Pro Academy';
    const examCfg = (await (0, notification_settings_service_1.getNotificationSettings)()).examResults;
    const message = examCfg.template
        ? examCfg.template
            .replace(/\{school\}/g, schoolName)
            .replace(/\{exam\}/g, examType.name)
            .replace(/\{term\}/g, term.name)
        : buildResultsMessage(schoolName, term.name, examType.name);
    const wantEmail = examCfg.channels.email;
    const wantInApp = examCfg.channels.inApp;
    const studentIds = [...new Set(reports.map((r) => r.studentId))];
    const guardians = await data_source_1.AppDataSource.getRepository(entities_1.Guardian).find({
        where: { studentId: (0, typeorm_1.In)(studentIds) },
        relations: (0, typeorm_helpers_1.relations)('parent', 'parent.user', 'student'),
    });
    const students = await data_source_1.AppDataSource.getRepository(entities_1.Student).find({
        where: { id: (0, typeorm_1.In)(studentIds) },
        relations: (0, typeorm_helpers_1.relations)('user'),
    });
    const phonesSms = new Set();
    const emails = new Set();
    const notifyUserIds = new Set();
    for (const g of guardians) {
        if (wantEmail) {
            const email = g.email || g.parent?.user?.email;
            if (email)
                emails.add(email);
        }
        const phone = g.phone || g.parent?.user?.phone;
        if (phone && notifySms) {
            const normalized = normalizePhone(phone);
            if (normalized)
                phonesSms.add(normalized);
        }
        if (g.parent?.userId) {
            notifyUserIds.add(g.parent.userId);
        }
    }
    for (const s of students) {
        if (s.userId)
            notifyUserIds.add(s.userId);
        if (wantEmail && s.user?.email)
            emails.add(s.user.email);
        if (s.user?.phone && notifySms) {
            const normalized = normalizePhone(s.user.phone);
            if (normalized)
                phonesSms.add(normalized);
        }
    }
    let whatsappSent = 0;
    let smsSent = 0;
    let emailsSent = 0;
    if (notifyWhatsApp) {
        try {
            const whatsappSummary = await (0, result_notification_service_1.queueWhatsAppResultNotifications)({
                reports,
                guardians,
                examTypeId,
                examName: examType.name,
                termId,
            });
            whatsappSent = whatsappSummary.whatsappQueued + whatsappSummary.smsQueued;
            console.log(`[publish-results] Result notifications queued: whatsapp=${whatsappSummary.whatsappQueued}, sms=${whatsappSummary.smsQueued}, skipped=${whatsappSummary.skipped}, enqueueFailed=${whatsappSummary.enqueueFailed}`);
        }
        catch (err) {
            console.error('[publish-results] WhatsApp result notifications failed (non-blocking):', err);
        }
    }
    if (notifySms) {
        for (const phone of phonesSms) {
            const ok = await (0, whatsapp_service_1.sendSmsMessage)(phone, message);
            if (ok)
                smsSent += 1;
        }
    }
    if (wantEmail) {
        const subject = `${schoolName}: ${examType.name} results published`;
        for (const email of emails) {
            const result = await (0, email_service_1.sendTransactionalEmail)({ to: email, subject, text: message });
            if (result.sent)
                emailsSent += 1;
        }
    }
    const notificationRepo = data_source_1.AppDataSource.getRepository(entities_1.Notification);
    let notificationsCreated = 0;
    const title = `${examType.name} results published`;
    for (const userId of wantInApp ? notifyUserIds : []) {
        await notificationRepo.save(notificationRepo.create({
            userId,
            title,
            message: `${term.name} — ${examType.name} results are now available in the parent portal.`,
            type: 'results_published',
            metadata: { termId, examTypeId, termName: term.name, examTypeName: examType.name },
            sentViaWhatsApp: notifyWhatsApp && whatsappSent > 0,
        }));
        notificationsCreated += 1;
    }
    const pubRepo = data_source_1.AppDataSource.getRepository(entities_1.ResultsPublication);
    let publication = await pubRepo.findOne({ where: { termId, examTypeId } });
    if (!publication) {
        publication = pubRepo.create({ termId, examTypeId });
    }
    publication.publishedAt = new Date();
    publication.publishedByUserId = publishedByUserId;
    publication.reportCardCount = reports.length;
    publication.whatsappSent = whatsappSent;
    publication.smsSent = smsSent;
    publication.notificationsCreated = notificationsCreated;
    await pubRepo.save(publication);
    return {
        message: `Published ${reports.length} report cards for ${term.name} · ${examType.name}.`,
        reportCardCount: reports.length,
        whatsappSent,
        smsSent,
        emailsSent,
        notificationsCreated,
        publishedAt: publication.publishedAt.toISOString(),
    };
}
async function unpublishResults(termId, examTypeId) {
    const term = await data_source_1.AppDataSource.getRepository(entities_1.Term).findOne({ where: { id: termId } });
    if (!term)
        throw new Error('Term not found');
    const examType = await data_source_1.AppDataSource.getRepository(entities_1.ExamType).findOne({ where: { id: examTypeId } });
    if (!examType)
        throw new Error('Exam type not found');
    const pubRepo = data_source_1.AppDataSource.getRepository(entities_1.ResultsPublication);
    const publication = await pubRepo.findOne({ where: { termId, examTypeId } });
    const reportRepo = data_source_1.AppDataSource.getRepository(entities_1.ReportCard);
    const publishedCount = await reportRepo.count({
        where: { termId, examTypeId, isPublished: true },
    });
    if (!publication && publishedCount === 0) {
        throw new Error('These results are not currently published.');
    }
    await reportRepo.update({ termId, examTypeId }, { isPublished: false });
    if (publication) {
        await pubRepo.remove(publication);
    }
    return {
        message: `Unpublished ${examType.name} results for ${term.name}. Parents and students can no longer view these report cards.`,
        reportCardCount: 0,
        unpublishedReportCards: publishedCount,
    };
}
