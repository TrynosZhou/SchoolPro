"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapTwilioMessageStatus = mapTwilioMessageStatus;
exports.updateNotificationLogByMessageSid = updateNotificationLogByMessageSid;
exports.listResultNotificationLogsForExam = listResultNotificationLogsForExam;
const data_source_1 = require("../config/data-source");
const entities_1 = require("../entities");
const typeorm_helpers_1 = require("../utils/typeorm-helpers");
const typeorm_1 = require("typeorm");
function mapTwilioMessageStatus(messageStatus) {
    const normalized = messageStatus.trim().toLowerCase();
    if (normalized === 'delivered' || normalized === 'read')
        return 'delivered';
    if (normalized === 'failed')
        return 'failed';
    if (normalized === 'undelivered')
        return 'undelivered';
    if (normalized === 'sent' || normalized === 'sending')
        return 'sent';
    if (normalized === 'queued' || normalized === 'accepted')
        return 'queued';
    return normalized;
}
async function updateNotificationLogByMessageSid(params) {
    const { messageSid, messageStatus, errorCode } = params;
    const logRepo = data_source_1.AppDataSource.getRepository(entities_1.NotificationLog);
    const row = await logRepo.findOne({ where: { messageSid } });
    if (!row) {
        console.warn(`[whatsapp-webhook] No notification_log row for MessageSid=${messageSid}`);
        return null;
    }
    const status = mapTwilioMessageStatus(messageStatus);
    const isFailure = status === 'failed' || status === 'undelivered';
    const errorMessage = isFailure && errorCode != null && String(errorCode).trim() !== ''
        ? `Twilio error code: ${errorCode}`
        : isFailure
            ? row.errorMessage
            : undefined;
    await logRepo.update(row.id, {
        status,
        errorMessage,
    });
    console.log(`[whatsapp-webhook] Updated notification_log ${row.id}: status=${status}, MessageSid=${messageSid}`);
    return row.id;
}
function emptyNotificationSummary() {
    return { total: 0, queued: 0, sent: 0, delivered: 0, failed: 0, undelivered: 0 };
}
function bumpSummary(summary, status) {
    summary.total += 1;
    if (status === 'queued')
        summary.queued += 1;
    else if (status === 'sent')
        summary.sent += 1;
    else if (status === 'delivered')
        summary.delivered += 1;
    else if (status === 'failed')
        summary.failed += 1;
    else if (status === 'undelivered')
        summary.undelivered += 1;
}
/** List result notification delivery logs for a term + exam publication. */
async function listResultNotificationLogsForExam(termId, examTypeId) {
    const reportRepo = data_source_1.AppDataSource.getRepository(entities_1.ReportCard);
    const reports = await reportRepo.find({
        where: { termId, examTypeId },
        select: { studentId: true },
    });
    const studentIds = [...new Set(reports.map((r) => r.studentId))];
    if (!studentIds.length) {
        return { termId, examTypeId, summary: emptyNotificationSummary(), logs: [] };
    }
    const logRepo = data_source_1.AppDataSource.getRepository(entities_1.NotificationLog);
    const logs = await logRepo.find({
        where: { examId: examTypeId, studentId: (0, typeorm_1.In)(studentIds) },
        relations: (0, typeorm_helpers_1.relations)('student'),
        order: { createdAt: 'DESC' },
    });
    const guardianRepo = data_source_1.AppDataSource.getRepository(entities_1.Guardian);
    const guardians = await guardianRepo.find({
        where: { studentId: (0, typeorm_1.In)(studentIds) },
        order: { isPrimary: 'DESC' },
    });
    const guardianByStudent = new Map();
    for (const guardian of guardians) {
        if (!guardianByStudent.has(guardian.studentId)) {
            guardianByStudent.set(guardian.studentId, guardian);
        }
    }
    const summary = emptyNotificationSummary();
    const rows = logs.map((log) => {
        bumpSummary(summary, log.status);
        const guardian = guardianByStudent.get(log.studentId);
        const student = log.student;
        return {
            id: log.id,
            studentId: log.studentId,
            studentName: student ? `${student.firstName} ${student.lastName}`.trim() : 'Unknown student',
            admissionNumber: student?.admissionNumber,
            guardianName: guardian?.fullName ?? null,
            phone: log.phone,
            messageSid: log.messageSid,
            status: log.status,
            errorMessage: log.errorMessage,
            createdAt: log.createdAt.toISOString(),
        };
    });
    return { termId, examTypeId, summary, logs: rows };
}
