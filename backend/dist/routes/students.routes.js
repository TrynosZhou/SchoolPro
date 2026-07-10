"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-nocheck
const express_1 = require("express");
const typeorm_1 = require("typeorm");
const data_source_1 = require("../config/data-source");
const entities_1 = require("../entities");
const enums_1 = require("../entities/enums");
const auth_1 = require("../middleware/auth");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const typeorm_helpers_1 = require("../utils/typeorm-helpers");
const helpers_1 = require("../utils/helpers");
const pdf_1 = require("../utils/pdf");
const school_branding_service_1 = require("../services/school-branding.service");
const portal_roles_1 = require("../config/portal-roles");
const teacher_class_access_1 = require("../utils/teacher-class-access");
const registration_invoice_service_1 = require("../services/registration-invoice.service");
const student_lifecycle_service_1 = require("../services/student-lifecycle.service");
const access_control_1 = require("../middleware/access-control");
const access_control_service_1 = require("../services/access-control.service");
const audit_log_service_1 = require("../services/audit-log.service");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
const stuView = (0, access_control_1.requireModuleAccess)('students', 'view');
const stuCreate = (0, access_control_1.requireModuleAccess)('students', 'create');
const stuEdit = (0, access_control_1.requireModuleAccess)('students', 'edit');
const stuDelete = (0, access_control_1.requireModuleAccess)('students', 'delete');
const enrollEdit = (0, access_control_1.requireModuleAccess)('enrollment', 'edit');
const enrollCreate = (0, access_control_1.requireModuleAccess)('enrollment', 'create');
function normalizeGuardianInput(g = {}) {
    const phone = String(g.guardianPhone || g.phone || '').trim() || undefined;
    return {
        fullName: g.fullName,
        phone,
        guardianPhone: phone,
        guardianWhatsappConsent: g.guardianWhatsappConsent === true,
        relationship: g.relationship,
        email: g.email,
        isPrimary: g.isPrimary ?? true,
        parentId: g.parentId,
    };
}
async function filterAccessibleStudents(req, qb, options) {
    if (options?.unenrolled &&
        req.user.role === enums_1.UserRole.TEACHER &&
        req.user.staffId &&
        (await (0, teacher_class_access_1.isAnyClassTeacher)(req.user.staffId))) {
        return;
    }
    const accessible = await access_control_service_1.AccessControlService.getAccessibleStudentIds(req.user);
    if (accessible === 'all')
        return;
    if (!accessible.length) {
        qb.andWhere('1 = 0');
        return;
    }
    qb.andWhere('s.id IN (:...accessibleIds)', { accessibleIds: accessible });
}
router.get('/', (0, auth_1.authorize)(...portal_roles_1.STUDENT_REGISTRATION_ROLES, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.TEACHER), stuView, async (req, res) => {
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
    await filterAccessibleStudents(req, qb, { unenrolled: unenrolled === 'true' });
    const students = await qb.orderBy('s.lastName', 'ASC').getMany();
    res.json(students);
});
router.get('/class-list/pdf', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.TEACHER), stuView, async (req, res) => {
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
router.get('/next-student-id', (0, auth_1.authorize)(...portal_roles_1.STUDENT_REGISTRATION_ROLES), stuCreate, async (_req, res) => {
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
// Parent-facing student lookup used when linking a child. Searches by Student ID
// (admission number) OR by last/first name. Returns minimal, non-sensitive fields
// so the parent can pick the correct record when several students match.
router.get('/parent/search', (0, auth_1.authorize)(enums_1.UserRole.PARENT), async (req, res) => {
    const parentId = req.user.parentId;
    if (!parentId)
        return res.status(400).json({ message: 'Parent profile not found. Sign out and sign in again.' });
    const q = String(req.query.q ?? '').trim();
    if (q.length < 2) {
        return res.status(400).json({ message: 'Enter a Student ID or last name (at least 2 characters).' });
    }
    const studentRepo = data_source_1.AppDataSource.getRepository(entities_1.Student);
    const students = await studentRepo.createQueryBuilder('s')
        .leftJoinAndSelect('s.schoolClass', 'c')
        .leftJoinAndSelect('c.form', 'f')
        .leftJoinAndSelect('s.form', 'studentForm')
        .where('s.isActive = true')
        .andWhere('(s.admissionNumber ILIKE :q OR s.lastName ILIKE :q OR s.firstName ILIKE :q)', { q: `%${q}%` })
        .orderBy('s.lastName', 'ASC')
        .addOrderBy('s.firstName', 'ASC')
        .take(25)
        .getMany();
    let linkedIds = new Set();
    if (students.length) {
        const links = await data_source_1.AppDataSource.getRepository(entities_1.Guardian).find({
            where: { parentId, studentId: (0, typeorm_1.In)(students.map((s) => s.id)) },
        });
        linkedIds = new Set(links.map((l) => l.studentId));
    }
    res.json(students.map((s) => ({
        id: s.id,
        admissionNumber: s.admissionNumber,
        firstName: s.firstName,
        lastName: s.lastName,
        gender: s.gender || undefined,
        className: s.schoolClass?.name,
        formName: s.schoolClass?.form?.name || s.form?.name,
        alreadyLinked: linkedIds.has(s.id),
    })));
});
router.post('/parent/link-child', (0, auth_1.authorize)(enums_1.UserRole.PARENT), async (req, res) => {
    const parentId = req.user.parentId;
    if (!parentId)
        return res.status(400).json({ message: 'Parent profile not found. Sign out and sign in again.' });
    const { admissionNumber, studentId, relationship } = req.body;
    if (!admissionNumber?.trim() && !studentId?.trim()) {
        return res.status(400).json({ message: 'Provide a Student ID or select a student to link.' });
    }
    const userRepo = data_source_1.AppDataSource.getRepository(entities_1.User);
    const studentRepo = data_source_1.AppDataSource.getRepository(entities_1.Student);
    const guardianRepo = data_source_1.AppDataSource.getRepository(entities_1.Guardian);
    const user = await userRepo.findOne({ where: { id: req.user.userId } });
    if (!user)
        return res.status(404).json({ message: 'User not found' });
    let student;
    if (studentId?.trim()) {
        // Parent picked a specific record from the search results.
        student = await studentRepo.findOne({
            where: { id: String(studentId).trim(), isActive: true },
            relations: (0, typeorm_helpers_1.relations)('schoolClass', 'schoolClass.form', 'form'),
        });
        if (!student) {
            return res.status(404).json({ message: 'That student record could not be found. Try searching again.' });
        }
    }
    else {
        const admission = String(admissionNumber).trim().toUpperCase();
        student = await studentRepo.findOne({
            where: { admissionNumber: admission, isActive: true },
            relations: (0, typeorm_helpers_1.relations)('schoolClass', 'schoolClass.form', 'form'),
        });
        if (!student) {
            return res.status(404).json({ message: 'No student found with that Student ID. Check the number on the admission letter or with the school office.' });
        }
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
// Detach a student from the parent's account. Non-destructive: the guardian
// contact record is kept (parentId cleared) so any school-entered contact
// details remain, and the parent can re-link the child later.
router.delete('/parent/unlink-child/:studentId', (0, auth_1.authorize)(enums_1.UserRole.PARENT), async (req, res) => {
    const parentId = req.user.parentId;
    if (!parentId)
        return res.status(400).json({ message: 'Parent profile not found. Sign out and sign in again.' });
    const studentId = (0, typeorm_helpers_1.param)(req.params.studentId);
    const guardianRepo = data_source_1.AppDataSource.getRepository(entities_1.Guardian);
    const guardian = await guardianRepo.findOne({
        where: { studentId, parentId },
        relations: (0, typeorm_helpers_1.relations)('student'),
    });
    if (!guardian) {
        return res.status(404).json({ message: 'That child is not linked to your account.' });
    }
    const name = guardian.student ? `${guardian.student.firstName} ${guardian.student.lastName}` : 'Child';
    guardian.parentId = null;
    await guardianRepo.save(guardian);
    res.json({ message: `${name} has been unlinked from your account.` });
});
router.get('/:id/id-card/pdf', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.TEACHER), stuView, async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.Student);
    const student = await repo.findOne({
        where: { id: (0, typeorm_helpers_1.param)(req.params.id), isActive: true },
        relations: (0, typeorm_helpers_1.relations)('schoolClass', 'schoolClass.form', 'form'),
    });
    if (!student)
        return res.status(404).json({ message: 'Student not found' });
    if (!(await access_control_service_1.AccessControlService.userCanAccessStudent(req.user, student.id))) {
        return res.status(403).json({ message: 'You do not have access to this student record' });
    }
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
router.get('/:id', (0, auth_1.authorize)(...portal_roles_1.STUDENT_REGISTRATION_ROLES, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.TEACHER, enums_1.UserRole.PARENT, enums_1.UserRole.STUDENT), stuView, async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.Student);
    const student = await repo.findOne({
        where: { id: (0, typeorm_helpers_1.param)(req.params.id) },
        relations: (0, typeorm_helpers_1.relations)('schoolClass', 'schoolClass.form', 'form', 'guardians', 'guardians.parent', 'user'),
    });
    if (!student)
        return res.status(404).json({ message: 'Student not found' });
    if (!(await access_control_service_1.AccessControlService.userCanAccessStudent(req.user, student.id))) {
        return res.status(403).json({ message: 'Access denied' });
    }
    res.json(student);
});
router.post('/', (0, auth_1.authorize)(...portal_roles_1.STUDENT_REGISTRATION_ROLES), stuCreate, async (req, res) => {
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
            const normalized = normalizeGuardianInput(g);
            await guardianRepo.save(guardianRepo.create({ ...normalized, studentId: student.id }));
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
    void (0, audit_log_service_1.logAudit)({
        userId: req.user.userId,
        userRole: req.user.role,
        userEmail: req.user.email,
        action: 'create',
        module: 'students',
        recordId: student.id,
        recordLabel: `${student.firstName} ${student.lastName} (${student.admissionNumber})`,
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
router.patch('/:id/enroll', (0, auth_1.authorize)(...portal_roles_1.ENROLLMENT_ROLES), enrollCreate, async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.Student);
    const { classId } = req.body;
    if (!classId)
        return res.status(400).json({ message: 'Class is required' });
    const student = await repo.findOne({ where: { id: req.params.id } });
    if (!student)
        return res.status(404).json({ message: 'Student not found' });
    if (req.user.role === enums_1.UserRole.TEACHER) {
        if (!student.classId) {
            // Class teachers may enrol registered students not yet assigned to a class.
        }
        else if (!(await access_control_service_1.AccessControlService.userCanAccessStudent(req.user, student.id))) {
            return res.status(403).json({ message: 'You do not have access to this student record' });
        }
    }
    else if (!(await access_control_service_1.AccessControlService.userCanAccessStudent(req.user, student.id))) {
        return res.status(403).json({ message: 'You do not have access to this student record' });
    }
    if (!(await (0, teacher_class_access_1.assertTeacherClassTeacherAccess)(req, classId))) {
        return res.status(403).json({ message: 'Only the class teacher may enrol students into this class' });
    }
    const beforeClassId = student.classId;
    student.classId = classId;
    student.enrollmentDate = (0, helpers_1.today)();
    await repo.save(student);
    try {
        const year = await (0, student_lifecycle_service_1.getActiveSchoolYear)();
        if (year)
            await (0, student_lifecycle_service_1.upsertEnrollmentSnapshot)(student, year.id);
    }
    catch (err) {
        console.error('[students] enrollment snapshot failed:', err);
    }
    const full = await repo.findOne({
        where: { id: student.id },
        relations: (0, typeorm_helpers_1.relations)('schoolClass', 'schoolClass.form', 'guardians'),
    });
    void (0, audit_log_service_1.logAudit)({
        userId: req.user.userId,
        userRole: req.user.role,
        userEmail: req.user.email,
        action: 'edit',
        module: 'enrollment',
        recordId: student.id,
        recordLabel: `${student.firstName} ${student.lastName}`,
        changes: (0, audit_log_service_1.diffObjects)({ classId: beforeClassId }, { classId: student.classId }),
    });
    res.json(full);
});
router.patch('/:id/unenroll', (0, auth_1.authorize)(...portal_roles_1.ENROLLMENT_ROLES), enrollEdit, async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.Student);
    const student = await repo.findOne({ where: { id: req.params.id } });
    if (!student)
        return res.status(404).json({ message: 'Student not found' });
    if (req.user.role === enums_1.UserRole.TEACHER) {
        if (!student.classId) {
            return res.status(403).json({ message: 'Student is not enrolled in a class' });
        }
        if (!(await (0, teacher_class_access_1.assertTeacherClassTeacherAccess)(req, student.classId))) {
            return res.status(403).json({ message: 'Only the class teacher may unenrol students from this class' });
        }
    }
    else if (!(await access_control_service_1.AccessControlService.userCanAccessStudent(req.user, student.id))) {
        return res.status(403).json({ message: 'You do not have access to this student record' });
    }
    const beforeClassId = student.classId;
    student.classId = null;
    student.enrollmentDate = null;
    await repo.save(student);
    const full = await repo.findOne({
        where: { id: student.id },
        relations: (0, typeorm_helpers_1.relations)('guardians'),
    });
    void (0, audit_log_service_1.logAudit)({
        userId: req.user.userId,
        userRole: req.user.role,
        userEmail: req.user.email,
        action: 'edit',
        module: 'enrollment',
        recordId: student.id,
        recordLabel: `${student.firstName} ${student.lastName}`,
        changes: (0, audit_log_service_1.diffObjects)({ classId: beforeClassId }, { classId: null }),
    });
    res.json(full);
});
router.put('/:id', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.TEACHER), stuEdit, async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.Student);
    const guardianRepo = data_source_1.AppDataSource.getRepository(entities_1.Guardian);
    const student = await repo.findOne({
        where: { id: (0, typeorm_helpers_1.param)(req.params.id) },
        relations: (0, typeorm_helpers_1.relations)('guardians'),
    });
    if (!student)
        return res.status(404).json({ message: 'Student not found' });
    if (!(await access_control_service_1.AccessControlService.userCanAccessStudent(req.user, student.id))) {
        return res.status(403).json({ message: 'You do not have access to this student record' });
    }
    const beforeSnapshot = {
        firstName: student.firstName,
        lastName: student.lastName,
        dateOfBirth: student.dateOfBirth,
        gender: student.gender,
        studentType: student.studentType,
        address: student.address,
        previousSchool: student.previousSchool,
        formId: student.formId,
    };
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
            if (g.relationship !== undefined)
                existing.relationship = g.relationship;
            if (g.guardianWhatsappConsent !== undefined) {
                existing.guardianWhatsappConsent = g.guardianWhatsappConsent === true;
            }
            if (g.phone !== undefined || g.guardianPhone !== undefined) {
                const phone = String(g.guardianPhone || g.phone || '').trim() || undefined;
                existing.phone = phone;
                existing.guardianPhone = phone;
            }
            await guardianRepo.save(existing);
        }
        else if (g.fullName) {
            const normalized = normalizeGuardianInput(g);
            await guardianRepo.save(guardianRepo.create({
                studentId: student.id,
                ...normalized,
                relationship: normalized.relationship || 'Parent',
                isPrimary: true,
            }));
        }
    }
    const full = await repo.findOne({
        where: { id: student.id },
        relations: (0, typeorm_helpers_1.relations)('schoolClass', 'schoolClass.form', 'form', 'guardians'),
    });
    void (0, audit_log_service_1.logAudit)({
        userId: req.user.userId,
        userRole: req.user.role,
        userEmail: req.user.email,
        action: 'edit',
        module: 'students',
        recordId: student.id,
        recordLabel: `${student.firstName} ${student.lastName}`,
        changes: (0, audit_log_service_1.diffObjects)(beforeSnapshot, {
            firstName: student.firstName,
            lastName: student.lastName,
            dateOfBirth: student.dateOfBirth,
            gender: student.gender,
            studentType: student.studentType,
            address: student.address,
            previousSchool: student.previousSchool,
            formId: student.formId,
        }),
    });
    res.json(full);
});
router.post('/:id/registration-invoice', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), stuEdit, async (req, res) => {
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
const EXIT_STATUSES = [
    enums_1.StudentStatus.WITHDRAWN,
    enums_1.StudentStatus.TRANSFERRED,
    enums_1.StudentStatus.GRADUATED,
    enums_1.StudentStatus.SUSPENDED,
];
/**
 * Record a student's exit from the roll (withdrawn / transferred / graduated / suspended)
 * with a reason and date, for retention & dropout analytics.
 */
router.patch('/:id/status', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL), stuEdit, async (req, res) => {
    const { status, reason, exitDate } = req.body || {};
    if (!EXIT_STATUSES.includes(status)) {
        return res.status(400).json({
            message: `status must be one of: ${EXIT_STATUSES.join(', ')}`,
        });
    }
    const studentId = (0, typeorm_helpers_1.param)(req.params.id);
    const before = await data_source_1.AppDataSource.getRepository(entities_1.Student).findOne({ where: { id: studentId } });
    const student = await (0, student_lifecycle_service_1.recordStudentExit)(studentId, status, {
        reason: reason ? String(reason).slice(0, 255) : undefined,
        exitDate: exitDate || undefined,
    });
    if (!student)
        return res.status(404).json({ message: 'Student not found' });
    void (0, audit_log_service_1.logAudit)({
        userId: req.user.userId,
        userRole: req.user.role,
        userEmail: req.user.email,
        action: 'edit',
        module: 'students',
        recordId: student.id,
        recordLabel: `${student.firstName} ${student.lastName}`,
        changes: (0, audit_log_service_1.diffObjects)({ status: before?.status, exitDate: before?.exitDate, exitReason: before?.exitReason }, { status: student.status, exitDate: student.exitDate, exitReason: student.exitReason }),
    });
    res.json({
        message: `Student marked as ${status}.`,
        id: student.id,
        status: student.status,
        exitDate: student.exitDate,
        exitReason: student.exitReason,
    });
});
/** Reinstate a previously exited student back to active status. */
router.patch('/:id/reinstate', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL), stuEdit, async (req, res) => {
    const studentId = (0, typeorm_helpers_1.param)(req.params.id);
    const before = await data_source_1.AppDataSource.getRepository(entities_1.Student).findOne({ where: { id: studentId } });
    const student = await (0, student_lifecycle_service_1.reinstateStudent)(studentId);
    if (!student)
        return res.status(404).json({ message: 'Student not found' });
    void (0, audit_log_service_1.logAudit)({
        userId: req.user.userId,
        userRole: req.user.role,
        userEmail: req.user.email,
        action: 'edit',
        module: 'students',
        recordId: student.id,
        recordLabel: `${student.firstName} ${student.lastName}`,
        changes: (0, audit_log_service_1.diffObjects)({ status: before?.status }, { status: student.status }),
    });
    res.json({ message: 'Student reinstated.', id: student.id, status: student.status });
});
router.delete('/:id', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), stuDelete, async (req, res) => {
    const reason = req.body?.reason ? String(req.body.reason).slice(0, 255) : 'Record removed';
    const student = await (0, student_lifecycle_service_1.recordStudentExit)((0, typeorm_helpers_1.param)(req.params.id), enums_1.StudentStatus.WITHDRAWN, { reason });
    if (!student)
        return res.status(404).json({ message: 'Student not found' });
    void (0, audit_log_service_1.logAudit)({
        userId: req.user.userId,
        userRole: req.user.role,
        userEmail: req.user.email,
        action: 'delete',
        module: 'students',
        recordId: student.id,
        recordLabel: `${student.firstName} ${student.lastName}`,
        changes: [{ field: 'reason', before: null, after: reason }],
    });
    res.json({ message: 'Student record deleted', id: student.id });
});
exports.default = router;
