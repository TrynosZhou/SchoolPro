import crypto from 'crypto';
import { Repository } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import { Application, SchoolSettings } from '../entities';
import { ApplicationStatus } from '../entities/enums';
import { sendTransactionalEmail } from './email.service';
import { sendSmsMessage } from './whatsapp.service';

const REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Generate a unique, human-friendly application reference (e.g. APP-7K3Q9M). */
export async function generateApplicationReference(
  repo: Repository<Application>,
): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    let suffix = '';
    const bytes = crypto.randomBytes(6);
    for (let i = 0; i < 6; i += 1) {
      suffix += REFERENCE_ALPHABET[bytes[i] % REFERENCE_ALPHABET.length];
    }
    const reference = `APP-${suffix}`;
    const existing = await repo.findOne({ where: { referenceNumber: reference } });
    if (!existing) return reference;
  }
  // Extremely unlikely fallback.
  return `APP-${Date.now().toString(36).toUpperCase()}`;
}

const STATUS_LABELS: Record<string, string> = {
  [ApplicationStatus.APPLIED]: 'Applied',
  [ApplicationStatus.SHORTLISTED]: 'Shortlisted',
  [ApplicationStatus.ADMITTED]: 'Admitted',
  [ApplicationStatus.REJECTED]: 'Not successful',
};

export function applicationStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

async function getSchoolName(): Promise<string> {
  try {
    const settings = await AppDataSource.getRepository(SchoolSettings).findOne({
      where: { id: 'default' },
    });
    return settings?.schoolName?.trim() || 'our school';
  } catch {
    return 'our school';
  }
}

/** Confirmation sent to the applicant right after they submit the form. */
export async function sendApplicationSubmittedEmail(
  application: Application,
  schoolName: string,
): Promise<void> {
  const applicantName = `${application.studentFirstName} ${application.studentLastName}`.trim();
  const subject = `Application received — ${application.referenceNumber}`;
  const text =
    `Dear ${application.guardianName || 'Applicant'},\n\n` +
    `Thank you for applying to ${schoolName}. We have received the admission application for ` +
    `${applicantName} (applying for ${application.classAppliedFor}).\n\n` +
    `Your application reference number is: ${application.referenceNumber}\n\n` +
    `Please keep this reference number safe. You can use it together with this email address to ` +
    `track your application status online at any time.\n\n` +
    `Current status: ${applicationStatusLabel(application.status)}\n\n` +
    `We will notify you by email whenever your application status changes.\n\n` +
    `Kind regards,\n${schoolName} Admissions Office`;

  await sendTransactionalEmail({ to: application.contactEmail, subject, text });
}

/** Notification sent to the applicant whenever an admin changes their status. */
export async function sendApplicationStatusEmail(
  application: Application,
  schoolName: string,
): Promise<void> {
  const applicantName = `${application.studentFirstName} ${application.studentLastName}`.trim();
  const statusLabel = applicationStatusLabel(application.status);
  const subject = `Application update — ${statusLabel} (${application.referenceNumber})`;

  let statusLine: string;
  switch (application.status) {
    case ApplicationStatus.SHORTLISTED:
      statusLine = `Good news — the application for ${applicantName} has been shortlisted.`;
      break;
    case ApplicationStatus.ADMITTED:
      statusLine = `Congratulations! ${applicantName} has been admitted to ${schoolName}.`;
      break;
    case ApplicationStatus.REJECTED:
      statusLine =
        `After careful consideration, we are unable to offer ${applicantName} a place at this time.`;
      break;
    default:
      statusLine = `The application for ${applicantName} is now marked as "${statusLabel}".`;
  }

  const noteBlock = application.statusNote?.trim()
    ? `\n\nNote from the admissions office:\n${application.statusNote.trim()}`
    : '';

  const text =
    `Dear ${application.guardianName || 'Applicant'},\n\n` +
    `${statusLine}\n\n` +
    `Application reference: ${application.referenceNumber}\n` +
    `Current status: ${statusLabel}${noteBlock}\n\n` +
    `You can track your application online using your reference number and email or phone.\n\n` +
    `Kind regards,\n${schoolName} Admissions Office`;

  await sendTransactionalEmail({ to: application.contactEmail, subject, text });
}

/** Short SMS confirming submission. */
async function sendApplicationSubmittedSms(
  application: Application,
  schoolName: string,
): Promise<void> {
  if (!application.contactPhone) return;
  const applicantName = `${application.studentFirstName} ${application.studentLastName}`.trim();
  const message =
    `${schoolName}: Application received for ${applicantName}. ` +
    `Reference ${application.referenceNumber}. ` +
    `Track your status online using this reference and your email or phone.`;
  await sendSmsMessage(application.contactPhone, message);
}

/** Short SMS notifying a status change. */
async function sendApplicationStatusSms(
  application: Application,
  schoolName: string,
): Promise<void> {
  if (!application.contactPhone) return;
  const statusLabel = applicationStatusLabel(application.status);
  const message =
    `${schoolName}: Application ${application.referenceNumber} status is now "${statusLabel}". ` +
    `Track details online using your reference and email or phone.`;
  await sendSmsMessage(application.contactPhone, message);
}

/**
 * Notify the applicant that their application was received, via email + SMS.
 * Each channel fails independently and never throws to the caller.
 */
export async function notifyApplicationSubmitted(application: Application): Promise<void> {
  const schoolName = await getSchoolName();
  await Promise.allSettled([
    sendApplicationSubmittedEmail(application, schoolName),
    sendApplicationSubmittedSms(application, schoolName),
  ]);
}

/** Notify the applicant of a status change, via email + SMS. */
export async function notifyApplicationStatusChange(application: Application): Promise<void> {
  const schoolName = await getSchoolName();
  await Promise.allSettled([
    sendApplicationStatusEmail(application, schoolName),
    sendApplicationStatusSms(application, schoolName),
  ]);
}
