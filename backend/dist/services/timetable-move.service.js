"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.moveTimetableSlot = moveTimetableSlot;
const data_source_1 = require("../config/data-source");
const entities_1 = require("../entities");
const timetable_day_1 = require("../utils/timetable-day");
const timetable_conflict_service_1 = require("./timetable-conflict.service");
function normalizeTime(time) {
    const [h, m] = String(time || '0:00').split(':');
    return `${String(h).padStart(2, '0')}:${String(m || '00').padStart(2, '0')}`;
}
async function moveTimetableSlot(slotId, input, options = {}) {
    const dayOfWeek = Number(input.dayOfWeek);
    const startTime = normalizeTime(input.startTime);
    const endTime = normalizeTime(input.endTime);
    if (!dayOfWeek || dayOfWeek < 1 || dayOfWeek > 7) {
        throw new Error('Invalid day of week.');
    }
    if (!startTime || !endTime) {
        throw new Error('startTime and endTime are required.');
    }
    const timetableRepo = data_source_1.AppDataSource.getRepository(entities_1.Timetable);
    const allocationRepo = data_source_1.AppDataSource.getRepository(entities_1.TeacherAllocation);
    const entry = await timetableRepo.findOne({ where: { id: slotId } });
    if (!entry) {
        throw new Error('Timetable slot not found.');
    }
    if (entry.isLocked) {
        throw new Error('This lesson is locked and cannot be moved.');
    }
    if (entry.dayOfWeek === dayOfWeek &&
        normalizeTime(entry.startTime) === startTime &&
        normalizeTime(entry.endTime) === endTime) {
        return { id: entry.id, dayOfWeek: entry.dayOfWeek, startTime: entry.startTime, endTime: entry.endTime };
    }
    if (!options.ignoreConflicts) {
        const classOccupied = await timetableRepo.findOne({
            where: {
                classId: entry.classId,
                dayOfWeek,
                startTime,
                endTime,
            },
        });
        if (classOccupied && classOccupied.id !== slotId) {
            throw new Error('This class already has a lesson in the target period.');
        }
    }
    const allocation = await allocationRepo.findOne({ where: { timetableEntryId: slotId } });
    const dayEnum = (0, timetable_day_1.dayIntToEnum)(dayOfWeek);
    if (entry.teacherId && !options.ignoreConflicts) {
        const conflict = await timetable_conflict_service_1.timetableConflictService.checkTeacherConflict(entry.teacherId, dayEnum, startTime, endTime, allocation?.id);
        if (conflict) {
            const err = new Error(timetable_conflict_service_1.timetableConflictService.formatConflictMessage(conflict));
            err.conflict = conflict;
            throw err;
        }
    }
    entry.dayOfWeek = dayOfWeek;
    entry.startTime = startTime;
    entry.endTime = endTime;
    if (allocation) {
        allocation.dayOfWeek = dayEnum;
        allocation.startTime = startTime;
        allocation.endTime = endTime;
    }
    // Update the timetable entry and its allocation together so a failure on either
    // never leaves the two out of sync.
    await data_source_1.AppDataSource.transaction(async (manager) => {
        await manager.save(entry);
        if (allocation) {
            await manager.save(allocation);
        }
    });
    return {
        id: entry.id,
        dayOfWeek: entry.dayOfWeek,
        startTime: entry.startTime,
        endTime: entry.endTime,
    };
}
