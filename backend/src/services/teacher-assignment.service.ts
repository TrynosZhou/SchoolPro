import { EntityManager, In, IsNull, Not } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import {
  ClassSubject,
  SchoolClass,
  SchoolSettings,
  Staff,
  TeacherAllocation,
  TeacherAssignment,
  Timetable,
  TimetableSlot,
  Section,
} from '../entities';
import { LessonLength, TeacherAssignmentRole, UserRole } from '../entities/enums';
import {
  assertCanAssignTeacherToClassSubject,
  syncTimetableTeachersForAssignment,
} from './class-subject-teacher.service';
import { TimetableConflictService } from './timetable-conflict.service';
import { effectiveWeeklyPeriods, lessonLengthMultiplier, normalizeLessonLength, calculateTeacherWeeklyLoadTotals } from './teacher-load.service';
import { dayIntToEnum } from '../utils/timetable-day';
import { relations } from '../utils/typeorm-helpers';
import type {
  BulkTeacherAssignmentDto,
  CreateTeacherAssignmentDto,
  CreateTimetableSlotDto,
  UpdateTeacherAssignmentDto,
  UpdateTimetableSlotDto,
} from '../dtos/teacher-assignment.dto';

export class TeacherAssignmentConflictError extends Error {
  statusCode = 409;
  constructor(message: string) {
    super(message);
    this.name = 'TeacherAssignmentConflictError';
  }
}

const TEACHING_ROLES: UserRole[] = [UserRole.TEACHER, UserRole.PRINCIPAL, UserRole.ADMIN];

export interface WorkloadThresholds {
  minWeeklyPeriods: number;
  /** Null means no upper cap — teachers may exceed any advisory limit. */
  maxWeeklyPeriods: number | null;
}

export interface WorkloadSummaryRow {
  teacherId: string;
  employeeNumber: string;
  teacherName: string;
  totalPeriods: number;
  minThreshold: number;
  maxThreshold: number | null;
  status: 'underload' | 'balanced' | 'overload';
  assignmentCount: number;
}

async function loadThresholdsForTeacher(teacherId: string): Promise<WorkloadThresholds> {
  const settings = await AppDataSource.getRepository(SchoolSettings).findOne({
    where: { id: 'default' },
  });
  const staff = await AppDataSource.getRepository(Staff).findOne({ where: { id: teacherId } });
  const staffMax = staff?.maxWeeklyPeriods;
  const settingsMax = settings?.maxWeeklyPeriods;
  const resolvedMax =
    staffMax != null && staffMax > 0
      ? staffMax
      : settingsMax != null && settingsMax > 0
        ? settingsMax
        : null;
  return {
    minWeeklyPeriods: settings?.minWeeklyPeriods ?? 0,
    maxWeeklyPeriods: resolvedMax,
  };
}

async function assertTeachingStaff(teacherId: string): Promise<Staff> {
  const staff = await AppDataSource.getRepository(Staff)
    .createQueryBuilder('s')
    .innerJoinAndSelect('s.user', 'u')
    .where('s.id = :id', { id: teacherId })
    .getOne();
  if (!staff?.isActive || !staff.user?.isActive) {
    throw new Error('Teacher must be an active staff member');
  }
  if (!TEACHING_ROLES.includes(staff.user.role)) {
    throw new Error('Only teaching staff can receive class/subject assignments');
  }
  return staff;
}

async function resolveSectionId(classId: string, sectionId?: string | null): Promise<string | null> {
  if (sectionId) return sectionId;
  const cls = await AppDataSource.getRepository(SchoolClass).findOne({ where: { id: classId } });
  return cls?.sectionId ?? null;
}

async function syncLegacyAssignmentRow(assignment: TeacherAssignment): Promise<void> {
  if (!assignment.isActive || assignment.endDate) return;

  if (assignment.role === TeacherAssignmentRole.CLASS_TEACHER) {
    await AppDataSource.getRepository(SchoolClass).update(assignment.classId, {
      classTeacherId: assignment.teacherId,
    });
    return;
  }

  if (assignment.role === TeacherAssignmentRole.SUBJECT_TEACHER && assignment.subjectId) {
    const repo = AppDataSource.getRepository(ClassSubject);
    let row = await repo.findOne({
      where: { classId: assignment.classId, subjectId: assignment.subjectId },
    });
    if (!row) {
      row = repo.create({
        classId: assignment.classId,
        subjectId: assignment.subjectId,
        teacherId: assignment.teacherId,
        weeklyPeriods: assignment.weeklyPeriods,
        lessonLength: assignment.lessonLength,
      });
    } else {
      row.teacherId = assignment.teacherId;
      row.weeklyPeriods = assignment.weeklyPeriods;
      row.lessonLength = assignment.lessonLength;
    }
    await repo.save(row);
    await syncTimetableTeachersForAssignment(assignment.classId, assignment.subjectId, assignment.teacherId);
  }
}

