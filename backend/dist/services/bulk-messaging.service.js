"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveAudienceRecipients = resolveAudienceRecipients;
exports.buildAudienceLabel = buildAudienceLabel;
exports.previewAudience = previewAudience;
exports.sendBulkMessage = sendBulkMessage;
const typeorm_1 = require("typeorm");
const data_source_1 = require("../config/data-source");
const entities_1 = require("../entities");
const typeorm_helpers_1 = require("../utils/typeorm-helpers");
const email_service_1 = require("./email.service");
const whatsapp_service_1 = require("./whatsapp.service");
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
async function resolveStudents(filter) {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.Student);
    if (filter.scope === 'custom') {
        const ids = (filter.studentIds || []).filter(Boolean);
        if (!ids.length)
            return [];
        return repo.find({ where: { id: (0, typeorm_1.In)(ids) }, relations: (0, typeorm_helpers_1.relations)('user') });
    }
    if (filter.scope === 'class' && filter.classId) {
        return repo.find({ where: { classId: filter.classId, isActive: true }, relations: (0, typeorm_helpers_1.relations)('user') });
    }
    if (filter.scope === 'form' && filter.formId) {
        return repo.find({ where: { formId: filter.formId, isActive: true }, relations: (0, typeorm_helpers_1.relations)('user') });
    }
    if (filter.scope === 'all') {
        return repo.find({ where: { isActive: true }, relations: (0, typeorm_helpers_1.relations)('user') });
    }
    return [];
}
async function resolveAudienceRecipients(filter) {
    const students = await resolveStudents(filter);
    if (!students.length)
        return [];
    const includeParents = filter.audience === 'parents' || filter.audience === 'both';
    const includeStudents = filter.audience === 'students' || filter.audience === 'both';
    const recipients = [];
    const seen = new Set();
    const push = (r) => {
        const key = `${r.type}:${(r.email || '').toLowerCase()}|${r.phone || ''}|${r.userId || ''}`;
        if (r.email || r.phone) {
            if (seen.has(key))
                return;
            seen.add(key);
        }
        recipients.push(r);
    };
    if (includeStudents) {
        for (const s of students) {
            push({
                studentId: s.id,
                userId: s.userId,
                name: `${s.firstName} ${s.lastName}`.trim(),
                type: 'student',
                email: s.user?.email || undefined,
                phone: s.user?.phone ? normalizePhone(s.user.phone) : undefined,
            });
        }
    }
    if (includeParents) {
        const studentIds = students.map((s) => s.id);
        const studentName = new Map(students.map((s) => [s.id, `${s.firstName} ${s.lastName}`.trim()]));
        const guardians = await data_source_1.AppDataSource.getRepository(entities_1.Guardian).find({
            where: { studentId: (0, typeorm_1.In)(studentIds) },
            relations: (0, typeorm_helpers_1.relations)('parent', 'parent.user'),
        });
        for (const g of guardians) {
            const email = g.email || g.parent?.user?.email || undefined;
            const rawPhone = g.phone || g.parent?.user?.phone || undefined;
            const name = g.fullName ||
                (g.parent?.user
                    ? `${g.parent.user.firstName} ${g.parent.user.lastName}`.trim()
                    : `Guardian of ${studentName.get(g.studentId) || ''}`.trim());
            push({
                studentId: g.studentId,
                userId: g.parent?.userId,
                name: name || 'Guardian',
                type: 'parent',
                email,
                phone: rawPhone ? normalizePhone(rawPhone) : undefined,
            });
        }
    }
    return recipients;
}
async function buildAudienceLabel(filter) {
    let scopeLabel = 'All students';
    if (filter.scope === 'class' && filter.classId) {
        const c = await data_source_1.AppDataSource.getRepository(entities_1.SchoolClass).findOne({ where: { id: filter.classId } });
        scopeLabel = c ? `Class ${c.name}` : 'Class';
    }
    else if (filter.scope === 'form' && filter.formId) {
        const f = await data_source_1.AppDataSource.getRepository(entities_1.Form).findOne({ where: { id: filter.formId } });
        scopeLabel = f ? `Form ${f.name}` : 'Form';
    }
    else if (filter.scope === 'custom') {
        scopeLabel = `${(filter.studentIds || []).length} selected student(s)`;
    }
    const audienceLabel = filter.audience === 'both' ? 'Parents & Students' : filter.audience === 'parents' ? 'Parents' : 'Students';
    return `${scopeLabel} · ${audienceLabel}`;
}
async function previewAudience(filter) {
    const recipients = await resolveAudienceRecipients(filter);
    return {
        total: recipients.length,
        parents: recipients.filter((r) => r.type === 'parent').length,
        students: recipients.filter((r) => r.type === 'student').length,
        withEmail: recipients.filter((r) => r.email).length,
        withPhone: recipients.filter((r) => r.phone).length,
        label: await buildAudienceLabel(filter),
        sample: recipients.slice(0, 8).map((r) => ({
            name: r.name,
            type: r.type,
            email: r.email,
            phone: r.phone,
        })),
    };
}
async function sendBulkMessage(params) {
    const { senderId, subject, body, channels, filter } = params;
    const recipients = await resolveAudienceRecipients(filter);
    const label = await buildAudienceLabel(filter);
    const bulkRepo = data_source_1.AppDataSource.getRepository(entities_1.BulkMessage);
    const bulk = await bulkRepo.save(bulkRepo.create({
        senderId,
        subject,
        body,
        channels,
        audience: filter,
        audienceLabel: label,
        totalRecipients: recipients.length,
        sentCount: 0,
        failedCount: 0,
    }));
    const logRepo = data_source_1.AppDataSource.getRepository(entities_1.BulkMessageRecipient);
    let sentCount = 0;
    let failedCount = 0;
    for (const r of recipients) {
        for (const channel of channels) {
            const destination = channel === 'email' ? r.email : r.phone;
            if (!destination) {
                await logRepo.save(logRepo.create({
                    bulkMessageId: bulk.id,
                    studentId: r.studentId,
                    userId: r.userId,
                    recipientName: r.name,
                    recipientType: r.type,
                    channel,
                    destination: undefined,
                    status: 'skipped',
                    error: channel === 'email' ? 'No email address' : 'No phone number',
                }));
                continue;
            }
            let status = 'failed';
            let error;
            try {
                if (channel === 'email') {
                    const result = await (0, email_service_1.sendTransactionalEmail)({ to: destination, subject, text: body });
                    status = result.sent ? 'sent' : result.mock ? 'mock' : 'failed';
                    error = result.error;
                }
                else {
                    const ok = await (0, whatsapp_service_1.sendSmsMessage)(destination, `${subject}\n\n${body}`);
                    status = ok ? 'sent' : 'failed';
                }
            }
            catch (err) {
                status = 'failed';
                error = err instanceof Error ? err.message : 'Send failed';
            }
            if (status === 'failed')
                failedCount += 1;
            else
                sentCount += 1;
            await logRepo.save(logRepo.create({
                bulkMessageId: bulk.id,
                studentId: r.studentId,
                userId: r.userId,
                recipientName: r.name,
                recipientType: r.type,
                channel,
                destination,
                status,
                error,
            }));
        }
    }
    bulk.sentCount = sentCount;
    bulk.failedCount = failedCount;
    await bulkRepo.save(bulk);
    return bulk;
}
