"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.timetableConflictService = exports.TimetableConflictService = void 0;
const data_source_1 = require("../config/data-source");
const TeacherAllocation_1 = require("../entities/TeacherAllocation");
const timetable_day_1 = require("../utils/timetable-day");
function parseMinutes(time) {
    const [h, m] = String(time || '0:0').split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
}
function timesOverlap(startA, endA, startB, endB) {
    const a0 = parseMinutes(startA);
    const a1 = parseMinutes(endA);
    const b0 = parseMinutes(startB);
    const b1 = parseMinutes(endB);
    return a0 < b1 && b0 < a1;
}
class TimetableConflictService {
    /**
     * Returns conflict details when the teacher is already allocated to an overlapping slot.
     * Pass excludeAllocationId when updating an existing allocation.
     */
    async checkTeacherConflict(teacherId, dayOfWeek, startTime, endTime, excludeAllocationId) {
        const repo = data_source_1.AppDataSource.getRepository(TeacherAllocation_1.TeacherAllocation);
        const qb = repo
            .createQueryBuilder('a')
            .leftJoinAndSelect('a.schoolClass', 'c')
            .leftJoinAndSelect('a.subject', 's')
            .where('a.teacherId = :teacherId', { teacherId })
            .andWhere('a.dayOfWeek = :dayOfWeek', { dayOfWeek });
        if (excludeAllocationId) {
            qb.andWhere('a.id != :excludeAllocationId', { excludeAllocationId });
        }
        const rows = await qb.getMany();
        for (const row of rows) {
            if (timesOverlap(startTime, endTime, row.startTime, row.endTime)) {
                return {
                    allocationId: row.id,
                    timetableEntryId: row.timetableEntryId,
                    classId: row.classId,
                    className: row.schoolClass?.name || 'Class',
                    subjectId: row.subjectId,
                    subjectName: row.subject?.name || 'Subject',
                    dayOfWeek: row.dayOfWeek,
                    startTime: row.startTime,
                    endTime: row.endTime,
                };
            }
        }
        return null;
    }
    formatConflictMessage(conflict) {
        const day = (0, timetable_day_1.dayEnumLabel)(conflict.dayOfWeek);
        return (`Teacher is already allocated to ${conflict.className} (${conflict.subjectName}) ` +
            `on ${day} ${conflict.startTime}–${conflict.endTime}.`);
    }
}
exports.TimetableConflictService = TimetableConflictService;
exports.timetableConflictService = new TimetableConflictService();
