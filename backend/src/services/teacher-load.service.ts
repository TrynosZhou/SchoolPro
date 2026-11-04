import { IsNull, Not } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import { ClassSubject, Staff, Timetable } from '../entities';
import { LessonLength, UserRole } from '../entities/enums';
import { relations } from '../utils/typeorm-helpers';
import {
  assertCanAssignTeacherToClassSubject,
  syncTimetableTeachersForAssignment,
} from './class-subject-teacher.service';

export function lessonLengthMultiplier(lessonLength?: LessonLength | string | null): number {
  switch (lessonLength) {
    case LessonLength.DOUBLE:
      return 2;
    case LessonLength.TRIPLE:
      return 3;
    default:
      return 1;
  }
}

export function normalizeLessonLength(value?: string | null): LessonLength {
  if (value === LessonLength.DOUBLE) return LessonLength.DOUBLE;
  if (value === LessonLength.TRIPLE) return LessonLength.TRIPLE;
  return LessonLength.SINGLE;
}

export function effectiveWeeklyPeriods(weeklyPeriods: number, lessonLength?: LessonLength | string | null): number {
  const count = Math.max(0, Math.round(Number(weeklyPeriods) || 0));
  return count * lessonLengthMultiplier(lessonLength);
}

export interface TeacherLoadAssignmentRow {
  classSubjectId: string;
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  subjectCode: string | null;
  /** Lessons per week (before single/double/triple multiplier). */
  weeklyPeriods: number;
  lessonLength: LessonLength;
  /** Timetable slots per week (weeklyPeriods × lesson length). */
  periods: number;
  timetablePeriods: number;
}

export interface TeacherLoadClassGroup {
  classId: string;
  className: string;
  subjects: TeacherLoadAssignmentRow[];
  classLoad: number;
}

export interface TeacherLoadEntry {
  teacherId: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  classes: TeacherLoadClassGroup[];
  totalLoad: number;
}

export interface TeacherLoadReport {
  teachers: TeacherLoadEntry[];
  summary: {
    teacherCount: number;
    teachersWithAssignments: number;
    teachersWithTimetableLoad: number;
    totalPeriods: number;
  };
}

async function countTimetablePeriods(
  teacherId: string,
  classId: string,
  subjectId: string,
): Promise<number> {
  return AppDataSource.getRepository(Timetable).count({
    where: { teacherId, classId, subjectId },
  });
}

async function countAllocationPeriods(
  teacherId: string,
  classId: string,
  subjectId: string,
): Promise<number> {
  try {
    const rows = await AppDataSource.query(
      `SELECT COUNT(*)::int AS count FROM teacher_allocations
       WHERE "teacherId" = $1 AND "classId" = $2 AND "subjectId" = $3`,
      [teacherId, classId, subjectId],
    );
    return Number(rows[0]?.count || 0);
  } catch {
    return 0;
  }
}

function resolvePeriods(weeklyPeriods: number, lessonLength: LessonLength, timetablePeriods: number): number {
  const planned = effectiveWeeklyPeriods(weeklyPeriods, lessonLength);
  if (planned > 0) return planned;
  return timetablePeriods;
}

function emptyTeacherEntry(staff: Staff): TeacherLoadEntry {
  const user = staff.user;
  return {
    teacherId: staff.id,
    employeeNumber: staff.employeeNumber,
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    classes: [],
    totalLoad: 0,
  };
}

/** Roles that may appear on the Teacher Load tab and receive class assignments. */
const TEACHING_STAFF_ROLES: UserRole[] = [
  UserRole.TEACHER,
  UserRole.PRINCIPAL,
  UserRole.ADMIN,
];

function canReceiveTeacherLoad(staff: Staff): boolean {
  const role = staff.user?.role;
  return Boolean(
    staff.isActive &&
    staff.user?.isActive !== false &&
    role &&
    TEACHING_STAFF_ROLES.includes(role),
  );
}

