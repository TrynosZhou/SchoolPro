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
