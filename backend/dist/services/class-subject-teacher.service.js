"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClassSubjectTeacherConflictError = void 0;
exports.findClassSubjectAssignment = findClassSubjectAssignment;
exports.staffDisplayName = staffDisplayName;
exports.assertCanAssignTeacherToClassSubject = assertCanAssignTeacherToClassSubject;
exports.assertTimetableTeacherMatchesAssignment = assertTimetableTeacherMatchesAssignment;
exports.syncTimetableTeachersForAssignment = syncTimetableTeachersForAssignment;
exports.listClassSubjectTeachers = listClassSubjectTeachers;
const data_source_1 = require("../config/data-source");
const entities_1 = require("../entities");
const enums_1 = require("../entities/enums");
const typeorm_helpers_1 = require("../utils/typeorm-helpers");
class ClassSubjectTeacherConflictError extends Error {
    constructor(message, existingTeacherId, existingTeacherName) {
        super(message);
        this.statusCode = 409;
        this.name = 'ClassSubjectTeacherConflictError';
        this.existingTeacherId = existingTeacherId;
        this.existingTeacherName = existingTeacherName;
    }
}
exports.ClassSubjectTeacherConflictError = ClassSubjectTeacherConflictError;
const TEACHING_STAFF_ROLES = [enums_1.UserRole.TEACHER, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.ADMIN];
async function findClassSubjectAssignment(classId, subjectId) {
    return data_source_1.AppDataSource.getRepository(entities_1.ClassSubject).findOne({
        where: { classId, subjectId },
    });
}
async function staffDisplayName(staffId) {
    const staff = await data_source_1.AppDataSource.getRepository(entities_1.Staff)
        .createQueryBuilder('s')
        .innerJoinAndSelect('s.user', 'u')
        .where('s.id = :id', { id: staffId })
        .getOne();
    if (!staff?.user)
        return 'another teacher';
    return `${staff.user.firstName} ${staff.user.lastName}`.trim() || 'another teacher';
}
async function isActiveTeachingStaff(staffId) {
    const staff = await data_source_1.AppDataSource.getRepository(entities_1.Staff)
        .createQueryBuilder('s')
        .innerJoinAndSelect('s.user', 'u')
        .where('s.id = :id', { id: staffId })
        .getOne();
    if (!staff?.isActive || !staff.user?.isActive)
        return false;
    return TEACHING_STAFF_ROLES.includes(staff.user.role);
}
/**
 * Ensures at most one teacher is assigned to teach a subject in a class.
 * Returns the existing class-subject row when present (may be updated by caller).
 */
async function assertCanAssignTeacherToClassSubject(input) {
    const { classId, subjectId, teacherId, forceReassign } = input;
    if (!teacherId) {
        return findClassSubjectAssignment(classId, subjectId);
    }
    const row = await findClassSubjectAssignment(classId, subjectId);
    if (!row?.teacherId || row.teacherId === teacherId) {
        return row;
    }
    const otherActive = await isActiveTeachingStaff(row.teacherId);
    if (otherActive && !forceReassign) {
        const otherName = await staffDisplayName(row.teacherId);
        throw new ClassSubjectTeacherConflictError(`This class/subject is already assigned to ${otherName}.`, row.teacherId, otherName);
    }
    return row;
}
/** Timetable slots for a class/subject must use the canonical teacher from class_subjects. */
async function assertTimetableTeacherMatchesAssignment(classId, subjectId, teacherId) {
    const row = await findClassSubjectAssignment(classId, subjectId);
    if (!row?.teacherId) {
        throw new Error('Assign this class and subject to a teacher on Staff → Teacher Load first.');
    }
    if (row.teacherId !== teacherId) {
        const assignedName = await staffDisplayName(row.teacherId);
        throw new ClassSubjectTeacherConflictError(`${assignedName} is the assigned teacher for this class/subject. Reassign on Teacher Load before changing timetable teachers.`, row.teacherId, assignedName);
    }
}
async function syncTimetableTeachersForAssignment(classId, subjectId, teacherId, manager) {
    const timetableRepo = manager
        ? manager.getRepository(entities_1.Timetable)
        : data_source_1.AppDataSource.getRepository(entities_1.Timetable);
    const allocationRepo = manager
        ? manager.getRepository(entities_1.TeacherAllocation)
        : data_source_1.AppDataSource.getRepository(entities_1.TeacherAllocation);
    await timetableRepo
        .createQueryBuilder()
        .update(entities_1.Timetable)
        .set({ teacherId })
        .where('"classId" = :classId AND "subjectId" = :subjectId AND ("teacherId" IS NULL OR "teacherId" <> :teacherId)', {
        classId,
        subjectId,
        teacherId,
    })
        .execute();
    await allocationRepo
        .createQueryBuilder()
        .update(entities_1.TeacherAllocation)
        .set({ teacherId })
        .where('"classId" = :classId AND "subjectId" = :subjectId AND "teacherId" <> :teacherId', {
        classId,
        subjectId,
        teacherId,
    })
        .execute();
}
async function listClassSubjectTeachers(classId) {
    const rows = await data_source_1.AppDataSource.getRepository(entities_1.ClassSubject).find({
        where: { classId },
        relations: (0, typeorm_helpers_1.relations)('subject', 'teacher', 'teacher.user'),
        order: { subject: { name: 'ASC' } },
    });
    return rows.map((row) => ({
        id: row.id,
        classId: row.classId,
        subjectId: row.subjectId,
        teacherId: row.teacherId || null,
        weeklyPeriods: row.weeklyPeriods,
        lessonLength: row.lessonLength,
        subject: row.subject
            ? { id: row.subject.id, code: row.subject.code, name: row.subject.name, short: row.subject.short }
            : null,
        teacher: row.teacher
            ? {
                id: row.teacher.id,
                employeeNumber: row.teacher.employeeNumber,
                firstName: row.teacher.user?.firstName || '',
                lastName: row.teacher.user?.lastName || '',
            }
            : null,
    }));
}
