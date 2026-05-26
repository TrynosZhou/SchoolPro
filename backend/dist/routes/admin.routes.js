"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-nocheck
const express_1 = require("express");
const data_source_1 = require("../config/data-source");
const entities_1 = require("../entities");
const enums_1 = require("../entities/enums");
const auth_1 = require("../middleware/auth");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const typeorm_helpers_1 = require("../utils/typeorm-helpers");
const helpers_1 = require("../utils/helpers");
const grade_boundaries_1 = require("../types/grade-boundaries");
const grade_service_1 = require("../services/grade.service");
const env_1 = require("../config/env");
const whatsapp_service_1 = require("../services/whatsapp.service");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const pdf_1 = require("../utils/pdf");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
const SETTINGS_ID = 'default';
const logosDir = path_1.default.join(process.cwd(), 'uploads', 'logos');
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
        }));
    }
    if (!settings.gradeBoundaries?.length) {
        settings.gradeBoundaries = grade_boundaries_1.DEFAULT_GRADE_BOUNDARIES;
        await repo.save(settings);
    }
    return settings;
}
router.get('/settings', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL), async (_req, res) => {
    const school = await getOrCreateSettings();
    res.json({
        school,
        whatsapp: {
            enabled: env_1.env.whatsapp.enabled,
            configured: !!(env_1.env.whatsapp.accountSid && env_1.env.whatsapp.authToken && env_1.env.whatsapp.from),
            from: env_1.env.whatsapp.from ? env_1.env.whatsapp.from.replace(/(\+\d{3}).+(\d{4})/, '$1***$2') : null,
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
        }));
        (0, grade_service_1.invalidateGradeBoundariesCache)();
    }
    const { gradeBoundaries: _gb, logoUrl: _logo, ...rest } = req.body;
    Object.assign(settings, rest);
    const saved = await repo.save(settings);
    if (req.body.gradeBoundaries !== undefined)
        (0, grade_service_1.invalidateGradeBoundariesCache)();
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
        return res.status(400).json({ message: 'WhatsApp not configured or send failed. Check .env TWILIO settings.' });
    res.json({ sent: true });
});
router.get('/school-years', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL), async (_req, res) => {
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
    if (req.body.isCurrent) {
        await repo.update({ isCurrent: true }, { isCurrent: false });
    }
    const term = await repo.save(repo.create(req.body));
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
    if (req.body.isCurrent) {
        await repo.update({ isCurrent: true }, { isCurrent: false });
    }
    Object.assign(term, req.body);
    res.json(await repo.save(term));
});
router.get('/forms', async (_req, res) => {
    res.json(await data_source_1.AppDataSource.getRepository(entities_1.Form).find({ relations: (0, typeorm_helpers_1.relations)('classes'), order: { level: 'ASC' } }));
});
router.post('/forms', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (req, res) => {
    const form = await data_source_1.AppDataSource.getRepository(entities_1.Form).save(data_source_1.AppDataSource.getRepository(entities_1.Form).create(req.body));
    res.status(201).json(form);
});
router.get('/classes', async (_req, res) => {
    res.json(await data_source_1.AppDataSource.getRepository(entities_1.SchoolClass).find({
        relations: (0, typeorm_helpers_1.relations)('form', 'students'),
        order: { name: 'ASC' },
    }));
});
router.post('/classes', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (req, res) => {
    const cls = await data_source_1.AppDataSource.getRepository(entities_1.SchoolClass).save(data_source_1.AppDataSource.getRepository(entities_1.SchoolClass).create(req.body));
    res.status(201).json(cls);
});
router.get('/subjects', async (_req, res) => {
    res.json(await data_source_1.AppDataSource.getRepository(entities_1.Subject).find({ order: { name: 'ASC' } }));
});
router.post('/subjects', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (req, res) => {
    const subject = await data_source_1.AppDataSource.getRepository(entities_1.Subject).save(data_source_1.AppDataSource.getRepository(entities_1.Subject).create(req.body));
    res.status(201).json(subject);
});
router.get('/class-subjects', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL), async (req, res) => {
    const { classId } = req.query;
    const qb = data_source_1.AppDataSource.getRepository(entities_1.ClassSubject).createQueryBuilder('cs')
        .leftJoinAndSelect('cs.subject', 'subject')
        .leftJoinAndSelect('cs.teacher', 'teacher')
        .leftJoinAndSelect('teacher.user', 'user')
        .leftJoinAndSelect('cs.schoolClass', 'schoolClass');
    if (classId)
        qb.where('cs.classId = :classId', { classId });
    res.json(await qb.getMany());
});
router.post('/class-subjects', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (req, res) => {
    const cs = await data_source_1.AppDataSource.getRepository(entities_1.ClassSubject).save(data_source_1.AppDataSource.getRepository(entities_1.ClassSubject).create(req.body));
    res.status(201).json(cs);
});
router.patch('/class-subjects/:id', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.ClassSubject);
    const cs = await repo.findOne({ where: { id: req.params.id } });
    if (!cs)
        return res.status(404).json({ message: 'Assignment not found' });
    Object.assign(cs, req.body);
    res.json(await repo.save(cs));
});
router.delete('/class-subjects/:id', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (req, res) => {
    await data_source_1.AppDataSource.getRepository(entities_1.ClassSubject).delete({ id: req.params.id });
    res.json({ deleted: true });
});
router.patch('/classes/:id', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.SchoolClass);
    const cls = await repo.findOne({ where: { id: req.params.id } });
    if (!cls)
        return res.status(404).json({ message: 'Class not found' });
    Object.assign(cls, req.body);
    res.json(await repo.save(cls));
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
    const { email, password, firstName, lastName, phone, role = enums_1.UserRole.TEACHER, department, qualification, hireDate, employeeNumber: _ignored, } = req.body;
    const userRepo = data_source_1.AppDataSource.getRepository(entities_1.User);
    const staffRepo = data_source_1.AppDataSource.getRepository(entities_1.Staff);
    const existing = await userRepo.findOne({ where: { email: email?.toLowerCase() } });
    if (existing)
        return res.status(400).json({ message: 'Email already registered' });
    const allowedRoles = [enums_1.UserRole.TEACHER, enums_1.UserRole.ADMIN, enums_1.UserRole.PRINCIPAL];
    const staffRole = allowedRoles.includes(role) ? role : enums_1.UserRole.TEACHER;
    const passwordHash = await bcryptjs_1.default.hash(password || 'Teacher123!', 10);
    const user = await userRepo.save(userRepo.create({
        email: email.toLowerCase(),
        passwordHash,
        firstName,
        lastName,
        phone,
        role: staffRole,
    }));
    const employeeNumber = await (0, helpers_1.generateEmployeeNumber)();
    const staff = await staffRepo.save(staffRepo.create({
        userId: user.id,
        employeeNumber,
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
    const { email, password, firstName, lastName, phone, role, department, qualification, hireDate, employeeNumber: _ignored, isActive, } = req.body;
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
    if (password)
        staff.user.passwordHash = await bcryptjs_1.default.hash(password, 10);
    if (department !== undefined)
        staff.department = department;
    if (qualification !== undefined)
        staff.qualification = qualification;
    if (hireDate !== undefined)
        staff.hireDate = hireDate;
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
exports.default = router;
