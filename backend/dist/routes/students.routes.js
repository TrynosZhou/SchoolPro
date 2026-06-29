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
const pdf_1 = require("../utils/pdf");
const school_branding_service_1 = require("../services/school-branding.service");
const teacher_class_access_1 = require("../utils/teacher-class-access");
const registration_invoice_service_1 = require("../services/registration-invoice.service");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
router.get('/', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.TEACHER), async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.Student);
    const { classId, search, unenrolled, enrolled } = req.query;
    if (classId && !(await (0, teacher_class_access_1.assertTeacherClassAccess)(req, classId))) {
        return res.status(403).json({ message: 'You are not assigned to this class' });
    }
    const qb = repo.createQueryBuilder('s')
        .leftJoinAndSelect('s.schoolClass', 'c')
        .leftJoinAndSelect('c.form', 'f')
        .leftJoinAndSelect('s.form', 'studentForm')
        .leftJoinAndSelect('s.guardians', 'g')
        .where('s.isActive = true');
    if (classId)
        qb.andWhere('s.classId = :classId', { classId });
    if (unenrolled === 'true')
        qb.andWhere('s.classId IS NULL');
    if (enrolled === 'true')
        qb.andWhere('s.classId IS NOT NULL');
    if (search) {
        qb.andWhere('(s.firstName ILIKE :s OR s.lastName ILIKE :s OR s.admissionNumber ILIKE :s)', { s: `%${search}%` });
    }
    const students = await qb.orderBy('s.lastName', 'ASC').getMany();
    res.json(students);
});
router.get('/class-list/pdf', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.TEACHER), async (req, res) => {
    const classId = req.query.classId;
    if (!classId)
        return res.status(400).json({ message: 'classId is required' });
    if (!(await (0, teacher_class_access_1.assertTeacherClassAccess)(req, classId))) {
        return res.status(403).json({ message: 'You are not assigned to this class' });
    }
    const repo = data_source_1.AppDataSource.getRepository(entities_1.Student);
    const students = await repo.find({
        where: { classId, isActive: true },
        relations: (0, typeorm_helpers_1.relations)('schoolClass', 'schoolClass.form'),
        order: { lastName: 'ASC', firstName: 'ASC' },
    });
    if (!students.length) {
        return res.status(404).json({ message: 'No enrolled students in this class' });
    }
    const settingsRepo = data_source_1.AppDataSource.getRepository(entities_1.SchoolSettings);
    const settings = await settingsRepo.findOne({ where: { id: 'default' } });
    const schoolName = settings?.schoolName || 'School Pro Academy';
    const cls = students[0].schoolClass;
    const classLabel = cls?.name || 'Class';
    const pdf = await (0, pdf_1.generateClassListPdf)({
        schoolName,
        tagline: settings?.tagline || undefined,
        logoUrl: settings?.logoUrl || undefined,
        classLabel,
        generatedAt: new Date(),
        students: students.map((s) => ({
            admissionNumber: s.admissionNumber,
            lastName: s.lastName,
            firstName: s.firstName,
            gender: s.gender || '—',
            dateOfBirth: s.dateOfBirth ? String(s.dateOfBirth) : undefined,
            studentType: s.studentType || undefined,
        })),
    });
    const safeName = classLabel.replace(/[^\w\-]+/g, '-').replace(/-+/g, '-');
    const filename = `class-list-${safeName}.pdf`;
    const inline = req.query.preview === 'true';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${filename}"`);
    res.send(pdf);
});
router.get('/next-student-id', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (_req, res) => {
    const studentId = await (0, helpers_1.generateStudentId)();
    res.json({ studentId });
});
router.get('/parent/my-children', (0, auth_1.authorize)(enums_1.UserRole.PARENT), async (req, res) => {
    const guardianRepo = data_source_1.AppDataSource.getRepository(entities_1.Guardian);
    const links = await guardianRepo.find({
        where: { parentId: req.user.parentId },
        relations: (0, typeorm_helpers_1.relations)('student', 'student.schoolClass', 'student.schoolClass.form'),
    });
    res.json(links.map((l) => ({
        linkId: l.id,
        relationship: l.relationship,
        student: l.student,
    })));
});
router.post('/parent/link-child', (0, auth_1.authorize)(enums_1.UserRole.PARENT), async (req, res) => {
    const parentId = req.user.parentId;
    if (!parentId)
        return res.status(400).json({ message: 'Parent profile not found. Sign out and sign in again.' });
    const { admissionNumber, relationship } = req.body;
    if (!admissionNumber?.trim()) {
        return res.status(400).json({ message: 'Student ID is required' });
    }
    const userRepo = data_source_1.AppDataSource.getRepository(entities_1.User);
    const studentRepo = data_source_1.AppDataSource.getRepository(entities_1.Student);
    const guardianRepo = data_source_1.AppDataSource.getRepository(entities_1.Guardian);
    const user = await userRepo.findOne({ where: { id: req.user.userId } });
    if (!user)
        return res.status(404).json({ message: 'User not found' });
    const admission = String(admissionNumber).trim().toUpperCase();
    const student = await studentRepo.findOne({
        where: { admissionNumber: admission, isActive: true },
        relations: (0, typeorm_helpers_1.relations)('schoolClass', 'schoolClass.form', 'form'),
    });
    if (!student) {
        return res.status(404).json({ message: 'No student found with that Student ID. Check the number on the admission letter or with the school office.' });
    }
    const alreadyLinked = await guardianRepo.findOne({ where: { studentId: student.id, parentId } });
    if (alreadyLinked) {
        return res.status(409).json({ message: `${student.firstName} ${student.lastName} is already linked to your account` });
    }
    let guardian = await guardianRepo.findOne({
        where: [
            { studentId: student.id, parentId },
            { studentId: student.id, email: user.email.toLowerCase() },
        ],
    });
    const rel = String(relationship || 'Parent').trim() || 'Parent';
    if (guardian) {
        guardian.parentId = parentId;
        guardian.relationship = rel;
        guardian.fullName = `${user.firstName} ${user.lastName}`;
        guardian.phone = user.phone || guardian.phone;
        guardian.email = user.email;
    }
    else {
        const existingForStudent = await guardianRepo.count({ where: { studentId: student.id } });
        guardian = guardianRepo.create({
            studentId: student.id,
            parentId,
            fullName: `${user.firstName} ${user.lastName}`,
            relationship: rel,
            phone: user.phone || '—',
            email: user.email,
            isPrimary: existingForStudent === 0,
            isEmergencyContact: false,
        });
    }
    const saved = await guardianRepo.save(guardian);
    res.status(201).json({
        message: `Linked to ${student.firstName} ${student.lastName}`,
        link: {
            linkId: saved.id,
            relationship: saved.relationship,
            student: {
                id: student.id,
                admissionNumber: student.admissionNumber,
                firstName: student.firstName,
                lastName: student.lastName,
                className: student.schoolClass?.name,
                formName: student.schoolClass?.form?.name || student.form?.name,
            },
        },
    });
});
router.get('/:id/id-card/pdf', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.TEACHER), async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.Student);
    const student = await repo.findOne({
        where: { id: (0, typeorm_helpers_1.param)(req.params.id), isActive: true },
        relations: (0, typeorm_helpers_1.relations)('schoolClass', 'schoolClass.form', 'form'),
    });
    if (!student)
        return res.status(404).json({ message: 'Student not found' });
    if (student.classId && !(await (0, teacher_class_access_1.assertTeacherClassAccess)(req, student.classId))) {
        return res.status(403).json({ message: 'You are not assigned to this class' });
    }
    const branding = await (0, school_branding_service_1.loadSchoolBranding)();
    const pdf = await (0, pdf_1.generateStudentIdCardPdf)({
        ...branding,
        admissionNumber: student.admissionNumber,
        firstName: student.firstName,
        lastName: student.lastName,
        dateOfBirth: student.dateOfBirth || undefined,
        studentAddress: student.address || undefined,
        gender: student.gender || undefined,
        studentType: student.studentType || undefined,
        className: student.schoolClass?.name || undefined,
        formName: student.form?.name || student.schoolClass?.form?.name || undefined,
        generatedAt: new Date(),
    });
    const filename = `student-id-${student.admissionNumber}.pdf`;
    const inline = req.query.preview === 'true';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${filename}"`);
    res.send(pdf);
});
router.get('/:id', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.TEACHER, enums_1.UserRole.PARENT, enums_1.UserRole.STUDENT), async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.Student);
    const student = await repo.findOne({
        where: { id: (0, typeorm_helpers_1.param)(req.params.id) },
        relations: (0, typeorm_helpers_1.relations)('schoolClass', 'schoolClass.form', 'form', 'guardians', 'guardians.parent', 'user'),
    });
    if (!student)
        return res.status(404).json({ message: 'Student not found' });
    if (req.user.role === enums_1.UserRole.PARENT) {
        const guardianRepo = data_source_1.AppDataSource.getRepository(entities_1.Guardian);
        const link = await guardianRepo.findOne({ where: { studentId: student.id, parentId: req.user.parentId } });
        if (!link)
            return res.status(403).json({ message: 'Access denied' });
    }
    if (req.user.role === enums_1.UserRole.STUDENT && req.user.studentId !== student.id) {
        return res.status(403).json({ message: 'Access denied' });
    }
    res.json(student);
});
router.post('/', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.Student);
    const guardianRepo = data_source_1.AppDataSource.getRepository(entities_1.Guardian);
    const formRepo = data_source_1.AppDataSource.getRepository(entities_1.Form);
    const { guardians, createPortalAccount, parentEmail, formId, admissionNumber: _ignored, classId: _ignoredClass, enrollmentDate: _ignoredEnroll, ...data } = req.body;
    if (!formId) {
        return res.status(400).json({ message: 'Form is required when registering a student' });
    }
    const studentType = data.studentType || enums_1.StudentType.DAY_SCHOLAR;
    if (![enums_1.StudentType.DAY_SCHOLAR, enums_1.StudentType.BOARDER].includes(studentType)) {
        return res.status(400).json({ message: 'Student type must be Day Scholar or Boarder' });
    }
    data.studentType = studentType;
    const form = await formRepo.findOne({ where: { id: formId } });
    if (!form) {
        return res.status(400).json({ message: 'Selected form was not found' });
    }
    let student;
    for (let attempt = 0; attempt < 5; attempt++) {
        const studentId = await (0, helpers_1.generateStudentId)();
        try {
            const created = repo.create({
                ...data,
                admissionNumber: studentId,
                formId,
                classId: null,
                enrollmentDate: null,
            });
            student = await repo.save(Array.isArray(created) ? created[0] : created);
            break;
        }
        catch (err) {
            if (err?.code === '23505' && attempt < 4)
                continue;
            throw err;
        }
    }
    if (guardians?.length) {
        for (const g of guardians) {
            await guardianRepo.save(guardianRepo.create({ ...g, studentId: student.id }));
        }
    }
    if (createPortalAccount && parentEmail) {
        const userRepo = data_source_1.AppDataSource.getRepository(entities_1.User);
        const passwordHash = await bcryptjs_1.default.hash('ChangeMe123!', 10);
        const user = await userRepo.save(userRepo.create({
            email: parentEmail,
            passwordHash,
            firstName: guardians?.[0]?.fullName?.split(' ')[0] || 'Parent',
            lastName: guardians?.[0]?.fullName?.split(' ').slice(1).join(' ') || 'Account',
            role: enums_1.UserRole.STUDENT,
        }));
        student.userId = user.id;
        await repo.save(student);
    }
    let registrationInvoice = null;
    try {
        registrationInvoice = await (0, registration_invoice_service_1.createRegistrationInvoiceForStudent)(student, form);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : 'Registration invoice could not be created';
        return res.status(500).json({
            message: `Student was saved but registration invoice creation failed: ${message}`,
            studentId: student.id,
            admissionNumber: student.admissionNumber,
        });
    }
    const full = await repo.findOne({
        where: { id: student.id },
        relations: (0, typeorm_helpers_1.relations)('guardians', 'schoolClass', 'form'),
    });
    res.status(201).json({
        ...full,
        registrationInvoice: {
            id: registrationInvoice.id,
            invoiceNumber: registrationInvoice.invoiceNumber,
            totalAmount: Number(registrationInvoice.totalAmount),
        },
    });
});
router.patch('/:id/enroll', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.TEACHER), async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.Student);
    const { classId } = req.body;
    if (!classId)
        return res.status(400).json({ message: 'Class is required' });
    const student = await repo.findOne({ where: { id: req.params.id } });
    if (!student)
        return res.status(404).json({ message: 'Student not found' });
    student.classId = classId;
    student.enrollmentDate = (0, helpers_1.today)();
    await repo.save(student);
    const full = await repo.findOne({
        where: { id: student.id },
        relations: (0, typeorm_helpers_1.relations)('schoolClass', 'schoolClass.form', 'guardians'),
    });
    res.json(full);
});
router.patch('/:id/unenroll', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.TEACHER), async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.Student);
    const student = await repo.findOne({ where: { id: req.params.id } });
    if (!student)
        return res.status(404).json({ message: 'Student not found' });
    student.classId = null;
    student.enrollmentDate = null;
    await repo.save(student);
    const full = await repo.findOne({
        where: { id: student.id },
        relations: (0, typeorm_helpers_1.relations)('guardians'),
    });
    res.json(full);
});
router.put('/:id', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.Student);
    const guardianRepo = data_source_1.AppDataSource.getRepository(entities_1.Guardian);
    const student = await repo.findOne({
        where: { id: (0, typeorm_helpers_1.param)(req.params.id) },
        relations: (0, typeorm_helpers_1.relations)('guardians'),
    });
    if (!student)
        return res.status(404).json({ message: 'Student not found' });
    const { guardians, admissionNumber: _admission, classId: _classId, formId: _formId, enrollmentDate: _enroll, id: _id, createdAt: _created, isActive: _active, schoolClass: _sc, userId: _userId, ...updates } = req.body;
    if (updates.firstName !== undefined)
        student.firstName = updates.firstName;
    if (updates.lastName !== undefined)
        student.lastName = updates.lastName;
    if (updates.dateOfBirth !== undefined)
        student.dateOfBirth = updates.dateOfBirth || null;
    if (updates.gender !== undefined)
        student.gender = updates.gender;
    if (req.body.studentType !== undefined) {
        if (![enums_1.StudentType.DAY_SCHOLAR, enums_1.StudentType.BOARDER].includes(req.body.studentType)) {
            return res.status(400).json({ message: 'Student type must be Day Scholar or Boarder' });
        }
        student.studentType = req.body.studentType;
    }
    if (updates.address !== undefined)
        student.address = updates.address || null;
    if (updates.previousSchool !== undefined)
        student.previousSchool = updates.previousSchool || null;
    if (req.body.formId !== undefined) {
        if (!req.body.formId) {
            return res.status(400).json({ message: 'Form cannot be empty' });
        }
        const form = await data_source_1.AppDataSource.getRepository(entities_1.Form).findOne({ where: { id: req.body.formId } });
        if (!form)
            return res.status(400).json({ message: 'Selected form was not found' });
        student.formId = req.body.formId;
    }
    await repo.save(student);
    if (guardians?.length) {
        const g = guardians[0];
        const existing = student.guardians?.find((x) => x.isPrimary) || student.guardians?.[0];
        if (existing) {
            if (g.fullName !== undefined)
                existing.fullName = g.fullName;
            if (g.phone !== undefined)
                existing.phone = g.phone;
            if (g.relationship !== undefined)
                existing.relationship = g.relationship;
            await guardianRepo.save(existing);
        }
        else if (g.fullName) {
            await guardianRepo.save(guardianRepo.create({
                studentId: student.id,
                fullName: g.fullName,
                phone: g.phone,
                relationship: g.relationship || 'Parent',
                isPrimary: true,
            }));
        }
    }
    const full = await repo.findOne({
        where: { id: student.id },
        relations: (0, typeorm_helpers_1.relations)('schoolClass', 'schoolClass.form', 'form', 'guardians'),
    });
    res.json(full);
});
router.post('/:id/registration-invoice', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (req, res) => {
    const studentRepo = data_source_1.AppDataSource.getRepository(entities_1.Student);
    const invoiceRepo = data_source_1.AppDataSource.getRepository(entities_1.Invoice);
    const student = await studentRepo.findOne({
        where: { id: (0, typeorm_helpers_1.param)(req.params.id) },
        relations: (0, typeorm_helpers_1.relations)('form'),
    });
    if (!student)
        return res.status(404).json({ message: 'Student not found' });
    if (!student.form) {
        return res.status(400).json({ message: 'Student has no form assigned. Set form first.' });
    }
    const existing = await invoiceRepo.findOne({
        where: {
            studentId: student.id,
            description: `New student registration — ${student.form.name} (${student.admissionNumber})`,
        },
        order: { createdAt: 'DESC' },
    });
    if (existing) {
        return res.json({
            message: 'Registration invoice already exists',
            invoice: {
                id: existing.id,
                invoiceNumber: existing.invoiceNumber,
                totalAmount: Number(existing.totalAmount),
            },
        });
    }
    const invoice = await (0, registration_invoice_service_1.createRegistrationInvoiceForStudent)(student, student.form);
    return res.status(201).json({
        message: 'Registration invoice created',
        invoice: {
            id: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            totalAmount: Number(invoice.totalAmount),
        },
    });
});
router.delete('/:id', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.Student);
    const student = await repo.findOne({ where: { id: (0, typeorm_helpers_1.param)(req.params.id) } });
    if (!student)
        return res.status(404).json({ message: 'Student not found' });
    student.isActive = false;
    await repo.save(student);
    res.json({ message: 'Student record deleted', id: student.id });
});
exports.default = router;
