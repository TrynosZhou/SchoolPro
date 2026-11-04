"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.effectiveWeeklyPeriods = exports.lessonLengthMultiplier = exports.TeacherAssignmentConflictError = void 0;
exports.listTeacherAssignments = listTeacherAssignments;
exports.resetTeacherAssignments = resetTeacherAssignments;
exports.resetAllTeacherAssignments = resetAllTeacherAssignments;
exports.repairDuplicateTeacherClassAssignments = repairDuplicateTeacherClassAssignments;
exports.createTeacherAssignment = createTeacherAssignment;
exports.bulkCreateTeacherAssignments = bulkCreateTeacherAssignments;
exports.updateTeacherAssignment = updateTeacherAssignment;
exports.endTeacherAssignment = endTeacherAssignment;
exports.calculateTeacherWeeklyLoad = calculateTeacherWeeklyLoad;
exports.syncSubjectAssignmentsFromClassSubjects = syncSubjectAssignmentsFromClassSubjects;
exports.syncSubjectAssignmentFromClassSubjectId = syncSubjectAssignmentFromClassSubjectId;
exports.endSubjectTeacherAssignmentsForTeacherClass = endSubjectTeacherAssignmentsForTeacherClass;
exports.getWorkloadSummaryReport = getWorkloadSummaryReport;
exports.getClassRoster = getClassRoster;
exports.syncTimetableSlotsFromGenerated = syncTimetableSlotsFromGenerated;
exports.getTeacherWeeklySchedule = getTeacherWeeklySchedule;
exports.createTimetableSlot = createTimetableSlot;
exports.updateTimetableSlot = updateTimetableSlot;
exports.deleteTimetableSlot = deleteTimetableSlot;
exports.listSections = listSections;
const typeorm_1 = require("typeorm");
const data_source_1 = require("../config/data-source");
const entities_1 = require("../entities");
const enums_1 = require("../entities/enums");
const class_subject_teacher_service_1 = require("./class-subject-teacher.service");
const timetable_conflict_service_1 = require("./timetable-conflict.service");
const teacher_load_service_1 = require("./teacher-load.service");
Object.defineProperty(exports, "effectiveWeeklyPeriods", { enumerable: true, get: function () { return teacher_load_service_1.effectiveWeeklyPeriods; } });
Object.defineProperty(exports, "lessonLengthMultiplier", { enumerable: true, get: function () { return teacher_load_service_1.lessonLengthMultiplier; } });
const timetable_day_1 = require("../utils/timetable-day");
const typeorm_helpers_1 = require("../utils/typeorm-helpers");
class TeacherAssignmentConflictError extends Error {
    constructor(message) {
        super(message);
        this.statusCode = 409;
        this.name = 'TeacherAssignmentConflictError';
    }
}
exports.TeacherAssignmentConflictError = TeacherAssignmentConflictError;
const TEACHING_ROLES = [enums_1.UserRole.TEACHER, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.ADMIN];
async function loadThresholdsForTeacher(teacherId) {
    const settings = await data_source_1.AppDataSource.getRepository(entities_1.SchoolSettings).findOne({
        where: { id: 'default' },
    });
    const staff = await data_source_1.AppDataSource.getRepository(entities_1.Staff).findOne({ where: { id: teacherId } });
    const staffMax = staff?.maxWeeklyPeriods;
    const settingsMax = settings?.maxWeeklyPeriods;
    const resolvedMax = staffMax != null && staffMax > 0
        ? staffMax
        : settingsMax != null && settingsMax > 0
            ? settingsMax
            : null;
    return {
        minWeeklyPeriods: settings?.minWeeklyPeriods ?? 0,
        maxWeeklyPeriods: resolvedMax,
    };
}
async function assertTeachingStaff(teacherId) {
    const staff = await data_source_1.AppDataSource.getRepository(entities_1.Staff)
        .createQueryBuilder('s')
        .innerJoinAndSelect('s.user', 'u')
        .where('s.id = :id', { id: teacherId })
        .getOne();
    if (!staff?.isActive || !staff.user?.isActive) {
        throw new Error('Teacher must be an active staff member');
    }
    if (!TEACHING_ROLES.includes(staff.user.role)) {
        throw new Error('Only teaching staff can receive class/subject assignments');
    }
    return staff;
}
async function resolveSectionId(classId, sectionId) {
    if (sectionId)
        return sectionId;
    const cls = await data_source_1.AppDataSource.getRepository(entities_1.SchoolClass).findOne({ where: { id: classId } });
    return cls?.sectionId ?? null;
}
async function syncLegacyAssignmentRow(assignment) {
    if (!assignment.isActive || assignment.endDate)
        return;
    if (assignment.role === enums_1.TeacherAssignmentRole.CLASS_TEACHER) {
        await data_source_1.AppDataSource.getRepository(entities_1.SchoolClass).update(assignment.classId, {
            classTeacherId: assignment.teacherId,
        });
        return;
    }
    if (assignment.role === enums_1.TeacherAssignmentRole.SUBJECT_TEACHER && assignment.subjectId) {
        const repo = data_source_1.AppDataSource.getRepository(entities_1.ClassSubject);
        let row = await repo.findOne({
            where: { classId: assignment.classId, subjectId: assignment.subjectId },
        });
        if (!row) {
            row = repo.create({
                classId: assignment.classId,
                subjectId: assignment.subjectId,
                teacherId: assignment.teacherId,
                weeklyPeriods: assignment.weeklyPeriods,
                lessonLength: assignment.lessonLength,
            });
        }
        else {
            row.teacherId = assignment.teacherId;
            row.weeklyPeriods = assignment.weeklyPeriods;
            row.lessonLength = assignment.lessonLength;
        }
        await repo.save(row);
        await (0, class_subject_teacher_service_1.syncTimetableTeachersForAssignment)(assignment.classId, assignment.subjectId, assignment.teacherId);
    }
}
/** Remove Staff → Teacher Load links when an assignment is ended/deleted. */
async function unlinkLegacyAssignmentOnEnd(assignment, manager) {
    const classRepo = manager
        ? manager.getRepository(entities_1.SchoolClass)
        : data_source_1.AppDataSource.getRepository(entities_1.SchoolClass);
    const csRepo = manager
        ? manager.getRepository(entities_1.ClassSubject)
        : data_source_1.AppDataSource.getRepository(entities_1.ClassSubject);
    if (assignment.role === enums_1.TeacherAssignmentRole.CLASS_TEACHER) {
        const cls = await classRepo.findOne({ where: { id: assignment.classId } });
        if (cls?.classTeacherId === assignment.teacherId) {
            await classRepo.update(assignment.classId, { classTeacherId: null });
        }
        return;
    }
    if (assignment.role === enums_1.TeacherAssignmentRole.SUBJECT_TEACHER) {
        await csRepo
            .createQueryBuilder()
            .update(entities_1.ClassSubject)
            .set({ teacherId: null, weeklyPeriods: 0, lessonLength: enums_1.LessonLength.SINGLE })
            .where('"teacherId" = :teacherId AND "classId" = :classId', {
            teacherId: assignment.teacherId,
            classId: assignment.classId,
        })
            .execute();
    }
}
/** Drop generated timetable links for one assignment (slots, allocations, class-grid entries). */
async function clearTimetableForAssignment(assignment, manager) {
    const slotRepo = manager.getRepository(entities_1.TimetableSlot);
    const timetableRepo = manager.getRepository(entities_1.Timetable);
    const allocationRepo = manager.getRepository(entities_1.TeacherAllocation);
    const { teacherId, classId, subjectId } = assignment;
    await slotRepo.delete({ teacherAssignmentId: assignment.id });
    if (assignment.role === enums_1.TeacherAssignmentRole.SUBJECT_TEACHER && subjectId) {
        await allocationRepo.delete({ teacherId, classId, subjectId });
        await timetableRepo.delete({ classId, subjectId });
        return;
    }
    await allocationRepo.delete({ teacherId, classId });
    await timetableRepo.delete({ classId, teacherId });
}
/** Remove all timetable data tied to one teacher. */
async function clearTimetableForTeacher(teacherId, manager, assignments) {
    const timetableRepo = manager.getRepository(entities_1.Timetable);
    const allocationRepo = manager.getRepository(entities_1.TeacherAllocation);
    const slotRepo = manager.getRepository(entities_1.TimetableSlot);
    const assignmentRepo = manager.getRepository(entities_1.TeacherAssignment);
    await allocationRepo.delete({ teacherId });
    await timetableRepo.delete({ teacherId });
    const rows = assignments?.length
        ? assignments
        : await assignmentRepo.find({ where: { teacherId } });
    const clearedClassSubjects = new Set();
    for (const assignment of rows) {
        if (assignment.role === enums_1.TeacherAssignmentRole.SUBJECT_TEACHER && assignment.subjectId) {
            const key = `${assignment.classId}:${assignment.subjectId}`;
            if (clearedClassSubjects.has(key))
                continue;
            clearedClassSubjects.add(key);
            await timetableRepo.delete({ classId: assignment.classId, subjectId: assignment.subjectId });
            continue;
        }
        if (assignment.role === enums_1.TeacherAssignmentRole.CLASS_TEACHER) {
            await timetableRepo.delete({ classId: assignment.classId, teacherId: assignment.teacherId });
        }
    }
    const teacherAssignments = await assignmentRepo.find({
        where: { teacherId },
        select: { id: true },
    });
    const assignmentIds = teacherAssignments.map((row) => row.id);
    if (assignmentIds.length) {
        await slotRepo.delete({ teacherAssignmentId: (0, typeorm_1.In)(assignmentIds) });
    }
}
/** Remove all class timetable grids school-wide (used when resetting all assignments). */
async function clearAllTimetableData(manager) {
    await manager.getRepository(entities_1.TimetableSlot).createQueryBuilder().delete().from(entities_1.TimetableSlot).execute();
    await manager.getRepository(entities_1.TeacherAllocation).createQueryBuilder().delete().from(entities_1.TeacherAllocation).execute();
    await manager.getRepository(entities_1.Timetable).createQueryBuilder().delete().from(entities_1.Timetable).execute();
}
async function endConflictingAssignments(input) {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.TeacherAssignment);
    const qb = repo
        .createQueryBuilder('a')
        .where('a.classId = :classId', { classId: input.classId })
        .andWhere('a.role = :role', { role: input.role })
        .andWhere('a.isActive = true')
        .andWhere('a.endDate IS NULL');
    if (input.role === enums_1.TeacherAssignmentRole.SUBJECT_TEACHER && input.subjectId) {
        qb.andWhere('a.subjectId = :subjectId', { subjectId: input.subjectId });
    }
    if (input.excludeId) {
        qb.andWhere('a.id != :excludeId', { excludeId: input.excludeId });
    }
    const rows = await qb.getMany();
    for (const row of rows) {
        row.isActive = false;
        row.endDate = input.endDate;
        await repo.save(row);
    }
}
function workloadStatus(total, thresholds) {
    if (total < thresholds.minWeeklyPeriods)
        return 'underload';
    if (thresholds.maxWeeklyPeriods != null && total > thresholds.maxWeeklyPeriods)
        return 'overload';
    return 'balanced';
}
async function listTeacherAssignments(filters) {
    if (filters.syncFromTeacherLoad !== false) {
        await syncSubjectAssignmentsFromClassSubjects();
        await repairDuplicateTeacherClassAssignments();
    }
    const repo = data_source_1.AppDataSource.getRepository(entities_1.TeacherAssignment);
    const where = {};
    if (filters.teacherId)
        where.teacherId = filters.teacherId;
    if (filters.classId)
        where.classId = filters.classId;
    if (filters.sectionId)
        where.sectionId = filters.sectionId;
    if (filters.activeOnly !== false) {
        where.isActive = true;
        where.endDate = (0, typeorm_1.IsNull)();
    }
    return repo.find({
        where,
        relations: (0, typeorm_helpers_1.relations)('teacher', 'teacher.user', 'schoolClass', 'schoolClass.form', 'section', 'subject'),
        order: { startDate: 'DESC', createdAt: 'DESC' },
    }).then((rows) => annotateLoadSyncFlags(rows));
}
/** Flag assignments whose load differs from Staff → Teacher Load (class_subjects). */
async function annotateLoadSyncFlags(assignments) {
    const csRepo = data_source_1.AppDataSource.getRepository(entities_1.ClassSubject);
    for (const assignment of assignments) {
        if (assignment.role !== enums_1.TeacherAssignmentRole.SUBJECT_TEACHER || !assignment.subjectId) {
            assignment.loadOutOfSync = false;
            continue;
        }
        const cs = await csRepo.findOne({
            where: {
                teacherId: assignment.teacherId,
                classId: assignment.classId,
                subjectId: assignment.subjectId,
            },
        });
        if (!cs?.teacherId) {
            assignment.loadOutOfSync = true;
            continue;
        }
        assignment.loadOutOfSync =
            Math.round(Number(cs.weeklyPeriods) || 0) !== Math.round(Number(assignment.weeklyPeriods) || 0) ||
                (0, teacher_load_service_1.normalizeLessonLength)(cs.lessonLength) !== (0, teacher_load_service_1.normalizeLessonLength)(assignment.lessonLength);
    }
    return assignments;
}
async function endAssignmentsWithIntegrity(rows, endDate, manager, options) {
    if (!rows.length)
        return;
    const assignmentRepo = manager.getRepository(entities_1.TeacherAssignment);
    const classRepo = manager.getRepository(entities_1.SchoolClass);
    const csRepo = manager.getRepository(entities_1.ClassSubject);
    if (!options?.skipTimetableCleanup) {
        for (const assignment of rows) {
            await clearTimetableForAssignment(assignment, manager);
        }
    }
    for (const assignment of rows) {
        assignment.isActive = false;
        assignment.endDate = endDate;
        await assignmentRepo.save(assignment);
        if (assignment.role === enums_1.TeacherAssignmentRole.CLASS_TEACHER) {
            const cls = await classRepo.findOne({ where: { id: assignment.classId } });
            if (cls?.classTeacherId === assignment.teacherId) {
                await classRepo.update(assignment.classId, { classTeacherId: null });
            }
            continue;
        }
        if (assignment.role === enums_1.TeacherAssignmentRole.SUBJECT_TEACHER) {
            await csRepo
                .createQueryBuilder()
                .update(entities_1.ClassSubject)
                .set({ teacherId: null, weeklyPeriods: 0, lessonLength: enums_1.LessonLength.SINGLE })
                .where('"teacherId" = :teacherId AND "classId" = :classId', {
                teacherId: assignment.teacherId,
                classId: assignment.classId,
            })
                .execute();
        }
    }
}
async function resetTeacherAssignments(teacherId) {
    await assertTeachingStaff(teacherId);
    const rows = await listTeacherAssignments({ teacherId, activeOnly: true, syncFromTeacherLoad: false });
    const endDate = new Date().toISOString().split('T')[0];
    await data_source_1.AppDataSource.transaction(async (manager) => {
        await clearTimetableForTeacher(teacherId, manager, rows);
        if (rows.length) {
            await endAssignmentsWithIntegrity(rows, endDate, manager, { skipTimetableCleanup: true });
        }
    });
    return { ended: rows.length };
}
async function resetAllTeacherAssignments() {
    const rows = await listTeacherAssignments({ activeOnly: true, syncFromTeacherLoad: false });
    const endDate = new Date().toISOString().split('T')[0];
    await data_source_1.AppDataSource.transaction(async (manager) => {
        await clearAllTimetableData(manager);
        if (rows.length) {
            await endAssignmentsWithIntegrity(rows, endDate, manager, { skipTimetableCleanup: true });
        }
    });
    return { ended: rows.length };
}
/** End older rows when multiple active assignments exist for the same teacher + class. */
async function repairDuplicateTeacherClassAssignments() {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.TeacherAssignment);
    const active = await repo.find({
        where: { isActive: true, endDate: (0, typeorm_1.IsNull)() },
        order: { createdAt: 'DESC', id: 'DESC' },
    });
    const seen = new Set();
    const endDate = new Date().toISOString().split('T')[0];
    let repaired = 0;
    for (const row of active) {
        const key = `${row.teacherId}:${row.classId}`;
        if (seen.has(key)) {
            row.isActive = false;
            row.endDate = endDate;
            await repo.save(row);
            repaired += 1;
        }
        else {
            seen.add(key);
        }
    }
    return repaired;
}
async function assertTeacherNotAlreadyAssignedToClass(teacherId, classId, excludeAssignmentId) {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.TeacherAssignment);
    const existing = await repo.findOne({
        where: {
            teacherId,
            classId,
            isActive: true,
            endDate: (0, typeorm_1.IsNull)(),
        },
        relations: (0, typeorm_helpers_1.relations)('schoolClass', 'schoolClass.form', 'teacher', 'teacher.user'),
    });
    if (!existing || existing.id === excludeAssignmentId)
        return;
    const teacherName = existing.teacher?.user
        ? `${existing.teacher.user.firstName} ${existing.teacher.user.lastName}`.trim()
        : 'This teacher';
    const className = existing.schoolClass?.name || 'this class';
    throw new TeacherAssignmentConflictError(`${teacherName} is already assigned to ${className}. Each teacher can only be linked to a class once.`);
}
function assertNoDuplicateTeacherClassInBatch(assignments) {
    const seen = new Set();
    for (const row of assignments) {
        const key = `${row.teacherId}:${row.classId}`;
        if (seen.has(key)) {
            throw new TeacherAssignmentConflictError('Duplicate class in this batch: the same teacher cannot be assigned to the same class more than once.');
        }
        seen.add(key);
    }
}
async function createTeacherAssignment(dto) {
    await assertTeachingStaff(dto.teacherId);
    if (dto.role === enums_1.TeacherAssignmentRole.CLASS_TEACHER && dto.subjectId) {
        throw new Error('Class teacher assignments must not include a subject');
    }
    if (dto.role === enums_1.TeacherAssignmentRole.SUBJECT_TEACHER && !dto.subjectId) {
        throw new Error('Subject teacher assignments require a subject');
    }
    await assertTeacherNotAlreadyAssignedToClass(dto.teacherId, dto.classId);
    if (dto.role === enums_1.TeacherAssignmentRole.SUBJECT_TEACHER && dto.subjectId && !dto.isSharedSplit) {
        await (0, class_subject_teacher_service_1.assertCanAssignTeacherToClassSubject)({
            classId: dto.classId,
            subjectId: dto.subjectId,
            teacherId: dto.teacherId,
            forceReassign: dto.forceReassign,
        });
    }
    if (dto.role === enums_1.TeacherAssignmentRole.CLASS_TEACHER) {
        const existing = await data_source_1.AppDataSource.getRepository(entities_1.TeacherAssignment).findOne({
            where: {
                classId: dto.classId,
                role: enums_1.TeacherAssignmentRole.CLASS_TEACHER,
                isActive: true,
                endDate: (0, typeorm_1.IsNull)(),
            },
        });
        if (existing && existing.teacherId !== dto.teacherId && !dto.forceReassign) {
            throw new TeacherAssignmentConflictError('This class already has an active class teacher. Use forceReassign to transfer.');
        }
    }
    const startDate = dto.startDate || new Date().toISOString().split('T')[0];
    if (dto.forceReassign) {
        await endConflictingAssignments({
            classId: dto.classId,
            subjectId: dto.subjectId,
            role: dto.role,
            endDate: startDate,
        });
    }
    const repo = data_source_1.AppDataSource.getRepository(entities_1.TeacherAssignment);
    const assignment = repo.create({
        teacherId: dto.teacherId,
        classId: dto.classId,
        sectionId: await resolveSectionId(dto.classId, dto.sectionId),
        subjectId: dto.role === enums_1.TeacherAssignmentRole.SUBJECT_TEACHER ? dto.subjectId : null,
        role: dto.role,
        startDate,
        isActive: true,
        weeklyPeriods: dto.weeklyPeriods ?? 0,
        lessonLength: (0, teacher_load_service_1.normalizeLessonLength)(dto.lessonLength),
        isSharedSplit: dto.isSharedSplit ?? false,
        notes: dto.notes,
    });
    const saved = await repo.save(assignment);
    await syncLegacyAssignmentRow(saved);
    return repo.findOneOrFail({
        where: { id: saved.id },
        relations: (0, typeorm_helpers_1.relations)('teacher', 'teacher.user', 'schoolClass', 'section', 'subject'),
    });
}
async function bulkCreateTeacherAssignments(dto) {
    assertNoDuplicateTeacherClassInBatch(dto.assignments);
    for (const row of dto.assignments) {
        await assertTeacherNotAlreadyAssignedToClass(row.teacherId, row.classId);
    }
    const created = [];
    for (const row of dto.assignments) {
        const assignment = await createTeacherAssignment({ ...row, forceReassign: dto.forceReassign });
        created.push(assignment);
    }
    return created;
}
async function updateTeacherAssignment(id, dto) {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.TeacherAssignment);
    const assignment = await repo.findOne({ where: { id } });
    if (!assignment)
        throw new Error('Assignment not found');
    if (dto.teacherId && dto.teacherId !== assignment.teacherId) {
        await assertTeachingStaff(dto.teacherId);
        await assertTeacherNotAlreadyAssignedToClass(dto.teacherId, assignment.classId, assignment.id);
        if (dto.forceReassign && assignment.role === enums_1.TeacherAssignmentRole.SUBJECT_TEACHER && assignment.subjectId) {
            await (0, class_subject_teacher_service_1.assertCanAssignTeacherToClassSubject)({
                classId: assignment.classId,
                subjectId: assignment.subjectId,
                teacherId: dto.teacherId,
                forceReassign: true,
            });
        }
        assignment.teacherId = dto.teacherId;
    }
    const previousSubjectId = assignment.subjectId;
    if (dto.subjectId !== undefined && dto.subjectId !== assignment.subjectId) {
        if (assignment.role !== enums_1.TeacherAssignmentRole.SUBJECT_TEACHER) {
            throw new Error('Only subject teacher assignments can change subject');
        }
        if (!dto.subjectId) {
            throw new Error('Subject is required for subject teacher assignments');
        }
        await (0, class_subject_teacher_service_1.assertCanAssignTeacherToClassSubject)({
            classId: assignment.classId,
            subjectId: dto.subjectId,
            teacherId: assignment.teacherId,
            forceReassign: dto.forceReassign,
        });
        assignment.subjectId = dto.subjectId;
    }
    if (dto.weeklyPeriods !== undefined)
        assignment.weeklyPeriods = dto.weeklyPeriods;
    if (dto.lessonLength !== undefined)
        assignment.lessonLength = (0, teacher_load_service_1.normalizeLessonLength)(dto.lessonLength);
    if (dto.isSharedSplit !== undefined)
        assignment.isSharedSplit = dto.isSharedSplit;
    if (dto.notes !== undefined)
        assignment.notes = dto.notes;
    if (dto.endDate !== undefined)
        assignment.endDate = dto.endDate;
    if (dto.isActive !== undefined)
        assignment.isActive = dto.isActive;
    const saved = await repo.save(assignment);
    if (!saved.isActive || saved.endDate) {
        await data_source_1.AppDataSource.transaction(async (manager) => {
            await clearTimetableForAssignment(saved, manager);
            await unlinkLegacyAssignmentOnEnd(saved, manager);
        });
    }
    else {
        if (previousSubjectId &&
            saved.subjectId &&
            previousSubjectId !== saved.subjectId &&
            saved.role === enums_1.TeacherAssignmentRole.SUBJECT_TEACHER) {
            const csRepo = data_source_1.AppDataSource.getRepository(entities_1.ClassSubject);
            const oldRow = await csRepo.findOne({
                where: { classId: saved.classId, subjectId: previousSubjectId },
            });
            if (oldRow?.teacherId === saved.teacherId) {
                oldRow.teacherId = undefined;
                await csRepo.save(oldRow);
            }
        }
        await syncLegacyAssignmentRow(saved);
    }
    return repo.findOneOrFail({
        where: { id: saved.id },
        relations: (0, typeorm_helpers_1.relations)('teacher', 'teacher.user', 'schoolClass', 'section', 'subject'),
    });
}
async function endTeacherAssignment(id, endDate) {
    return updateTeacherAssignment(id, {
        isActive: false,
        endDate: endDate || new Date().toISOString().split('T')[0],
    });
}
async function calculateTeacherWeeklyLoad(teacherId) {
    const totals = await (0, teacher_load_service_1.calculateTeacherWeeklyLoadTotals)(teacherId);
    return totals.totalLoad;
}
async function upsertSubjectTeacherAssignmentFromClassSubject(cs) {
    if (!cs.teacherId)
        return;
    const repo = data_source_1.AppDataSource.getRepository(entities_1.TeacherAssignment);
    const sectionId = await resolveSectionId(cs.classId, null);
    const weeklyPeriods = Math.max(0, Math.round(Number(cs.weeklyPeriods) || 0));
    const lessonLength = (0, teacher_load_service_1.normalizeLessonLength)(cs.lessonLength);
    let assignment = await repo.findOne({
        where: {
            teacherId: cs.teacherId,
            classId: cs.classId,
            isActive: true,
            endDate: (0, typeorm_1.IsNull)(),
        },
    });
    if (!assignment) {
        assignment = repo.create({
            teacherId: cs.teacherId,
            classId: cs.classId,
            sectionId,
            subjectId: cs.subjectId,
            role: enums_1.TeacherAssignmentRole.SUBJECT_TEACHER,
            startDate: new Date().toISOString().split('T')[0],
            isActive: true,
            weeklyPeriods,
            lessonLength,
        });
    }
    else {
        assignment.subjectId = cs.subjectId;
        assignment.weeklyPeriods = weeklyPeriods;
        assignment.lessonLength = lessonLength;
        assignment.sectionId = sectionId;
        assignment.role = enums_1.TeacherAssignmentRole.SUBJECT_TEACHER;
        assignment.isActive = true;
        assignment.endDate = null;
    }
    await repo.save(assignment);
}
async function endSubjectTeacherAssignmentsForClassSubject(classId, subjectId, teacherId) {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.TeacherAssignment);
    const qb = repo
        .createQueryBuilder('a')
        .where('a.classId = :classId', { classId })
        .andWhere('a.subjectId = :subjectId', { subjectId })
        .andWhere('a.role = :role', { role: enums_1.TeacherAssignmentRole.SUBJECT_TEACHER })
        .andWhere('a.isActive = true')
        .andWhere('a.endDate IS NULL');
    if (teacherId) {
        qb.andWhere('a.teacherId = :teacherId', { teacherId });
    }
    const endDate = new Date().toISOString().split('T')[0];
    const rows = await qb.getMany();
    for (const row of rows) {
        row.isActive = false;
        row.endDate = endDate;
        await repo.save(row);
    }
}
/** Keep teacher_assignments aligned with Staff → Teacher Load (class_subjects). */
async function syncSubjectAssignmentsFromClassSubjects() {
    const classSubjects = await data_source_1.AppDataSource.getRepository(entities_1.ClassSubject).find({
        where: { teacherId: (0, typeorm_1.Not)((0, typeorm_1.IsNull)()) },
    });
    for (const cs of classSubjects) {
        await upsertSubjectTeacherAssignmentFromClassSubject(cs);
    }
    await repairDuplicateTeacherClassAssignments();
    return classSubjects.length;
}
async function syncSubjectAssignmentFromClassSubjectId(classSubjectId) {
    const cs = await data_source_1.AppDataSource.getRepository(entities_1.ClassSubject).findOne({ where: { id: classSubjectId } });
    if (!cs)
        return;
    if (cs.teacherId) {
        await upsertSubjectTeacherAssignmentFromClassSubject(cs);
        return;
    }
    await endSubjectTeacherAssignmentsForClassSubject(cs.classId, cs.subjectId);
}
async function endSubjectTeacherAssignmentsForTeacherClass(teacherId, classId) {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.TeacherAssignment);
    const rows = await repo.find({
        where: {
            teacherId,
            classId,
            role: enums_1.TeacherAssignmentRole.SUBJECT_TEACHER,
            isActive: true,
            endDate: (0, typeorm_1.IsNull)(),
        },
    });
    const endDate = new Date().toISOString().split('T')[0];
    for (const row of rows) {
        row.isActive = false;
        row.endDate = endDate;
        await repo.save(row);
    }
}
async function getWorkloadSummaryReport() {
    await syncSubjectAssignmentsFromClassSubjects();
    await repairDuplicateTeacherClassAssignments();
    const staff = await data_source_1.AppDataSource.getRepository(entities_1.Staff)
        .createQueryBuilder('s')
        .innerJoinAndSelect('s.user', 'u')
        .where('s.isActive = true')
        .andWhere('u.role IN (:...roles)', { roles: TEACHING_ROLES })
        .orderBy('u.lastName', 'ASC')
        .addOrderBy('u.firstName', 'ASC')
        .getMany();
    const rows = [];
    for (const s of staff) {
        const { totalLoad, assignmentCount } = await (0, teacher_load_service_1.calculateTeacherWeeklyLoadTotals)(s.id);
        const thresholds = await loadThresholdsForTeacher(s.id);
        rows.push({
            teacherId: s.id,
            employeeNumber: s.employeeNumber,
            teacherName: `${s.user.firstName} ${s.user.lastName}`.trim(),
            totalPeriods: totalLoad,
            minThreshold: thresholds.minWeeklyPeriods,
            maxThreshold: thresholds.maxWeeklyPeriods,
            status: workloadStatus(totalLoad, thresholds),
            assignmentCount,
        });
    }
    return rows;
}
async function getClassRoster(classId, sectionId) {
    const where = { classId, isActive: true, endDate: (0, typeorm_1.IsNull)() };
    if (sectionId)
        where.sectionId = sectionId;
    const assignments = await data_source_1.AppDataSource.getRepository(entities_1.TeacherAssignment).find({
        where,
        relations: (0, typeorm_helpers_1.relations)('teacher', 'teacher.user', 'subject', 'section', 'timetableSlots'),
        order: { role: 'ASC', createdAt: 'ASC' },
    });
    const cls = await data_source_1.AppDataSource.getRepository(entities_1.SchoolClass).findOne({
        where: { id: classId },
        relations: (0, typeorm_helpers_1.relations)('form', 'classTeacher', 'classTeacher.user'),
    });
    return { class: cls, assignments };
}
async function buildPeriodNumberLookup() {
    const rows = await data_source_1.AppDataSource.getRepository(entities_1.Timetable)
        .createQueryBuilder('t')
        .select('DISTINCT t.startTime', 'startTime')
        .orderBy('t.startTime', 'ASC')
        .getRawMany();
    const map = new Map();
    rows.forEach((row, index) => map.set(row.startTime, index + 1));
    return map;
}
/** Link generated `timetables` rows to `timetable_slots` on teacher assignments. */
async function syncTimetableSlotsFromGenerated(options) {
    const slotRepo = data_source_1.AppDataSource.getRepository(entities_1.TimetableSlot);
    const timetableRepo = data_source_1.AppDataSource.getRepository(entities_1.Timetable);
    const assignmentRepo = data_source_1.AppDataSource.getRepository(entities_1.TeacherAssignment);
    if (options?.replaceAll) {
        await slotRepo.createQueryBuilder().delete().execute();
    }
    const periodLookup = await buildPeriodNumberLookup();
    const rows = await timetableRepo.find({
        where: options?.teacherId ? { teacherId: options.teacherId } : { teacherId: (0, typeorm_1.Not)((0, typeorm_1.IsNull)()) },
        relations: (0, typeorm_helpers_1.relations)('schoolClass', 'subject'),
        order: { dayOfWeek: 'ASC', startTime: 'ASC' },
    });
    let created = 0;
    for (const row of rows) {
        if (!row.teacherId)
            continue;
        const existing = await slotRepo.findOne({ where: { timetableEntryId: row.id } });
        if (existing)
            continue;
        const assignment = await assignmentRepo.findOne({
            where: {
                teacherId: row.teacherId,
                classId: row.classId,
                subjectId: row.subjectId,
                role: enums_1.TeacherAssignmentRole.SUBJECT_TEACHER,
                isActive: true,
                endDate: (0, typeorm_1.IsNull)(),
            },
        });
        if (!assignment)
            continue;
        await slotRepo.save(slotRepo.create({
            teacherAssignmentId: assignment.id,
            dayOfWeek: (0, timetable_day_1.dayIntToEnum)(row.dayOfWeek),
            periodNumber: periodLookup.get(row.startTime) ?? 1,
            startTime: row.startTime,
            endTime: row.endTime,
            timetableEntryId: row.id,
        }));
        created += 1;
    }
    return created;
}
async function loadTeacherScheduleSlots(teacherId, assignmentIds) {
    if (!assignmentIds.length)
        return [];
    return data_source_1.AppDataSource.getRepository(entities_1.TimetableSlot).find({
        where: { teacherAssignmentId: (0, typeorm_1.In)(assignmentIds) },
        relations: (0, typeorm_helpers_1.relations)('assignment', 'assignment.schoolClass', 'assignment.subject'),
        order: { dayOfWeek: 'ASC', periodNumber: 'ASC' },
    });
}
async function getTeacherWeeklySchedule(teacherId) {
    const assignments = await listTeacherAssignments({ teacherId, activeOnly: true });
    const assignmentIds = assignments.map((a) => a.id);
    let slots = await loadTeacherScheduleSlots(teacherId, assignmentIds);
    const timetableRows = await data_source_1.AppDataSource.getRepository(entities_1.Timetable).find({
        where: { teacherId },
        relations: (0, typeorm_helpers_1.relations)('schoolClass', 'subject'),
        order: { dayOfWeek: 'ASC', startTime: 'ASC' },
    });
    if (!slots.length && timetableRows.length) {
        await syncTimetableSlotsFromGenerated({ teacherId });
        slots = await loadTeacherScheduleSlots(teacherId, assignmentIds);
    }
    return { assignments, slots, timetableRows };
}
const conflictService = new timetable_conflict_service_1.TimetableConflictService();
async function createTimetableSlot(dto) {
    const assignment = await data_source_1.AppDataSource.getRepository(entities_1.TeacherAssignment).findOne({
        where: { id: dto.teacherAssignmentId },
        relations: (0, typeorm_helpers_1.relations)('schoolClass', 'subject'),
    });
    if (!assignment || !assignment.isActive) {
        throw new Error('Active teacher assignment not found');
    }
    const conflict = await conflictService.checkTeacherConflict(assignment.teacherId, dto.dayOfWeek, dto.startTime, dto.endTime);
    if (conflict) {
        throw new TeacherAssignmentConflictError(conflictService.formatConflictMessage(conflict));
    }
    const repo = data_source_1.AppDataSource.getRepository(entities_1.TimetableSlot);
    const slot = repo.create({
        teacherAssignmentId: dto.teacherAssignmentId,
        dayOfWeek: dto.dayOfWeek,
        periodNumber: dto.periodNumber,
        startTime: dto.startTime,
        endTime: dto.endTime,
        timetableEntryId: dto.timetableEntryId ?? null,
    });
    return repo.save(slot);
}
async function updateTimetableSlot(id, dto) {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.TimetableSlot);
    const slot = await repo.findOne({
        where: { id },
        relations: (0, typeorm_helpers_1.relations)('assignment'),
    });
    if (!slot)
        throw new Error('Timetable slot not found');
    const dayOfWeek = dto.dayOfWeek ?? slot.dayOfWeek;
    const startTime = dto.startTime ?? slot.startTime;
    const endTime = dto.endTime ?? slot.endTime;
    const conflict = await conflictService.checkTeacherConflict(slot.assignment.teacherId, dayOfWeek, startTime, endTime);
    if (conflict) {
        throw new TeacherAssignmentConflictError(conflictService.formatConflictMessage(conflict));
    }
    Object.assign(slot, dto);
    return repo.save(slot);
}
async function deleteTimetableSlot(id) {
    await data_source_1.AppDataSource.getRepository(entities_1.TimetableSlot).delete(id);
}
async function listSections(formId) {
    const where = { isActive: true };
    if (formId)
        where.formId = formId;
    return data_source_1.AppDataSource.getRepository(entities_1.Section).find({ where, order: { name: 'ASC' } });
}
