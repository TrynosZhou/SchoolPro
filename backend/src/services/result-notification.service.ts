import type { Job } from 'bullmq';
import { AppDataSource } from '../config/data-source';
import { env } from '../config/env';
import { Guardian, NotificationLog, ReportCard } from '../entities';
import type { ResultNotificationJobData } from '../queues/result-notification.queue';
import { sendResultSms, sendResultWhatsApp } from './whatsapp.service';

type NotifyParams = {
  parentPhone: string;
  studentName: string;
  examName: string;
  score: string;
  portalLink: string;
};

type SendResult = {
  success: boolean;
  sid?: string;
  error?: string;
  deliveredVia?: 'whatsapp' | 'sms';
};

export interface ResultNotificationQueueSummary {
  whatsappQueued: number;
  smsQueued: number;
  skipped: number;
  enqueueFailed: number;
}

function normalizePhone(phone: string): string {
  const trimmed = phone.trim();
  if (!trimmed) return '';
  // Ignore placeholder / em-dash phones stored in demo or incomplete records.
  if (/^[+\-—–\s]*$/.test(trimmed) || trimmed === '—' || trimmed === '-') return '';
  if (trimmed.startsWith('+')) return trimmed;
  if (trimmed.startsWith('0')) return `+263${trimmed.slice(1)}`;
  return `+${trimmed}`;
}

function formatScore(report: ReportCard): string {
  const avg =
    report.averageMark != null && Number.isFinite(Number(report.averageMark))
      ? `${Number(report.averageMark).toFixed(1)}%`
      : '';
  if (report.overallGrade) {
    return avg ? `${avg} (${report.overallGrade})` : report.overallGrade;
  }
  return avg || 'N/A';
}

function buildPortalLink(studentId: string, termId: string, examTypeId: string): string {
  const base = env.frontendUrl.replace(/\/$/, '');
  const params = new URLSearchParams({ termId, examTypeId });
  return `${base}/parent/report-card/${studentId}?${params.toString()}`;
}

async function deliverResultNotification(
  channel: 'whatsapp' | 'sms',
  params: NotifyParams,
): Promise<SendResult> {
  if (channel === 'sms') {
    const smsResult = await sendResultSms(params);
    return { ...smsResult, deliveredVia: 'sms' };
  }

  const whatsappResult = await sendResultWhatsApp(params);
  if (whatsappResult.success) {
    return { ...whatsappResult, deliveredVia: 'whatsapp' };
  }

  console.log(
    `[result-notification] WhatsApp failed for ${params.parentPhone}, attempting SMS fallback`,
  );
  const smsResult = await sendResultSms(params);
  if (smsResult.success) {
    return { ...smsResult, deliveredVia: 'sms' };
  }

  return {
    success: false,
    error: smsResult.error || whatsappResult.error || 'WhatsApp and SMS delivery failed',
  };
}

/** Worker handler: send one result notification and update notification_logs. */
export async function processResultNotificationJob(
  job: Job<ResultNotificationJobData>,
): Promise<'whatsapp' | 'sms'> {
  const { notificationLogId, parentPhone, studentName, examName, score, portalLink, channel } =
    job.data;
  const logRepo = AppDataSource.getRepository(NotificationLog);

  console.log(
    `[result-notification] Processing job ${job.id} (attempt ${job.attemptsMade + 1}, channel=${channel}) for ${parentPhone}`,
  );

  const notifyParams: NotifyParams = {
    parentPhone,
    studentName,
    examName,
    score,
    portalLink,
  };

  let sendResult: SendResult;
  try {
    sendResult = await deliverResultNotification(channel, notifyParams);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error sending notification';
    console.error(`[result-notification] Unexpected send error for ${parentPhone}:`, err);
    sendResult = { success: false, error: message };
  }

  if (!sendResult.success || !sendResult.deliveredVia) {
    try {
      await logRepo.update(notificationLogId, {
        status: 'failed',
        errorMessage: sendResult.error,
      });
    } catch (logErr) {
      console.error(
        `[result-notification] Failed to update notification_log ${notificationLogId}:`,
        logErr,
      );
    }
    throw new Error(sendResult.error || 'Result notification send failed');
  }

  const viaLabel = sendResult.deliveredVia === 'sms' ? ' (SMS fallback)' : '';

  try {
    await logRepo.update(notificationLogId, {
      messageSid: sendResult.sid,
      status: 'sent',
      errorMessage:
        sendResult.deliveredVia === 'sms' && channel === 'whatsapp'
          ? 'Delivered via SMS fallback'
          : undefined,
    });
  } catch (logErr) {
    console.error(
      `[result-notification] Failed to update notification_log ${notificationLogId}:`,
      logErr,
    );
  }

  console.log(
    `[result-notification] Sent successfully via ${sendResult.deliveredVia}${viaLabel} (sid=${sendResult.sid})`,
  );
  return sendResult.deliveredVia;
}

