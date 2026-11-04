import { AppDataSource } from '../config/data-source';
import { TeacherAllocation } from '../entities/TeacherAllocation';
import { DayOfWeek } from '../entities/enums';
import { dayEnumLabel } from '../utils/timetable-day';

export interface TeacherConflictDetail {
  allocationId: string;
  timetableEntryId: string;
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
}

function parseMinutes(time: string): number {
  const [h, m] = String(time || '0:0').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function timesOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
  const a0 = parseMinutes(startA);
  const a1 = parseMinutes(endA);
  const b0 = parseMinutes(startB);
  const b1 = parseMinutes(endB);
  return a0 < b1 && b0 < a1;
}

export class TimetableConflictService {
  /**
   * Returns conflict details when the teacher is already allocated to an overlapping slot.
   * Pass excludeAllocationId when updating an existing allocation.
   */
  async checkTeacherConflict(
    teacherId: string,
    dayOfWeek: DayOfWeek,
    startTime: string,
    endTime: string,
    excludeAllocationId?: string,
  ): Promise<TeacherConflictDetail | null> {
    const repo = AppDataSource.getRepository(TeacherAllocation);
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

  formatConflictMessage(conflict: TeacherConflictDetail): string {
    const day = dayEnumLabel(conflict.dayOfWeek);
    return (
      `Teacher is already allocated to ${conflict.className} (${conflict.subjectName}) ` +
      `on ${day} ${conflict.startTime}–${conflict.endTime}.`
    );
  }
}

export const timetableConflictService = new TimetableConflictService();
