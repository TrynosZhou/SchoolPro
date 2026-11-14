import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { In } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import { env } from '../config/env';
import { tenantContext } from '../config/tenant-context';
import {
  ExamType,
  Guardian,
  NotificationLog,
  ReportCard,
  SchoolSettings,
  Term,
} from '../entities';
import { DEFAULT_GRADE_BOUNDARIES } from '../types/grade-boundaries';
import { generateReportCardPdf } from '../utils/pdf';
import { relations } from '../utils/typeorm-helpers';
import { getReportCardPdfMetrics } from './report-card.service';
import { guardianAllowsWhatsApp, resolveGuardianNotifyPhone } from './result-notification.service';
import { sendReportCardWhatsApp } from './whatsapp.service';

export interface SendReportCardsWhatsAppResult {
  message: string;
  total: number;
  sent: number;
  failed: number;
  skipped: number;
}

const PDF_DIR = path.join(process.cwd(), 'uploads', 'report-cards');

/** Absolute public URL Twilio can fetch (needs API_PUBLIC_URL to be internet-reachable). */
function publicUploadUrl(fileName: string): string {
  const base = env.apiPublicUrl.trim().replace(/\/$/, '');
  return `${base}/uploads/report-cards/${fileName}`;
}

async function loadReportForPdf(reportId: string): Promise<ReportCard | null> {
  return AppDataSource.getRepository(ReportCard).findOne({
    where: { id: reportId },
    relations: relations(
      'student',
      'student.schoolClass',
      'student.schoolClass.form',
      'term',
      'examType',
    ),
  });
}

/** Render the report card PDF and store it under an unguessable filename. Returns its public URL. */
async function storeReportCardPdf(report: ReportCard): Promise<string> {
  const settings = await AppDataSource.getRepository(SchoolSettings).findOne({
    where: { id: 'default' },
  });
  const maxMarks = Number(report.examType?.maxMarks) || 100;
  const metrics = await getReportCardPdfMetrics(report, maxMarks);

  const pdf = await generateReportCardPdf({
    schoolName: settings?.schoolName || 'School Pro Academy',
    tagline: settings?.tagline || undefined,
    logoUrl: settings?.logoUrl || undefined,
    address: settings?.address || undefined,
    phone: settings?.phone || undefined,
    email: settings?.email || undefined,
    website: settings?.website || undefined,
    studentName: `${report.student.firstName} ${report.student.lastName}`,
    admissionNumber: report.student.admissionNumber,
    className: report.student.schoolClass?.name || '',
    formName: report.student.schoolClass?.form?.name || '',
    formLevel: report.student.schoolClass?.form?.level,
    termName: report.term.name,
    examTypeName: report.examType?.name,
    subjectResults: metrics.subjectResults,
    averageMark: Number(report.averageMark),
    overallGrade: report.overallGrade,
    classPosition: metrics.classPosition ?? report.classPosition,
    formPosition: metrics.formPosition ?? report.formPosition,
    classTotal: metrics.classTotal,
    formTotal: metrics.formTotal,
    subjectsPassed: metrics.subjectsPassed,
    totalSubjects: metrics.totalSubjects,
    attendance: metrics.attendance,
    classTeacherRemarks: report.classTeacherRemarks,
    principalRemarks: report.principalRemarks,
    headmasterName: settings?.headmasterName || undefined,
    generatedAt: report.generatedAt ? new Date(report.generatedAt) : new Date(),
    gradeBoundaries: settings?.gradeBoundaries?.length
      ? settings.gradeBoundaries
      : DEFAULT_GRADE_BOUNDARIES,
    reportCardId: report.id,
  });

  await fs.promises.mkdir(PDF_DIR, { recursive: true });
  const fileName = `${crypto.randomBytes(16).toString('hex')}.pdf`;
  await fs.promises.writeFile(path.join(PDF_DIR, fileName), pdf);
  return publicUploadUrl(fileName);
}

