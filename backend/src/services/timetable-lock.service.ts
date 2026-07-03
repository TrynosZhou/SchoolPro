import { AppDataSource } from '../config/data-source';
import { Timetable } from '../entities';

export async function setTimetableSlotLocked(slotId: string, locked: boolean) {
  const repo = AppDataSource.getRepository(Timetable);
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
export async function setBulkTimetableSlotsLocked(locked: boolean) {
  const repo = AppDataSource.getRepository(Timetable);
  const result = await repo
    .createQueryBuilder()
    .update(Timetable)
    .set({ isLocked: locked })
    .where('isLocked = :opposite', { opposite: !locked })
    .execute();

  return {
    updated: result.affected ?? 0,
    isLocked: locked,
  };
}