/** Remove Staff → Teacher Load links when an assignment is ended/deleted. */
async function unlinkLegacyAssignmentOnEnd(
  assignment: TeacherAssignment,
  manager?: EntityManager,
): Promise<void> {
  const classRepo = manager
    ? manager.getRepository(SchoolClass)
    : AppDataSource.getRepository(SchoolClass);
  const csRepo = manager
    ? manager.getRepository(ClassSubject)
    : AppDataSource.getRepository(ClassSubject);

  if (assignment.role === TeacherAssignmentRole.CLASS_TEACHER) {
    const cls = await classRepo.findOne({ where: { id: assignment.classId } });
    if (cls?.classTeacherId === assignment.teacherId) {
      await classRepo.update(assignment.classId, { classTeacherId: null });
    }
    return;
  }

  if (assignment.role === TeacherAssignmentRole.SUBJECT_TEACHER) {
    await csRepo
      .createQueryBuilder()
      .update(ClassSubject)
      .set({ teacherId: null, weeklyPeriods: 0, lessonLength: LessonLength.SINGLE })
      .where('"teacherId" = :teacherId AND "classId" = :classId', {
        teacherId: assignment.teacherId,
        classId: assignment.classId,
      })
      .execute();
  }
}

/** Drop generated timetable links for one assignment (slots, allocations, class-grid entries). */
async function clearTimetableForAssignment(
  assignment: TeacherAssignment,
  manager: EntityManager,
): Promise<void> {
  const slotRepo = manager.getRepository(TimetableSlot);
  const timetableRepo = manager.getRepository(Timetable);
  const allocationRepo = manager.getRepository(TeacherAllocation);
  const { teacherId, classId, subjectId } = assignment;

  await slotRepo.delete({ teacherAssignmentId: assignment.id });

  if (assignment.role === TeacherAssignmentRole.SUBJECT_TEACHER && subjectId) {
    await allocationRepo.delete({ teacherId, classId, subjectId });
    await timetableRepo.delete({ classId, subjectId });
    return;
  }

  await allocationRepo.delete({ teacherId, classId });
  await timetableRepo.delete({ classId, teacherId });
}

/** Remove all timetable data tied to one teacher. */
async function clearTimetableForTeacher(
  teacherId: string,
  manager: EntityManager,
  assignments?: TeacherAssignment[],
): Promise<void> {
  const timetableRepo = manager.getRepository(Timetable);
  const allocationRepo = manager.getRepository(TeacherAllocation);
  const slotRepo = manager.getRepository(TimetableSlot);
  const assignmentRepo = manager.getRepository(TeacherAssignment);

  await allocationRepo.delete({ teacherId });
  await timetableRepo.delete({ teacherId });

  const rows = assignments?.length
    ? assignments
    : await assignmentRepo.find({ where: { teacherId } });
  const clearedClassSubjects = new Set<string>();
  for (const assignment of rows) {
    if (assignment.role === TeacherAssignmentRole.SUBJECT_TEACHER && assignment.subjectId) {
      const key = `${assignment.classId}:${assignment.subjectId}`;
      if (clearedClassSubjects.has(key)) continue;
      clearedClassSubjects.add(key);
      await timetableRepo.delete({ classId: assignment.classId, subjectId: assignment.subjectId });
      continue;
    }
    if (assignment.role === TeacherAssignmentRole.CLASS_TEACHER) {
      await timetableRepo.delete({ classId: assignment.classId, teacherId: assignment.teacherId });
    }
  }

  const teacherAssignments = await assignmentRepo.find({
    where: { teacherId },
    select: { id: true },
  });
  const assignmentIds = teacherAssignments.map((row) => row.id);
  if (assignmentIds.length) {
    await slotRepo.delete({ teacherAssignmentId: In(assignmentIds) });
  }
}

/** Remove all class timetable grids school-wide (used when resetting all assignments). */
async function clearAllTimetableData(manager: EntityManager): Promise<void> {
  await manager.getRepository(TimetableSlot).createQueryBuilder().delete().from(TimetableSlot).execute();
  await manager.getRepository(TeacherAllocation).createQueryBuilder().delete().from(TeacherAllocation).execute();
  await manager.getRepository(Timetable).createQueryBuilder().delete().from(Timetable).execute();
}