async function loadStaffForAssignment(teacherId: string): Promise<Staff> {
  const repo = AppDataSource.getRepository(Staff);
  let staff = await repo
    .createQueryBuilder('s')
    .innerJoinAndSelect('s.user', 'u')
    .where('s.id = :id', { id: teacherId })
    .getOne();

  if (!staff) {
    staff = await repo
      .createQueryBuilder('s')
      .innerJoinAndSelect('s.user', 'u')
      .where('s.userId = :userId', { userId: teacherId })
      .getOne();
  }

  if (!staff) {
    throw new Error('Staff member not found.');
  }
  if (!staff.isActive) {
    throw new Error('This staff member is inactive. Reactivate them before assigning lessons.');
  }
  if (staff.user && !staff.user.isActive) {
    throw new Error('This staff member\'s portal account is inactive. Reactivate them before assigning lessons.');
  }
  if (!canReceiveTeacherLoad(staff)) {
    const name = `${staff.user?.firstName || ''} ${staff.user?.lastName || ''}`.trim() || 'Staff';
    throw new Error(`${name} cannot be assigned lessons (portal role must be teacher, principal, or admin).`);
  }
  return staff;
}

export async function getTeacherLoadReport(): Promise<TeacherLoadReport> {
  const staffRepo = AppDataSource.getRepository(Staff);
  const csRepo = AppDataSource.getRepository(ClassSubject);

  const activeTeachers = await staffRepo
    .createQueryBuilder('s')
    .innerJoinAndSelect('s.user', 'u')
    .andWhere('s.isActive = :active', { active: true })
    .andWhere('u.isActive = :userActive', { userActive: true })
    .andWhere('u.role IN (:...roles)', { roles: TEACHING_STAFF_ROLES })
    .orderBy('u.lastName', 'ASC')
    .addOrderBy('u.firstName', 'ASC')
    .getMany();

  const assignedRows = await csRepo.find({
    where: { teacherId: Not(IsNull()) },
    relations: relations('teacher', 'teacher.user', 'schoolClass', 'subject'),
    order: { schoolClass: { name: 'ASC' }, subject: { name: 'ASC' } },
  });

  const byTeacher = new Map<string, TeacherLoadEntry>();
  for (const staff of activeTeachers) {
    byTeacher.set(staff.id, emptyTeacherEntry(staff));
  }

  const classMap = new Map<string, Map<string, TeacherLoadClassGroup>>();

  for (const cs of assignedRows) {
    const teacherId = cs.teacherId!;
    let teacherEntry = byTeacher.get(teacherId);

    if (!teacherEntry && cs.teacher) {
      teacherEntry = emptyTeacherEntry(cs.teacher);
      byTeacher.set(teacherId, teacherEntry);
    }
    if (!teacherEntry) continue;

    const classId = cs.classId;
    const className = cs.schoolClass?.name || 'Class';
    const weeklyPeriods = Number(cs.weeklyPeriods || 0);
    const lessonLength = normalizeLessonLength(cs.lessonLength);
    const timetablePeriods = Math.max(
      await countAllocationPeriods(teacherId, classId, cs.subjectId),
      await countTimetablePeriods(teacherId, classId, cs.subjectId),
    );
    const periods = resolvePeriods(weeklyPeriods, lessonLength, timetablePeriods);

    if (!classMap.has(teacherId)) classMap.set(teacherId, new Map());
    const teacherClasses = classMap.get(teacherId)!;

    if (!teacherClasses.has(classId)) {
      teacherClasses.set(classId, { classId, className, subjects: [], classLoad: 0 });
    }

    const classGroup = teacherClasses.get(classId)!;
    classGroup.subjects.push({
      classSubjectId: cs.id,
      classId,
      className,
      subjectId: cs.subjectId,
      subjectName: cs.subject?.name || 'Subject',
      subjectCode: cs.subject?.code || null,
      weeklyPeriods,
      lessonLength,
      periods,
      timetablePeriods,
    });
    classGroup.classLoad += periods;
    teacherEntry.totalLoad += periods;
  }

  for (const [teacherId, teacher] of byTeacher) {
    const groups = classMap.get(teacherId);
    teacher.classes = groups ? [...groups.values()] : [];
  }

  const result = [...byTeacher.values()].sort((a, b) => {
    const nameA = `${a.lastName} ${a.firstName}`.toLowerCase();
    const nameB = `${b.lastName} ${b.firstName}`.toLowerCase();
    return nameA.localeCompare(nameB);
  });

  const teachersWithAssignments = result.filter((t) => t.classes.length > 0).length;
  const teachersWithTimetableLoad = result.filter((t) => t.totalLoad > 0).length;
  const totalPeriods = result.reduce((sum, t) => sum + t.totalLoad, 0);

  return {
    teachers: result,
    summary: {
      teacherCount: result.length,
      teachersWithAssignments,
      teachersWithTimetableLoad,
      totalPeriods,
    },
  };
}

