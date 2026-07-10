"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-nocheck
const express_1 = require("express");
const data_source_1 = require("../config/data-source");
const typeorm_1 = require("typeorm");
const entities_1 = require("../entities");
const enums_1 = require("../entities/enums");
const student_lifecycle_service_1 = require("../services/student-lifecycle.service");
const auth_1 = require("../middleware/auth");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const typeorm_helpers_1 = require("../utils/typeorm-helpers");
const permissions_1 = require("../config/permissions");
const helpers_1 = require("../utils/helpers");
const grade_boundaries_1 = require("../types/grade-boundaries");
const security_policy_1 = require("../types/security-policy");
const grade_service_1 = require("../services/grade.service");
const security_policy_service_1 = require("../services/security-policy.service");
const integrations_service_1 = require("../services/integrations.service");
const integrations_config_1 = require("../types/integrations-config");
const whatsapp_service_1 = require("../services/whatsapp.service");
const term_balance_service_1 = require("../services/term-balance.service");
const teacher_load_service_1 = require("../services/teacher-load.service");
const teacher_assignment_service_1 = require("../services/teacher-assignment.service");
const class_subject_teacher_service_1 = require("../services/class-subject-teacher.service");
const school_branding_service_1 = require("../services/school-branding.service");
const teacher_load_pdf_1 = require("../utils/teacher-load.pdf");
const permissions_routes_1 = __importDefault(require("./permissions.routes"));
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const pdf_1 = require("../utils/pdf");
const gender_1 = require("../utils/gender");
const portal_roles_1 = require("../config/portal-roles");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
const SETTINGS_ID = 'default';
const logosDir = path_1.default.join(process.cwd(), 'uploads', 'logos');
/** Normalize an incoming staff gender value to 'male' | 'female' | null. */
function normalizeGender(value) {
    const v = String(value ?? '').trim().toLowerCase();
    if (v === 'male' || v === 'm')
        return 'male';
    if (v === 'female' || v === 'f')
        return 'female';
    return null;
}
const logoUpload = (0, multer_1.default)({
    storage: multer_1.default.diskStorage({
        destination: (_req, _file, cb) => {
            (0, pdf_1.ensureUploadDirs)();
            cb(null, logosDir);
        },
        filename: (_req, file, cb) => {
            const ext = path_1.default.extname(file.originalname).toLowerCase();
            const safeExt = ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext) ? ext : '.png';
            cb(null, `school-logo${safeExt}`);
        },
    }),
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const ok = /^image\/(png|jpe?g|webp|gif)$/i.test(file.mimetype);
        cb(ok ? null : new Error('Only image files are allowed'), ok);
    },
});
async function getOrCreateSettings() {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.SchoolSettings);
    let settings = await repo.findOne({ where: { id: SETTINGS_ID } });
    if (!settings) {
        settings = await repo.save(repo.create({
            id: SETTINGS_ID,
            schoolName: 'School Pro Academy',
            tagline: 'Excellence in Education',
            address: 'Harare, Zimbabwe',
            phone: '+263 4 123 4567',
            email: 'info@schoolpro.ac.zw',
            currency: 'USD',
            feeReminderTemplate: 'Fee reminder: {student} ({class}) owes ${amount}. Please arrange payment.',
            gradeBoundaries: grade_boundaries_1.DEFAULT_GRADE_BOUNDARIES,
            securityPolicy: security_policy_1.DEFAULT_SECURITY_POLICY,
            integrationsConfig: integrations_config_1.DEFAULT_INTEGRATIONS,
        }));
    }
    if (!settings.gradeBoundaries?.length) {
        settings.gradeBoundaries = grade_boundaries_1.DEFAULT_GRADE_BOUNDARIES;
        await repo.save(settings);
    }
    if (!settings.securityPolicy) {
        settings.securityPolicy = security_policy_1.DEFAULT_SECURITY_POLICY;
        await repo.save(settings);
    }
    if (!settings.integrationsConfig) {
        settings.integrationsConfig = integrations_config_1.DEFAULT_INTEGRATIONS;
        await repo.save(settings);
    }
    return settings;
}
router.get('/settings', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL), async (_req, res) => {
    const school = await getOrCreateSettings();
    const integrations = await (0, integrations_service_1.getIntegrationsPublic)();
    res.json({
        school,
        security: (0, security_policy_1.normalizeSecurityPolicy)(school.securityPolicy || security_policy_1.DEFAULT_SECURITY_POLICY),
        whatsapp: {
            enabled: integrations.status.whatsapp !== 'disabled',
            configured: integrations.status.whatsapp === 'active',
            from: integrations.integrations.whatsapp.from
                ? integrations.integrations.whatsapp.from.replace(/(\+\d{3}).+(\d{4})/, '$1***$2')
                : null,
        },
    });
});
router.patch('/settings', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.SchoolSettings);
    const settings = await getOrCreateSettings();
    if (req.body.gradeBoundaries !== undefined) {
        const err = (0, grade_boundaries_1.validateGradeBoundaries)(req.body.gradeBoundaries);
        if (err)
            return res.status(400).json({ message: err });
        settings.gradeBoundaries = req.body.gradeBoundaries.map((b) => ({
            grade: String(b.grade).trim(),
            label: b.label?.trim() || undefined,
            minPercent: Number(b.minPercent),
            points: b.points !== undefined && b.points !== null && b.points !== ''
                ? Number(b.points)
                : undefined,
        }));
        (0, grade_service_1.invalidateGradeBoundariesCache)();
    }
    if (req.body.securityPolicy !== undefined) {
        const err = (0, security_policy_1.validateSecurityPolicy)(req.body.securityPolicy);
        if (err)
            return res.status(400).json({ message: err });
        settings.securityPolicy = (0, security_policy_1.normalizeSecurityPolicy)(req.body.securityPolicy);
        (0, security_policy_service_1.invalidateSecurityPolicyCache)();
    }
    const { gradeBoundaries: _gb, securityPolicy: _sp, logoUrl: _logo, ...rest } = req.body;
    Object.assign(settings, rest);
    const saved = await repo.save(settings);
    if (req.body.gradeBoundaries !== undefined)
        (0, grade_service_1.invalidateGradeBoundariesCache)();
    if (req.body.securityPolicy !== undefined)
        (0, security_policy_service_1.invalidateSecurityPolicyCache)();
    res.json(saved);
});
router.post('/settings/logo', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), logoUpload.single('logo'), async (req, res) => {
    if (!req.file)
        return res.status(400).json({ message: 'Logo image file is required' });
    const repo = data_source_1.AppDataSource.getRepository(entities_1.SchoolSettings);
    const settings = await getOrCreateSettings();
    settings.logoUrl = `/uploads/logos/${req.file.filename}`;
    const saved = await repo.save(settings);
    res.json(saved);
});
router.delete('/settings/logo', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (_req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.SchoolSettings);
    const settings = await getOrCreateSettings();
    if (settings.logoUrl) {
        const filePath = path_1.default.join(process.cwd(), settings.logoUrl.replace(/^\/+/, ''));
        if (fs_1.default.existsSync(filePath))
            fs_1.default.unlinkSync(filePath);
        settings.logoUrl = null;
        await repo.save(settings);
    }
    res.json(settings);
});
router.post('/settings/test-whatsapp', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (req, res) => {
    const { phone, message } = req.body;
    if (!phone)
        return res.status(400).json({ message: 'Phone number required' });
    const ok = await (0, whatsapp_service_1.sendWhatsAppReminder)(phone, message || 'Test message from School Pro — WhatsApp integration is working.');
    if (!ok)
        return res.status(400).json({ message: 'WhatsApp not configured or send failed. Check Integrations settings.' });
    res.json({ sent: true });
});
router.get('/integrations', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (_req, res) => {
    res.json(await (0, integrations_service_1.getIntegrationsPublic)());
});
router.patch('/integrations', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (req, res) => {
    const patch = req.body?.integrations ?? req.body;
    if (!patch || typeof patch !== 'object') {
        return res.status(400).json({ message: 'Invalid integrations payload' });
    }
    const saved = await (0, integrations_service_1.saveIntegrationsConfig)(patch);
    res.json({
        integrations: saved,
        status: (await (0, integrations_service_1.getIntegrationsPublic)()).status,
    });
});
router.post('/integrations/test/:provider', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (req, res) => {
    const { provider } = req.params;
    const { phone, message, email } = req.body || {};
    if (provider === 'whatsapp') {
        if (!phone)
            return res.status(400).json({ message: 'Phone number required' });
        const ok = await (0, whatsapp_service_1.sendWhatsAppReminder)(phone, message || 'Test message from School Pro Integrations.');
        if (!ok)
            return res.status(400).json({ ok: false, message: 'WhatsApp send failed. Check credentials.' });
        return res.json({ ok: true, message: 'Test WhatsApp message sent (or logged in mock mode).' });
    }
    if (provider === 'webhook') {
        const result = await (0, integrations_service_1.testWebhookConnection)();
        return res.status(result.ok ? 200 : 400).json(result);
    }
    if (provider === 'custom-api') {
        const result = await (0, integrations_service_1.testCustomApiConnection)();
        return res.status(result.ok ? 200 : 400).json(result);
    }
    if (provider === 'email') {
        const cfg = (await (0, integrations_service_1.getIntegrationsPublic)()).integrations.email;
        if (!cfg.host || !cfg.user || !cfg.hasPassword) {
            return res.status(400).json({ ok: false, message: 'Complete SMTP host, user, and password first.' });
        }
        if (!email) {
            return res.json({ ok: true, message: 'SMTP settings look complete. Provide a test email address to send (coming soon).' });
        }
        return res.json({ ok: true, message: `SMTP configuration saved. Test delivery to ${email} will be enabled in a future update.` });
    }
    if (provider === 'payment') {
        const cfg = (await (0, integrations_service_1.getIntegrationsPublic)()).integrations.payment;
        if (!cfg.merchantId || !cfg.hasApiKey) {
            return res.status(400).json({ ok: false, message: 'Merchant ID and API key are required.' });
        }
        return res.json({ ok: true, message: `${cfg.provider} credentials saved. Live payment test pending provider SDK.` });
    }
    return res.status(404).json({ message: 'Unknown integration provider' });
});
router.get('/school-years', (0, auth_1.authorize)(...portal_roles_1.SCHOOL_READ_ROLES), async (_req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.SchoolYear);
    res.json(await repo.find({ relations: (0, typeorm_helpers_1.relations)('terms'), order: { startDate: 'DESC' } }));
});
router.post('/school-years', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.SchoolYear);
    if (req.body.isCurrent) {
        await repo.update({ isCurrent: true }, { isCurrent: false });
    }
    const year = await repo.save(repo.create(req.body));
    res.status(201).json(year);
});
router.post('/terms', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.Term);
    if (req.body.schoolYearId && req.body.termNumber != null) {
        const duplicate = await repo.findOne({
            where: {
                schoolYearId: req.body.schoolYearId,
                termNumber: Number(req.body.termNumber),
            },
        });
        if (duplicate) {
            return res.status(409).json({
                message: `Term ${req.body.termNumber} already exists for this school year. Edit the existing term instead of creating another.`,
            });
        }
    }
    if (req.body.isCurrent) {
        await repo.update({ isCurrent: true }, { isCurrent: false });
    }
    const term = await repo.save(repo.create(req.body));
    if (req.body.isCurrent) {
        try {
            await (0, term_balance_service_1.carryForwardBalancesForTerm)(term.id);
        }
        catch {
            // Balance carry-forward can be retried via billing API if needed.
        }
    }
    res.status(201).json(term);
});
router.patch('/school-years/:id', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.SchoolYear);
    const year = await repo.findOne({ where: { id: req.params.id } });
    if (!year)
        return res.status(404).json({ message: 'School year not found' });
    if (req.body.isCurrent) {
        await repo.update({ isCurrent: true }, { isCurrent: false });
    }
    Object.assign(year, req.body);
    res.json(await repo.save(year));
});
router.patch('/terms/:id', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.Term);
    const term = await repo.findOne({ where: { id: req.params.id } });
    if (!term)
        return res.status(404).json({ message: 'Term not found' });
    const nextTermNumber = req.body.termNumber != null ? Number(req.body.termNumber) : term.termNumber;
    const nextSchoolYearId = req.body.schoolYearId || term.schoolYearId;
    if (nextTermNumber !== term.termNumber || nextSchoolYearId !== term.schoolYearId) {
        const duplicate = await repo.findOne({
            where: {
                schoolYearId: nextSchoolYearId,
                termNumber: nextTermNumber,
            },
        });
        if (duplicate && duplicate.id !== term.id) {
            return res.status(409).json({
                message: `Term ${nextTermNumber} already exists for this school year.`,
            });
        }
    }
    if (req.body.isCurrent) {
        await repo.update({ isCurrent: true }, { isCurrent: false });
    }
    Object.assign(term, req.body);
    const saved = await repo.save(term);
    if (req.body.isCurrent) {
        try {
            await (0, term_balance_service_1.carryForwardBalancesForTerm)(saved.id);
        }
        catch {
            // Balance carry-forward can be retried via billing API if needed.
        }
    }
    res.json(saved);
});
router.get('/forms', async (_req, res) => {
    res.json(await data_source_1.AppDataSource.getRepository(entities_1.Form).find({ relations: (0, typeorm_helpers_1.relations)('classes'), order: { level: 'ASC' } }));
});
router.post('/forms', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (req, res) => {
    const form = await data_source_1.AppDataSource.getRepository(entities_1.Form).save(data_source_1.AppDataSource.getRepository(entities_1.Form).create(req.body));
    res.status(201).json(form);
});
router.patch('/forms/:id', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.Form);
    const form = await repo.findOne({ where: { id: req.params.id } });
    if (!form)
        return res.status(404).json({ message: 'Form not found' });
    if (req.body.name !== undefined)
        form.name = String(req.body.name).trim();
    if (req.body.level !== undefined)
        form.level = Number(req.body.level);
    await repo.save(form);
    res.json(form);
});
router.delete('/forms/:id', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.Form);
    const form = await repo.findOne({
        where: { id: req.params.id },
        relations: (0, typeorm_helpers_1.relations)('classes'),
    });
    if (!form)
        return res.status(404).json({ message: 'Form not found' });
    if (form.classes?.length) {
        return res.status(400).json({
            message: `Cannot delete form "${form.name}" — it has ${form.classes.length} class(es). Remove those classes first.`,
        });
    }
    const studentCount = await data_source_1.AppDataSource.query(`SELECT COUNT(*) AS cnt FROM students WHERE "formId" = $1`, [form.id]);
    if (Number(studentCount[0]?.cnt) > 0) {
        return res.status(400).json({
            message: `Cannot delete form "${form.name}" — ${studentCount[0].cnt} student(s) are assigned to it.`,
        });
    }
    await repo.delete({ id: form.id });
    res.json({ message: 'Form deleted' });
});
router.get('/classes', async (_req, res) => {
    res.json(await data_source_1.AppDataSource.getRepository(entities_1.SchoolClass).find({
        relations: (0, typeorm_helpers_1.relations)('form', 'students'),
        order: { name: 'ASC' },
    }));
});
async function resolveClassTeacherAssignment(repo, classId, classTeacherId) {
    if (classTeacherId === undefined)
        return {};
    const teacherId = classTeacherId ? String(classTeacherId).trim() : '';
    if (!teacherId)
        return { classTeacherId: undefined };
    const staff = await data_source_1.AppDataSource.getRepository(entities_1.Staff).findOne({ where: { id: teacherId } });
    if (!staff)
        return { error: 'Class teacher not found' };
    const existing = await repo.findOne({ where: { classTeacherId: teacherId } });
    if (existing && existing.id !== classId) {
        return {
            error: `This staff member is already the class teacher of ${existing.name}. Each class can have only one class teacher.`,
        };
    }
    return { classTeacherId: teacherId };
}
router.post('/classes', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.SchoolClass);
    const { classTeacherId, ...rest } = req.body;
    const assignment = await resolveClassTeacherAssignment(repo, undefined, classTeacherId);
    if (assignment.error)
        return res.status(409).json({ message: assignment.error });
    const cls = repo.create({
        ...rest,
        ...(assignment.classTeacherId !== undefined ? { classTeacherId: assignment.classTeacherId } : {}),
    });
    const saved = await repo.save(cls);
    res.status(201).json(saved);
});
router.get('/subjects', async (_req, res) => {
    res.json(await data_source_1.AppDataSource.getRepository(entities_1.Subject).find({ order: { name: 'ASC' } }));
});
router.post('/subjects', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (req, res) => {
    const subject = await data_source_1.AppDataSource.getRepository(entities_1.Subject).save(data_source_1.AppDataSource.getRepository(entities_1.Subject).create(req.body));
    res.status(201).json(subject);
});
router.patch('/subjects/:id', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.Subject);
    const subject = await repo.findOne({ where: { id: req.params.id } });
    if (!subject)
        return res.status(404).json({ message: 'Subject not found' });
    const { code, name, description, short } = req.body;
    if (code !== undefined) {
        const normalized = String(code).trim().toUpperCase();
        if (!normalized)
            return res.status(400).json({ message: 'Subject code is required' });
        const clash = await repo.findOne({ where: { code: normalized } });
        if (clash && clash.id !== subject.id) {
            return res.status(409).json({ message: 'A subject with this code already exists' });
        }
        subject.code = normalized;
    }
    if (name !== undefined) {
        const trimmed = String(name).trim();
        if (!trimmed)
            return res.status(400).json({ message: 'Subject name is required' });
        subject.name = trimmed;
    }
    if (description !== undefined)
        subject.description = description?.trim() || undefined;
    if (short !== undefined) {
        const trimmed = short == null ? '' : String(short).trim();
        if (trimmed.length > 16) {
            return res.status(400).json({ message: 'Subject short label must be 16 characters or fewer.' });
        }
        subject.short = trimmed || null;
    }
    res.json(await repo.save(subject));
});
router.get('/departments', async (_req, res) => {
    res.json(await data_source_1.AppDataSource.getRepository(entities_1.Department).find({
        order: { sortOrder: 'ASC', name: 'ASC' },
    }));
});
router.post('/departments', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (req, res) => {
    const { code, name, description, isActive, sortOrder } = req.body;
    if (!code?.trim() || !name?.trim()) {
        return res.status(400).json({ message: 'Department code and name are required' });
    }
    const repo = data_source_1.AppDataSource.getRepository(entities_1.Department);
    const existing = await repo.findOne({ where: { code: String(code).trim().toUpperCase() } });
    if (existing) {
        return res.status(409).json({ message: 'A department with this code already exists' });
    }
    const department = await repo.save(repo.create({
        code: String(code).trim().toUpperCase(),
        name: String(name).trim(),
        description: description?.trim() || undefined,
        isActive: isActive !== false,
        sortOrder: Number(sortOrder) || 0,
    }));
    res.status(201).json(department);
});
router.patch('/departments/:id', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.Department);
    const department = await repo.findOne({ where: { id: req.params.id } });
    if (!department)
        return res.status(404).json({ message: 'Department not found' });
    const { code, name, description, isActive, sortOrder } = req.body;
    if (code !== undefined) {
        const normalized = String(code).trim().toUpperCase();
        const clash = await repo.findOne({ where: { code: normalized } });
        if (clash && clash.id !== department.id) {
            return res.status(409).json({ message: 'A department with this code already exists' });
        }
        department.code = normalized;
    }
    if (name !== undefined)
        department.name = String(name).trim();
    if (description !== undefined)
        department.description = description?.trim() || null;
    if (isActive !== undefined)
        department.isActive = Boolean(isActive);
    if (sortOrder !== undefined)
        department.sortOrder = Number(sortOrder) || 0;
    res.json(await repo.save(department));
});
router.delete('/departments/:id', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.Department);
    const department = await repo.findOne({ where: { id: req.params.id } });
    if (!department)
        return res.status(404).json({ message: 'Department not found' });
    await repo.remove(department);
    res.json({ message: 'Department deleted' });
});
router.get('/class-subjects', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL), async (req, res) => {
    const { classId } = req.query;
    if (classId) {
        return res.json(await (0, class_subject_teacher_service_1.listClassSubjectTeachers)(String(classId)));
    }
    const qb = data_source_1.AppDataSource.getRepository(entities_1.ClassSubject).createQueryBuilder('cs')
        .leftJoinAndSelect('cs.subject', 'subject')
        .leftJoinAndSelect('cs.teacher', 'teacher')
        .leftJoinAndSelect('teacher.user', 'user')
        .leftJoinAndSelect('cs.schoolClass', 'schoolClass');
    res.json(await qb.getMany());
});
router.post('/class-subjects', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (req, res) => {
    try {
        const repo = data_source_1.AppDataSource.getRepository(entities_1.ClassSubject);
        const { classId, subjectId, teacherId, weeklyPeriods, lessonLength, forceReassign } = req.body || {};
        if (!classId || !subjectId) {
            return res.status(400).json({ message: 'classId and subjectId are required.' });
        }
        const existing = await (0, class_subject_teacher_service_1.assertCanAssignTeacherToClassSubject)({
            classId,
            subjectId,
            teacherId: teacherId || '',
            forceReassign: Boolean(forceReassign),
        });
        if (existing) {
            if (teacherId)
                existing.teacherId = teacherId;
            if (weeklyPeriods !== undefined)
                existing.weeklyPeriods = Number(weeklyPeriods) || 0;
            if (lessonLength !== undefined)
                existing.lessonLength = lessonLength;
            const saved = await repo.save(existing);
            if (teacherId)
                await (0, class_subject_teacher_service_1.syncTimetableTeachersForAssignment)(classId, subjectId, teacherId);
            return res.status(200).json(saved);
        }
        const entity = repo.create(req.body);
        const cs = await repo.save(entity);
        if (cs.teacherId) {
            await (0, class_subject_teacher_service_1.syncTimetableTeachersForAssignment)(cs.classId, cs.subjectId, cs.teacherId);
        }
        res.status(201).json(cs);
    }
    catch (err) {
        const e = err;
        if (e instanceof class_subject_teacher_service_1.ClassSubjectTeacherConflictError || e?.name === 'ClassSubjectTeacherConflictError') {
            return res.status(409).json({ message: e.message });
        }
        if (e?.code === '23505') {
            return res.status(409).json({ message: 'This subject is already allocated to the selected class.' });
        }
        res.status(400).json({ message: e?.message || 'Failed to create class subject assignment.' });
    }
});
router.patch('/class-subjects/:id', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (req, res) => {
    try {
        const repo = data_source_1.AppDataSource.getRepository(entities_1.ClassSubject);
        const cs = await repo.findOne({ where: { id: req.params.id } });
        if (!cs)
            return res.status(404).json({ message: 'Assignment not found' });
        const nextClassId = req.body?.classId ?? cs.classId;
        const nextSubjectId = req.body?.subjectId ?? cs.subjectId;
        const nextTeacherId = req.body?.teacherId;
        if (nextTeacherId !== undefined && nextTeacherId !== null && nextTeacherId !== cs.teacherId) {
            await (0, class_subject_teacher_service_1.assertCanAssignTeacherToClassSubject)({
                classId: nextClassId,
                subjectId: nextSubjectId,
                teacherId: nextTeacherId,
                forceReassign: Boolean(req.body?.forceReassign),
            });
        }
        Object.assign(cs, req.body);
        const saved = await repo.save(cs);
        if (saved.teacherId) {
            await (0, class_subject_teacher_service_1.syncTimetableTeachersForAssignment)(saved.classId, saved.subjectId, saved.teacherId);
        }
        res.json(saved);
    }
    catch (err) {
        const e = err;
        if (e instanceof class_subject_teacher_service_1.ClassSubjectTeacherConflictError || e?.name === 'ClassSubjectTeacherConflictError') {
            return res.status(409).json({ message: e.message });
        }
        if (e?.code === '23505') {
            return res.status(409).json({ message: 'This subject is already allocated to the selected class.' });
        }
        res.status(400).json({ message: e?.message || 'Failed to update class subject assignment.' });
    }
});
router.delete('/class-subjects/:id', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (req, res) => {
    await data_source_1.AppDataSource.getRepository(entities_1.ClassSubject).delete({ id: req.params.id });
    res.json({ deleted: true });
});
router.patch('/classes/:id', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.SchoolClass);
    const cls = await repo.findOne({
        where: { id: req.params.id },
        relations: (0, typeorm_helpers_1.relations)('form', 'students'),
    });
    if (!cls)
        return res.status(404).json({ message: 'Class not found' });
    const { name, formId, capacity, classTeacherId } = req.body;
    if (name !== undefined) {
        const trimmed = String(name).trim();
        if (!trimmed)
            return res.status(400).json({ message: 'Class name is required' });
        cls.name = trimmed;
    }
    if (formId !== undefined)
        cls.formId = formId;
    if (capacity !== undefined)
        cls.capacity = Number(capacity) || cls.capacity;
    if (classTeacherId !== undefined) {
        const assignment = await resolveClassTeacherAssignment(repo, cls.id, classTeacherId);
        if (assignment.error)
            return res.status(409).json({ message: assignment.error });
        cls.classTeacherId = assignment.classTeacherId;
    }
    const saved = await repo.save(cls);
    const full = await repo.findOne({
        where: { id: saved.id },
        relations: (0, typeorm_helpers_1.relations)('form', 'students'),
    });
    res.json(full ?? saved);
});
router.get('/promotion-rules', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (_req, res) => {
    const rules = await data_source_1.AppDataSource.getRepository(entities_1.ClassPromotionRule).find({
        select: {
            id: true,
            fromClassId: true,
            toClassId: true,
            completionLabel: true,
            isActive: true,
            createdAt: true,
        },
        order: { createdAt: 'ASC' },
    });
    res.json(rules);
});
router.put('/promotion-rules', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (req, res) => {
    const payload = req.body?.rules;
    if (!Array.isArray(payload)) {
        return res.status(400).json({ message: 'rules array is required' });
    }
    // A valid rule has a fromClassId plus either a toClassId or a completionLabel.
    const validRules = payload.filter((r) => r?.fromClassId && (r?.toClassId || r?.completionLabel));
    const fromIds = validRules.map((r) => String(r.fromClassId));
    if (fromIds.length !== new Set(fromIds).size) {
        return res.status(400).json({ message: 'Each class can only have one promotion target' });
    }
    for (const r of validRules) {
        if (r.toClassId && r.fromClassId === r.toClassId) {
            return res.status(400).json({ message: 'A class cannot be promoted to itself' });
        }
    }
    // Validate only the class-to-class rules (completion rules have no toClassId).
    const classRules = validRules.filter((r) => r.toClassId);
    const classIds = new Set();
    for (const r of classRules) {
        classIds.add(String(r.fromClassId));
        classIds.add(String(r.toClassId));
    }
    // Also validate fromClassIds for completion rules.
    for (const r of validRules.filter((r) => r.completionLabel)) {
        classIds.add(String(r.fromClassId));
    }
    if (classIds.size) {
        const found = await data_source_1.AppDataSource.getRepository(entities_1.SchoolClass).find({
            where: { id: (0, typeorm_1.In)([...classIds]) },
            select: { id: true },
        });
        if (found.length !== classIds.size) {
            return res.status(400).json({ message: 'One or more classes were not found' });
        }
    }
    const ruleRepo = data_source_1.AppDataSource.getRepository(entities_1.ClassPromotionRule);
    await ruleRepo.clear();
    if (validRules.length) {
        await ruleRepo.save(validRules.map((r) => ruleRepo.create({
            fromClassId: String(r.fromClassId),
            toClassId: r.toClassId ? String(r.toClassId) : undefined,
            completionLabel: r.completionLabel ? String(r.completionLabel) : undefined,
            isActive: r.isActive !== false,
        })));
    }
    const rules = await ruleRepo.find({
        select: {
            id: true,
            fromClassId: true,
            toClassId: true,
            completionLabel: true,
            isActive: true,
            createdAt: true,
        },
        order: { createdAt: 'ASC' },
    });
    res.json(rules);
});
/** Calendar year label for a school year (Jan–Dec), e.g. "2025" or "2025/2026" → 2025 */
function schoolYearCalendarYear(sy) {
    const matches = String(sy.name).match(/20\d{2}/g);
    if (matches?.length)
        return parseInt(matches[0], 10);
    return new Date(sy.startDate).getFullYear();
}
function findTargetSchoolYear(completing, allYears) {
    const nextCal = schoolYearCalendarYear(completing) + 1;
    const matches = allYears
        .filter((y) => schoolYearCalendarYear(y) === nextCal)
        .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
    return matches[0] ?? null;
}
router.post('/class-promotion/promote', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (req, res) => {
    const { classId, completingSchoolYearId, targetSchoolYearId } = req.body || {};
    if (!completingSchoolYearId || !classId) {
        return res.status(400).json({ message: 'completingSchoolYearId and classId are required' });
    }
    const yearRepo = data_source_1.AppDataSource.getRepository(entities_1.SchoolYear);
    const allYears = await yearRepo.find({ order: { startDate: 'ASC' } });
    const completingYear = allYears.find((y) => y.id === String(completingSchoolYearId));
    if (!completingYear)
        return res.status(404).json({ message: 'Completing school year not found' });
    let targetYear = null;
    if (targetSchoolYearId) {
        targetYear = allYears.find((y) => y.id === String(targetSchoolYearId)) ?? null;
        if (!targetYear)
            return res.status(404).json({ message: 'Target school year not found' });
        if (schoolYearCalendarYear(targetYear) !== schoolYearCalendarYear(completingYear) + 1) {
            return res.status(400).json({
                message: `Target school year must be the year after ${completingYear.name} (e.g. ${schoolYearCalendarYear(completingYear)} → ${schoolYearCalendarYear(completingYear) + 1}).`,
            });
        }
    }
    else {
        targetYear = findTargetSchoolYear(completingYear, allYears);
        if (!targetYear) {
            return res.status(400).json({
                message: `No school year found for ${schoolYearCalendarYear(completingYear) + 1}. Add it under Academic Settings → School Calendar.`,
            });
        }
    }
    const fromClass = await data_source_1.AppDataSource.getRepository(entities_1.SchoolClass).findOne({
        where: { id: String(classId) },
        relations: (0, typeorm_helpers_1.relations)('form'),
    });
    if (!fromClass)
        return res.status(404).json({ message: 'Class not found' });
    const rule = await data_source_1.AppDataSource.getRepository(entities_1.ClassPromotionRule).findOne({
        where: { fromClassId: fromClass.id, isActive: true },
    });
    if (!rule) {
        return res.status(400).json({
            message: `No active promotion rule for ${fromClass.form?.name || 'Form'} ${fromClass.name}. Configure it in Academic Settings → Promotion Rules.`,
        });
    }
    let toClass = null;
    if (rule.toClassId) {
        toClass = await data_source_1.AppDataSource.getRepository(entities_1.SchoolClass).findOne({
            where: { id: rule.toClassId },
            relations: (0, typeorm_helpers_1.relations)('form'),
        });
        if (!toClass)
            return res.status(400).json({ message: 'Promotion target class not found' });
    }
    const studentRepo = data_source_1.AppDataSource.getRepository(entities_1.Student);
    const students = await studentRepo.find({
        where: { classId: fromClass.id, isActive: true },
        select: { id: true, admissionNumber: true },
    });
    if (!students.length) {
        return res.json({
            promoted: 0,
            fromClassId: fromClass.id,
            toClassId: toClass?.id,
            completionLabel: rule.completionLabel,
            message: 'No active students found in this class.',
        });
    }
    const enrollmentDate = targetYear.startDate || (0, helpers_1.today)();
    const promotedStudentIds = students.map((s) => s.id);
    if (toClass) {
        await studentRepo
            .createQueryBuilder()
            .update(entities_1.Student)
            .set({
            classId: toClass.id,
            formId: toClass.formId,
            enrollmentDate,
        })
            .where('classId = :classId', { classId: fromClass.id })
            .andWhere('isActive = true')
            .execute();
    }
    else {
        // Completion: student has finished the top level — record graduation & remove from class.
        await studentRepo
            .createQueryBuilder()
            .update(entities_1.Student)
            .set({
            classId: null,
            enrollmentDate: null,
            status: enums_1.StudentStatus.GRADUATED,
            exitDate: completingYear.endDate || (0, helpers_1.today)(),
            isActive: false,
        })
            .where('classId = :classId', { classId: fromClass.id })
            .andWhere('isActive = true')
            .execute();
    }
    // Maintain year-over-year enrollment snapshots for retention analytics.
    try {
        await (0, student_lifecycle_service_1.recordPromotionSnapshots)({
            studentIds: promotedStudentIds,
            completingYearId: completingYear.id,
            completingYearEndDate: completingYear.endDate,
            targetYearId: targetYear.id,
            targetYearStartDate: targetYear.startDate,
            toClassId: toClass?.id ?? null,
            toFormId: toClass?.formId ?? null,
            toClassName: toClass?.name ?? null,
            toFormName: toClass?.form?.name ?? null,
            graduation: !toClass,
        });
    }
    catch (err) {
        console.error('[class-promotion] enrollment snapshot update failed:', err);
    }
    const fromLabel = `${fromClass.form?.name || 'Form'} ${fromClass.name}`;
    const toLabel = toClass ? `${toClass.form?.name || 'Form'} ${toClass.name}` : null;
    return res.json({
        promoted: students.length,
        completingSchoolYearId: completingYear.id,
        targetSchoolYearId: targetYear.id,
        fromClassId: fromClass.id,
        toClassId: toClass?.id,
        completionLabel: rule.completionLabel,
        message: toClass
            ? `Promoted ${students.length} student(s) from ${fromLabel} (${completingYear.name}) to ${toLabel} for ${targetYear.name}.`
            : `Marked ${students.length} student(s) in ${fromLabel} (${completingYear.name}) as completed (${rule.completionLabel || 'Completed'}) for ${targetYear.name}.`,
    });
});
router.get('/exam-types', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL), async (_req, res) => {
    res.json(await data_source_1.AppDataSource.getRepository(entities_1.ExamType).find({ order: { name: 'ASC' } }));
});
router.patch('/exam-types/:id', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.ExamType);
    const et = await repo.findOne({ where: { id: req.params.id } });
    if (!et)
        return res.status(404).json({ message: 'Exam type not found' });
    Object.assign(et, req.body);
    res.json(await repo.save(et));
});
router.get('/staff/next-employee-id', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (_req, res) => {
    const employeeNumber = await (0, helpers_1.generateEmployeeNumber)();
    res.json({ employeeNumber });
});
router.get('/staff/teacher-load/pdf', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL), async (req, res) => {
    try {
        const preview = String(req.query.preview || '').toLowerCase() === 'true';
        const report = await (0, teacher_load_service_1.getTeacherLoadReport)();
        const branding = await (0, school_branding_service_1.loadSchoolBranding)();
        const pdf = await (0, teacher_load_pdf_1.generateTeacherLoadPdf)({
            schoolName: branding.schoolName || 'School Pro Academy',
            tagline: branding.tagline,
            logoUrl: branding.logoUrl,
            generatedAt: new Date(),
            summary: {
                teacherCount: report.summary.teacherCount,
                teachersWithAssignments: report.summary.teachersWithAssignments,
                totalPeriods: report.summary.totalPeriods,
            },
            rows: (0, teacher_load_pdf_1.mapTeacherLoadReportToPdfRows)(report.teachers),
        });
        const filename = 'teacher-load-report.pdf';
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `${preview ? 'inline' : 'attachment'}; filename="${filename}"`);
        res.send(pdf);
    }
    catch (err) {
        const e = err;
        res.status(500).json({ message: e.message || 'Failed to generate teacher load PDF.' });
    }
});
router.get('/staff/teacher-load', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL), async (_req, res) => {
    try {
        res.json(await (0, teacher_load_service_1.getTeacherLoadReport)());
    }
    catch (err) {
        const e = err;
        res.status(500).json({ message: e.message || 'Failed to load teacher workload report.' });
    }
});
router.post('/staff/teacher-load', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL), async (req, res) => {
    try {
        const { teacherId, classId, subjectId, weeklyPeriods, lessonLength, forceReassign } = req.body || {};
        if (!teacherId || !classId || !subjectId) {
            return res.status(400).json({ message: 'teacherId, classId, and subjectId are required.' });
        }
        if (!weeklyPeriods || Number(weeklyPeriods) < 1) {
            return res.status(400).json({ message: 'weeklyPeriods must be at least 1.' });
        }
        const result = await (0, teacher_load_service_1.addTeacherLoadAssignment)({
            teacherId,
            classId,
            subjectId,
            weeklyPeriods: Number(weeklyPeriods),
            lessonLength,
            forceReassign: Boolean(forceReassign),
        });
        await (0, teacher_assignment_service_1.syncSubjectAssignmentFromClassSubjectId)(result.assignment.id);
        res.status(201).json(result.report);
    }
    catch (err) {
        const e = err;
        if (e instanceof class_subject_teacher_service_1.ClassSubjectTeacherConflictError || e.name === 'ClassSubjectTeacherConflictError') {
            return res.status(409).json({ message: e.message });
        }
        res.status(e.statusCode || 400).json({ message: e.message || 'Failed to add teacher assignment.' });
    }
});
router.delete('/staff/teacher-load', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL), async (req, res) => {
    try {
        const classSubjectId = String(req.query.classSubjectId || '').trim();
        if (classSubjectId) {
            const report = await (0, teacher_load_service_1.removeTeacherLoadAssignment)(classSubjectId);
            await (0, teacher_assignment_service_1.syncSubjectAssignmentFromClassSubjectId)(classSubjectId);
            return res.json(report);
        }
        const teacherId = String(req.query.teacherId || '').trim();
        const classId = String(req.query.classId || '').trim();
        if (!teacherId || !classId) {
            return res.status(400).json({ message: 'classSubjectId or teacherId and classId are required.' });
        }
        await (0, teacher_assignment_service_1.endSubjectTeacherAssignmentsForTeacherClass)(teacherId, classId);
        res.json(await (0, teacher_load_service_1.removeTeacherLoadClassAssignments)(teacherId, classId));
    }
    catch (err) {
        const e = err;
        res.status(400).json({ message: e.message || 'Failed to remove teacher assignment.' });
    }
});
router.get('/staff', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL), async (req, res) => {
    const { search, role, status } = req.query;
    const qb = data_source_1.AppDataSource.getRepository(entities_1.Staff).createQueryBuilder('s')
        .leftJoinAndSelect('s.user', 'user')
        .orderBy('s.createdAt', 'DESC');
    if (status === 'inactive') {
        qb.andWhere('s.isActive = false');
    }
    else if (status !== 'all') {
        qb.andWhere('s.isActive = true');
    }
    if (role)
        qb.andWhere('user.role = :role', { role });
    if (search) {
        qb.andWhere(`(user.firstName ILIKE :q OR user.lastName ILIKE :q OR user.email ILIKE :q OR s.employeeNumber ILIKE :q OR s.department ILIKE :q)`, { q: `%${search}%` });
    }
    res.json(await qb.getMany());
});
router.get('/staff/:id', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL), async (req, res) => {
    const staff = await data_source_1.AppDataSource.getRepository(entities_1.Staff).findOne({
        where: { id: req.params.id },
        relations: (0, typeorm_helpers_1.relations)('user'),
    });
    if (!staff)
        return res.status(404).json({ message: 'Staff member not found' });
    res.json(staff);
});
router.post('/staff', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (req, res) => {
    const { email, password, firstName, lastName, phone, role = enums_1.UserRole.TEACHER, department, qualification, hireDate, title, gender, employeeNumber: _ignored, } = req.body;
    const userRepo = data_source_1.AppDataSource.getRepository(entities_1.User);
    const staffRepo = data_source_1.AppDataSource.getRepository(entities_1.Staff);
    const existing = await userRepo.findOne({ where: { email: email?.toLowerCase() } });
    if (existing)
        return res.status(400).json({ message: 'Email already registered' });
    const allowedRoles = [enums_1.UserRole.TEACHER, enums_1.UserRole.ADMIN, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.ACCOUNTANT];
    const staffRole = allowedRoles.includes(role) ? role : enums_1.UserRole.TEACHER;
    const plainPassword = password || 'Teacher123!';
    const policy = await (0, security_policy_service_1.getSecurityPolicy)();
    const pwdErr = (0, security_policy_1.validatePasswordAgainstPolicy)(plainPassword, policy);
    if (pwdErr)
        return res.status(400).json({ message: pwdErr });
    const passwordHash = await bcryptjs_1.default.hash(plainPassword, 10);
    const user = await userRepo.save(userRepo.create({
        email: email.toLowerCase(),
        passwordHash,
        firstName,
        lastName,
        phone,
        role: staffRole,
    }));
    const employeeNumber = await (0, helpers_1.generateEmployeeNumber)();
    const normalizedGender = normalizeGender(gender);
    const staff = await staffRepo.save(staffRepo.create({
        userId: user.id,
        employeeNumber,
        title: title ? String(title).trim() : null,
        gender: normalizedGender,
        department,
        qualification,
        hireDate: hireDate || (0, helpers_1.today)(),
        isActive: true,
    }));
    const full = await staffRepo.findOne({
        where: { id: staff.id },
        relations: (0, typeorm_helpers_1.relations)('user'),
    });
    res.status(201).json(full);
});
router.patch('/staff/:id', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (req, res) => {
    const staffRepo = data_source_1.AppDataSource.getRepository(entities_1.Staff);
    const userRepo = data_source_1.AppDataSource.getRepository(entities_1.User);
    const staff = await staffRepo.findOne({
        where: { id: req.params.id },
        relations: (0, typeorm_helpers_1.relations)('user'),
    });
    if (!staff)
        return res.status(404).json({ message: 'Staff member not found' });
    const { email, password, firstName, lastName, phone, role, department, qualification, hireDate, title, gender, employeeNumber: _ignored, isActive, } = req.body;
    if (email && email.toLowerCase() !== staff.user.email) {
        const dup = await userRepo.findOne({ where: { email: email.toLowerCase() } });
        if (dup)
            return res.status(400).json({ message: 'Email already in use' });
        staff.user.email = email.toLowerCase();
    }
    if (firstName)
        staff.user.firstName = firstName;
    if (lastName)
        staff.user.lastName = lastName;
    if (phone !== undefined)
        staff.user.phone = phone;
    if (role && [enums_1.UserRole.TEACHER, enums_1.UserRole.ADMIN, enums_1.UserRole.PRINCIPAL].includes(role)) {
        staff.user.role = role;
    }
    if (password) {
        const policy = await (0, security_policy_service_1.getSecurityPolicy)();
        const pwdErr = (0, security_policy_1.validatePasswordAgainstPolicy)(password, policy);
        if (pwdErr)
            return res.status(400).json({ message: pwdErr });
        staff.user.passwordHash = await bcryptjs_1.default.hash(password, 10);
    }
    if (department !== undefined)
        staff.department = department;
    if (qualification !== undefined)
        staff.qualification = qualification;
    if (hireDate !== undefined) {
        const trimmedHireDate = String(hireDate || '').trim();
        staff.hireDate = trimmedHireDate || null;
    }
    if (title !== undefined)
        staff.title = title ? String(title).trim() : null;
    if (gender !== undefined)
        staff.gender = normalizeGender(gender);
    if (isActive !== undefined) {
        staff.isActive = isActive;
        staff.user.isActive = isActive;
    }
    await userRepo.save(staff.user);
    await staffRepo.save(staff);
    const full = await staffRepo.findOne({
        where: { id: staff.id },
        relations: (0, typeorm_helpers_1.relations)('user'),
    });
    res.json(full);
});
router.get('/tuckshop/items', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL), async (_req, res) => {
    res.json(await data_source_1.AppDataSource.getRepository(entities_1.TuckshopItem).find({ order: { name: 'ASC' } }));
});
router.post('/tuckshop/items', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (req, res) => {
    const item = await data_source_1.AppDataSource.getRepository(entities_1.TuckshopItem).save(data_source_1.AppDataSource.getRepository(entities_1.TuckshopItem).create(req.body));
    res.status(201).json(item);
});
router.patch('/tuckshop/items/:id', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.TuckshopItem);
    const item = await repo.findOne({ where: { id: req.params.id } });
    if (!item)
        return res.status(404).json({ message: 'Item not found' });
    Object.assign(item, req.body);
    res.json(await repo.save(item));
});
router.post('/tuckshop/sales', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (req, res) => {
    const itemRepo = data_source_1.AppDataSource.getRepository(entities_1.TuckshopItem);
    const saleRepo = data_source_1.AppDataSource.getRepository(entities_1.TuckshopSale);
    const { itemId, quantity, studentId } = req.body;
    const item = await itemRepo.findOne({ where: { id: itemId } });
    if (!item)
        return res.status(404).json({ message: 'Item not found' });
    if (item.stockQuantity < quantity)
        return res.status(400).json({ message: 'Insufficient stock' });
    item.stockQuantity -= quantity;
    await itemRepo.save(item);
    const sale = await saleRepo.save(saleRepo.create({
        itemId,
        quantity,
        studentId,
        totalAmount: Number(item.unitPrice) * quantity,
    }));
    res.status(201).json(sale);
});
router.get('/uniform/sales', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL), async (_req, res) => {
    res.json(await data_source_1.AppDataSource.getRepository(entities_1.UniformSale).find({
        relations: (0, typeorm_helpers_1.relations)('student'),
        order: { soldAt: 'DESC' },
        take: 100,
    }));
});
router.post('/uniform/sales', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (req, res) => {
    const sale = await data_source_1.AppDataSource.getRepository(entities_1.UniformSale).save(data_source_1.AppDataSource.getRepository(entities_1.UniformSale).create({
        ...req.body,
        totalAmount: req.body.unitPrice * (req.body.quantity || 1),
    }));
    res.status(201).json(sale);
});
const STAFF_PORTAL_ROLES = [enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.ADMIN, enums_1.UserRole.ACCOUNTANT, enums_1.UserRole.TEACHER];
function serializeManagedUser(user) {
    return {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone ?? null,
        role: user.role,
        roleLabel: permissions_1.PORTAL_ROLE_LABELS[user.role] ?? user.role,
        isActive: user.isActive,
        schoolRoleId: user.schoolRoleId ?? null,
        schoolRole: user.schoolRole
            ? { id: user.schoolRole.id, name: user.schoolRole.name, baseRole: user.schoolRole.baseRole }
            : null,
        failedLoginAttempts: user.failedLoginAttempts ?? 0,
        lockedUntil: user.lockedUntil ?? null,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        staffProfile: user.staffProfile
            ? {
                id: user.staffProfile.id,
                employeeNumber: user.staffProfile.employeeNumber,
                department: user.staffProfile.department ?? null,
                isActive: user.staffProfile.isActive,
            }
            : null,
        parentProfile: user.parentProfile ? { id: user.parentProfile.id } : null,
        studentProfile: user.studentProfile
            ? {
                id: user.studentProfile.id,
                admissionNumber: user.studentProfile.admissionNumber,
                firstName: user.studentProfile.firstName,
                lastName: user.studentProfile.lastName,
            }
            : null,
    };
}
async function loadManagedUser(userId) {
    return data_source_1.AppDataSource.getRepository(entities_1.User).findOne({
        where: { id: userId },
        relations: (0, typeorm_helpers_1.relations)('schoolRole', 'staffProfile', 'parentProfile', 'studentProfile'),
    });
}
router.get('/users', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (req, res) => {
    const { search, role, status } = req.query;
    const qb = data_source_1.AppDataSource.getRepository(entities_1.User)
        .createQueryBuilder('u')
        .leftJoinAndSelect('u.schoolRole', 'schoolRole')
        .leftJoinAndSelect('u.staffProfile', 'staffProfile')
        .leftJoinAndSelect('u.parentProfile', 'parentProfile')
        .leftJoinAndSelect('u.studentProfile', 'studentProfile')
        .orderBy('u.lastName', 'ASC')
        .addOrderBy('u.firstName', 'ASC');
    if (status === 'inactive') {
        qb.andWhere('u.isActive = false');
    }
    else if (status !== 'all') {
        qb.andWhere('u.isActive = true');
    }
    if (role)
        qb.andWhere('u.role = :role', { role: String(role) });
    if (search) {
        qb.andWhere(`(u.firstName ILIKE :q OR u.lastName ILIKE :q OR u.email ILIKE :q OR staffProfile.employeeNumber ILIKE :q OR studentProfile.admissionNumber ILIKE :q)`, { q: `%${String(search)}%` });
    }
    const users = await qb.getMany();
    res.json(users.map(serializeManagedUser));
});
router.get('/users/:id', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (req, res) => {
    const user = await loadManagedUser(req.params.id);
    if (!user)
        return res.status(404).json({ message: 'User not found' });
    res.json(serializeManagedUser(user));
});
router.post('/users', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (req, res) => {
    const { email, password, firstName, lastName, phone, role, schoolRoleId, department, qualification, hireDate, admissionNumber, linkAdmissionNumber, relationship, gender, } = req.body || {};
    const trimmedEmail = String(email || '').trim().toLowerCase();
    const trimmedFirst = String(firstName || '').trim();
    const trimmedLast = String(lastName || '').trim();
    const portalRole = Object.values(enums_1.UserRole).includes(role) ? role : null;
    if (!trimmedEmail || !trimmedFirst || !trimmedLast || !portalRole) {
        return res.status(400).json({ message: 'Email, first name, last name, and role are required' });
    }
    const userRepo = data_source_1.AppDataSource.getRepository(entities_1.User);
    const existing = await userRepo.findOne({ where: { email: trimmedEmail } });
    if (existing)
        return res.status(409).json({ message: 'Email already registered' });
    const plainPassword = password || 'ChangeMe123!';
    const policy = await (0, security_policy_service_1.getSecurityPolicy)();
    const pwdErr = (0, security_policy_1.validatePasswordAgainstPolicy)(plainPassword, policy);
    if (pwdErr)
        return res.status(400).json({ message: pwdErr });
    const passwordHash = await bcryptjs_1.default.hash(plainPassword, 10);
    let schoolRole = null;
    if (schoolRoleId) {
        schoolRole = await data_source_1.AppDataSource.getRepository(entities_1.SchoolRole).findOne({ where: { id: schoolRoleId } });
        if (!schoolRole)
            return res.status(404).json({ message: 'Assigned role not found' });
    }
    if (portalRole === enums_1.UserRole.STUDENT) {
        const admission = String(admissionNumber || '').trim().toUpperCase();
        if (!admission) {
            return res.status(400).json({ message: 'Student ID (admission number) is required for student accounts' });
        }
        const studentRepo = data_source_1.AppDataSource.getRepository(entities_1.Student);
        const student = await studentRepo.findOne({ where: { admissionNumber: admission, isActive: true } });
        if (!student)
            return res.status(404).json({ message: 'No active student found with that admission number' });
        if (student.userId)
            return res.status(409).json({ message: 'That student already has a portal account' });
        const user = await userRepo.save(userRepo.create({
            email: trimmedEmail,
            passwordHash,
            firstName: trimmedFirst,
            lastName: trimmedLast,
            phone: phone?.trim() || undefined,
            role: enums_1.UserRole.STUDENT,
            portalPasswordCustomized: true,
        }));
        student.userId = user.id;
        await studentRepo.save(student);
        const full = await loadManagedUser(user.id);
        return res.status(201).json(serializeManagedUser(full));
    }
    const user = await userRepo.save(userRepo.create({
        email: trimmedEmail,
        passwordHash,
        firstName: trimmedFirst,
        lastName: trimmedLast,
        phone: phone?.trim() || undefined,
        role: schoolRole ? schoolRole.baseRole : portalRole,
        schoolRoleId: schoolRole?.id,
    }));
    if (STAFF_PORTAL_ROLES.includes(portalRole)) {
        if (portalRole !== enums_1.UserRole.DIRECTOR) {
            const staffRepo = data_source_1.AppDataSource.getRepository(entities_1.Staff);
            const employeeNumber = await (0, helpers_1.generateEmployeeNumber)();
            await staffRepo.save(staffRepo.create({
                userId: user.id,
                employeeNumber,
                department: department?.trim() || undefined,
                qualification: qualification?.trim() || undefined,
                hireDate: hireDate || (0, helpers_1.today)(),
                isActive: true,
            }));
        }
    }
    else if (portalRole === enums_1.UserRole.PARENT) {
        const parentRepo = data_source_1.AppDataSource.getRepository(entities_1.Parent);
        const parentGender = (0, gender_1.resolveParentGender)(gender, relationship);
        const parent = await parentRepo.save(parentRepo.create({
            userId: user.id,
            gender: parentGender ?? undefined,
        }));
        const linkAdmission = String(linkAdmissionNumber || '').trim().toUpperCase();
        if (linkAdmission) {
            const studentRepo = data_source_1.AppDataSource.getRepository(entities_1.Student);
            const guardianRepo = data_source_1.AppDataSource.getRepository(entities_1.Guardian);
            const student = await studentRepo.findOne({ where: { admissionNumber: linkAdmission, isActive: true } });
            if (student) {
                let guardian = await guardianRepo.findOne({
                    where: [{ studentId: student.id, email: trimmedEmail }, { studentId: student.id, parentId: parent.id }],
                });
                if (guardian) {
                    guardian.parentId = parent.id;
                    if (relationship)
                        guardian.relationship = String(relationship).trim();
                }
                else {
                    guardian = guardianRepo.create({
                        studentId: student.id,
                        parentId: parent.id,
                        fullName: `${trimmedFirst} ${trimmedLast}`,
                        relationship: relationship?.trim() || 'Parent',
                        phone: phone?.trim() || undefined,
                        email: trimmedEmail,
                        isPrimary: false,
                    });
                }
                await guardianRepo.save(guardian);
            }
        }
    }
    else {
        await userRepo.delete({ id: user.id });
        return res.status(400).json({ message: 'Invalid role for user creation' });
    }
    const full = await loadManagedUser(user.id);
    res.status(201).json(serializeManagedUser(full));
});
router.patch('/users/:id', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (req, res) => {
    const userRepo = data_source_1.AppDataSource.getRepository(entities_1.User);
    const user = await userRepo.findOne({
        where: { id: req.params.id },
        relations: (0, typeorm_helpers_1.relations)('schoolRole', 'staffProfile', 'parentProfile', 'studentProfile'),
    });
    if (!user)
        return res.status(404).json({ message: 'User not found' });
    const { email, password, firstName, lastName, phone, role, schoolRoleId, isActive, department, qualification, hireDate, } = req.body || {};
    if (req.params.id === req.user.userId && isActive === false) {
        return res.status(400).json({ message: 'You cannot deactivate your own account' });
    }
    if (email !== undefined) {
        const trimmedEmail = String(email).trim().toLowerCase();
        if (!trimmedEmail)
            return res.status(400).json({ message: 'Email is required' });
        if (trimmedEmail !== user.email) {
            const dup = await userRepo.findOne({ where: { email: trimmedEmail } });
            if (dup)
                return res.status(409).json({ message: 'Email already in use' });
            user.email = trimmedEmail;
        }
    }
    if (firstName !== undefined)
        user.firstName = String(firstName).trim();
    if (lastName !== undefined)
        user.lastName = String(lastName).trim();
    if (phone !== undefined)
        user.phone = phone?.trim() || undefined;
    if (password) {
        const policy = await (0, security_policy_service_1.getSecurityPolicy)();
        const pwdErr = (0, security_policy_1.validatePasswordAgainstPolicy)(password, policy);
        if (pwdErr)
            return res.status(400).json({ message: pwdErr });
        user.passwordHash = await bcryptjs_1.default.hash(password, 10);
        user.failedLoginAttempts = 0;
        user.lockedUntil = null;
        if (user.role === enums_1.UserRole.STUDENT) {
            user.portalPasswordCustomized = true;
        }
    }
    if (schoolRoleId !== undefined) {
        if (schoolRoleId === null || schoolRoleId === '') {
            user.schoolRoleId = undefined;
            user.schoolRole = undefined;
        }
        else if (STAFF_PORTAL_ROLES.includes(user.role)) {
            const schoolRole = await data_source_1.AppDataSource.getRepository(entities_1.SchoolRole).findOne({ where: { id: schoolRoleId } });
            if (!schoolRole)
                return res.status(404).json({ message: 'Assigned role not found' });
            user.schoolRoleId = schoolRole.id;
            user.schoolRole = schoolRole;
            user.role = schoolRole.baseRole;
        }
    }
    if (role !== undefined && req.params.id !== req.user.userId) {
        const nextRole = Object.values(enums_1.UserRole).includes(role) ? role : null;
        if (!nextRole)
            return res.status(400).json({ message: 'Invalid role' });
        if (user.role !== nextRole) {
            return res.status(400).json({ message: 'Role changes are not supported here. Create a new account with the correct role instead.' });
        }
    }
    if (isActive !== undefined) {
        user.isActive = Boolean(isActive);
        if (user.staffProfile)
            user.staffProfile.isActive = user.isActive;
    }
    await userRepo.save(user);
    if (user.staffProfile) {
        if (department !== undefined)
            user.staffProfile.department = department?.trim() || undefined;
        if (qualification !== undefined)
            user.staffProfile.qualification = qualification?.trim() || undefined;
        if (hireDate !== undefined)
            user.staffProfile.hireDate = hireDate || user.staffProfile.hireDate;
        await data_source_1.AppDataSource.getRepository(entities_1.Staff).save(user.staffProfile);
    }
    if (user.studentProfile && user.role === enums_1.UserRole.STUDENT) {
        user.studentProfile.firstName = user.firstName;
        user.studentProfile.lastName = user.lastName;
        await data_source_1.AppDataSource.getRepository(entities_1.Student).save(user.studentProfile);
    }
    const full = await loadManagedUser(user.id);
    res.json(serializeManagedUser(full));
});
router.post('/users/:id/unlock', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (req, res) => {
    const userRepo = data_source_1.AppDataSource.getRepository(entities_1.User);
    const user = await userRepo.findOne({ where: { id: req.params.id } });
    if (!user)
        return res.status(404).json({ message: 'User not found' });
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    await userRepo.save(user);
    const full = await loadManagedUser(user.id);
    res.json(serializeManagedUser(full));
});
async function loadParentRecord(parentId) {
    return data_source_1.AppDataSource.getRepository(entities_1.Parent).findOne({
        where: { id: parentId },
        relations: (0, typeorm_helpers_1.relations)('user', 'guardianships', 'guardianships.student', 'guardianships.student.schoolClass', 'guardianships.student.form'),
    });
}
function serializeParent(parent) {
    const user = parent.user;
    const linkedStudents = (parent.guardianships || [])
        .filter((g) => g.student && g.parentId === parent.id)
        .map((g) => ({
        guardianId: g.id,
        studentId: g.student.id,
        admissionNumber: g.student.admissionNumber,
        firstName: g.student.firstName,
        lastName: g.student.lastName,
        className: g.student.schoolClass?.name ?? null,
        formName: g.student.form?.name ?? null,
        relationship: g.relationship || 'Parent',
    }));
    return {
        id: parent.id,
        userId: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone ?? null,
        isActive: user.isActive,
        occupation: parent.occupation ?? null,
        gender: parent.gender ?? null,
        address: parent.address ?? null,
        receivesWhatsApp: parent.receivesWhatsApp,
        linkedStudents,
        createdAt: user.createdAt,
    };
}
router.get('/parents', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL), async (req, res) => {
    const search = String(req.query.search || '').trim();
    const status = String(req.query.status || 'active');
    const qb = data_source_1.AppDataSource.getRepository(entities_1.Parent)
        .createQueryBuilder('p')
        .innerJoinAndSelect('p.user', 'u')
        .leftJoinAndSelect('p.guardianships', 'g')
        .leftJoinAndSelect('g.student', 's')
        .where('u.role = :role', { role: enums_1.UserRole.PARENT });
    if (status === 'active')
        qb.andWhere('u.isActive = true');
    else if (status === 'inactive')
        qb.andWhere('u.isActive = false');
    if (search) {
        qb.andWhere(`(u.firstName ILIKE :q OR u.lastName ILIKE :q OR u.email ILIKE :q OR u.phone ILIKE :q OR p.occupation ILIKE :q OR s."admissionNumber" ILIKE :q OR s."firstName" ILIKE :q OR s."lastName" ILIKE :q)`, { q: `%${search}%` });
    }
    qb.orderBy('u.lastName', 'ASC').addOrderBy('u.firstName', 'ASC');
    const parents = await qb.getMany();
    res.json(parents.map(serializeParent));
});
router.get('/parents/:id', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL), async (req, res) => {
    const parent = await loadParentRecord(req.params.id);
    if (!parent)
        return res.status(404).json({ message: 'Parent not found' });
    res.json(serializeParent(parent));
});
router.get('/parents/:id/students/search', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL), async (req, res) => {
    const q = String(req.query.q || '').trim();
    if (!q) {
        return res.status(400).json({ message: 'Enter a first name or last name to search' });
    }
    const parent = await loadParentRecord(req.params.id);
    if (!parent)
        return res.status(404).json({ message: 'Parent not found' });
    const linkedStudentIds = new Set((parent.guardianships || [])
        .filter((g) => g.parentId === parent.id && g.studentId)
        .map((g) => g.studentId));
    const students = await data_source_1.AppDataSource.getRepository(entities_1.Student)
        .createQueryBuilder('s')
        .leftJoinAndSelect('s.schoolClass', 'c')
        .leftJoinAndSelect('s.form', 'f')
        .where('s.isActive = true')
        .andWhere('(s.firstName ILIKE :q OR s.lastName ILIKE :q)', { q: `%${q}%` })
        .orderBy('s.lastName', 'ASC')
        .addOrderBy('s.firstName', 'ASC')
        .take(50)
        .getMany();
    res.json(students.map((s) => ({
        id: s.id,
        admissionNumber: s.admissionNumber,
        firstName: s.firstName,
        lastName: s.lastName,
        className: s.schoolClass?.name ?? null,
        formName: s.form?.name ?? null,
        alreadyLinked: linkedStudentIds.has(s.id),
    })));
});
router.post('/parents/:id/students/link', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (req, res) => {
    const { studentIds, relationship } = req.body || {};
    const ids = Array.isArray(studentIds) ? [...new Set(studentIds.filter(Boolean))] : [];
    if (!ids.length) {
        return res.status(400).json({ message: 'Select at least one student to link' });
    }
    const parent = await loadParentRecord(req.params.id);
    if (!parent)
        return res.status(404).json({ message: 'Parent not found' });
    const user = parent.user;
    const rel = String(relationship || 'Parent').trim() || 'Parent';
    const studentRepo = data_source_1.AppDataSource.getRepository(entities_1.Student);
    const guardianRepo = data_source_1.AppDataSource.getRepository(entities_1.Guardian);
    let linked = 0;
    for (const studentId of ids) {
        const student = await studentRepo.findOne({ where: { id: studentId, isActive: true } });
        if (!student)
            continue;
        const existingLink = await guardianRepo.findOne({ where: { studentId, parentId: parent.id } });
        if (existingLink)
            continue;
        let guardian = await guardianRepo.findOne({
            where: [{ studentId, email: user.email }, { studentId, parentId: parent.id }],
        });
        if (guardian) {
            guardian.parentId = parent.id;
            guardian.relationship = rel;
            guardian.fullName = `${user.firstName} ${user.lastName}`;
            guardian.email = user.email;
            guardian.phone = user.phone || guardian.phone;
        }
        else {
            guardian = guardianRepo.create({
                studentId,
                parentId: parent.id,
                fullName: `${user.firstName} ${user.lastName}`,
                relationship: rel,
                phone: user.phone || undefined,
                email: user.email,
                isPrimary: false,
            });
        }
        await guardianRepo.save(guardian);
        linked += 1;
    }
    const full = await loadParentRecord(parent.id);
    res.json({ linked, parent: serializeParent(full) });
});
router.delete('/parents/:id/students/:studentId/unlink', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (req, res) => {
    const parent = await loadParentRecord(req.params.id);
    if (!parent)
        return res.status(404).json({ message: 'Parent not found' });
    const guardianRepo = data_source_1.AppDataSource.getRepository(entities_1.Guardian);
    const guardian = await guardianRepo.findOne({
        where: { studentId: req.params.studentId, parentId: parent.id },
    });
    if (!guardian) {
        return res.status(404).json({ message: 'This student is not linked to the parent' });
    }
    guardian.parentId = null;
    await guardianRepo.save(guardian);
    const full = await loadParentRecord(parent.id);
    res.json({ parent: serializeParent(full) });
});
router.post('/parents', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (req, res) => {
    const { email, password, firstName, lastName, phone, occupation, address, receivesWhatsApp, linkAdmissionNumber, relationship, gender, } = req.body || {};
    const trimmedEmail = String(email || '').trim().toLowerCase();
    const trimmedFirst = String(firstName || '').trim();
    const trimmedLast = String(lastName || '').trim();
    if (!trimmedEmail || !trimmedFirst || !trimmedLast) {
        return res.status(400).json({ message: 'Email, first name, and last name are required' });
    }
    const userRepo = data_source_1.AppDataSource.getRepository(entities_1.User);
    const existing = await userRepo.findOne({ where: { email: trimmedEmail } });
    if (existing)
        return res.status(409).json({ message: 'Email already registered' });
    const plainPassword = password || 'ChangeMe123!';
    const policy = await (0, security_policy_service_1.getSecurityPolicy)();
    const pwdErr = (0, security_policy_1.validatePasswordAgainstPolicy)(plainPassword, policy);
    if (pwdErr)
        return res.status(400).json({ message: pwdErr });
    const passwordHash = await bcryptjs_1.default.hash(plainPassword, 10);
    const user = await userRepo.save(userRepo.create({
        email: trimmedEmail,
        passwordHash,
        firstName: trimmedFirst,
        lastName: trimmedLast,
        phone: phone?.trim() || undefined,
        role: enums_1.UserRole.PARENT,
        isActive: true,
    }));
    const parentRepo = data_source_1.AppDataSource.getRepository(entities_1.Parent);
    const parentGender = (0, gender_1.resolveParentGender)(gender, relationship);
    const parent = await parentRepo.save(parentRepo.create({
        userId: user.id,
        occupation: occupation?.trim() || undefined,
        address: address?.trim() || undefined,
        receivesWhatsApp: receivesWhatsApp !== false,
        gender: parentGender ?? undefined,
    }));
    const linkAdmission = String(linkAdmissionNumber || '').trim().toUpperCase();
    if (linkAdmission) {
        const studentRepo = data_source_1.AppDataSource.getRepository(entities_1.Student);
        const guardianRepo = data_source_1.AppDataSource.getRepository(entities_1.Guardian);
        const student = await studentRepo.findOne({ where: { admissionNumber: linkAdmission, isActive: true } });
        if (student) {
            let guardian = await guardianRepo.findOne({
                where: [{ studentId: student.id, email: trimmedEmail }, { studentId: student.id, parentId: parent.id }],
            });
            if (guardian) {
                guardian.parentId = parent.id;
                if (relationship)
                    guardian.relationship = String(relationship).trim();
            }
            else {
                guardian = guardianRepo.create({
                    studentId: student.id,
                    parentId: parent.id,
                    fullName: `${trimmedFirst} ${trimmedLast}`,
                    relationship: relationship?.trim() || 'Parent',
                    phone: phone?.trim() || undefined,
                    email: trimmedEmail,
                    isPrimary: false,
                });
            }
            await guardianRepo.save(guardian);
        }
    }
    const full = await loadParentRecord(parent.id);
    res.status(201).json(serializeParent(full));
});
router.patch('/parents/:id', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (req, res) => {
    const parent = await loadParentRecord(req.params.id);
    if (!parent)
        return res.status(404).json({ message: 'Parent not found' });
    const { email, password, firstName, lastName, phone, occupation, address, receivesWhatsApp, isActive, linkAdmissionNumber, relationship, gender, } = req.body || {};
    const userRepo = data_source_1.AppDataSource.getRepository(entities_1.User);
    const parentRepo = data_source_1.AppDataSource.getRepository(entities_1.Parent);
    const user = parent.user;
    if (email !== undefined) {
        const trimmedEmail = String(email).trim().toLowerCase();
        if (!trimmedEmail)
            return res.status(400).json({ message: 'Email is required' });
        if (trimmedEmail !== user.email) {
            const dup = await userRepo.findOne({ where: { email: trimmedEmail } });
            if (dup)
                return res.status(409).json({ message: 'Email already in use' });
            user.email = trimmedEmail;
        }
    }
    if (firstName !== undefined)
        user.firstName = String(firstName).trim();
    if (lastName !== undefined)
        user.lastName = String(lastName).trim();
    if (phone !== undefined)
        user.phone = phone?.trim() || undefined;
    if (isActive !== undefined)
        user.isActive = Boolean(isActive);
    if (password) {
        const policy = await (0, security_policy_service_1.getSecurityPolicy)();
        const pwdErr = (0, security_policy_1.validatePasswordAgainstPolicy)(String(password), policy);
        if (pwdErr)
            return res.status(400).json({ message: pwdErr });
        user.passwordHash = await bcryptjs_1.default.hash(String(password), 10);
    }
    if (occupation !== undefined)
        parent.occupation = occupation?.trim() || undefined;
    if (address !== undefined)
        parent.address = address?.trim() || undefined;
    if (receivesWhatsApp !== undefined)
        parent.receivesWhatsApp = Boolean(receivesWhatsApp);
    if (gender !== undefined || relationship !== undefined) {
        const rel = relationship !== undefined ? relationship : parent.guardians?.[0]?.relationship;
        parent.gender = (0, gender_1.resolveParentGender)(gender !== undefined ? gender : parent.gender, rel) ?? undefined;
    }
    await userRepo.save(user);
    await parentRepo.save(parent);
    const linkAdmission = String(linkAdmissionNumber || '').trim().toUpperCase();
    if (linkAdmission) {
        const studentRepo = data_source_1.AppDataSource.getRepository(entities_1.Student);
        const guardianRepo = data_source_1.AppDataSource.getRepository(entities_1.Guardian);
        const student = await studentRepo.findOne({ where: { admissionNumber: linkAdmission, isActive: true } });
        if (student) {
            let guardian = await guardianRepo.findOne({
                where: [{ studentId: student.id, parentId: parent.id }, { studentId: student.id, email: user.email }],
            });
            if (guardian) {
                guardian.parentId = parent.id;
                guardian.email = user.email;
                guardian.fullName = `${user.firstName} ${user.lastName}`;
                if (relationship)
                    guardian.relationship = String(relationship).trim();
                if (phone !== undefined)
                    guardian.phone = phone?.trim() || undefined;
            }
            else {
                guardian = guardianRepo.create({
                    studentId: student.id,
                    parentId: parent.id,
                    fullName: `${user.firstName} ${user.lastName}`,
                    relationship: relationship?.trim() || 'Parent',
                    phone: user.phone || undefined,
                    email: user.email,
                    isPrimary: false,
                });
            }
            await guardianRepo.save(guardian);
        }
    }
    const full = await loadParentRecord(parent.id);
    res.json(serializeParent(full));
});
router.delete('/parents/:id', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (req, res) => {
    const parent = await loadParentRecord(req.params.id);
    if (!parent)
        return res.status(404).json({ message: 'Parent not found' });
    if (parent.userId === req.user.userId) {
        return res.status(400).json({ message: 'You cannot delete your own account' });
    }
    await data_source_1.AppDataSource.getRepository(entities_1.User).delete({ id: parent.userId });
    res.json({ message: 'Parent deleted' });
});
router.use('/permissions', permissions_routes_1.default);
exports.default = router;