async function endConflictingAssignments(input: {
  classId: string;
  subjectId?: string | null;
  role: TeacherAssignmentRole;
  excludeId?: string;
  endDate: string;
}): Promise<void> {
  const repo = AppDataSource.getRepository(TeacherAssignment);
  const qb = repo
    .createQueryBuilder('a')
    .where('a.classId = :classId', { classId: input.classId })
    .andWhere('a.role = :role', { role: input.role })
    .andWhere('a.isActive = true')
    .andWhere('a.endDate IS NULL');

  if (input.role === TeacherAssignmentRole.SUBJECT_TEACHER && input.subjectId) {
    qb.andWhere('a.subjectId = :subjectId', { subjectId: input.subjectId });
  }

  if (input.excludeId) {
    qb.andWhere('a.id != :excludeId', { excludeId: input.excludeId });
  }

  const rows = await qb.getMany();
  for (const row of rows) {
    row.isActive = false;
    row.endDate = input.endDate;
    await repo.save(row);
  }
}

function workloadStatus(
  total: number,
  thresholds: WorkloadThresholds,
): 'underload' | 'balanced' | 'overload' {
  if (total < thresholds.minWeeklyPeriods) return 'underload';
  if (thresholds.maxWeeklyPeriods != null && total > thresholds.maxWeeklyPeriods) return 'overload';
  return 'balanced';
}

export async function listTeacherAssignments(filters: {
  teacherId?: string;
  classId?: string;
  sectionId?: string;
  activeOnly?: boolean;
  syncFromTeacherLoad?: boolean;
}): Promise<TeacherAssignment[]> {
  if (filters.syncFromTeacherLoad !== false) {
    await syncSubjectAssignmentsFromClassSubjects();
    await repairDuplicateTeacherClassAssignments();
  }

  const repo = AppDataSource.getRepository(TeacherAssignment);
  const where: Record<string, unknown> = {};
  if (filters.teacherId) where.teacherId = filters.teacherId;
  if (filters.classId) where.classId = filters.classId;
  if (filters.sectionId) where.sectionId = filters.sectionId;
  if (filters.activeOnly !== false) {
    where.isActive = true;
    where.endDate = IsNull();
  }
  return repo.find({
    where,
    relations: relations('teacher', 'teacher.user', 'schoolClass', 'schoolClass.form', 'section', 'subject'),
    order: { startDate: 'DESC', createdAt: 'DESC' },
  }).then((rows) => annotateLoadSyncFlags(rows));
}

/** Flag assignments whose load differs from Staff → Teacher Load (class_subjects). */
async function annotateLoadSyncFlags(assignments: TeacherAssignment[]): Promise<TeacherAssignment[]> {
  const csRepo = AppDataSource.getRepository(ClassSubject);
  for (const assignment of assignments) {
    if (assignment.role !== TeacherAssignmentRole.SUBJECT_TEACHER || !assignment.subjectId) {
      assignment.loadOutOfSync = false;
      continue;
    }
    const cs = await csRepo.findOne({
      where: {
        teacherId: assignment.teacherId,
        classId: assignment.classId,
        subjectId: assignment.subjectId,
      },
    });
    if (!cs?.teacherId) {
      assignment.loadOutOfSync = true;
      continue;
    }
    assignment.loadOutOfSync =
      Math.round(Number(cs.weeklyPeriods) || 0) !== Math.round(Number(assignment.weeklyPeriods) || 0) ||
      normalizeLessonLength(cs.lessonLength) !== normalizeLessonLength(assignment.lessonLength);
  }
  return assignments;
}

async function endAssignmentsWithIntegrity(
  rows: TeacherAssignment[],
  endDate: string,
  manager: EntityManager,
  options?: { skipTimetableCleanup?: boolean },
): Promise<void> {
  if (!rows.length) return;

  const assignmentRepo = manager.getRepository(TeacherAssignment);
  const classRepo = manager.getRepository(SchoolClass);
  const csRepo = manager.getRepository(ClassSubject);

  if (!options?.skipTimetableCleanup) {
    for (const assignment of rows) {
      await clearTimetableForAssignment(assignment, manager);
    }
  }

  for (const assignment of rows) {
    assignment.isActive = false;
    assignment.endDate = endDate;
    await assignmentRepo.save(assignment);

    if (assignment.role === TeacherAssignmentRole.CLASS_TEACHER) {
      const cls = await classRepo.findOne({ where: { id: assignment.classId } });
      if (cls?.classTeacherId === assignment.teacherId) {
        await classRepo.update(assignment.classId, { classTeacherId: null });
      }
      continue;
    }

    if (assignment.role === TeacherAssignmentRole.SUBJECT_TEACHER) {
      await csRepo
        .createQueryBuilder()
        .update(ClassSubject)
        .set({ teacherId: null, weeklyPeriods: 0, lessonLength: LessonLength.SINGLE })
        .where('"teacherId" = :teacherId AND "classId" = :classId', {
          teacherId: assignment.teacherId,
          classId: assignment.classId,
        })
        .execute();
    }
  }
}

