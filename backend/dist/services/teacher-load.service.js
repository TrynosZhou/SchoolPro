"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.lessonLengthMultiplier = lessonLengthMultiplier;
exports.normalizeLessonLength = normalizeLessonLength;
exports.effectiveWeeklyPeriods = effectiveWeeklyPeriods;
exports.getTeacherLoadReport = getTeacherLoadReport;
exports.calculateTeacherWeeklyLoadTotals = calculateTeacherWeeklyLoadTotals;
exports.addTeacherLoadAssignment = addTeacherLoadAssignment;
exports.removeTeacherLoadClassAssignments = removeTeacherLoadClassAssignments;
exports.removeTeacherLoadAssignment = removeTeacherLoadAssignment;
const typeorm_1 = require("typeorm");
const data_source_1 = require("../config/data-source");
const entities_1 = require("../entities");
const enums_1 = require("../entities/enums");
const typeorm_helpers_1 = require("../utils/typeorm-helpers");
const class_subject_teacher_service_1 = require("./class-subject-teacher.service");
function lessonLengthMultiplier(lessonLength) {
    switch (lessonLength) {
        case enums_1.LessonLength.DOUBLE:
            return 2;
        case enums_1.LessonLength.TRIPLE:
            return 3;
        default:
            return 1;
    }
}
function normalizeLessonLength(value) {
    if (value === enums_1.LessonLength.DOUBLE)
        return enums_1.LessonLength.DOUBLE;
    if (value === enums_1.LessonLength.TRIPLE)
        return enums_1.LessonLength.TRIPLE;
    return enums_1.LessonLength.SINGLE;
}
function effectiveWeeklyPeriods(weeklyPeriods, lessonLength) {
    const count = Math.max(0, Math.round(Number(weeklyPeriods) || 0));
    return count * lessonLengthMultiplier(lessonLength);
}
async function countTimetablePeriods(teacherId, classId, subjectId) {
    return data_source_1.AppDataSource.getRepository(entities_1.Timetable).count({
        where: { teacherId, classId, subjectId },
    });
}
async function countAllocationPeriods(teacherId, classId, subjectId) {
    try {
        const rows = await data_source_1.AppDataSource.query(`SELECT COUNT(*)::int AS count FROM teacher_allocations
       WHERE "teacherId" = $1 AND "classId" = $2 AND "subjectId" = $3`, [teacherId, classId, subjectId]);
        return Number(rows[0]?.count || 0);
    }
    catch {
        return 0;
    }
}
function resolvePeriods(weeklyPeriods, lessonLength, timetablePeriods) {
    const planned = effectiveWeeklyPeriods(weeklyPeriods, lessonLength);
    if (planned > 0)
        return planned;
    return timetablePeriods;
}
function emptyTeacherEntry(staff) {
    const user = staff.user;
    return {
        teacherId: staff.id,
        employeeNumber: staff.employeeNumber,
        firstName: user?.firstName || '',
        lastName: user?.lastName || '',
        classes: [],
        totalLoad: 0,
    };
}
/** Roles that may appear on the Teacher Load tab and receive class assignments. */
const TEACHING_STAFF_ROLES = [
    enums_1.UserRole.TEACHER,
    enums_1.UserRole.PRINCIPAL,
    enums_1.UserRole.ADMIN,
];
function canReceiveTeacherLoad(staff) {
    const role = staff.user?.role;
    return Boolean(staff.isActive &&
        staff.user?.isActive !== false &&
        role &&
        TEACHING_STAFF_ROLES.includes(role));
}
async function loadStaffForAssignment(teacherId) {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.Staff);
    let staff = await repo
        .createQueryBuilder('s')
        .innerJoinAndSelect('s.user', 'u')
        .where('s.id = :id', { id: teacherId })
        .getOne();
    if (!staff) {
        staff = await repo
            .createQueryBuilder('s')
            .innerJoinAndSelect('s.user', 'u')
            .where('s.userId = :userId', { userId: teacherId })
            .getOne();
    }
    if (!staff) {
        throw new Error('Staff member not found.');
    }
    if (!staff.isActive) {
        throw new Error('This staff member is inactive. Reactivate them before assigning lessons.');
    }
    if (staff.user && !staff.user.isActive) {
        throw new Error('This staff member\'s portal account is inactive. Reactivate them before assigning lessons.');
    }
    if (!canReceiveTeacherLoad(staff)) {
        const name = `${staff.user?.firstName || ''} ${staff.user?.lastName || ''}`.trim() || 'Staff';
        throw new Error(`${name} cannot be assigned lessons (portal role must be teacher, principal, or admin).`);
    }
    return staff;
}
async function getTeacherLoadReport() {
    const staffRepo = data_source_1.AppDataSource.getRepository(entities_1.Staff);
    const csRepo = data_source_1.AppDataSource.getRepository(entities_1.ClassSubject);
    const activeTeachers = await staffRepo
        .createQueryBuilder('s')
        .innerJoinAndSelect('s.user', 'u')
        .andWhere('s.isActive = :active', { active: true })
        .andWhere('u.isActive = :userActive', { userActive: true })
        .andWhere('u.role IN (:...roles)', { roles: TEACHING_STAFF_ROLES })
        .orderBy('u.lastName', 'ASC')
        .addOrderBy('u.firstName', 'ASC')
        .getMany();
    const assignedRows = await csRepo.find({
        where: { teacherId: (0, typeorm_1.Not)((0, typeorm_1.IsNull)()) },
        relations: (0, typeorm_helpers_1.relations)('teacher', 'teacher.user', 'schoolClass', 'subject'),
        order: { schoolClass: { name: 'ASC' }, subject: { name: 'ASC' } },
    });
    const byTeacher = new Map();
    for (const staff of activeTeachers) {
        byTeacher.set(staff.id, emptyTeacherEntry(staff));
    }
    const classMap = new Map();
    for (const cs of assignedRows) {
        const teacherId = cs.teacherId;
        let teacherEntry = byTeacher.get(teacherId);
        if (!teacherEntry && cs.teacher) {
            teacherEntry = emptyTeacherEntry(cs.teacher);
            byTeacher.set(teacherId, teacherEntry);
        }
        if (!teacherEntry)
            continue;
        const classId = cs.classId;
        const className = cs.schoolClass?.name || 'Class';
        const weeklyPeriods = Number(cs.weeklyPeriods || 0);
        const lessonLength = normalizeLessonLength(cs.lessonLength);
        const timetablePeriods = Math.max(await countAllocationPeriods(teacherId, classId, cs.subjectId), await countTimetablePeriods(teacherId, classId, cs.subjectId));
        const periods = resolvePeriods(weeklyPeriods, lessonLength, timetablePeriods);
        if (!classMap.has(teacherId))
            classMap.set(teacherId, new Map());
        const teacherClasses = classMap.get(teacherId);
        if (!teacherClasses.has(classId)) {
            teacherClasses.set(classId, { classId, className, subjects: [], classLoad: 0 });
        }
        const classGroup = teacherClasses.get(classId);
        classGroup.subjects.push({
            classSubjectId: cs.id,
            classId,
            className,
            subjectId: cs.subjectId,
            subjectName: cs.subject?.name || 'Subject',
            subjectCode: cs.subject?.code || null,
            weeklyPeriods,
            lessonLength,
            periods,
            timetablePeriods,
        });
        classGroup.classLoad += periods;
        teacherEntry.totalLoad += periods;
    }
    for (const [teacherId, teacher] of byTeacher) {
        const groups = classMap.get(teacherId);
        teacher.classes = groups ? [...groups.values()] : [];
    }
    const result = [...byTeacher.values()].sort((a, b) => {
        const nameA = `${a.lastName} ${a.firstName}`.toLowerCase();
        const nameB = `${b.lastName} ${b.firstName}`.toLowerCase();
        return nameA.localeCompare(nameB);
    });
    const teachersWithAssignments = result.filter((t) => t.classes.length > 0).length;
    const teachersWithTimetableLoad = result.filter((t) => t.totalLoad > 0).length;
    const totalPeriods = result.reduce((sum, t) => sum + t.totalLoad, 0);
    return {
        teachers: result,
        summary: {
            teacherCount: result.length,
            teachersWithAssignments,
            teachersWithTimetableLoad,
            totalPeriods,
        },
    };
}
/** Planned weekly load for one teacher — matches Staff → Teacher Load totals. */
async function calculateTeacherWeeklyLoadTotals(teacherId) {
    const rows = await data_source_1.AppDataSource.getRepository(entities_1.ClassSubject).find({
        where: { teacherId },
    });
    let totalLoad = 0;
    for (const cs of rows) {
        const weeklyPeriods = Number(cs.weeklyPeriods || 0);
        const lessonLength = normalizeLessonLength(cs.lessonLength);
        const timetablePeriods = Math.max(await countAllocationPeriods(teacherId, cs.classId, cs.subjectId), await countTimetablePeriods(teacherId, cs.classId, cs.subjectId));
        totalLoad += resolvePeriods(weeklyPeriods, lessonLength, timetablePeriods);
    }
    return { totalLoad, assignmentCount: rows.length };
}
async function addTeacherLoadAssignment(input) {
    const { classId, subjectId, forceReassign } = input;
    const weeklyPeriods = Math.max(1, Math.round(Number(input.weeklyPeriods) || 0));
    const lessonLength = normalizeLessonLength(input.lessonLength);
    const staff = await loadStaffForAssignment(input.teacherId);
    const teacherId = staff.id;
    const repo = data_source_1.AppDataSource.getRepository(entities_1.ClassSubject);
    let row = await (0, class_subject_teacher_service_1.assertCanAssignTeacherToClassSubject)({
        classId,
        subjectId,
        teacherId,
        forceReassign,
    });
    if (!row) {
        row = repo.create({ classId, subjectId, teacherId, weeklyPeriods, lessonLength });
    }
    else {
        row.teacherId = teacherId;
        row.weeklyPeriods = weeklyPeriods;
        row.lessonLength = lessonLength;
    }
    const saved = await repo.save(row);
    await (0, class_subject_teacher_service_1.syncTimetableTeachersForAssignment)(classId, subjectId, teacherId);
    const report = await getTeacherLoadReport();
    return { assignment: saved, report };
}
async function removeTeacherLoadClassAssignments(teacherId, classId) {
    if (!teacherId || !classId) {
        throw new Error('teacherId and classId are required.');
    }
    await data_source_1.AppDataSource.getRepository(entities_1.ClassSubject)
        .createQueryBuilder()
        .update(entities_1.ClassSubject)
        .set({ teacherId: null, weeklyPeriods: 0, lessonLength: enums_1.LessonLength.SINGLE })
        .where('"teacherId" = :teacherId AND "classId" = :classId', { teacherId, classId })
        .execute();
    return getTeacherLoadReport();
}
async function removeTeacherLoadAssignment(classSubjectId) {
    if (!classSubjectId) {
        throw new Error('classSubjectId is required.');
    }
    const repo = data_source_1.AppDataSource.getRepository(entities_1.ClassSubject);
    const row = await repo.findOne({ where: { id: classSubjectId } });
    if (!row) {
        throw new Error('Assignment not found.');
    }
    await repo
        .createQueryBuilder()
        .update(entities_1.ClassSubject)
        .set({ teacherId: null, weeklyPeriods: 0, lessonLength: enums_1.LessonLength.SINGLE })
        .where('id = :id', { id: classSubjectId })
        .execute();
    return getTeacherLoadReport();
}
