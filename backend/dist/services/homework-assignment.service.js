"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listTeacherHomeworkAssignments = listTeacherHomeworkAssignments;
exports.listStudentHomeworkAssignments = listStudentHomeworkAssignments;
exports.createHomeworkAssignment = createHomeworkAssignment;
exports.listTeacherSubjectsForClass = listTeacherSubjectsForClass;
const data_source_1 = require("../config/data-source");
const entities_1 = require("../entities");
const enums_1 = require("../entities/enums");
const teacher_class_access_1 = require("../utils/teacher-class-access");
const homework_assignments_1 = require("../utils/homework-assignments");
const typeorm_helpers_1 = require("../utils/typeorm-helpers");
function mapRow(row) {
    const teacherUser = row.teacher?.user;
    const teacherName = teacherUser
        ? `${teacherUser.firstName} ${teacherUser.lastName}`.trim()
        : undefined;
    return {
        id: row.id,
        classId: row.classId,
        className: row.schoolClass?.name,
        subjectId: row.subjectId ?? null,
        subjectName: row.subject?.name ?? null,
        termId: row.termId,
        termName: row.term?.name,
        teacherId: row.teacherId,
        teacherName,
        title: row.title,
        instructions: row.instructions ?? null,
        originalFileName: row.originalFileName,
        fileUrl: (0, homework_assignments_1.homeworkFileUrl)(row.storedFileName),
        mimeType: row.mimeType,
        fileSize: row.fileSize,
        dueDate: row.dueDate ?? null,
        createdAt: row.createdAt,
    };
}
async function notifyClassStudents(classId, title, assignmentId, teacherName) {
    const students = await data_source_1.AppDataSource.query(`SELECT "userId" FROM students WHERE "classId" = $1 AND "isActive" = true AND "userId" IS NOT NULL`, [classId]);
    if (!students.length)
        return;
    const notifRepo = data_source_1.AppDataSource.getRepository(entities_1.Notification);
    const rows = students.map((s) => notifRepo.create({
        userId: s.userId,
        title: 'New assignment posted',
        message: `${teacherName} posted "${title}" for your class.`,
        type: 'homework_assignment',
        metadata: { assignmentId, classId },
    }));
    await notifRepo.save(rows);
}
async function listTeacherHomeworkAssignments(req, classId, termId) {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.HomeworkAssignment);
    const qb = repo
        .createQueryBuilder('a')
        .leftJoinAndSelect('a.schoolClass', 'c')
        .leftJoinAndSelect('a.subject', 'sub')
        .leftJoinAndSelect('a.term', 't')
        .leftJoinAndSelect('a.teacher', 'teacher')
        .leftJoinAndSelect('teacher.user', 'teacherUser');
    if (req.user.staffId) {
        qb.where('a.teacherId = :teacherId', { teacherId: req.user.staffId });
    }
    if (classId) {
        if (req.user.role === enums_1.UserRole.TEACHER) {
            const allowed = await (0, teacher_class_access_1.assertTeacherClassAccess)(req, classId);
            if (!allowed)
                throw Object.assign(new Error('You are not assigned to this class.'), { statusCode: 403 });
        }
        qb.andWhere('a.classId = :classId', { classId });
    }
    if (termId)
        qb.andWhere('a.termId = :termId', { termId });
    const rows = await qb.orderBy('a.createdAt', 'DESC').getMany();
    return rows.map(mapRow);
}
async function listStudentHomeworkAssignments(studentId, termId) {
    const studentRows = await data_source_1.AppDataSource.query(`SELECT "classId" FROM students WHERE id = $1 AND "isActive" = true LIMIT 1`, [studentId]);
    const classId = studentRows[0]?.classId;
    if (!classId)
        return [];
    const repo = data_source_1.AppDataSource.getRepository(entities_1.HomeworkAssignment);
    const where = { classId };
    if (termId)
        where.termId = termId;
    const rows = await repo.find({
        where,
        relations: (0, typeorm_helpers_1.relations)('schoolClass', 'subject', 'term', 'teacher', 'teacher.user'),
        order: { createdAt: 'DESC' },
    });
    return rows.map(mapRow);
}
async function createHomeworkAssignment(req, input) {
    const staffId = req.user.staffId;
    if (!staffId)
        throw Object.assign(new Error('Teacher profile not linked.'), { statusCode: 403 });
    const allowed = await (0, teacher_class_access_1.assertTeacherClassAccess)(req, input.classId);
    if (!allowed)
        throw Object.assign(new Error('You are not assigned to this class.'), { statusCode: 403 });
    if (input.subjectId) {
        const subjectRows = await data_source_1.AppDataSource.query(`SELECT 1 FROM class_subjects cs
       WHERE cs."classId" = $1 AND cs."subjectId" = $2 AND cs."teacherId" = $3
       LIMIT 1`, [input.classId, input.subjectId, staffId]);
        const classTeacher = await data_source_1.AppDataSource.query(`SELECT 1 FROM classes c WHERE c.id = $1 AND c."classTeacherId" = $2 LIMIT 1`, [input.classId, staffId]);
        if (!subjectRows.length && !classTeacher.length) {
            throw Object.assign(new Error('You are not assigned to teach that subject in this class.'), {
                statusCode: 403,
            });
        }
    }
    const repo = data_source_1.AppDataSource.getRepository(entities_1.HomeworkAssignment);
    const saved = await repo.save(repo.create({
        classId: input.classId,
        termId: input.termId,
        subjectId: input.subjectId || null,
        teacherId: staffId,
        title: input.title.trim(),
        instructions: input.instructions?.trim() || null,
        originalFileName: input.originalFileName,
        storedFileName: input.storedFileName,
        mimeType: input.mimeType,
        fileSize: input.fileSize,
        dueDate: input.dueDate || null,
    }));
    const full = await repo.findOne({
        where: { id: saved.id },
        relations: (0, typeorm_helpers_1.relations)('schoolClass', 'subject', 'term', 'teacher', 'teacher.user'),
    });
    if (!full)
        throw new Error('Failed to load saved assignment.');
    const teacherName = full.teacher?.user
        ? `${full.teacher.user.firstName} ${full.teacher.user.lastName}`.trim()
        : 'Your teacher';
    void notifyClassStudents(input.classId, full.title, full.id, teacherName).catch((err) => console.error('notifyClassStudents failed:', err));
    return mapRow(full);
}
async function listTeacherSubjectsForClass(staffId, classId) {
    const rows = await data_source_1.AppDataSource.query(`
    SELECT DISTINCT sub.id, sub.code, sub.name
    FROM class_subjects cs
    JOIN subjects sub ON sub.id = cs."subjectId"
    WHERE cs."classId" = $1 AND cs."teacherId" = $2
    ORDER BY sub.name ASC
    `, [classId, staffId]);
    return rows;
}
