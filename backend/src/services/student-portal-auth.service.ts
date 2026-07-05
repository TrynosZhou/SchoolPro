import bcrypt from 'bcryptjs';
import { AppDataSource } from '../config/data-source';
import { Student, User } from '../entities';
import { UserRole } from '../entities/enums';
import { USER_PROFILES } from '../utils/typeorm-helpers';

/** Normalize a date string to YYYY-MM-DD for comparison. */
export function normalizeDateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function studentPortalEmail(admissionNumber: string): string {
  const safe = admissionNumber.toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${safe}@student.portal`;
}

async function syncPortalPasswordHash(user: User, dateOfBirth: string): Promise<void> {
  const matches = await bcrypt.compare(dateOfBirth, user.passwordHash);
  if (matches) return;
  user.passwordHash = await bcrypt.hash(dateOfBirth, 10);
  user.failedLoginAttempts = 0;
  user.lockedUntil = null;
  await AppDataSource.getRepository(User).save(user);
}

async function createStudentPortalUser(student: Student, dateOfBirth: string): Promise<User> {
  const userRepo = AppDataSource.getRepository(User);
  const admission = student.admissionNumber.trim().toUpperCase();
  const email = studentPortalEmail(admission);

  const existing = await userRepo.findOne({ where: { email } });
  if (existing) {
    student.userId = existing.id;
    await AppDataSource.getRepository(Student).save(student);
    await syncPortalPasswordHash(existing, dateOfBirth);
    return (await userRepo.findOne({ where: { id: existing.id }, relations: USER_PROFILES }))!;
  }

  const passwordHash = await bcrypt.hash(dateOfBirth, 10);
  const user = await userRepo.save(
    userRepo.create({
      email,
      username: admission,
      passwordHash,
      firstName: student.firstName,
      lastName: student.lastName,
      role: UserRole.STUDENT,
      isActive: true,
    }),
  );

  student.userId = user.id;
  await AppDataSource.getRepository(Student).save(student);

  const full = await userRepo.findOne({ where: { id: user.id }, relations: USER_PROFILES });
  if (!full) throw new Error('Failed to create student portal account');
  return full;
}

export type StudentPortalAuthResult =
  | { ok: true; user: User }
  | { ok: false; status: number; message: string };

/**
 * Authenticate a student using admission number + date of birth.
 * Auto-provisions a portal user on first successful login.
 */
export async function authenticateStudentPortal(
  admissionNumber: string,
  dateOfBirth: string,
): Promise<StudentPortalAuthResult> {
  const admission = String(admissionNumber || '').trim().toUpperCase();
  const dob = normalizeDateOnly(dateOfBirth);

  if (!admission) {
    return { ok: false, status: 400, message: 'Student ID is required' };
  }
  if (!dob) {
    return { ok: false, status: 400, message: 'Date of birth is required' };
  }

  const studentRepo = AppDataSource.getRepository(Student);
  const student = await studentRepo.findOne({
    where: { admissionNumber: admission, isActive: true },
    relations: { user: true },
  });

  if (!student) {
    return { ok: false, status: 401, message: 'Invalid Student ID or date of birth' };
  }

  if (!student.dateOfBirth) {
    return {
      ok: false,
      status: 403,
      message: 'Date of birth is not on file for this student. Please contact the school office.',
    };
  }

  const recordDob = normalizeDateOnly(student.dateOfBirth);
  if (!recordDob || recordDob !== dob) {
    return { ok: false, status: 401, message: 'Invalid Student ID or date of birth' };
  }

  let user: User;
  if (student.userId && student.user?.isActive !== false) {
    user = (await AppDataSource.getRepository(User).findOne({
      where: { id: student.userId },
      relations: USER_PROFILES,
    }))!;
    if (!user) {
      return { ok: false, status: 500, message: 'Student portal account is misconfigured. Contact the school office.' };
    }
    await syncPortalPasswordHash(user, dob);
    user = (await AppDataSource.getRepository(User).findOne({
      where: { id: user.id },
      relations: USER_PROFILES,
    }))!;
  } else {
    user = await createStudentPortalUser(student, dob);
  }

  return { ok: true, user };
}