/** Prefer dedicated WhatsApp phone, then guardian phone, then linked parent account phone. */
function resolveGuardianNotifyPhone(guardian: Guardian): string {
  const raw =
    guardian.guardianPhone?.trim() ||
    guardian.phone?.trim() ||
    guardian.parent?.user?.phone?.trim() ||
    '';
  return normalizePhone(raw);
}

/**
 * Prefer WhatsApp unless the linked parent explicitly disabled it.
 * Unlinked guardians (no parent row) also get WhatsApp — same rule as fee/absence notify.
 */
function guardianAllowsWhatsApp(guardian: Guardian): boolean {
  if (guardian.guardianWhatsappConsent === true) return true;
  // parent?.receivesWhatsApp !== false → true when parent is missing or WhatsApp is enabled
  return guardian.parent?.receivesWhatsApp !== false;
}

/**
 * Send per-student result notifications for guardians.
 * Counts are based on the channel that actually delivered (not the intended channel).
 */
export async function queueWhatsAppResultNotifications(params: {
  reports: ReportCard[];
  guardians: Guardian[];
  examTypeId: string;
  examName: string;
  termId: string;
}): Promise<ResultNotificationQueueSummary> {
  const { reports, guardians, examTypeId, examName, termId } = params;
  const summary: ResultNotificationQueueSummary = {
    whatsappQueued: 0,
    smsQueued: 0,
    skipped: 0,
    enqueueFailed: 0,
  };

  const guardiansByStudent = new Map<string, Guardian[]>();
  for (const guardian of guardians) {
    const list = guardiansByStudent.get(guardian.studentId) ?? [];
    list.push(guardian);
    guardiansByStudent.set(guardian.studentId, list);
  }

  const logRepo = AppDataSource.getRepository(NotificationLog);
  /** Avoid duplicate WhatsApp/SMS to the same phone for one publish run. */
  const notifiedPhones = new Set<string>();

  console.log(
    `[result-notification] Queueing result notifications for ${reports.length} report card(s), exam="${examName}"`,
  );

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
      const parentPhone = resolveGuardianNotifyPhone(guardian);
      if (!parentPhone) {
        console.log(
          `[result-notification] Skipping guardian ${guardian.id} (student ${report.studentId}): no phone on guardian/parent`,
        );
        summary.skipped += 1;
        continue;
      }

      const phoneKey = `${report.studentId}:${parentPhone}`;
      if (notifiedPhones.has(phoneKey)) {
        summary.skipped += 1;
        continue;
      }
      notifiedPhones.add(phoneKey);

      const channel: ResultNotificationJobData['channel'] = guardianAllowsWhatsApp(guardian)
        ? 'whatsapp'
        : 'sms';

      if (channel === 'sms') {
        console.log(
          `[result-notification] Guardian ${guardian.id} opted out of WhatsApp — using SMS for ${parentPhone}`,
        );
      } else {
        console.log(
          `[result-notification] Guardian ${guardian.id} — using WhatsApp for ${parentPhone}`,
        );
      }

      let logRow: NotificationLog;
      try {
        logRow = await logRepo.save(
          logRepo.create({
            studentId: report.studentId,
            examId: examTypeId,
            phone: parentPhone,
            status: 'queued',
          }),
        );
      } catch (logErr) {
        console.error(
          `[result-notification] Failed to create notification_log for student ${report.studentId}:`,
          logErr,
        );
        summary.enqueueFailed += 1;
        continue;
      }

      const jobData: ResultNotificationJobData = {
        notificationLogId: logRow.id,
        parentPhone,
        studentName,
        examName,
        score,
        portalLink,
        channel,
      };

      // Send immediately. BullMQ requires Redis ≥5; many school installs still run Redis 3.x
      // where enqueue appears to succeed but the worker never processes jobs.
      try {
        const deliveredVia = await processResultNotificationJob({
          id: `direct-${logRow.id}`,
          data: jobData,
          attemptsMade: 0,
        } as Job<ResultNotificationJobData>);
        if (deliveredVia === 'whatsapp') summary.whatsappQueued += 1;
        else summary.smsQueued += 1;
        console.log(
          `[result-notification] Delivered via ${deliveredVia} for ${parentPhone} (${studentName}, log=${logRow.id})`,
        );
      } catch (sendErr) {
        summary.enqueueFailed += 1;
        console.error(
          `[result-notification] Send failed for ${parentPhone}:`,
          sendErr instanceof Error ? sendErr.message : sendErr,
        );
      }
    }
  }

  console.log(
    `[result-notification] Finished: whatsappSent=${summary.whatsappQueued}, smsSent=${summary.smsQueued}, skipped=${summary.skipped}, failed=${summary.enqueueFailed}`,
  );

  return summary;
}

// Backwards-compatible alias for publish-results integration.
export type WhatsAppResultNotificationSummary = ResultNotificationQueueSummary;