export async function resetTeacherAssignments(teacherId: string): Promise<{ ended: number }> {
  await assertTeachingStaff(teacherId);
  const rows = await listTeacherAssignments({ teacherId, activeOnly: true, syncFromTeacherLoad: false });
  const endDate = new Date().toISOString().split('T')[0];

  await AppDataSource.transaction(async (manager) => {
    await clearTimetableForTeacher(teacherId, manager, rows);
    if (rows.length) {
      await endAssignmentsWithIntegrity(rows, endDate, manager, { skipTimetableCleanup: true });
    }
  });

  return { ended: rows.length };
}

export async function resetAllTeacherAssignments(): Promise<{ ended: number }> {
  const rows = await listTeacherAssignments({ activeOnly: true, syncFromTeacherLoad: false });
  const endDate = new Date().toISOString().split('T')[0];

  await AppDataSource.transaction(async (manager) => {
    await clearAllTimetableData(manager);
    if (rows.length) {
      await endAssignmentsWithIntegrity(rows, endDate, manager, { skipTimetableCleanup: true });
    }
  });

  return { ended: rows.length };
}

/** End older rows when multiple active assignments exist for the same teacher + class. */
export async function repairDuplicateTeacherClassAssignments(): Promise<number> {
  const repo = AppDataSource.getRepository(TeacherAssignment);
  const active = await repo.find({
    where: { isActive: true, endDate: IsNull() },
    order: { createdAt: 'DESC', id: 'DESC' },
  });

  const seen = new Set<string>();
  const endDate = new Date().toISOString().split('T')[0];
  let repaired = 0;

  for (const row of active) {
    const key = `${row.teacherId}:${row.classId}`;
    if (seen.has(key)) {
      row.isActive = false;
      row.endDate = endDate;
      await repo.save(row);
      repaired += 1;
    } else {
      seen.add(key);
    }
  }

  return repaired;
}

async function assertTeacherNotAlreadyAssignedToClass(
  teacherId: string,
  classId: string,
  excludeAssignmentId?: string,
): Promise<void> {
  const repo = AppDataSource.getRepository(TeacherAssignment);
  const existing = await repo.findOne({
    where: {
      teacherId,
      classId,
      isActive: true,
      endDate: IsNull(),
    },
    relations: relations('schoolClass', 'schoolClass.form', 'teacher', 'teacher.user'),
  });

  if (!existing || existing.id === excludeAssignmentId) return;

  const teacherName = existing.teacher?.user
    ? `${existing.teacher.user.firstName} ${existing.teacher.user.lastName}`.trim()
    : 'This teacher';
  const className = existing.schoolClass?.name || 'this class';

  throw new TeacherAssignmentConflictError(
    `${teacherName} is already assigned to ${className}. Each teacher can only be linked to a class once.`,
  );
}

function assertNoDuplicateTeacherClassInBatch(assignments: { teacherId: string; classId: string }[]): void {
  const seen = new Set<string>();
  for (const row of assignments) {
    const key = `${row.teacherId}:${row.classId}`;
    if (seen.has(key)) {
      throw new TeacherAssignmentConflictError(
        'Duplicate class in this batch: the same teacher cannot be assigned to the same class more than once.',
      );
    }
    seen.add(key);
  }
}

