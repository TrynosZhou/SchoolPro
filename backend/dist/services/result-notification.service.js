"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processResultNotificationJob = processResultNotificationJob;
exports.queueWhatsAppResultNotifications = queueWhatsAppResultNotifications;
const path_1 = __importDefault(require("path"));
const data_source_1 = require("../config/data-source");
const env_1 = require("../config/env");
const entities_1 = require("../entities");
const result_notification_queue_1 = require("../queues/result-notification.queue");
// Standalone Twilio module (plain JS) — kept separate for isolated testing.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { sendResultNotification, sendSmsFallback } = require(path_1.default.join(__dirname, '../../services/whatsapp.js'));
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
function formatScore(report) {
    const avg = report.averageMark != null && Number.isFinite(Number(report.averageMark))
        ? `${Number(report.averageMark).toFixed(1)}%`
        : '';
    if (report.overallGrade) {
        return avg ? `${avg} (${report.overallGrade})` : report.overallGrade;
    }
    return avg || 'N/A';
}
function buildPortalLink(studentId, termId, examTypeId) {
    const base = env_1.env.frontendUrl.replace(/\/$/, '');
    const params = new URLSearchParams({ termId, examTypeId });
    return `${base}/parent/report-card/${studentId}?${params.toString()}`;
}
async function deliverResultNotification(channel, params) {
    if (channel === 'sms') {
        const smsResult = await sendSmsFallback(params);
        return { ...smsResult, deliveredVia: 'sms' };
    }
    const whatsappResult = await sendResultNotification(params);
    if (whatsappResult.success) {
        return { ...whatsappResult, deliveredVia: 'whatsapp' };
    }
    console.log(`[result-notification] WhatsApp failed for ${params.parentPhone}, attempting SMS fallback`);
    const smsResult = await sendSmsFallback(params);
    if (smsResult.success) {
        return { ...smsResult, deliveredVia: 'sms' };
    }
    return {
        success: false,
        error: smsResult.error || whatsappResult.error || 'WhatsApp and SMS delivery failed',
    };
}
/** Worker handler: send one result notification and update notification_logs. */
async function processResultNotificationJob(job) {
    const { notificationLogId, parentPhone, studentName, examName, score, portalLink, channel } = job.data;
    const logRepo = data_source_1.AppDataSource.getRepository(entities_1.NotificationLog);
    console.log(`[result-notification] Processing job ${job.id} (attempt ${job.attemptsMade + 1}, channel=${channel}) for ${parentPhone}`);
    const notifyParams = {
        parentPhone,
        studentName,
        examName,
        score,
        portalLink,
    };
    let sendResult;
    try {
        sendResult = await deliverResultNotification(channel, notifyParams);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error sending notification';
        console.error(`[result-notification] Unexpected send error for ${parentPhone}:`, err);
        sendResult = { success: false, error: message };
    }
    if (!sendResult.success) {
        try {
            await logRepo.update(notificationLogId, {
                status: 'failed',
                errorMessage: sendResult.error,
            });
        }
        catch (logErr) {
            console.error(`[result-notification] Failed to update notification_log ${notificationLogId}:`, logErr);
        }
        throw new Error(sendResult.error || 'Result notification send failed');
    }
    const viaLabel = sendResult.deliveredVia === 'sms' ? ' (SMS fallback)' : '';
    try {
        await logRepo.update(notificationLogId, {
            messageSid: sendResult.sid,
            status: 'sent',
            errorMessage: sendResult.deliveredVia === 'sms' ? 'Delivered via SMS fallback' : undefined,
        });
    }
    catch (logErr) {
        console.error(`[result-notification] Failed to update notification_log ${notificationLogId}:`, logErr);
    }
    console.log(`[result-notification] Sent successfully${viaLabel} (sid=${sendResult.sid})`);
}
/**
 * Queue per-student result notifications for guardians.
 * WhatsApp when consent is given; SMS when consent is not given or as worker fallback.
 */
async function queueWhatsAppResultNotifications(params) {
    const { reports, guardians, examTypeId, examName, termId } = params;
    const summary = {
        whatsappQueued: 0,
        smsQueued: 0,
        skipped: 0,
        enqueueFailed: 0,
    };
    const guardiansByStudent = new Map();
    for (const guardian of guardians) {
        const list = guardiansByStudent.get(guardian.studentId) ?? [];
        list.push(guardian);
        guardiansByStudent.set(guardian.studentId, list);
    }
    const logRepo = data_source_1.AppDataSource.getRepository(entities_1.NotificationLog);
    console.log(`[result-notification] Queueing result notifications for ${reports.length} report card(s), exam="${examName}"`);
    for (const report of reports) {
        const student = report.student;
        if (!student) {
            console.warn(`[result-notification] Skipping report ${report.id}: student not loaded`);
            continue;
        }
        const studentName = `${student.firstName} ${student.lastName}`.trim();
        const score = formatScore(report);
        const portalLink = buildPortalLink(report.studentId, termId, examTypeId);
        const studentGuardians = guardiansByStudent.get(report.studentId) ?? [];
        if (!studentGuardians.length) {
            console.log(`[result-notification] No guardians found for student ${report.studentId}`);
            continue;
        }
        for (const guardian of studentGuardians) {
            const rawPhone = guardian.guardianPhone?.trim();
            if (!rawPhone) {
                console.log(`[result-notification] Skipping guardian ${guardian.id} (student ${report.studentId}): guardianPhone empty`);
                summary.skipped += 1;
                continue;
            }
            const parentPhone = normalizePhone(rawPhone);
            if (!parentPhone) {
                console.log(`[result-notification] Skipping guardian ${guardian.id} (student ${report.studentId}): invalid phone`);
                summary.skipped += 1;
                continue;
            }
            const channel = guardian.guardianWhatsappConsent
                ? 'whatsapp'
                : 'sms';
            if (channel === 'sms') {
                console.log(`[result-notification] Guardian ${guardian.id} has no WhatsApp consent — queueing SMS for ${parentPhone}`);
            }
            let logRow;
            try {
                logRow = await logRepo.save(logRepo.create({
                    studentId: report.studentId,
                    examId: examTypeId,
                    phone: parentPhone,
                    status: 'queued',
                }));
            }
            catch (logErr) {
                console.error(`[result-notification] Failed to create notification_log for student ${report.studentId}:`, logErr);
                summary.enqueueFailed += 1;
                continue;
            }
            const jobId = await (0, result_notification_queue_1.enqueueResultNotification)({
                notificationLogId: logRow.id,
                parentPhone,
                studentName,
                examName,
                score,
                portalLink,
                channel,
            });
            if (!jobId) {
                summary.enqueueFailed += 1;
                try {
                    await logRepo.update(logRow.id, {
                        status: 'failed',
                        errorMessage: 'Failed to enqueue result notification job',
                    });
                }
                catch (logErr) {
                    console.error(`[result-notification] Failed to mark log ${logRow.id} as failed:`, logErr);
                }
                continue;
            }
            if (channel === 'whatsapp') {
                summary.whatsappQueued += 1;
            }
            else {
                summary.smsQueued += 1;
            }
            console.log(`[result-notification] Queued ${channel} notification for ${parentPhone} (${studentName}, log=${logRow.id})`);
        }
    }
    console.log(`[result-notification] Queueing finished: whatsappQueued=${summary.whatsappQueued}, smsQueued=${summary.smsQueued}, skipped=${summary.skipped}, enqueueFailed=${summary.enqueueFailed}`);
    return summary;
}