/** Plain-text report card so parents can read results even if the PDF cannot be opened. */
async function buildSummaryText(
  report: ReportCard,
  schoolName: string,
): Promise<string> {
  const maxMarks = Number(report.examType?.maxMarks) || 100;
  const metrics = await getReportCardPdfMetrics(report, maxMarks);
  const lines: string[] = [
    `*${schoolName}*`,
    `Report Card — ${report.examType?.name ?? 'Exam'}, ${report.term.name}`,
    `Student: ${report.student.firstName} ${report.student.lastName} (${report.student.admissionNumber ?? ''})`,
  ];
  const cls = report.student.schoolClass?.name;
  if (cls) lines.push(`Class: ${cls}`);
  lines.push('');
  for (const row of metrics.subjectResults) {
    const name = row.subjectName || row.subject;
    lines.push(`• ${name}: ${row.marks} (${row.grade})`);
  }
  lines.push('');
  const avg =
    report.averageMark != null && Number.isFinite(Number(report.averageMark))
      ? `${Number(report.averageMark).toFixed(1)}%`
      : 'N/A';
  lines.push(`Average: ${avg}${report.overallGrade ? ` (${report.overallGrade})` : ''}`);
  const pos = metrics.classPosition ?? report.classPosition;
  if (pos) {
    lines.push(`Class position: ${pos}${metrics.classTotal ? ` of ${metrics.classTotal}` : ''}`);
  }
  if (report.classTeacherRemarks) lines.push('', `Teacher's remarks: ${report.classTeacherRemarks}`);
  if (report.principalRemarks) lines.push(`Principal's remarks: ${report.principalRemarks}`);
  lines.push('', 'The full report card (PDF) is attached.');
  return lines.join('\n');
}

/**
 * Send each ready report card to the student's linked guardians on WhatsApp.
 * Guardians without a phone number, or that opted out of WhatsApp, are skipped.
 */
export async function sendReportCardsViaWhatsApp(params: {
  termId: string;
  examTypeId: string;
}): Promise<SendReportCardsWhatsAppResult> {
  const { termId, examTypeId } = params;

  const term = await AppDataSource.getRepository(Term).findOne({ where: { id: termId } });
  if (!term) throw new Error('Term not found');
  const examType = await AppDataSource.getRepository(ExamType).findOne({
    where: { id: examTypeId },
  });
  if (!examType) throw new Error('Exam type not found');

  const reports = await AppDataSource.getRepository(ReportCard).find({
    where: { termId, examTypeId },
    select: { id: true, studentId: true },
  });
  if (!reports.length) {
    throw new Error(
      'No report cards found for this term and exam type. Generate report cards from the Report Cards page first.',
    );
  }

  const guardians = await AppDataSource.getRepository(Guardian).find({
    where: { studentId: In([...new Set(reports.map((r) => r.studentId))]) },
    relations: relations('parent', 'parent.user'),
  });
  const byStudent = new Map<string, Guardian[]>();
  for (const g of guardians) {
    const list = byStudent.get(g.studentId) ?? [];
    list.push(g);
    byStudent.set(g.studentId, list);
  }

  const settings = await AppDataSource.getRepository(SchoolSettings).findOne({
    where: { id: 'default' },
  });
  const schoolName = settings?.schoolName || 'School Pro Academy';
  const logRepo = AppDataSource.getRepository(NotificationLog);

  const result: SendReportCardsWhatsAppResult = {
    message: `Report cards for ${term.name} · ${examType.name} processed.`,
    total: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
  };

  for (const { id, studentId } of reports) {
    const studentGuardians = byStudent.get(studentId) ?? [];
    // One message per distinct phone number per student.
    const seen = new Set<string>();
    const targets: { guardian: Guardian; phone: string }[] = [];
    for (const guardian of studentGuardians) {
      const phone = resolveGuardianNotifyPhone(guardian);
      if (!phone || !guardianAllowsWhatsApp(guardian) || seen.has(phone)) {
        result.skipped += 1;
        continue;
      }
      seen.add(phone);
      targets.push({ guardian, phone });
    }
    if (!studentGuardians.length) result.skipped += 1;
    if (!targets.length) continue;

    let body: string;
    let pdfUrl: string | undefined;
    try {
      const report = await loadReportForPdf(id);
      if (!report) throw new Error('Report card not found');
      body = await buildSummaryText(report, schoolName);
      try {
        pdfUrl = tenantContext.isDemo() ? undefined : await storeReportCardPdf(report);
      } catch (pdfErr) {
        // Still deliver the text summary if the PDF cannot be produced.
        console.error(`[report-card-whatsapp] PDF failed for report ${id}:`, pdfErr);
      }
    } catch (err) {
      console.error(`[report-card-whatsapp] Could not prepare report ${id}:`, err);
      result.failed += targets.length;
      result.total += targets.length;
      continue;
    }

    for (const { phone } of targets) {
      result.total += 1;
      const log = await logRepo.save(
        logRepo.create({ studentId, examId: examTypeId, phone, status: 'queued' }),
      );
      try {
        const send = await sendReportCardWhatsApp({ parentPhone: phone, body, pdfUrl });
        if (send.success) {
          await logRepo.update(log.id, { status: 'sent', messageSid: send.sid });
          result.sent += 1;
        } else {
          await logRepo.update(log.id, { status: 'failed', errorMessage: send.error });
          result.failed += 1;
        }
      } catch (err) {
        await logRepo.update(log.id, {
          status: 'failed',
          errorMessage: err instanceof Error ? err.message : 'Send failed',
        });
        result.failed += 1;
      }
    }
  }

  return result;
}
