import { AppDataSource } from '../config/data-source';
import { Guardian, NotificationLog, ReportCard } from '../entities';
import { relations } from '../utils/typeorm-helpers';
import { In } from 'typeorm';

export function mapTwilioMessageStatus(messageStatus: string): string {
  const normalized = messageStatus.trim().toLowerCase();
  if (normalized === 'delivered' || normalized === 'read') return 'delivered';
  if (normalized === 'failed') return 'failed';
  if (normalized === 'undelivered') return 'undelivered';
  if (normalized === 'sent' || normalized === 'sending') return 'sent';
  if (normalized === 'queued' || normalized === 'accepted') return 'queued';
  return normalized;
}

export async function updateNotificationLogByMessageSid(params: {
  messageSid: string;
  messageStatus: string;
  errorCode?: string | number | null;
}): Promise<string | null> {
  const { messageSid, messageStatus, errorCode } = params;
  const logRepo = AppDataSource.getRepository(NotificationLog);

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

  console.log(
    `[whatsapp-webhook] Updated notification_log ${row.id}: status=${status}, MessageSid=${messageSid}`,
  );

  return row.id;
}

export interface ResultNotificationLogSummary {
  total: number;
  queued: number;
  sent: number;
  delivered: number;
  failed: number;
  undelivered: number;
}

export interface ResultNotificationLogRow {
  id: string;
  studentId: string;
  studentName: string;
  admissionNumber?: string;
  guardianName?: string | null;
  phone: string;
  messageSid?: string;
  status: string;
  errorMessage?: string;
  createdAt: string;
}

function emptyNotificationSummary(): ResultNotificationLogSummary {
  return { total: 0, queued: 0, sent: 0, delivered: 0, failed: 0, undelivered: 0 };
}

function bumpSummary(summary: ResultNotificationLogSummary, status: string) {
  summary.total += 1;
  if (status === 'queued') summary.queued += 1;
  else if (status === 'sent') summary.sent += 1;
  else if (status === 'delivered') summary.delivered += 1;
  else if (status === 'failed') summary.failed += 1;
  else if (status === 'undelivered') summary.undelivered += 1;
}

/** List result notification delivery logs for a term + exam publication. */
export async function listResultNotificationLogsForExam(
  termId: string,
  examTypeId: string,
): Promise<{
  termId: string;
  examTypeId: string;
  summary: ResultNotificationLogSummary;
  logs: ResultNotificationLogRow[];
}> {
  const reportRepo = AppDataSource.getRepository(ReportCard);
  const reports = await reportRepo.find({
    where: { termId, examTypeId },
    select: { studentId: true },
  });
  const studentIds = [...new Set(reports.map((r) => r.studentId))];

  if (!studentIds.length) {
    return { termId, examTypeId, summary: emptyNotificationSummary(), logs: [] };
  }

  const logRepo = AppDataSource.getRepository(NotificationLog);
  const logs = await logRepo.find({
    where: { examId: examTypeId, studentId: In(studentIds) },
    relations: relations('student'),
    order: { createdAt: 'DESC' },
  });

  const guardianRepo = AppDataSource.getRepository(Guardian);
  const guardians = await guardianRepo.find({
    where: { studentId: In(studentIds) },
    order: { isPrimary: 'DESC' },
  });
  const guardianByStudent = new Map<string, Guardian>();
  for (const guardian of guardians) {
    if (!guardianByStudent.has(guardian.studentId)) {
      guardianByStudent.set(guardian.studentId, guardian);
    }
  }

  const summary = emptyNotificationSummary();
  const rows: ResultNotificationLogRow[] = logs.map((log) => {
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
