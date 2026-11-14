import { In } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import { Timetable, TeacherAllocation } from '../entities';
import { dayIntToEnum, dayEnumToInt, dayEnumLabel } from '../utils/timetable-day';

export interface TeacherLessonChange {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room?: string | null;
  isLocked?: boolean;
  /** When true the lesson is deleted from the timetable. */
  remove?: boolean;
}

export interface SaveTeacherLessonsInput {
  lessons: TeacherLessonChange[];
  /** Allow the teacher to be double-booked (teach 2+ classes in the same period). */
  ignoreConflicts?: boolean;
}

function normalizeTime(time: string): string {
  const [h, m] = String(time || '0:00').split(':');
  return `${String(h).padStart(2, '0')}:${String(m || '00').padStart(2, '0')}`;
}

function minutes(time: string): number {
  const [h, m] = normalizeTime(time).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return minutes(aStart) < minutes(bEnd) && minutes(bStart) < minutes(aEnd);
}

/**
 * Saves the edits made in the "Edit lessons" modal for ONE teacher, atomically.
 *
 * Every change is validated against the FINAL state of the timetable, so swapping two
 * lessons between periods works (a one-by-one move would hit a transient clash).
 * Nothing is written unless every change passes.
 */
export async function saveTeacherLessons(teacherId: string, input: SaveTeacherLessonsInput) {
  const changes = Array.isArray(input?.lessons) ? input.lessons : [];
  if (!teacherId) throw new Error('teacherId is required.');
  if (!changes.length) return { updated: 0, removed: 0 };

  const timetableRepo = AppDataSource.getRepository(Timetable);
  const allocationRepo = AppDataSource.getRepository(TeacherAllocation);

  const ids = changes.map((c) => String(c.id));
  if (new Set(ids).size !== ids.length) {
    throw new Error('A lesson appears more than once in the request.');
  }

  const entries = await timetableRepo.find({ where: { id: In(ids) } });
  if (entries.length !== ids.length) {
    throw new Error('One or more lessons no longer exist. Reload the timetable and try again.');
  }
  const byId = new Map(entries.map((e) => [e.id, e]));

  for (const entry of entries) {
    if (entry.teacherId !== teacherId) {
      throw new Error('A lesson does not belong to the selected teacher.');
    }
  }

  // ---- Per-lesson validation ---------------------------------------------------------
  const final = new Map<string, { day: number; start: string; end: string; classId: string; removed: boolean }>();
  for (const change of changes) {
    const entry = byId.get(String(change.id))!;
    const removed = change.remove === true;
    const day = Number(change.dayOfWeek);
    const start = normalizeTime(change.startTime);
    const end = normalizeTime(change.endTime);

    if (!removed) {
      if (!day || day < 1 || day > 7) throw new Error('Invalid day of week.');
      if (minutes(end) <= minutes(start)) throw new Error('A lesson must end after it starts.');
    }

    const keepsLock = entry.isLocked && change.isLocked !== false;
    if (keepsLock) {
      const moved =
        entry.dayOfWeek !== day ||
        normalizeTime(entry.startTime) !== start ||
        normalizeTime(entry.endTime) !== end ||
        (entry.room || '') !== String(change.room ?? '').trim();
      if (removed || moved) {
        throw new Error('A locked lesson cannot be changed or removed. Unlock it first.');
      }
    }

    final.set(entry.id, {
      day: removed ? entry.dayOfWeek : day,
      start: removed ? normalizeTime(entry.startTime) : start,
      end: removed ? normalizeTime(entry.endTime) : end,
      classId: entry.classId,
      removed,
    });
  }

  // ---- Class clashes: a class can only have one lesson per period ---------------------
  const moving = changes.filter((c) => c.remove !== true);
  const classIds = [...new Set(moving.map((c) => byId.get(String(c.id))!.classId))];
  if (classIds.length) {
    const classRows = await timetableRepo.find({ where: { classId: In(classIds) } });
    const finalClassRows = classRows
      .map((row) => {
        const edited = final.get(row.id);
        if (edited?.removed) return null;
        return {
          id: row.id,
          classId: row.classId,
          day: edited ? edited.day : row.dayOfWeek,
          start: edited ? edited.start : normalizeTime(row.startTime),
          end: edited ? edited.end : normalizeTime(row.endTime),
        };
      })
      .filter((r): r is NonNullable<typeof r> => !!r);

    for (const change of moving) {
      const mine = final.get(String(change.id))!;
      const clash = finalClassRows.find(
        (r) =>
          r.id !== String(change.id) &&
          r.classId === mine.classId &&
          r.day === mine.day &&
          r.start === mine.start &&
          r.end === mine.end,
      );
      if (clash) {
        throw new Error(
          `${dayEnumLabel(dayIntToEnum(mine.day))} ${mine.start}–${mine.end}: that class already has a lesson in this period.`,
        );
      }
    }
  }

  // ---- Teacher clashes (against the teacher's whole final week) -----------------------
  if (!input.ignoreConflicts) {
    const allAllocations = await allocationRepo.find({ where: { teacherId } });
    const teacherWeek = allAllocations
      .map((a) => {
        const edited = final.get(a.timetableEntryId);
        if (edited?.removed) return null;
        return {
          entryId: a.timetableEntryId,
          day: edited ? edited.day : dayEnumToInt(a.dayOfWeek),
          start: edited ? edited.start : normalizeTime(a.startTime),
          end: edited ? edited.end : normalizeTime(a.endTime),
        };
      })
      .filter((r): r is NonNullable<typeof r> => !!r);

    for (const change of moving) {
      const mine = final.get(String(change.id))!;
      const clash = teacherWeek.find(
        (r) =>
          r.entryId !== String(change.id) &&
          r.day === mine.day &&
          overlaps(mine.start, mine.end, r.start, r.end),
      );
      if (clash) {
        const err = new Error(
          `${dayEnumLabel(dayIntToEnum(mine.day))} ${mine.start}–${mine.end}: the teacher is already teaching another class in this period.`,
        );
        (err as Error & { conflict?: boolean }).conflict = true;
        throw err;
      }
    }
  }

  // ---- Apply everything in one transaction -------------------------------------------
  let updated = 0;
  let removedCount = 0;
  await AppDataSource.transaction(async (manager) => {
    for (const change of changes) {
      const entry = byId.get(String(change.id))!;

      if (change.remove === true) {
        // teacher_allocations cascades on timetableEntry delete, but remove it explicitly.
        await manager.delete(TeacherAllocation, { timetableEntryId: entry.id });
        await manager.delete(Timetable, { id: entry.id });
        removedCount += 1;
        continue;
      }

      const target = final.get(entry.id)!;
      entry.dayOfWeek = target.day;
      entry.startTime = target.start;
      entry.endTime = target.end;
      entry.room = String(change.room ?? '').trim() || undefined;
      if (typeof change.isLocked === 'boolean') entry.isLocked = change.isLocked;
      await manager.save(entry);

      const allocation = await manager.findOne(TeacherAllocation, {
        where: { timetableEntryId: entry.id },
      });
      if (allocation) {
        allocation.dayOfWeek = dayIntToEnum(target.day);
        allocation.startTime = target.start;
        allocation.endTime = target.end;
        await manager.save(allocation);
      }
      updated += 1;
    }
  });

  return { updated, removed: removedCount };
}