export async function createTeacherAssignment(dto: CreateTeacherAssignmentDto): Promise<TeacherAssignment> {
  await assertTeachingStaff(dto.teacherId);

  if (dto.role === TeacherAssignmentRole.CLASS_TEACHER && dto.subjectId) {
    throw new Error('Class teacher assignments must not include a subject');
  }
  if (dto.role === TeacherAssignmentRole.SUBJECT_TEACHER && !dto.subjectId) {
    throw new Error('Subject teacher assignments require a subject');
  }

  await assertTeacherNotAlreadyAssignedToClass(dto.teacherId, dto.classId);
  if (dto.role === TeacherAssignmentRole.SUBJECT_TEACHER && dto.subjectId && !dto.isSharedSplit) {
    await assertCanAssignTeacherToClassSubject({
      classId: dto.classId,
      subjectId: dto.subjectId,
      teacherId: dto.teacherId,
      forceReassign: dto.forceReassign,
    });
  }

  if (dto.role === TeacherAssignmentRole.CLASS_TEACHER) {
    const existing = await AppDataSource.getRepository(TeacherAssignment).findOne({
      where: {
        classId: dto.classId,
        role: TeacherAssignmentRole.CLASS_TEACHER,
        isActive: true,
        endDate: IsNull(),
      },
    });
    if (existing && existing.teacherId !== dto.teacherId && !dto.forceReassign) {
      throw new TeacherAssignmentConflictError('This class already has an active class teacher. Use forceReassign to transfer.');
    }
  }

  const startDate = dto.startDate || new Date().toISOString().split('T')[0];
  if (dto.forceReassign) {
    await endConflictingAssignments({
      classId: dto.classId,
      subjectId: dto.subjectId,
      role: dto.role,
      endDate: startDate,
    });
  }

  const repo = AppDataSource.getRepository(TeacherAssignment);
  const assignment = repo.create({
    teacherId: dto.teacherId,
    classId: dto.classId,
    sectionId: await resolveSectionId(dto.classId, dto.sectionId),
    subjectId: dto.role === TeacherAssignmentRole.SUBJECT_TEACHER ? dto.subjectId : null,
    role: dto.role,
    startDate,
    isActive: true,
    weeklyPeriods: dto.weeklyPeriods ?? 0,
    lessonLength: normalizeLessonLength(dto.lessonLength),
    isSharedSplit: dto.isSharedSplit ?? false,
    notes: dto.notes,
  });
  const saved = await repo.save(assignment);
  await syncLegacyAssignmentRow(saved);
  return repo.findOneOrFail({
    where: { id: saved.id },
    relations: relations('teacher', 'teacher.user', 'schoolClass', 'section', 'subject'),
  });
}

export async function bulkCreateTeacherAssignments(dto: BulkTeacherAssignmentDto): Promise<TeacherAssignment[]> {
  assertNoDuplicateTeacherClassInBatch(dto.assignments);
  for (const row of dto.assignments) {
    await assertTeacherNotAlreadyAssignedToClass(row.teacherId, row.classId);
  }

  const created: TeacherAssignment[] = [];
  for (const row of dto.assignments) {
    const assignment = await createTeacherAssignment({ ...row, forceReassign: dto.forceReassign });
    created.push(assignment);
  }
  return created;
}

export async function updateTeacherAssignment(
  id: string,
  dto: UpdateTeacherAssignmentDto,
): Promise<TeacherAssignment> {
  const repo = AppDataSource.getRepository(TeacherAssignment);
  const assignment = await repo.findOne({ where: { id } });
  if (!assignment) throw new Error('Assignment not found');

  if (dto.teacherId && dto.teacherId !== assignment.teacherId) {
    await assertTeachingStaff(dto.teacherId);
    await assertTeacherNotAlreadyAssignedToClass(dto.teacherId, assignment.classId, assignment.id);
    if (dto.forceReassign && assignment.role === TeacherAssignmentRole.SUBJECT_TEACHER && assignment.subjectId) {
      await assertCanAssignTeacherToClassSubject({
        classId: assignment.classId,
        subjectId: assignment.subjectId,
        teacherId: dto.teacherId,
        forceReassign: true,
      });
    }
    assignment.teacherId = dto.teacherId;
  }

  const previousSubjectId = assignment.subjectId;
  if (dto.subjectId !== undefined && dto.subjectId !== assignment.subjectId) {
    if (assignment.role !== TeacherAssignmentRole.SUBJECT_TEACHER) {
      throw new Error('Only subject teacher assignments can change subject');
    }
    if (!dto.subjectId) {
      throw new Error('Subject is required for subject teacher assignments');
    }
    await assertCanAssignTeacherToClassSubject({
      classId: assignment.classId,
      subjectId: dto.subjectId,
      teacherId: assignment.teacherId,
      forceReassign: dto.forceReassign,
    });
    assignment.subjectId = dto.subjectId;
  }

  if (dto.weeklyPeriods !== undefined) assignment.weeklyPeriods = dto.weeklyPeriods;
  if (dto.lessonLength !== undefined) assignment.lessonLength = normalizeLessonLength(dto.lessonLength);
  if (dto.isSharedSplit !== undefined) assignment.isSharedSplit = dto.isSharedSplit;
  if (dto.notes !== undefined) assignment.notes = dto.notes;
  if (dto.endDate !== undefined) assignment.endDate = dto.endDate;
  if (dto.isActive !== undefined) assignment.isActive = dto.isActive;

  const saved = await repo.save(assignment);
  if (!saved.isActive || saved.endDate) {
    await AppDataSource.transaction(async (manager) => {
      await clearTimetableForAssignment(saved, manager);
      await unlinkLegacyAssignmentOnEnd(saved, manager);
    });
  } else {
    if (
      previousSubjectId &&
      saved.subjectId &&
      previousSubjectId !== saved.subjectId &&
      saved.role === TeacherAssignmentRole.SUBJECT_TEACHER
    ) {
      const csRepo = AppDataSource.getRepository(ClassSubject);
      const oldRow = await csRepo.findOne({
        where: { classId: saved.classId, subjectId: previousSubjectId },
      });
      if (oldRow?.teacherId === saved.teacherId) {
        oldRow.teacherId = undefined;
        await csRepo.save(oldRow);
      }
    }
    await syncLegacyAssignmentRow(saved);
  }

  return repo.findOneOrFail({
    where: { id: saved.id },
    relations: relations('teacher', 'teacher.user', 'schoolClass', 'section', 'subject'),
  });
}

