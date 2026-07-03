"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setTimetableSlotLocked = setTimetableSlotLocked;
exports.setBulkTimetableSlotsLocked = setBulkTimetableSlotsLocked;
const data_source_1 = require("../config/data-source");
const entities_1 = require("../entities");
async function setTimetableSlotLocked(slotId, locked) {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.Timetable);
    const entry = await repo.findOne({ where: { id: slotId } });
    if (!entry) {
        throw new Error('Timetable slot not found.');
    }
    entry.isLocked = !!locked;
    await repo.save(entry);
    return {
        id: entry.id,
        isLocked: entry.isLocked,
    };
}
/** Lock all unlocked slots, or unlock all locked slots. */
async function setBulkTimetableSlotsLocked(locked) {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.Timetable);
    const result = await repo
        .createQueryBuilder()
        .update(entities_1.Timetable)
        .set({ isLocked: locked })
        .where('isLocked = :opposite', { opposite: !locked })
        .execute();
    return {
        updated: result.affected ?? 0,
        isLocked: locked,
    };
}
