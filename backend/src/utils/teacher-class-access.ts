import { AppDataSource } from '../config/data-source';
import { UserRole } from '../entities/enums';
import type { AuthRequest } from '../middleware/auth';

export async function assertTeacherClassAccess(req: AuthRequest, classId: string): Promise<boolean> {
  if (req.user!.role !== UserRole.TEACHER) return true;
  if (!req.user!.staffId) return false;

  const [subjectAssignment, classTeacher] = await Promise.all([
    AppDataSource.query(
      `SELECT 1 FROM class_subjects cs WHERE cs."classId" = $1 AND cs."teacherId" = $2 LIMIT 1`,
      [classId, req.user!.staffId],
    ),
    isClassTeacher(req.user!.staffId, classId),
  ]);

  return subjectAssignment.length > 0 || classTeacher;
}

export async function isClassTeacher(staffId: string, classId: string): Promise<boolean> {
  const rows = await AppDataSource.query(
    `SELECT 1 FROM classes c WHERE c.id = $1 AND c."classTeacherId" = $2 LIMIT 1`,
    [classId, staffId],
  );
  return rows.length > 0;
}

export async function assertTeacherSubjectAccess(
  req: AuthRequest,
  classId: string,
  subjectId: string,
): Promise<boolean> {
  if (req.user!.role !== UserRole.TEACHER) return true;
  const staffId = req.user!.staffId;
  if (!staffId) return false;

  if (await isClassTeacher(staffId, classId)) return true;

  const rows = await AppDataSource.query(
    `SELECT 1 FROM class_subjects cs
     WHERE cs."classId" = $1 AND cs."subjectId" = $2 AND cs."teacherId" = $3
     LIMIT 1`,
    [classId, subjectId, staffId],
  );

  return rows.length > 0;
}

/** Teachers may mark attendance only for the class they are assigned as class teacher. */
export async function assertTeacherClassTeacherAccess(req: AuthRequest, classId: string): Promise<boolean> {
  if (req.user!.role !== UserRole.TEACHER) return true;
  if (!req.user!.staffId) return false;

  const rows = await AppDataSource.query(
    `SELECT 1 FROM classes c WHERE c.id = $1 AND c."classTeacherId" = $2 LIMIT 1`,
    [classId, req.user!.staffId],
  );

  return rows.length > 0;
}