export async function endTeacherAssignment(id: string, endDate?: string): Promise<TeacherAssignment> {
  return updateTeacherAssignment(id, {
    isActive: false,
    endDate: endDate || new Date().toISOString().split('T')[0],
  });
}

export async function calculateTeacherWeeklyLoad(teacherId: string): Promise<number> {
  const totals = await calculateTeacherWeeklyLoadTotals(teacherId);
  return totals.totalLoad;
}

async function upsertSubjectTeacherAssignmentFromClassSubject(cs: ClassSubject): Promise<void> {
  if (!cs.teacherId) return;

  const repo = AppDataSource.getRepository(TeacherAssignment);
  const sectionId = await resolveSectionId(cs.classId, null);
  const weeklyPeriods = Math.max(0, Math.round(Number(cs.weeklyPeriods) || 0));
  const lessonLength = normalizeLessonLength(cs.lessonLength);

  let assignment = await repo.findOne({
    where: {
      teacherId: cs.teacherId,
      classId: cs.classId,
      isActive: true,
      endDate: IsNull(),
    },
  });

  if (!assignment) {
    assignment = repo.create({
      teacherId: cs.teacherId,
      classId: cs.classId,
      sectionId,
      subjectId: cs.subjectId,
      role: TeacherAssignmentRole.SUBJECT_TEACHER,
      startDate: new Date().toISOString().split('T')[0],
      isActive: true,
      weeklyPeriods,
      lessonLength,
    });
  } else {
    assignment.subjectId = cs.subjectId;
    assignment.weeklyPeriods = weeklyPeriods;
    assignment.lessonLength = lessonLength;
    assignment.sectionId = sectionId;
    assignment.role = TeacherAssignmentRole.SUBJECT_TEACHER;
    assignment.isActive = true;
    assignment.endDate = null;
  }

  await repo.save(assignment);
}

async function endSubjectTeacherAssignmentsForClassSubject(
  classId: string,
  subjectId: string,
  teacherId?: string,
): Promise<void> {
  const repo = AppDataSource.getRepository(TeacherAssignment);
  const qb = repo
    .createQueryBuilder('a')
    .where('a.classId = :classId', { classId })
    .andWhere('a.subjectId = :subjectId', { subjectId })
    .andWhere('a.role = :role', { role: TeacherAssignmentRole.SUBJECT_TEACHER })
    .andWhere('a.isActive = true')
    .andWhere('a.endDate IS NULL');

  if (teacherId) {
    qb.andWhere('a.teacherId = :teacherId', { teacherId });
  }

  const endDate = new Date().toISOString().split('T')[0];
  const rows = await qb.getMany();
  for (const row of rows) {
    row.isActive = false;
    row.endDate = endDate;
    await repo.save(row);
  }
}

/** Keep teacher_assignments aligned with Staff → Teacher Load (class_subjects). */
export async function syncSubjectAssignmentsFromClassSubjects(): Promise<number> {
  const classSubjects = await AppDataSource.getRepository(ClassSubject).find({
    where: { teacherId: Not(IsNull()) },
  });

  for (const cs of classSubjects) {
    await upsertSubjectTeacherAssignmentFromClassSubject(cs);
  }

  await repairDuplicateTeacherClassAssignments();
  return classSubjects.length;
}

