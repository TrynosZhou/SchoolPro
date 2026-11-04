"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateApplicationReference = generateApplicationReference;
exports.applicationStatusLabel = applicationStatusLabel;
exports.sendApplicationSubmittedEmail = sendApplicationSubmittedEmail;
exports.sendApplicationStatusEmail = sendApplicationStatusEmail;
exports.notifyApplicationSubmitted = notifyApplicationSubmitted;
exports.notifyApplicationStatusChange = notifyApplicationStatusChange;
const crypto_1 = __importDefault(require("crypto"));
const data_source_1 = require("../config/data-source");
const entities_1 = require("../entities");
const enums_1 = require("../entities/enums");
const email_service_1 = require("./email.service");
const whatsapp_service_1 = require("./whatsapp.service");
const REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** Generate a unique, human-friendly application reference (e.g. APP-7K3Q9M). */
async function generateApplicationReference(repo) {
    for (let attempt = 0; attempt < 10; attempt += 1) {
        let suffix = '';
        const bytes = crypto_1.default.randomBytes(6);
        for (let i = 0; i < 6; i += 1) {
            suffix += REFERENCE_ALPHABET[bytes[i] % REFERENCE_ALPHABET.length];
        }
        const reference = `APP-${suffix}`;
        const existing = await repo.findOne({ where: { referenceNumber: reference } });
        if (!existing)
            return reference;
    }
    // Extremely unlikely fallback.
    return `APP-${Date.now().toString(36).toUpperCase()}`;
}
const STATUS_LABELS = {
    [enums_1.ApplicationStatus.APPLIED]: 'Applied',
    [enums_1.ApplicationStatus.SHORTLISTED]: 'Shortlisted',
    [enums_1.ApplicationStatus.ADMITTED]: 'Admitted',
    [enums_1.ApplicationStatus.REJECTED]: 'Not successful',
};
function applicationStatusLabel(status) {
    return STATUS_LABELS[status] ?? status;
}
async function getSchoolName() {
    try {
        const settings = await data_source_1.AppDataSource.getRepository(entities_1.SchoolSettings).findOne({
            where: { id: 'default' },
        });
        return settings?.schoolName?.trim() || 'our school';
    }
    catch {
        return 'our school';
    }
}
/** Confirmation sent to the applicant right after they submit the form. */
async function sendApplicationSubmittedEmail(application, schoolName) {
    const applicantName = `${application.studentFirstName} ${application.studentLastName}`.trim();
    const subject = `Application received — ${application.referenceNumber}`;
    const text = `Dear ${application.guardianName || 'Applicant'},\n\n` +
        `Thank you for applying to ${schoolName}. We have received the admission application for ` +
        `${applicantName} (applying for ${application.classAppliedFor}).\n\n` +
        `Your application reference number is: ${application.referenceNumber}\n\n` +
        `Please keep this reference number safe. You can use it together with this email address to ` +
        `track your application status online at any time.\n\n` +
        `Current status: ${applicationStatusLabel(application.status)}\n\n` +
        `We will notify you by email whenever your application status changes.\n\n` +
        `Kind regards,\n${schoolName} Admissions Office`;
    await (0, email_service_1.sendTransactionalEmail)({ to: application.contactEmail, subject, text });
}
/** Notification sent to the applicant whenever an admin changes their status. */
async function sendApplicationStatusEmail(application, schoolName) {
    const applicantName = `${application.studentFirstName} ${application.studentLastName}`.trim();
    const statusLabel = applicationStatusLabel(application.status);
    const subject = `Application update — ${statusLabel} (${application.referenceNumber})`;
    let statusLine;
    switch (application.status) {
        case enums_1.ApplicationStatus.SHORTLISTED:
            statusLine = `Good news — the application for ${applicantName} has been shortlisted.`;
            break;
        case enums_1.ApplicationStatus.ADMITTED:
            statusLine = `Congratulations! ${applicantName} has been admitted to ${schoolName}.`;
            break;
        case enums_1.ApplicationStatus.REJECTED:
            statusLine =
                `After careful consideration, we are unable to offer ${applicantName} a place at this time.`;
            break;
        default:
            statusLine = `The application for ${applicantName} is now marked as "${statusLabel}".`;
    }
    const noteBlock = application.statusNote?.trim()
        ? `\n\nNote from the admissions office:\n${application.statusNote.trim()}`
        : '';
    const text = `Dear ${application.guardianName || 'Applicant'},\n\n` +
        `${statusLine}\n\n` +
        `Application reference: ${application.referenceNumber}\n` +
        `Current status: ${statusLabel}${noteBlock}\n\n` +
        `You can track your application online using your reference number and email or phone.\n\n` +
        `Kind regards,\n${schoolName} Admissions Office`;
    await (0, email_service_1.sendTransactionalEmail)({ to: application.contactEmail, subject, text });
}
/** Short SMS confirming submission. */
async function sendApplicationSubmittedSms(application, schoolName) {
    if (!application.contactPhone)
        return;
    const applicantName = `${application.studentFirstName} ${application.studentLastName}`.trim();
    const message = `${schoolName}: Application received for ${applicantName}. ` +
        `Reference ${application.referenceNumber}. ` +
        `Track your status online using this reference and your email or phone.`;
    await (0, whatsapp_service_1.sendSmsMessage)(application.contactPhone, message);
}
/** Short SMS notifying a status change. */
async function sendApplicationStatusSms(application, schoolName) {
    if (!application.contactPhone)
        return;
    const statusLabel = applicationStatusLabel(application.status);
    const message = `${schoolName}: Application ${application.referenceNumber} status is now "${statusLabel}". ` +
        `Track details online using your reference and email or phone.`;
    await (0, whatsapp_service_1.sendSmsMessage)(application.contactPhone, message);
}
/**
 * Notify the applicant that their application was received, via email + SMS.
 * Each channel fails independently and never throws to the caller.
 */
async function notifyApplicationSubmitted(application) {
    const schoolName = await getSchoolName();
    await Promise.allSettled([
        sendApplicationSubmittedEmail(application, schoolName),
        sendApplicationSubmittedSms(application, schoolName),
    ]);
}
/** Notify the applicant of a status change, via email + SMS. */
async function notifyApplicationStatusChange(application) {
    const schoolName = await getSchoolName();
    await Promise.allSettled([
        sendApplicationStatusEmail(application, schoolName),
        sendApplicationStatusSms(application, schoolName),
    ]);
}
