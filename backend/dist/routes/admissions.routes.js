"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const data_source_1 = require("../config/data-source");
const entities_1 = require("../entities");
const enums_1 = require("../entities/enums");
const auth_1 = require("../middleware/auth");
const admission_documents_1 = require("../utils/admission-documents");
const admission_service_1 = require("../services/admission.service");
const router = (0, express_1.Router)();
/** Roles allowed to review and manage admission applications. */
const manageRoles = [enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL];
const VALID_STATUSES = new Set(Object.values(enums_1.ApplicationStatus));
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Normalise a phone number to its trailing digits for lenient comparison. */
function phoneDigits(value) {
    return String(value || '').replace(/\D/g, '').slice(-9);
}
/** True when the supplied contact matches the application's email or phone. */
function contactMatchesApplication(app, contact) {
    const c = contact.trim();
    if (!c)
        return false;
    if (app.contactEmail.trim().toLowerCase() === c.toLowerCase())
        return true;
    const supplied = phoneDigits(c);
    const stored = phoneDigits(app.contactPhone);
    return supplied.length >= 6 && supplied === stored;
}
/** Public metadata shape (never exposes stored file names / disk paths). */
function toPublicTracking(app) {
    return {
        referenceNumber: app.referenceNumber,
        studentName: `${app.studentFirstName} ${app.studentLastName}`.trim(),
        classAppliedFor: app.classAppliedFor,
        status: app.status,
        statusNote: app.statusNote ?? null,
        submittedAt: app.submittedAt,
        reviewedAt: app.reviewedAt ?? null,
    };
}
function toAdminDocument(doc) {
    return {
        id: doc.id,
        docType: doc.docType,
        originalName: doc.originalName,
        mimeType: doc.mimeType,
        sizeBytes: doc.sizeBytes,
        createdAt: doc.createdAt,
    };
}
// ---------------------------------------------------------------------------
// PUBLIC ENDPOINTS (no authentication) — prospective applicants
// ---------------------------------------------------------------------------
/** Grade/form options for the "class applying for" dropdown on the public form. */
router.get('/classes', async (_req, res) => {
    try {
        const forms = await data_source_1.AppDataSource.getRepository(entities_1.Form).find({ order: { level: 'ASC' } });
        res.json(forms.map((f) => ({ id: f.id, name: f.name })));
    }
    catch {
        res.json([]);
    }
});
/** Track an application's status using its reference number + email or phone. */
router.get('/track', async (req, res) => {
    const reference = String(req.query.reference || '').trim().toUpperCase();
    // Accept `contact` (email or phone); keep `email` for backward compatibility.
    const contact = String(req.query.contact || req.query.email || '').trim();
    if (!reference || !contact) {
        return res
            .status(400)
            .json({ message: 'Reference number and email or phone are required.' });
    }
    const app = await data_source_1.AppDataSource.getRepository(entities_1.Application).findOne({
        where: { referenceNumber: reference },
    });
    if (!app || !contactMatchesApplication(app, contact)) {
        return res
            .status(404)
            .json({ message: 'No application found for that reference number and contact detail.' });
    }
    res.json(toPublicTracking(app));
});
/**
 * Pre-fill guardian/contact details for a signed-in parent so they can apply
 * for another child without re-entering their information.
 */