export async function syncSubjectAssignmentFromClassSubjectId(classSubjectId: string): Promise<void> {
  const cs = await AppDataSource.getRepository(ClassSubject).findOne({ where: { id: classSubjectId } });
  if (!cs) return;
  if (cs.teacherId) {
    await upsertSubjectTeacherAssignmentFromClassSubject(cs);
    return;
  }
  await endSubjectTeacherAssignmentsForClassSubject(cs.classId, cs.subjectId);
}

export async function endSubjectTeacherAssignmentsForTeacherClass(
  teacherId: string,
  classId: string,
): Promise<void> {
  const repo = AppDataSource.getRepository(TeacherAssignment);
  const rows = await repo.find({
    where: {
      teacherId,
      classId,
      role: TeacherAssignmentRole.SUBJECT_TEACHER,
      isActive: true,
      endDate: IsNull(),
    },
  });
  const endDate = new Date().toISOString().split('T')[0];
  for (const row of rows) {
    row.isActive = false;
    row.endDate = endDate;
    await repo.save(row);
  }
}

export async function getWorkloadSummaryReport(): Promise<WorkloadSummaryRow[]> {
  await syncSubjectAssignmentsFromClassSubjects();
  await repairDuplicateTeacherClassAssignments();

  const staff = await AppDataSource.getRepository(Staff)
    .createQueryBuilder('s')
    .innerJoinAndSelect('s.user', 'u')
    .where('s.isActive = true')
    .andWhere('u.role IN (:...roles)', { roles: TEACHING_ROLES })
    .orderBy('u.lastName', 'ASC')
    .addOrderBy('u.firstName', 'ASC')
    .getMany();

  const rows: WorkloadSummaryRow[] = [];
  for (const s of staff) {
    const { totalLoad, assignmentCount } = await calculateTeacherWeeklyLoadTotals(s.id);
    const thresholds = await loadThresholdsForTeacher(s.id);
    rows.push({
      teacherId: s.id,
      employeeNumber: s.employeeNumber,
      teacherName: `${s.user.firstName} ${s.user.lastName}`.trim(),
      totalPeriods: totalLoad,
      minThreshold: thresholds.minWeeklyPeriods,
      maxThreshold: thresholds.maxWeeklyPeriods,
      status: workloadStatus(totalLoad, thresholds),
      assignmentCount,
    });
  }
  return rows;
}

export async function getClassRoster(classId: string, sectionId?: string) {
  const where: Record<string, unknown> = { classId, isActive: true, endDate: IsNull() };
  if (sectionId) where.sectionId = sectionId;
  const assignments = await AppDataSource.getRepository(TeacherAssignment).find({
    where,
    relations: relations('teacher', 'teacher.user', 'subject', 'section', 'timetableSlots'),
    order: { role: 'ASC', createdAt: 'ASC' },
  });

  const cls = await AppDataSource.getRepository(SchoolClass).findOne({
    where: { id: classId },
    relations: relations('form', 'classTeacher', 'classTeacher.user'),
  });

  return { class: cls, assignments };
}

async function buildPeriodNumberLookup(): Promise<Map<string, number>> {
  const rows = await AppDataSource.getRepository(Timetable)
    .createQueryBuilder('t')
    .select('DISTINCT t.startTime', 'startTime')
    .orderBy('t.startTime', 'ASC')
    .getRawMany<{ startTime: string }>();
  const map = new Map<string, number>();
  rows.forEach((row, index) => map.set(row.startTime, index + 1));
  return map;
}

/** Link generated `timetables` rows to `timetable_slots` on teacher assignments. */
export async function syncTimetableSlotsFromGenerated(options?: {
  teacherId?: string;
  replaceAll?: boolean;
}): Promise<number> {
  const slotRepo = AppDataSource.getRepository(TimetableSlot);
  const timetableRepo = AppDataSource.getRepository(Timetable);
  const assignmentRepo = AppDataSource.getRepository(TeacherAssignment);

  if (options?.replaceAll) {
    await slotRepo.createQueryBuilder().delete().execute();
  }

  const periodLookup = await buildPeriodNumberLookup();
  const rows = await timetableRepo.find({
    where: options?.teacherId ? { teacherId: options.teacherId } : { teacherId: Not(IsNull()) },
    relations: relations('schoolClass', 'subject'),
    order: { dayOfWeek: 'ASC', startTime: 'ASC' },
  });

  let created = 0;
  for (const row of rows) {
    if (!row.teacherId) continue;

    const existing = await slotRepo.findOne({ where: { timetableEntryId: row.id } });
    if (existing) continue;

    const assignment = await assignmentRepo.findOne({
      where: {
        teacherId: row.teacherId,
        classId: row.classId,
        subjectId: row.subjectId,
        role: TeacherAssignmentRole.SUBJECT_TEACHER,
        isActive: true,
        endDate: IsNull(),
      },
    });
    if (!assignment) continue;

    await slotRepo.save(
      slotRepo.create({
        teacherAssignmentId: assignment.id,
        dayOfWeek: dayIntToEnum(row.dayOfWeek),
        periodNumber: periodLookup.get(row.startTime) ?? 1,
        startTime: row.startTime,
        endTime: row.endTime,
        timetableEntryId: row.id,
      }),
    );
    created += 1;
  }

  return created;
}

