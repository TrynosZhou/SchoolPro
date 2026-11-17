"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const data_source_1 = require("../config/data-source");
const entities_1 = require("../entities");
const router = (0, express_1.Router)();
/**
 * Public school branding (name, tagline, logo) for unauthenticated pages such as
 * the login screen and the public admissions pages. Reads the same settings that
 * admins manage on /admin/settings.
 */
router.get('/branding', async (_req, res) => {
    try {
        const settings = await data_source_1.AppDataSource.getRepository(entities_1.SchoolSettings).findOne({
            where: { id: 'default' },
        });
        res.json({
            schoolName: settings?.schoolName?.trim() || 'School Pro Academy',
            tagline: settings?.tagline?.trim() || null,
            logoUrl: settings?.logoUrl?.trim() || null,
        });
    }
    catch (err) {
        console.warn('[public:branding] DB lookup failed — returning default branding (non-fatal):', err instanceof Error ? err.message : String(err));
        res.json({
            schoolName: 'School Pro Academy',
            tagline: null,
            logoUrl: null,
        });
    }
});
/**
 * Public QR verification for issued documents (bonafide, transfer, testimonial…).
 * Returns limited fields only — enough to confirm authenticity.
 */
router.get('/verify-document/:code', async (req, res) => {
    try {
        const doc = await data_source_1.AppDataSource.getRepository(entities_1.IssuedDocument).findOne({
            where: { referenceCode: String(req.params.code).toUpperCase() },
        });
        if (!doc)
            return res.status(404).json({ valid: false, message: 'Document not found.' });
        res.json({
            valid: true,
            type: doc.type,
            title: doc.title,
            recipientName: doc.recipientName || null,
            issuedAt: doc.issuedAt,
            referenceCode: doc.referenceCode,
        });
    }
    catch (err) {
        console.error('[public:verify-document]', err);
        res.status(500).json({ valid: false, message: 'Verification failed.' });
    }
});
/** Public QR verification for student ID cards. */
router.get('/verify-id/:code', async (req, res) => {
    try {
        const card = await data_source_1.AppDataSource.getRepository(entities_1.StudentIdCard).findOne({
            where: { code: String(req.params.code).toUpperCase() },
        });
        if (!card || !card.isActive) {
            return res.status(404).json({ valid: false, message: 'Invalid card code.' });
        }
        const student = await data_source_1.AppDataSource.getRepository(entities_1.Student).findOne({
            where: { id: card.studentId },
            relations: { schoolClass: true },
        });
        res.json({
            valid: true,
            student: student
                ? {
                    name: `${student.firstName} ${student.lastName}`,
                    admissionNumber: student.admissionNumber,
                    className: student.schoolClass?.name || null,
                }
                : null,
        });
    }
    catch (err) {
        console.error('[public:verify-id]', err);
        res.status(500).json({ valid: false, message: 'Verification failed.' });
    }
});
/** Public job listings + application submission (careers page). */
router.get('/jobs', async (_req, res) => {
    try {
        const jobs = await data_source_1.AppDataSource.getRepository(entities_1.JobPosting).find({
            where: { status: 'open' },
            order: { createdAt: 'DESC' },
        });
        res.json(jobs.map((j) => ({
            id: j.id,
            title: j.title,
            department: j.department,
            description: j.description,
            employmentType: j.employmentType,
            closingDate: j.closingDate,
        })));
    }
    catch (err) {
        console.error('[public:jobs]', err);
        res.status(500).json({ message: 'Could not load jobs.' });
    }
});
router.post('/jobs/:id/apply', async (req, res) => {
    try {
        const job = await data_source_1.AppDataSource.getRepository(entities_1.JobPosting).findOne({
            where: { id: String(req.params.id), status: 'open' },
        });
        if (!job)
            return res.status(404).json({ message: 'Job not found or closed.' });
        const { applicantName, email, phone, coverNote } = req.body ?? {};
        if (!applicantName || !email) {
            return res.status(400).json({ message: 'applicantName and email are required.' });
        }
        const repo = data_source_1.AppDataSource.getRepository(entities_1.JobApplication);
        const row = await repo.save(repo.create({ jobPostingId: job.id, applicantName, email, phone, coverNote }));
        res.status(201).json({ id: row.id, message: 'Application received.' });
    }
    catch (err) {
        console.error('[public:apply]', err);
        res.status(500).json({ message: 'Could not submit application.' });
    }
});
exports.default = router;