router.get('/prefill', auth_1.authenticate, async (req, res) => {
    const user = await data_source_1.AppDataSource.getRepository(entities_1.User).findOne({
        where: { id: String(req.user.userId) },
    });
    if (!user)
        return res.status(404).json({ message: 'Profile not found.' });
    let address = '';
    if (req.user.parentId) {
        const parent = await data_source_1.AppDataSource.getRepository(entities_1.Parent).findOne({
            where: { id: String(req.user.parentId) },
        });
        address = parent?.address ?? '';
    }
    res.json({
        guardianName: `${user.firstName} ${user.lastName}`.trim(),
        guardianRelationship: 'Parent',
        contactEmail: user.email ?? '',
        contactPhone: user.phone ?? '',
        address,
    });
});
// Multer middleware that maps the 4 typed document fields; converts upload
// errors (size/type) into a clean 400 instead of a 500.
const uploadAdmissionDocs = admission_documents_1.admissionDocumentUpload.fields(admission_documents_1.ADMISSION_DOC_FIELDS.map((f) => ({ name: f.name, maxCount: 1 })));
/** Submit a new admission application (public). */
router.post('/', (req, res, next) => {
    uploadAdmissionDocs(req, res, (err) => {
        if (err) {
            const message = err instanceof Error ? err.message : 'File upload failed.';
            return res.status(400).json({ message });
        }
        next();
    });
}, async (req, res) => {
    const files = req.files || {};
    const cleanupOnError = () => {
        const stored = Object.values(files)
            .flat()
            .map((f) => f.filename);
        if (stored.length)
            (0, admission_documents_1.removeAdmissionDocumentFiles)(stored);
    };
    try {
        const body = req.body || {};
        const str = (v) => String(v ?? '').trim();
        const studentFirstName = str(body.studentFirstName);
        const studentLastName = str(body.studentLastName);
        const dateOfBirth = str(body.dateOfBirth);
        const gender = str(body.gender);
        const previousSchool = str(body.previousSchool);
        const classAppliedFor = str(body.classAppliedFor);
        const guardianName = str(body.guardianName);
        const guardianRelationship = str(body.guardianRelationship);
        const contactPhone = str(body.contactPhone);
        const contactEmail = str(body.contactEmail).toLowerCase();
        const address = str(body.address);
        // Required text fields
        const missing = [];
        if (!studentFirstName)
            missing.push('student first name');
        if (!studentLastName)
            missing.push('student last name');
        if (!classAppliedFor)
            missing.push('class applying for');
        if (!guardianName)
            missing.push('parent/guardian name');
        if (!contactPhone)
            missing.push('contact phone');
        if (!contactEmail)
            missing.push('contact email');
        if (missing.length) {
            cleanupOnError();
            return res.status(400).json({ message: `Please provide: ${missing.join(', ')}.` });
        }
        if (!EMAIL_RE.test(contactEmail)) {
            cleanupOnError();
            return res.status(400).json({ message: 'Please provide a valid contact email address.' });
        }
        // Required documents: birth certificate, passport photo, ID/passport copy.
        // Previous school report card is optional (first-time applicants may not have one).
        const requiredDocFields = ['birthCertificate', 'passportPhoto', 'idCopy'];
        const missingDocs = requiredDocFields.filter((field) => !files[field]?.[0]);
        if (missingDocs.length) {
            const labelMap = {
                birthCertificate: 'birth certificate',
                passportPhoto: 'passport photo',
                idCopy: 'ID / passport copy',
            };
            cleanupOnError();
            return res.status(400).json({
                message: `Please upload the required documents: ${missingDocs
                    .map((f) => labelMap[f])
                    .join(', ')}.`,
            });
        }
        const appRepo = data_source_1.AppDataSource.getRepository(entities_1.Application);
        const referenceNumber = await (0, admission_service_1.generateApplicationReference)(appRepo);
        const saved = await data_source_1.AppDataSource.transaction(async (manager) => {
            const application = manager.getRepository(entities_1.Application).create({
                referenceNumber,
                studentFirstName,
                studentLastName,
                dateOfBirth: dateOfBirth || null,
                gender: gender || null,
                previousSchool: previousSchool || null,
                classAppliedFor,
                guardianName,
                guardianRelationship: guardianRelationship || null,
                contactPhone,
                contactEmail,
                address: address || null,
                status: enums_1.ApplicationStatus.APPLIED,
            });
            const app = await manager.getRepository(entities_1.Application).save(application);
            const docRepo = manager.getRepository(entities_1.ApplicationDocument);
            for (const field of admission_documents_1.ADMISSION_DOC_FIELDS) {
                const file = files[field.name]?.[0];
                if (!file)
                    continue;
                await docRepo.save(docRepo.create({
                    applicationId: app.id,
                    docType: field.docType,
                    originalName: file.originalname,
                    storedName: file.filename,
                    mimeType: file.mimetype,
                    sizeBytes: file.size,
                }));
            }
            return app;
        });
        // Fire-and-forget confirmation (email + SMS); never blocks the response.
        void (0, admission_service_1.notifyApplicationSubmitted)(saved).catch((e) => console.error('[Admissions] submission notification failed:', e));
        res.status(201).json({
            referenceNumber: saved.referenceNumber,
            status: saved.status,
            message: 'Application submitted successfully.',
        });
    }
    catch (err) {
        cleanupOnError();
        const message = err instanceof Error ? err.message : 'Failed to submit application.';
        res.status(400).json({ message });
    }
});
// ---------------------------------------------------------------------------
// ADMIN ENDPOINTS — review & manage the admission pipeline
// ---------------------------------------------------------------------------
/** List applications with optional filters (status, class, date range, search). */
router.get('/', auth_1.authenticate, (0, auth_1.authorize)(...manageRoles), async (req, res) => {
    const { status, classAppliedFor, from, to, search } = req.query;
    const qb = data_source_1.AppDataSource.getRepository(entities_1.Application)
        .createQueryBuilder('a')
        .leftJoinAndSelect('a.documents', 'd');
    if (status && VALID_STATUSES.has(status)) {
        qb.andWhere('a.status = :status', { status });
    }
    if (classAppliedFor) {
        qb.andWhere('a.classAppliedFor ILIKE :cls', { cls: `%${classAppliedFor}%` });
    }
    if (from)
        qb.andWhere('a.submittedAt >= :from', { from });
    if (to)
        qb.andWhere('a.submittedAt <= :to', { to: `${to} 23:59:59` });
    if (search) {
        qb.andWhere('(a.studentFirstName ILIKE :s OR a.studentLastName ILIKE :s OR a.referenceNumber ILIKE :s OR a.guardianName ILIKE :s OR a.contactEmail ILIKE :s)', { s: `%${search}%` });
    }
    const applications = await qb.orderBy('a.submittedAt', 'DESC').getMany();
    res.json(applications.map((a) => ({
        id: a.id,
        referenceNumber: a.referenceNumber,
        studentFirstName: a.studentFirstName,
        studentLastName: a.studentLastName,
        dateOfBirth: a.dateOfBirth ?? null,
        gender: a.gender ?? null,
        previousSchool: a.previousSchool ?? null,
        classAppliedFor: a.classAppliedFor,
        guardianName: a.guardianName,
        guardianRelationship: a.guardianRelationship ?? null,
        contactPhone: a.contactPhone,
        contactEmail: a.contactEmail,
        address: a.address ?? null,
        status: a.status,
        statusNote: a.statusNote ?? null,
        submittedAt: a.submittedAt,
        reviewedAt: a.reviewedAt ?? null,
        documents: (a.documents || []).map(toAdminDocument),
    })));
});
/** Get a single application with its documents. */
router.get('/:id', auth_1.authenticate, (0, auth_1.authorize)(...manageRoles), async (req, res) => {
    const app = await data_source_1.AppDataSource.getRepository(entities_1.Application).findOne({
        where: { id: String(req.params.id) },
        relations: { documents: true },
    });
    if (!app)
        return res.status(404).json({ message: 'Application not found.' });
    res.json({
        ...app,
        documents: (app.documents || []).map(toAdminDocument),
    });
});
/** Securely download/view a single application document (admin only). */
router.get('/:id/documents/:docId', auth_1.authenticate, (0, auth_1.authorize)(...manageRoles), async (req, res) => {
    const doc = await data_source_1.AppDataSource.getRepository(entities_1.ApplicationDocument).findOne({
        where: { id: String(req.params.docId), applicationId: String(req.params.id) },
    });
    if (!doc)
        return res.status(404).json({ message: 'Document not found.' });
    const fullPath = path_1.default.join(admission_documents_1.admissionDocumentsDir, doc.storedName);
    if (!fs_1.default.existsSync(fullPath)) {
        return res.status(404).json({ message: 'File is no longer available.' });
    }
    res.setHeader('Content-Type', doc.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${doc.originalName.replace(/"/g, '')}"`);
    res.sendFile(fullPath);
});
/** Update an application's status and notify the applicant by email. */
router.patch('/:id/status', auth_1.authenticate, (0, auth_1.authorize)(...manageRoles), async (req, res) => {
    const { status, statusNote } = req.body || {};
    const nextStatus = String(status || '').trim();
    if (!VALID_STATUSES.has(nextStatus)) {
        return res.status(400).json({ message: 'Invalid application status.' });
    }
    const repo = data_source_1.AppDataSource.getRepository(entities_1.Application);
    const app = await repo.findOne({ where: { id: String(req.params.id) } });
    if (!app)
        return res.status(404).json({ message: 'Application not found.' });
    app.status = nextStatus;
    app.statusNote = statusNote != null ? String(statusNote).trim() || null : app.statusNote;
    app.reviewedAt = new Date();
    const saved = await repo.save(app);
    void (0, admission_service_1.notifyApplicationStatusChange)(saved).catch((e) => console.error('[Admissions] status notification failed:', e));
    res.json({
        id: saved.id,
        referenceNumber: saved.referenceNumber,
        status: saved.status,
        statusNote: saved.statusNote ?? null,
        reviewedAt: saved.reviewedAt ?? null,
        message: 'Status updated. Applicant notified by email and SMS.',
    });
});
exports.default = router;