async function loadTeacherScheduleSlots(teacherId: string, assignmentIds: string[]) {
  if (!assignmentIds.length) return [];
  return AppDataSource.getRepository(TimetableSlot).find({
    where: { teacherAssignmentId: In(assignmentIds) },
    relations: relations('assignment', 'assignment.schoolClass', 'assignment.subject'),
    order: { dayOfWeek: 'ASC', periodNumber: 'ASC' },
  });
}

export async function getTeacherWeeklySchedule(teacherId: string) {
  const assignments = await listTeacherAssignments({ teacherId, activeOnly: true });
  const assignmentIds = assignments.map((a) => a.id);
  let slots = await loadTeacherScheduleSlots(teacherId, assignmentIds);

  const timetableRows = await AppDataSource.getRepository(Timetable).find({
    where: { teacherId },
    relations: relations('schoolClass', 'subject'),
    order: { dayOfWeek: 'ASC', startTime: 'ASC' },
  });

  if (!slots.length && timetableRows.length) {
    await syncTimetableSlotsFromGenerated({ teacherId });
    slots = await loadTeacherScheduleSlots(teacherId, assignmentIds);
  }

  return { assignments, slots, timetableRows };
}

const conflictService = new TimetableConflictService();

export async function createTimetableSlot(dto: CreateTimetableSlotDto): Promise<TimetableSlot> {
  const assignment = await AppDataSource.getRepository(TeacherAssignment).findOne({
    where: { id: dto.teacherAssignmentId },
    relations: relations('schoolClass', 'subject'),
  });
  if (!assignment || !assignment.isActive) {
    throw new Error('Active teacher assignment not found');
  }

  const conflict = await conflictService.checkTeacherConflict(
    assignment.teacherId,
    dto.dayOfWeek,
    dto.startTime,
    dto.endTime,
  );
  if (conflict) {
    throw new TeacherAssignmentConflictError(conflictService.formatConflictMessage(conflict));
  }

  const repo = AppDataSource.getRepository(TimetableSlot);
  const slot = repo.create({
    teacherAssignmentId: dto.teacherAssignmentId,
    dayOfWeek: dto.dayOfWeek,
    periodNumber: dto.periodNumber,
    startTime: dto.startTime,
    endTime: dto.endTime,
    timetableEntryId: dto.timetableEntryId ?? null,
  });
  return repo.save(slot);
}

export async function updateTimetableSlot(id: string, dto: UpdateTimetableSlotDto): Promise<TimetableSlot> {
  const repo = AppDataSource.getRepository(TimetableSlot);
  const slot = await repo.findOne({
    where: { id },
    relations: relations('assignment'),
  });
  if (!slot) throw new Error('Timetable slot not found');

  const dayOfWeek = dto.dayOfWeek ?? slot.dayOfWeek;
  const startTime = dto.startTime ?? slot.startTime;
  const endTime = dto.endTime ?? slot.endTime;

  const conflict = await conflictService.checkTeacherConflict(
    slot.assignment.teacherId,
    dayOfWeek,
    startTime,
    endTime,
  );
  if (conflict) {
    throw new TeacherAssignmentConflictError(conflictService.formatConflictMessage(conflict));
  }

  Object.assign(slot, dto);
  return repo.save(slot);
}

export async function deleteTimetableSlot(id: string): Promise<void> {
  await AppDataSource.getRepository(TimetableSlot).delete(id);
}

export async function listSections(formId?: string) {
  const where: Record<string, unknown> = { isActive: true };
  if (formId) where.formId = formId;
  return AppDataSource.getRepository(Section).find({ where, order: { name: 'ASC' } });
}

export { lessonLengthMultiplier, effectiveWeeklyPeriods };
