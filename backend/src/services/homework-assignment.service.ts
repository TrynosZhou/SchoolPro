import { AppDataSource } from '../config/data-source';
import { HomeworkAssignment, Notification } from '../entities';
import { UserRole } from '../entities/enums';
import type { AuthRequest } from '../middleware/auth';
import { assertTeacherClassAccess } from '../utils/teacher-class-access';
import { homeworkFileUrl } from '../utils/homework-assignments';
import { relations } from '../utils/typeorm-helpers';

export interface HomeworkAssignmentDto {
  id: string;
  classId: string;
  className?: string;
  subjectId?: string | null;
  subjectName?: string | null;
  termId: string;
  termName?: string;
  teacherId: string;
  teacherName?: string;
  title: string;
  instructions?: string | null;
  originalFileName: string;
  fileUrl: string;
  mimeType: string;
  fileSize: number;
  dueDate?: string | null;
  createdAt: Date;
}

function mapRow(row: HomeworkAssignment): HomeworkAssignmentDto {
  const teacherUser = row.teacher?.user;
  const teacherName = teacherUser
    ? `${teacherUser.firstName} ${teacherUser.lastName}`.trim()
    : undefined;

  return {
    id: row.id,
    classId: row.classId,
    className: row.schoolClass?.name,
    subjectId: row.subjectId ?? null,
    subjectName: row.subject?.name ?? null,
    termId: row.termId,
    termName: row.term?.name,
    teacherId: row.teacherId,
    teacherName,
    title: row.title,
    instructions: row.instructions ?? null,
    originalFileName: row.originalFileName,
    fileUrl: homeworkFileUrl(row.storedFileName),
    mimeType: row.mimeType,
    fileSize: row.fileSize,
    dueDate: row.dueDate ?? null,
    createdAt: row.createdAt,
  };
}

async function notifyClassStudents(
  classId: string,
  title: string,
  assignmentId: string,
  teacherName: string,
): Promise<void> {
  const students = await AppDataSource.query(
    `SELECT "userId" FROM students WHERE "classId" = $1 AND "isActive" = true AND "userId" IS NOT NULL`,
    [classId],
  );
  if (!students.length) return;

  const notifRepo = AppDataSource.getRepository(Notification);
  const rows = students.map((s: { userId: string }) =>
    notifRepo.create({
      userId: s.userId,
      title: 'New assignment posted',
      message: `${teacherName} posted "${title}" for your class.`,
      type: 'homework_assignment',
      metadata: { assignmentId, classId },
    }),
  );
  await notifRepo.save(rows);
}

export async function listTeacherHomeworkAssignments(
  req: AuthRequest,
  classId?: string,
  termId?: string,
): Promise<HomeworkAssignmentDto[]> {
  const repo = AppDataSource.getRepository(HomeworkAssignment);
  const qb = repo
    .createQueryBuilder('a')
    .leftJoinAndSelect('a.schoolClass', 'c')
    .leftJoinAndSelect('a.subject', 'sub')
    .leftJoinAndSelect('a.term', 't')
    .leftJoinAndSelect('a.teacher', 'teacher')
    .leftJoinAndSelect('teacher.user', 'teacherUser');

  if (req.user!.staffId) {
    qb.where('a.teacherId = :teacherId', { teacherId: req.user!.staffId });
  }

  if (classId) {
    if (req.user!.role === UserRole.TEACHER) {
      const allowed = await assertTeacherClassAccess(req, classId);
      if (!allowed) throw Object.assign(new Error('You are not assigned to this class.'), { statusCode: 403 });
    }
    qb.andWhere('a.classId = :classId', { classId });
  }
  if (termId) qb.andWhere('a.termId = :termId', { termId });

  const rows = await qb.orderBy('a.createdAt', 'DESC').getMany();
  return rows.map(mapRow);
}

export async function listStudentHomeworkAssignments(
  studentId: string,
  termId?: string,
): Promise<HomeworkAssignmentDto[]> {
  const studentRows = await AppDataSource.query(
    `SELECT "classId" FROM students WHERE id = $1 AND "isActive" = true LIMIT 1`,
    [studentId],
  );
  const classId = studentRows[0]?.classId;
  if (!classId) return [];

  const repo = AppDataSource.getRepository(HomeworkAssignment);
  const where: { classId: string; termId?: string } = { classId };
  if (termId) where.termId = termId;

  const rows = await repo.find({
    where,
    relations: relations('schoolClass', 'subject', 'term', 'teacher', 'teacher.user'),
    order: { createdAt: 'DESC' },
  });
  return rows.map(mapRow);
}

export interface CreateHomeworkAssignmentInput {
  classId: string;
  termId: string;
  subjectId?: string;
  title: string;
  instructions?: string;
  dueDate?: string;
  originalFileName: string;
  storedFileName: string;
  mimeType: string;
  fileSize: number;
}

export async function createHomeworkAssignment(
  req: AuthRequest,
  input: CreateHomeworkAssignmentInput,
): Promise<HomeworkAssignmentDto> {
  const staffId = req.user!.staffId;
  if (!staffId) throw Object.assign(new Error('Teacher profile not linked.'), { statusCode: 403 });

  const allowed = await assertTeacherClassAccess(req, input.classId);
  if (!allowed) throw Object.assign(new Error('You are not assigned to this class.'), { statusCode: 403 });

  if (input.subjectId) {
    const subjectRows = await AppDataSource.query(
      `SELECT 1 FROM class_subjects cs
       WHERE cs."classId" = $1 AND cs."subjectId" = $2 AND cs."teacherId" = $3
       LIMIT 1`,
      [input.classId, input.subjectId, staffId],
    );
    const classTeacher = await AppDataSource.query(
      `SELECT 1 FROM classes c WHERE c.id = $1 AND c."classTeacherId" = $2 LIMIT 1`,
      [input.classId, staffId],
    );
    if (!subjectRows.length && !classTeacher.length) {
      throw Object.assign(new Error('You are not assigned to teach that subject in this class.'), {
        statusCode: 403,
      });
    }
  }

  const repo = AppDataSource.getRepository(HomeworkAssignment);
  const saved = await repo.save(
    repo.create({
      classId: input.classId,
      termId: input.termId,
      subjectId: input.subjectId || null,
      teacherId: staffId,
      title: input.title.trim(),
      instructions: input.instructions?.trim() || null,
      originalFileName: input.originalFileName,
      storedFileName: input.storedFileName,
      mimeType: input.mimeType,
      fileSize: input.fileSize,
      dueDate: input.dueDate || null,
    }),
  );

  const full = await repo.findOne({
    where: { id: saved.id },
    relations: relations('schoolClass', 'subject', 'term', 'teacher', 'teacher.user'),
  });
  if (!full) throw new Error('Failed to load saved assignment.');

  const teacherName = full.teacher?.user
    ? `${full.teacher.user.firstName} ${full.teacher.user.lastName}`.trim()
    : 'Your teacher';
  void notifyClassStudents(input.classId, full.title, full.id, teacherName).catch((err) =>
    console.error('notifyClassStudents failed:', err),
  );

  return mapRow(full);
}

export async function listTeacherSubjectsForClass(
  staffId: string,
  classId: string,
): Promise<{ id: string; code: string; name: string }[]> {
  const rows = await AppDataSource.query(
    `
    SELECT DISTINCT sub.id, sub.code, sub.name
    FROM class_subjects cs
    JOIN subjects sub ON sub.id = cs."subjectId"
    WHERE cs."classId" = $1 AND cs."teacherId" = $2
    ORDER BY sub.name ASC
    `,
    [classId, staffId],
  );
  return rows;
}
