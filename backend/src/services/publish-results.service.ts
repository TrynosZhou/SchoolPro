import { In } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import { env } from '../config/env';
import {
  ExamType,
  Guardian,
  Notification,
  Parent,
  ReportCard,
  ResultsPublication,
  SchoolSettings,
  Student,
  Term,
  User,
} from '../entities';
import { relations } from '../utils/typeorm-helpers';
import { sendSmsMessage, sendWhatsAppReminder } from './whatsapp.service';

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
  const message = buildResultsMessage(schoolName, term.name, examType.name);

  const studentIds = [...new Set(reports.map((r) => r.studentId))];
  const guardians = await AppDataSource.getRepository(Guardian).find({
    where: { studentId: In(studentIds) },
    relations: relations('parent', 'parent.user', 'student'),
  });

  const students = await AppDataSource.getRepository(Student).find({
    where: { id: In(studentIds) },
    relations: relations('user'),
  });

  const phonesWhatsApp = new Set<string>();
  const phonesSms = new Set<string>();
  const notifyUserIds = new Set<string>();

  for (const g of guardians) {
    const phone = g.phone || g.parent?.user?.phone;
    if (!phone) continue;
    const normalized = normalizePhone(phone);
    if (!normalized) continue;

    if (g.parent?.receivesWhatsApp !== false && notifyWhatsApp) {
      phonesWhatsApp.add(normalized);
    }
    if (notifySms) {
      phonesSms.add(normalized);
    }
    if (g.parent?.userId) {
      notifyUserIds.add(g.parent.userId);
    }
  }

  for (const s of students) {
    if (s.userId) notifyUserIds.add(s.userId);
    if (s.user?.phone && notifySms) {
      const normalized = normalizePhone(s.user.phone);
      if (normalized) phonesSms.add(normalized);
    }
  }

  let whatsappSent = 0;
  let smsSent = 0;

  if (notifyWhatsApp) {
    for (const phone of phonesWhatsApp) {
      const ok = await sendWhatsAppReminder(phone, message);
      if (ok) whatsappSent += 1;
    }
  }

  if (notifySms) {
    for (const phone of phonesSms) {
      const ok = await sendSmsMessage(phone, message);
      if (ok) smsSent += 1;
    }
  }

  const notificationRepo = AppDataSource.getRepository(Notification);
  let notificationsCreated = 0;
  const title = `${examType.name} results published`;
  for (const userId of notifyUserIds) {
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
    notificationsCreated,
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
