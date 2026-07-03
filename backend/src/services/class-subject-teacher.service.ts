import { EntityManager } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import { ClassSubject, Staff, Timetable, TeacherAllocation } from '../entities';
import { UserRole } from '../entities/enums';
import { relations } from '../utils/typeorm-helpers';

export class ClassSubjectTeacherConflictError extends Error {
  statusCode = 409;
  existingTeacherId?: string;
  existingTeacherName?: string;

  constructor(message: string, existingTeacherId?: string, existingTeacherName?: string) {
    super(message);
    this.name = 'ClassSubjectTeacherConflictError';
    this.existingTeacherId = existingTeacherId;
    this.existingTeacherName = existingTeacherName;
  }
}

const TEACHING_STAFF_ROLES: UserRole[] = [UserRole.TEACHER, UserRole.PRINCIPAL, UserRole.ADMIN];

export async function findClassSubjectAssignment(
  classId: string,
  subjectId: string,
): Promise<ClassSubject | null> {
  return AppDataSource.getRepository(ClassSubject).findOne({
    where: { classId, subjectId },
  });
}

export async function staffDisplayName(staffId: string): Promise<string> {
  const staff = await AppDataSource.getRepository(Staff)
    .createQueryBuilder('s')
    .innerJoinAndSelect('s.user', 'u')
    .where('s.id = :id', { id: staffId })
    .getOne();
  if (!staff?.user) return 'another teacher';
  return `${staff.user.firstName} ${staff.user.lastName}`.trim() || 'another teacher';
}

async function isActiveTeachingStaff(staffId: string): Promise<boolean> {
  const staff = await AppDataSource.getRepository(Staff)
    .createQueryBuilder('s')
    .innerJoinAndSelect('s.user', 'u')
    .where('s.id = :id', { id: staffId })
    .getOne();
  if (!staff?.isActive || !staff.user?.isActive) return false;
  return TEACHING_STAFF_ROLES.includes(staff.user.role);
}

/**
 * Ensures at most one teacher is assigned to teach a subject in a class.
 * Returns the existing class-subject row when present (may be updated by caller).
 */
export async function assertCanAssignTeacherToClassSubject(input: {
  classId: string;
  subjectId: string;
  teacherId: string;
  forceReassign?: boolean;
}): Promise<ClassSubject | null> {
  const { classId, subjectId, teacherId, forceReassign } = input;
  if (!teacherId) {
    return findClassSubjectAssignment(classId, subjectId);
  }

  const row = await findClassSubjectAssignment(classId, subjectId);

  if (!row?.teacherId || row.teacherId === teacherId) {
    return row;
  }

  const otherActive = await isActiveTeachingStaff(row.teacherId);
  if (otherActive && !forceReassign) {
    const otherName = await staffDisplayName(row.teacherId);
    throw new ClassSubjectTeacherConflictError(
      `This class/subject is already assigned to ${otherName}.`,
      row.teacherId,
      otherName,
    );
  }

  return row;
}

/** Timetable slots for a class/subject must use the canonical teacher from class_subjects. */
export async function assertTimetableTeacherMatchesAssignment(
  classId: string,
  subjectId: string,
  teacherId: string,
): Promise<void> {
  const row = await findClassSubjectAssignment(classId, subjectId);
  if (!row?.teacherId) {
    throw new Error('Assign this class and subject to a teacher on Staff → Teacher Load first.');
  }
  if (row.teacherId !== teacherId) {
    const assignedName = await staffDisplayName(row.teacherId);
    throw new ClassSubjectTeacherConflictError(
      `${assignedName} is the assigned teacher for this class/subject. Reassign on Teacher Load before changing timetable teachers.`,
      row.teacherId,
      assignedName,
    );
  }
}

export async function syncTimetableTeachersForAssignment(
  classId: string,
  subjectId: string,
  teacherId: string,
  manager?: EntityManager,
): Promise<void> {
  const timetableRepo = manager
    ? manager.getRepository(Timetable)
    : AppDataSource.getRepository(Timetable);
  const allocationRepo = manager
    ? manager.getRepository(TeacherAllocation)
    : AppDataSource.getRepository(TeacherAllocation);

  await timetableRepo
    .createQueryBuilder()
    .update(Timetable)
    .set({ teacherId })
    .where('"classId" = :classId AND "subjectId" = :subjectId AND ("teacherId" IS NULL OR "teacherId" <> :teacherId)', {
      classId,
      subjectId,
      teacherId,
    })
    .execute();

  await allocationRepo
    .createQueryBuilder()
    .update(TeacherAllocation)
    .set({ teacherId })
    .where('"classId" = :classId AND "subjectId" = :subjectId AND "teacherId" <> :teacherId', {
      classId,
      subjectId,
      teacherId,
    })
    .execute();
}

export async function listClassSubjectTeachers(classId: string) {
  const rows = await AppDataSource.getRepository(ClassSubject).find({
    where: { classId },
    relations: relations('subject', 'teacher', 'teacher.user'),
    order: { subject: { name: 'ASC' } },
  });
  return rows.map((row) => ({
    id: row.id,
    classId: row.classId,
    subjectId: row.subjectId,
    teacherId: row.teacherId || null,
    weeklyPeriods: row.weeklyPeriods,
    lessonLength: row.lessonLength,
    subject: row.subject
      ? { id: row.subject.id, code: row.subject.code, name: row.subject.name, short: row.subject.short }
      : null,
    teacher: row.teacher
      ? {
          id: row.teacher.id,
          employeeNumber: row.teacher.employeeNumber,
          firstName: row.teacher.user?.firstName || '',
          lastName: row.teacher.user?.lastName || '',
        }
      : null,
  }));
}
