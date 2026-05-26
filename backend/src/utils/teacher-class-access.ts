import { AppDataSource } from '../config/data-source';
import { UserRole } from '../entities/enums';
import type { AuthRequest } from '../middleware/auth';

export async function assertTeacherClassAccess(req: AuthRequest, classId: string): Promise<boolean> {
  if (req.user!.role !== UserRole.TEACHER) return true;
  if (!req.user!.staffId) return false;
  const allowed = await AppDataSource.query(
    `SELECT 1 FROM class_subjects cs WHERE cs."classId" = $1 AND cs."teacherId" = $2 LIMIT 1`,
    [classId, req.user!.staffId],
  );
  return allowed.length > 0;
}
