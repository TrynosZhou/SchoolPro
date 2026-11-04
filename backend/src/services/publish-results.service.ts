import { In } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import { env } from '../config/env';
import {
  ExamType,
  Guardian,
  Notification,
  ReportCard,
  ResultsPublication,
  SchoolSettings,
  Student,
  Term,
  User,
} from '../entities';
import { relations } from '../utils/typeorm-helpers';
import { sendSmsMessage } from './whatsapp.service';
import { sendTransactionalEmail } from './email.service';
import { getNotificationSettings } from './notification-settings.service';
import { queueWhatsAppResultNotifications } from './result-notification.service';

export interface PublishResultsParams {
  termId: string;
  examTypeId: string;
  publishedByUserId?: string;
  notifyWhatsApp?: boolean;
  notifySms?: boolean;
}

export interface PublicationStatus {
  termId: string;
  examTypeId: string;
  isPublished: boolean;
  publishedAt?: string;
  reportCardCount: number;
  readyReportCardCount: number;
  publishedByName?: string;
  whatsappSent?: number;
  smsSent?: number;
}

function normalizePhone(phone: string): string {
  const trimmed = phone.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('+')) return trimmed;
  if (trimmed.startsWith('0')) return `+263${trimmed.slice(1)}`;
  return `+${trimmed}`;
}

function buildResultsMessage(
  schoolName: string,
  termName: string,
  examTypeName: string,
): string {
  const portalUrl = env.frontendUrl.replace(/\/$/, '');
  return (
    `${schoolName}: ${examTypeName} results for ${termName} have been published and are ready to view. ` +
    `Sign in to School Pro (${portalUrl}) to open your child's report card.`
  );
}

