"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RECORD_BOOK_MAX_MARKS = void 0;
exports.getTeacherFullName = getTeacherFullName;
exports.listRecordBookSubjects = listRecordBookSubjects;
exports.buildRecordBook = buildRecordBook;
exports.addRecordBookColumn = addRecordBookColumn;
exports.saveRecordBookRow = saveRecordBookRow;
const crypto_1 = require("crypto");
const data_source_1 = require("../config/data-source");
const entities_1 = require("../entities");
const enums_1 = require("../entities/enums");
const access_control_service_1 = require("./access-control.service");
const typeorm_helpers_1 = require("../utils/typeorm-helpers");
const teacher_class_access_1 = require("../utils/teacher-class-access");
exports.RECORD_BOOK_MAX_MARKS = 100;
function resolveOwnerKey(req) {
    if (req.user.staffId)
        return req.user.staffId;
    if (req.user.userId)
        return `user:${req.user.userId}`;
    throw new Error('Unable to identify record book owner for this account.');
}
async function getTeacherFullName(req) {
    const user = await data_source_1.AppDataSource.getRepository(entities_1.User).findOne({
        where: { id: req.user.userId },
    });
    if (!user)
        return 'Teacher';
    return `${user.firstName} ${user.lastName}`.trim() || user.email;
}
async function listRecordBookSubjects(req, classId) {
    const subjects = await getSubjectsForClass(req, classId);
    const fullName = await getTeacherFullName(req);
    return { teacher: { fullName }, subjects };
}
async function getSubjectsForClass(req, classId) {
    const role = req.user.role;
    const repo = data_source_1.AppDataSource.getRepository(entities_1.ClassSubject);
    if (role !== enums_1.UserRole.TEACHER) {
        const rows = await repo.find({
            where: { classId },
            relations: (0, typeorm_helpers_1.relations)('subject'),
            order: { subject: { name: 'ASC' } },
        });
        return rows
            .filter((r) => r.subject)
            .map((r) => ({ id: r.subject.id, code: r.subject.code, name: r.subject.name }));
    }
    const staffId = req.user.staffId;
    if (!staffId)
        return [];
    const classTeacher = await (0, teacher_class_access_1.isClassTeacher)(staffId, classId);
    const where = classTeacher ? { classId } : { classId, teacherId: staffId };
    const rows = await repo.find({
        where,
        relations: (0, typeorm_helpers_1.relations)('subject'),
        order: { subject: { name: 'ASC' } },
    });
    return rows
        .filter((r) => r.subject)
        .map((r) => ({ id: r.subject.id, code: r.subject.code, name: r.subject.name }));
}
async function assertCanUseSubject(req, classId, subjectId) {
    const subjects = await getSubjectsForClass(req, classId);
    if (!subjects.some((s) => s.id === subjectId)) {
        throw new Error('You are not assigned to teach this subject in the selected class.');
    }
    if (req.user.role === enums_1.UserRole.TEACHER) {
        const allowed = await (0, teacher_class_access_1.assertTeacherSubjectAccess)(req, classId, subjectId);
        if (!allowed) {
            throw new Error('You are not assigned to teach this subject in the selected class.');
        }
    }
}
async function resolveSubject(req, classId, subjectId) {
    await assertCanUseSubject(req, classId, subjectId);
    const subjects = await getSubjectsForClass(req, classId);
    const subject = subjects.find((s) => s.id === subjectId);
    if (!subject)
        throw new Error('Subject not found for this class.');
    return subject;
}
async function buildRecordBook(req, params) {
    const { classId, termId, subjectId } = params;
    const ownerKey = resolveOwnerKey(req);
    const subject = await resolveSubject(req, classId, subjectId);
    const fullName = await getTeacherFullName(req);
    const schoolClass = await data_source_1.AppDataSource.getRepository(entities_1.SchoolClass).findOne({ where: { id: classId } });
    if (!schoolClass)
        throw new Error('Class not found');
    const students = await data_source_1.AppDataSource.getRepository(entities_1.Student).find({
        where: { classId, isActive: true },
        order: { lastName: 'ASC', firstName: 'ASC' },
    });
    const columnRepo = data_source_1.AppDataSource.getRepository(entities_1.RecordBookColumn);
    const columns = await columnRepo.find({
        where: { termId, classId, ownerKey, subjectId },
        order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
    const markRepo = data_source_1.AppDataSource.getRepository(entities_1.RecordBookMark);
    const marks = columns.length
        ? await markRepo.find({
            where: { termId, classId, ownerKey, subjectId },
        })
        : [];
    const markLookup = new Map();
    for (const mark of marks) {
        markLookup.set(`${mark.studentId}:${mark.columnKey}`, mark);
    }
    const studentsOut = students.map((s) => {
        const marksByColumn = {};
        for (const col of columns) {
            const m = markLookup.get(`${s.id}:${col.columnKey}`);
            marksByColumn[col.columnKey] = {
                marks: m != null ? Number(m.marks) : null,
                markId: m?.id || null,
            };
        }
        return {
            studentId: s.id,
            admissionNumber: s.admissionNumber,
            lastName: s.lastName,
            firstName: s.firstName,
            gender: s.gender || '—',
            marksByColumn,
        };
    });
    return {
        maxMarks: exports.RECORD_BOOK_MAX_MARKS,
        term: { id: termId, name: '' },
        class: { id: schoolClass.id, name: schoolClass.name },
        teacher: { fullName },
        subject,
        columns: columns.map((c) => ({
            columnKey: c.columnKey,
            label: c.label,
            sortOrder: c.sortOrder,
        })),
        students: studentsOut,
    };
}
async function addRecordBookColumn(req, params) {
    const { classId, termId, subjectId } = params;
    const ownerKey = resolveOwnerKey(req);
    await assertCanUseSubject(req, classId, subjectId);
    const repo = data_source_1.AppDataSource.getRepository(entities_1.RecordBookColumn);
    const existing = await repo.find({
        where: { termId, classId, ownerKey, subjectId },
        order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
    const sortOrder = existing.length;
    const label = params.label?.trim() || `Test ${sortOrder + 1}`;
    const columnKey = `test-${(0, crypto_1.randomUUID)()}`;
    const created = await repo.save(repo.create({
        termId,
        classId,
        subjectId,
        ownerKey,
        columnKey,
        label,
        sortOrder,
    }));
    return {
        columnKey: created.columnKey,
        label: created.label,
        sortOrder: created.sortOrder,
    };
}
async function saveRecordBookRow(req, params) {
    const { classId, termId, subjectId, studentId, marks } = params;
    const ownerKey = resolveOwnerKey(req);
    if (!marks.length) {
        return { saved: 0 };
    }
    await assertCanUseSubject(req, classId, subjectId);
    if (!(await access_control_service_1.AccessControlService.userCanAccessStudent(req.user, studentId))) {
        throw new Error('You do not have access to this student record.');
    }
    const columnRepo = data_source_1.AppDataSource.getRepository(entities_1.RecordBookColumn);
    const allowedColumns = await columnRepo.find({
        where: { termId, classId, ownerKey, subjectId },
    });
    const allowedKeys = new Set(allowedColumns.map((c) => c.columnKey));
    const repo = data_source_1.AppDataSource.getRepository(entities_1.RecordBookMark);
    const enteredById = req.user.staffId;
    let saved = 0;
    for (const entry of marks) {
        if (!allowedKeys.has(entry.columnKey)) {
            throw new Error('One or more test columns are not valid for this record book.');
        }
        if (!Number.isFinite(entry.marks) || entry.marks < 0 || entry.marks > exports.RECORD_BOOK_MAX_MARKS) {
            throw new Error(`Marks must be between 0 and ${exports.RECORD_BOOK_MAX_MARKS}.`);
        }
        let existing = await repo.findOne({
            where: {
                termId,
                classId,
                ownerKey,
                subjectId,
                studentId,
                columnKey: entry.columnKey,
            },
        });
        if (existing) {
            existing.marks = entry.marks;
            if (enteredById)
                existing.enteredById = enteredById;
        }
        else {
            existing = repo.create({
                termId,
                classId,
                ownerKey,
                subjectId,
                studentId,
                columnKey: entry.columnKey,
                marks: entry.marks,
                enteredById,
            });
        }
        await repo.save(existing);
        saved += 1;
    }
    return { saved };
}