/** Planned weekly load for one teacher — matches Staff → Teacher Load totals. */
export async function calculateTeacherWeeklyLoadTotals(teacherId: string): Promise<{
  totalLoad: number;
  assignmentCount: number;
}> {
  const rows = await AppDataSource.getRepository(ClassSubject).find({
    where: { teacherId },
  });

  let totalLoad = 0;
  for (const cs of rows) {
    const weeklyPeriods = Number(cs.weeklyPeriods || 0);
    const lessonLength = normalizeLessonLength(cs.lessonLength);
    const timetablePeriods = Math.max(
      await countAllocationPeriods(teacherId, cs.classId, cs.subjectId),
      await countTimetablePeriods(teacherId, cs.classId, cs.subjectId),
    );
    totalLoad += resolvePeriods(weeklyPeriods, lessonLength, timetablePeriods);
  }

  return { totalLoad, assignmentCount: rows.length };
}

export interface AddTeacherLoadInput {
  teacherId: string;
  classId: string;
  subjectId: string;
  weeklyPeriods: number;
  lessonLength?: LessonLength | string;
  forceReassign?: boolean;
}


export async function addTeacherLoadAssignment(input: AddTeacherLoadInput) {
  const { classId, subjectId, forceReassign } = input;
  const weeklyPeriods = Math.max(1, Math.round(Number(input.weeklyPeriods) || 0));
  const lessonLength = normalizeLessonLength(input.lessonLength);

  const staff = await loadStaffForAssignment(input.teacherId);
  const teacherId = staff.id;

  const repo = AppDataSource.getRepository(ClassSubject);
  let row = await assertCanAssignTeacherToClassSubject({
    classId,
    subjectId,
    teacherId,
    forceReassign,
  });

  if (!row) {
    row = repo.create({ classId, subjectId, teacherId, weeklyPeriods, lessonLength });
  } else {
    row.teacherId = teacherId;
    row.weeklyPeriods = weeklyPeriods;
    row.lessonLength = lessonLength;
  }

  const saved = await repo.save(row);
  await syncTimetableTeachersForAssignment(classId, subjectId, teacherId);
  const report = await getTeacherLoadReport();
  return { assignment: saved, report };
}

export async function removeTeacherLoadClassAssignments(teacherId: string, classId: string) {
  if (!teacherId || !classId) {
    throw new Error('teacherId and classId are required.');
  }

  await AppDataSource.getRepository(ClassSubject)
    .createQueryBuilder()
    .update(ClassSubject)
    .set({ teacherId: null, weeklyPeriods: 0, lessonLength: LessonLength.SINGLE })
    .where('"teacherId" = :teacherId AND "classId" = :classId', { teacherId, classId })
    .execute();

  return getTeacherLoadReport();
}

export async function removeTeacherLoadAssignment(classSubjectId: string) {
  if (!classSubjectId) {
    throw new Error('classSubjectId is required.');
  }

  const repo = AppDataSource.getRepository(ClassSubject);
  const row = await repo.findOne({ where: { id: classSubjectId } });
  if (!row) {
    throw new Error('Assignment not found.');
  }

  await repo
    .createQueryBuilder()
    .update(ClassSubject)
    .set({ teacherId: null, weeklyPeriods: 0, lessonLength: LessonLength.SINGLE })
    .where('id = :id', { id: classSubjectId })
    .execute();

  return getTeacherLoadReport();
}