export async function getPublicationStatus(
  termId: string,
  examTypeId: string,
): Promise<PublicationStatus> {
  const reportRepo = AppDataSource.getRepository(ReportCard);
  const pubRepo = AppDataSource.getRepository(ResultsPublication);

  const readyReportCardCount = await reportRepo.count({
    where: { termId, examTypeId },
  });

  const publication = await pubRepo.findOne({
    where: { termId, examTypeId },
    relations: relations('publishedBy'),
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

export async function listPublishedExamTypesForTerm(termId: string) {
  const pubRepo = AppDataSource.getRepository(ResultsPublication);
  const rows = await pubRepo.find({
    where: { termId },
    relations: relations('examType'),
    order: { publishedAt: 'DESC' },
  });
  return rows.map((p) => ({
    id: p.examTypeId,
    name: p.examType?.name || 'Exam',
    publishedAt: p.publishedAt,
  }));
}

export async function publishResults(params: PublishResultsParams) {
  const { termId, examTypeId, publishedByUserId, notifyWhatsApp = true, notifySms = true } = params;

  const term = await AppDataSource.getRepository(Term).findOne({ where: { id: termId } });
  if (!term) throw new Error('Term not found');

  const examType = await AppDataSource.getRepository(ExamType).findOne({ where: { id: examTypeId } });
  if (!examType) throw new Error('Exam type not found');

  const reportRepo = AppDataSource.getRepository(ReportCard);
  const reports = await reportRepo.find({
    where: { termId, examTypeId },
    relations: relations('student'),
  });

  if (!reports.length) {
    throw new Error(
      'No report cards found for this term and exam type. Generate report cards from the Report Cards page first.',
    );
  }

  await reportRepo.update({ termId, examTypeId }, { isPublished: true });

  const settings = await AppDataSource.getRepository(SchoolSettings).findOne({ where: { id: 'default' } });
  const schoolName = settings?.schoolName || 'School Pro Academy';
  const examCfg = (await getNotificationSettings()).examResults;
  const message = examCfg.template
    ? examCfg.template
        .replace(/\{school\}/g, schoolName)
        .replace(/\{exam\}/g, examType.name)
        .replace(/\{term\}/g, term.name)
    : buildResultsMessage(schoolName, term.name, examType.name);
  const wantEmail = examCfg.channels.email;
  const wantInApp = examCfg.channels.inApp;

  const studentIds = [...new Set(reports.map((r) => r.studentId))];
  const guardians = await AppDataSource.getRepository(Guardian).find({
    where: { studentId: In(studentIds) },
    relations: relations('parent', 'parent.user', 'student'),
  });

  const students = await AppDataSource.getRepository(Student).find({
    where: { id: In(studentIds) },
    relations: relations('user'),
  });

  const phonesSms = new Set<string>();
  const emails = new Set<string>();
  const notifyUserIds = new Set<string>();

  for (const g of guardians) {
    if (wantEmail) {
      const email = g.email || g.parent?.user?.email;
      if (email) emails.add(email);
    }
    const phone = g.phone || g.parent?.user?.phone;
    if (phone && notifySms) {
      const normalized = normalizePhone(phone);
      if (normalized) phonesSms.add(normalized);
    }
    if (g.parent?.userId) {
      notifyUserIds.add(g.parent.userId);
    }
  }

  for (const s of students) {
    if (s.userId) notifyUserIds.add(s.userId);
    if (wantEmail && s.user?.email) emails.add(s.user.email);
    if (s.user?.phone && notifySms) {
      const normalized = normalizePhone(s.user.phone);
      if (normalized) phonesSms.add(normalized);
    }
  }

  let whatsappSent = 0;
  let smsSent = 0;
  let emailsSent = 0;
  let notificationFailed = 0;
  /** Phones already covered by the per-student result notification path. */
  const resultNotifyPhones = new Set<string>();

  if (notifyWhatsApp) {
    try {
      const whatsappSummary = await queueWhatsAppResultNotifications({
        reports,
        guardians,
        examTypeId,
        examName: examType.name,
        termId,
      });
      whatsappSent = whatsappSummary.whatsappQueued;
      smsSent += whatsappSummary.smsQueued;
      notificationFailed += whatsappSummary.enqueueFailed;
      console.log(
        `[publish-results] Result notifications: whatsapp=${whatsappSummary.whatsappQueued}, sms=${whatsappSummary.smsQueued}, skipped=${whatsappSummary.skipped}, failed=${whatsappSummary.enqueueFailed}`,
      );
    } catch (err) {
      console.error('[publish-results] WhatsApp result notifications failed (non-blocking):', err);
    }
  }

  // Collect phones already targeted by result notifications to avoid duplicate SMS blasts.
  for (const g of guardians) {
    const p =
      g.guardianPhone?.trim() ||
      g.phone?.trim() ||
      g.parent?.user?.phone?.trim() ||
      '';
    const normalized = normalizePhone(p);
    if (normalized) resultNotifyPhones.add(normalized);
  }

  if (notifySms) {
    for (const phone of phonesSms) {
      if (resultNotifyPhones.has(phone)) continue;
      const ok = await sendSmsMessage(phone, message);
      if (ok) smsSent += 1;
    }
  }

  if (wantEmail) {
    const subject = `${schoolName}: ${examType.name} results published`;
    for (const email of emails) {
      const result = await sendTransactionalEmail({ to: email, subject, text: message });
      if (result.sent) emailsSent += 1;
    }
  }

  const notificationRepo = AppDataSource.getRepository(Notification);
  let notificationsCreated = 0;
  const title = `${examType.name} results published`;
  for (const userId of wantInApp ? notifyUserIds : []) {
    await notificationRepo.save(
      notificationRepo.create({
        userId,
        title,
        message: `${term.name} — ${examType.name} results are now available in the parent portal.`,
        type: 'results_published',
        metadata: { termId, examTypeId, termName: term.name, examTypeName: examType.name },
        sentViaWhatsApp: notifyWhatsApp && whatsappSent > 0,
      }),
    );
    notificationsCreated += 1;
  }

  const pubRepo = AppDataSource.getRepository(ResultsPublication);
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
    notificationFailed,
    publishedAt: publication.publishedAt.toISOString(),
  };
}

export async function unpublishResults(termId: string, examTypeId: string) {
  const term = await AppDataSource.getRepository(Term).findOne({ where: { id: termId } });
  if (!term) throw new Error('Term not found');

  const examType = await AppDataSource.getRepository(ExamType).findOne({ where: { id: examTypeId } });
  if (!examType) throw new Error('Exam type not found');

  const pubRepo = AppDataSource.getRepository(ResultsPublication);
  const publication = await pubRepo.findOne({ where: { termId, examTypeId } });

  const reportRepo = AppDataSource.getRepository(ReportCard);
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
