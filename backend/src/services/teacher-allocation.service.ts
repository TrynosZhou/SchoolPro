import { AppDataSource } from '../config/data-source';
import { Timetable, TeacherAllocation, Staff } from '../entities';
import { DayOfWeek } from '../entities/enums';
import { dayIntToEnum, dayEnumToInt } from '../utils/timetable-day';
import { relations } from '../utils/typeorm-helpers';
import { timetableConflictService } from './timetable-conflict.service';
import { assertTimetableTeacherMatchesAssignment } from './class-subject-teacher.service';

export interface CreateTeacherAllocationInput {
  timetableEntryId: string;
  teacherId: string;
}

export interface UpdateTeacherAllocationInput {
  teacherId?: string;
  timetableEntryId?: string;
}

export interface TeacherAvailabilityRow {
  teacherId: string;
  firstName: string;
  lastName: string;
  available: boolean;
  conflict?: {
    className: string;
    subjectName: string;
    dayOfWeek: DayOfWeek;
    startTime: string;
    endTime: string;
  };
}

function mapAllocation(row: TeacherAllocation) {
  return {
    id: row.id,
    timetableEntryId: row.timetableEntryId,
    teacherId: row.teacherId,
    subjectId: row.subjectId,
    classId: row.classId,
    dayOfWeek: row.dayOfWeek,
    dayOfWeekInt: dayEnumToInt(row.dayOfWeek),
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

const allocationRelations = relations(
  'teacher',
  'teacher.user',
  'subject',
  'schoolClass',
  'schoolClass.form',
  'timetableEntry',
);

export async function createTeacherAllocation(input: CreateTeacherAllocationInput) {
  const timetableRepo = AppDataSource.getRepository(Timetable);
  const allocationRepo = AppDataSource.getRepository(TeacherAllocation);

  const entry = await timetableRepo.findOne({ where: { id: input.timetableEntryId } });
  if (!entry) {
    throw new Error('Timetable entry not found.');
  }

  await assertTimetableTeacherMatchesAssignment(entry.classId, entry.subjectId, input.teacherId);

  const dayOfWeek = dayIntToEnum(entry.dayOfWeek);
  const conflict = await timetableConflictService.checkTeacherConflict(
    input.teacherId,
    dayOfWeek,
    entry.startTime,
    entry.endTime,
  );
  if (conflict) {
    const err = new Error(timetableConflictService.formatConflictMessage(conflict));
    (err as Error & { conflict: typeof conflict }).conflict = conflict;
    throw err;
  }

  const existing = await allocationRepo.findOne({ where: { timetableEntryId: entry.id } });
  if (existing) {
    throw new Error('This timetable slot already has a teacher allocation. Use update instead.');
  }

  const saved = await allocationRepo.save(
    allocationRepo.create({
      timetableEntryId: entry.id,
      teacherId: input.teacherId,
      subjectId: entry.subjectId,
      classId: entry.classId,
      dayOfWeek,
      startTime: entry.startTime,
      endTime: entry.endTime,
    }),
  );

  entry.teacherId = input.teacherId;
  await timetableRepo.save(entry);

  const full = await allocationRepo.findOne({
    where: { id: saved.id },
    relations: allocationRelations,
  });
  return mapAllocation(full!);
}

export async function updateTeacherAllocation(id: string, input: UpdateTeacherAllocationInput) {
  const timetableRepo = AppDataSource.getRepository(Timetable);
  const allocationRepo = AppDataSource.getRepository(TeacherAllocation);

  const row = await allocationRepo.findOne({ where: { id }, relations: relations('timetableEntry') });
  if (!row) {
    throw new Error('Teacher allocation not found.');
  }

  const timetableEntryId = input.timetableEntryId || row.timetableEntryId;
  const teacherId = input.teacherId || row.teacherId;

  const entry = await timetableRepo.findOne({ where: { id: timetableEntryId } });
  if (!entry) {
    throw new Error('Timetable entry not found.');
  }

  await assertTimetableTeacherMatchesAssignment(entry.classId, entry.subjectId, teacherId);

  const dayOfWeek = dayIntToEnum(entry.dayOfWeek);
  const conflict = await timetableConflictService.checkTeacherConflict(
    teacherId,
    dayOfWeek,
    entry.startTime,
    entry.endTime,
    id,
  );
  if (conflict) {
    const err = new Error(timetableConflictService.formatConflictMessage(conflict));
    (err as Error & { conflict: typeof conflict }).conflict = conflict;
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
  return mapAllocation(full!);
}

export async function deleteTeacherAllocation(id: string) {
  const timetableRepo = AppDataSource.getRepository(Timetable);
  const allocationRepo = AppDataSource.getRepository(TeacherAllocation);

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

export async function getTeacherWeeklySchedule(teacherId: string) {
  const allocationRepo = AppDataSource.getRepository(TeacherAllocation);
  const rows = await allocationRepo.find({
    where: { teacherId },
    relations: allocationRelations,
    order: { dayOfWeek: 'ASC', startTime: 'ASC' },
  });

  const staff = await AppDataSource.getRepository(Staff).findOne({
    where: { id: teacherId },
    relations: relations('user'),
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

export async function getTeacherAvailability(params: {
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  excludeAllocationId?: string;
}) {
  const staff = await AppDataSource.getRepository(Staff).find({
    where: { isActive: true },
    relations: relations('user'),
    order: { createdAt: 'ASC' },
  });

  const rows: TeacherAvailabilityRow[] = [];
  for (const member of staff) {
    const conflict = await timetableConflictService.checkTeacherConflict(
      member.id,
      params.dayOfWeek,
      params.startTime,
      params.endTime,
      params.excludeAllocationId,
    );
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

export function parseDayOfWeekInput(value: unknown): DayOfWeek {
  const raw = String(value || '').trim().toUpperCase();
  if (Object.values(DayOfWeek).includes(raw as DayOfWeek)) {
    return raw as DayOfWeek;
  }
  const asInt = Number(value);
  if (Number.isFinite(asInt) && asInt >= 1 && asInt <= 7) {
    return dayIntToEnum(asInt);
  }
  throw new Error('Invalid dayOfWeek. Use MONDAY–SUNDAY or 1–7 (Monday=1).');
}
