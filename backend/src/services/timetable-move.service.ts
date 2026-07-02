import { AppDataSource } from '../config/data-source';
import { Timetable, TeacherAllocation } from '../entities';
import { dayIntToEnum } from '../utils/timetable-day';
import { timetableConflictService } from './timetable-conflict.service';

export interface MoveTimetableSlotInput {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

function normalizeTime(time: string): string {
  const [h, m] = String(time || '0:00').split(':');
  return `${String(h).padStart(2, '0')}:${String(m || '00').padStart(2, '0')}`;
}

export async function moveTimetableSlot(slotId: string, input: MoveTimetableSlotInput) {
  const dayOfWeek = Number(input.dayOfWeek);
  const startTime = normalizeTime(input.startTime);
  const endTime = normalizeTime(input.endTime);

  if (!dayOfWeek || dayOfWeek < 1 || dayOfWeek > 7) {
    throw new Error('Invalid day of week.');
  }
  if (!startTime || !endTime) {
    throw new Error('startTime and endTime are required.');
  }

  const timetableRepo = AppDataSource.getRepository(Timetable);
  const allocationRepo = AppDataSource.getRepository(TeacherAllocation);

  const entry = await timetableRepo.findOne({ where: { id: slotId } });
  if (!entry) {
    throw new Error('Timetable slot not found.');
  }

  if (entry.isLocked) {
    throw new Error('This lesson is locked and cannot be moved.');
  }

  if (
    entry.dayOfWeek === dayOfWeek &&
    normalizeTime(entry.startTime) === startTime &&
    normalizeTime(entry.endTime) === endTime
  ) {
    return { id: entry.id, dayOfWeek: entry.dayOfWeek, startTime: entry.startTime, endTime: entry.endTime };
  }

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

  const allocation = await allocationRepo.findOne({ where: { timetableEntryId: slotId } });
  const dayEnum = dayIntToEnum(dayOfWeek);

  if (entry.teacherId) {
    const conflict = await timetableConflictService.checkTeacherConflict(
      entry.teacherId,
      dayEnum,
      startTime,
      endTime,
      allocation?.id,
    );
    if (conflict) {
      const err = new Error(timetableConflictService.formatConflictMessage(conflict));
      (err as Error & { conflict: typeof conflict }).conflict = conflict;
      throw err;
    }
  }

  entry.dayOfWeek = dayOfWeek;
  entry.startTime = startTime;
  entry.endTime = endTime;
  await timetableRepo.save(entry);

  if (allocation) {
    allocation.dayOfWeek = dayEnum;
    allocation.startTime = startTime;
    allocation.endTime = endTime;
    await allocationRepo.save(allocation);
  }

  return {
    id: entry.id,
    dayOfWeek: entry.dayOfWeek,
    startTime: entry.startTime,
    endTime: entry.endTime,
  };
}
