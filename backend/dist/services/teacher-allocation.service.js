"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTeacherAllocation = createTeacherAllocation;
exports.updateTeacherAllocation = updateTeacherAllocation;
exports.deleteTeacherAllocation = deleteTeacherAllocation;
exports.getTeacherWeeklySchedule = getTeacherWeeklySchedule;
exports.getTeacherAvailability = getTeacherAvailability;
exports.parseDayOfWeekInput = parseDayOfWeekInput;
const data_source_1 = require("../config/data-source");
const entities_1 = require("../entities");
const enums_1 = require("../entities/enums");
const timetable_day_1 = require("../utils/timetable-day");
const typeorm_helpers_1 = require("../utils/typeorm-helpers");
const timetable_conflict_service_1 = require("./timetable-conflict.service");
const class_subject_teacher_service_1 = require("./class-subject-teacher.service");
function mapAllocation(row) {
    return {
        id: row.id,
        timetableEntryId: row.timetableEntryId,
        teacherId: row.teacherId,
        subjectId: row.subjectId,
        classId: row.classId,
        dayOfWeek: row.dayOfWeek,
        dayOfWeekInt: (0, timetable_day_1.dayEnumToInt)(row.dayOfWeek),
        startTime: row.startTime,
        endTime: row.endTime,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        teacher: row.teacher
            ? {
                id: row.teacher.id,
                user: row.teacher.user
                    ? { firstName: row.teacher.user.firstName, lastName: row.teacher.user.lastName }
                    : undefined,
            }
            : undefined,
        subject: row.subject
            ? { id: row.subject.id, name: row.subject.name, code: row.subject.code, short: row.subject.short }
            : undefined,
        schoolClass: row.schoolClass
            ? { id: row.schoolClass.id, name: row.schoolClass.name, form: row.schoolClass.form }
            : undefined,
        timetableEntry: row.timetableEntry
            ? {
                id: row.timetableEntry.id,
                room: row.timetableEntry.room,
            }
            : undefined,
    };
}
const allocationRelations = (0, typeorm_helpers_1.relations)('teacher', 'teacher.user', 'subject', 'schoolClass', 'schoolClass.form', 'timetableEntry');
async function createTeacherAllocation(input) {
    const timetableRepo = data_source_1.AppDataSource.getRepository(entities_1.Timetable);
    const allocationRepo = data_source_1.AppDataSource.getRepository(entities_1.TeacherAllocation);
    const entry = await timetableRepo.findOne({ where: { id: input.timetableEntryId } });
    if (!entry) {
        throw new Error('Timetable entry not found.');
    }
    await (0, class_subject_teacher_service_1.assertTimetableTeacherMatchesAssignment)(entry.classId, entry.subjectId, input.teacherId);
    const dayOfWeek = (0, timetable_day_1.dayIntToEnum)(entry.dayOfWeek);
    const conflict = await timetable_conflict_service_1.timetableConflictService.checkTeacherConflict(input.teacherId, dayOfWeek, entry.startTime, entry.endTime);
    if (conflict) {
        const err = new Error(timetable_conflict_service_1.timetableConflictService.formatConflictMessage(conflict));
        err.conflict = conflict;
        throw err;
    }
    const existing = await allocationRepo.findOne({ where: { timetableEntryId: entry.id } });
    if (existing) {
        throw new Error('This timetable slot already has a teacher allocation. Use update instead.');
    }
    const saved = await allocationRepo.save(allocationRepo.create({
        timetableEntryId: entry.id,
        teacherId: input.teacherId,
        subjectId: entry.subjectId,
        classId: entry.classId,
        dayOfWeek,
        startTime: entry.startTime,
        endTime: entry.endTime,
    }));
    entry.teacherId = input.teacherId;
    await timetableRepo.save(entry);
    const full = await allocationRepo.findOne({
        where: { id: saved.id },
        relations: allocationRelations,
    });
    return mapAllocation(full);
}
async function updateTeacherAllocation(id, input) {
    const timetableRepo = data_source_1.AppDataSource.getRepository(entities_1.Timetable);
    const allocationRepo = data_source_1.AppDataSource.getRepository(entities_1.TeacherAllocation);
    const row = await allocationRepo.findOne({ where: { id }, relations: (0, typeorm_helpers_1.relations)('timetableEntry') });
    if (!row) {
        throw new Error('Teacher allocation not found.');
    }
    const timetableEntryId = input.timetableEntryId || row.timetableEntryId;
    const teacherId = input.teacherId || row.teacherId;
    const entry = await timetableRepo.findOne({ where: { id: timetableEntryId } });
    if (!entry) {
        throw new Error('Timetable entry not found.');
    }
    await (0, class_subject_teacher_service_1.assertTimetableTeacherMatchesAssignment)(entry.classId, entry.subjectId, teacherId);
    const dayOfWeek = (0, timetable_day_1.dayIntToEnum)(entry.dayOfWeek);
    const conflict = await timetable_conflict_service_1.timetableConflictService.checkTeacherConflict(teacherId, dayOfWeek, entry.startTime, entry.endTime, id);
    if (conflict) {
        const err = new Error(timetable_conflict_service_1.timetableConflictService.formatConflictMessage(conflict));
        err.conflict = conflict;
        throw err;
    }
    if (timetableEntryId !== row.timetableEntryId) {
        const other = await allocationRepo.findOne({ where: { timetableEntryId } });
        if (other && other.id !== id) {
            throw new Error('Target timetable slot already has a teacher allocation.');
        }
        if (row.timetableEntry?.teacherId === row.teacherId) {
            const prev = await timetableRepo.findOne({ where: { id: row.timetableEntryId } });
            if (prev) {
                prev.teacherId = undefined;
                await timetableRepo.save(prev);
            }
        }
    }
    row.timetableEntryId = timetableEntryId;
    row.teacherId = teacherId;
    row.subjectId = entry.subjectId;
    row.classId = entry.classId;
    row.dayOfWeek = dayOfWeek;
    row.startTime = entry.startTime;
    row.endTime = entry.endTime;
    await allocationRepo.save(row);
    entry.teacherId = teacherId;
    await timetableRepo.save(entry);
    const full = await allocationRepo.findOne({ where: { id }, relations: allocationRelations });
    return mapAllocation(full);
}
async function deleteTeacherAllocation(id) {
    const timetableRepo = data_source_1.AppDataSource.getRepository(entities_1.Timetable);
    const allocationRepo = data_source_1.AppDataSource.getRepository(entities_1.TeacherAllocation);
    const row = await allocationRepo.findOne({ where: { id } });
    if (!row) {
        throw new Error('Teacher allocation not found.');
    }
    const entry = await timetableRepo.findOne({ where: { id: row.timetableEntryId } });
    if (entry && entry.teacherId === row.teacherId) {
        entry.teacherId = undefined;
        await timetableRepo.save(entry);
    }
    await allocationRepo.remove(row);
    return { ok: true };
}
async function getTeacherWeeklySchedule(teacherId) {
    const allocationRepo = data_source_1.AppDataSource.getRepository(entities_1.TeacherAllocation);
    const rows = await allocationRepo.find({
        where: { teacherId },
        relations: allocationRelations,
        order: { dayOfWeek: 'ASC', startTime: 'ASC' },
    });
    const staff = await data_source_1.AppDataSource.getRepository(entities_1.Staff).findOne({
        where: { id: teacherId },
        relations: (0, typeorm_helpers_1.relations)('user'),
    });
    return {
        teacher: staff
            ? {
                id: staff.id,
                employeeNumber: staff.employeeNumber,
                user: staff.user
                    ? { firstName: staff.user.firstName, lastName: staff.user.lastName }
                    : undefined,
            }
            : { id: teacherId },
        allocations: rows.map(mapAllocation),
        summary: {
            slotCount: rows.length,
            classCount: new Set(rows.map((r) => r.classId)).size,
            subjectCount: new Set(rows.map((r) => r.subjectId)).size,
        },
    };
}
async function getTeacherAvailability(params) {
    const staff = await data_source_1.AppDataSource.getRepository(entities_1.Staff).find({
        where: { isActive: true },
        relations: (0, typeorm_helpers_1.relations)('user'),
        order: { createdAt: 'ASC' },
    });
    const rows = [];
    for (const member of staff) {
        const conflict = await timetable_conflict_service_1.timetableConflictService.checkTeacherConflict(member.id, params.dayOfWeek, params.startTime, params.endTime, params.excludeAllocationId);
        rows.push({
            teacherId: member.id,
            firstName: member.user?.firstName || '',
            lastName: member.user?.lastName || '',
            available: !conflict,
            conflict: conflict
                ? {
                    className: conflict.className,
                    subjectName: conflict.subjectName,
                    dayOfWeek: conflict.dayOfWeek,
                    startTime: conflict.startTime,
                    endTime: conflict.endTime,
                }
                : undefined,
        });
    }
    return rows;
}
function parseDayOfWeekInput(value) {
    const raw = String(value || '').trim().toUpperCase();
    if (Object.values(enums_1.DayOfWeek).includes(raw)) {
        return raw;
    }
    const asInt = Number(value);
    if (Number.isFinite(asInt) && asInt >= 1 && asInt <= 7) {
        return (0, timetable_day_1.dayIntToEnum)(asInt);
    }
    throw new Error('Invalid dayOfWeek. Use MONDAY–SUNDAY or 1–7 (Monday=1).');
}
