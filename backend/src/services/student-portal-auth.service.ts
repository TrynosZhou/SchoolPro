import bcrypt from 'bcryptjs';
import { AppDataSource } from '../config/data-source';
import { Student, User } from '../entities';
import { UserRole } from '../entities/enums';
import { getSecurityPolicy } from './security-policy.service';
import { normalizeDateOnly, secretMatchesRecordDob } from '../utils/date-only';
import { USER_PROFILES } from '../utils/typeorm-helpers';
import { verifyUserPassword } from '../utils/user-password';

function studentPortalEmail(admissionNumber: string): string {
  const safe = admissionNumber.toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${safe}@student.portal`;
}

async function syncPortalPasswordHash(user: User, dateOfBirth: string): Promise<void> {
  if (user.portalPasswordCustomized) return;

  const matches = await verifyUserPassword(user, dateOfBirth);
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
    if (!existing.portalPasswordCustomized) {
      await syncPortalPasswordHash(existing, dateOfBirth);
    }
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
      portalPasswordCustomized: false,
    }),
  );

  student.userId = user.id;
  await AppDataSource.getRepository(Student).save(student);

  const full = await userRepo.findOne({ where: { id: user.id }, relations: USER_PROFILES });
  if (!full) throw new Error('Failed to create student portal account');
  return full;
}

function formatLockoutRemaining(until: Date): string {
  const mins = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 60_000));
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  return `${mins} minute${mins === 1 ? '' : 's'}`;
}

async function recordFailedStudentLogin(user: User): Promise<StudentPortalAuthResult | null> {
  const policy = await getSecurityPolicy();
  const userRepo = AppDataSource.getRepository(User);

  if (user.lockedUntil && new Date() < new Date(user.lockedUntil)) {
    return {
      ok: false,
      status: 423,
      message: `Account temporarily locked. Try again in ${formatLockoutRemaining(new Date(user.lockedUntil))}.`,
    };
  }

  if (user.lockedUntil && new Date() >= new Date(user.lockedUntil)) {
    user.lockedUntil = null;
    user.failedLoginAttempts = 0;
  }

  user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
  if (user.failedLoginAttempts >= policy.maxLoginAttempts) {
    user.lockedUntil = new Date(Date.now() + policy.lockoutDurationMinutes * 60_000);
    user.failedLoginAttempts = 0;
    await userRepo.save(user);
    return {
      ok: false,
      status: 423,
      message: `Too many failed attempts. Account locked for ${policy.lockoutDurationMinutes} minutes.`,
    };
  }

  await userRepo.save(user);
  const remaining = policy.maxLoginAttempts - user.failedLoginAttempts;
  return {
    ok: false,
    status: 401,
    message:
      remaining > 0
        ? `Invalid Student ID or password. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
        : 'Invalid Student ID or password',
  };
}

async function clearStudentLoginFailures(user: User): Promise<void> {
  user.failedLoginAttempts = 0;
  user.lockedUntil = null;
  await AppDataSource.getRepository(User).save(user);
}

export type StudentPortalAuthResult =
  | { ok: true; user: User }
  | { ok: false; status: number; message: string };

/**
 * Authenticate a student using admission number + date of birth (first sign-in)
 * or admission number + custom password (after the student changes their password).
 */
export async function authenticateStudentPortal(
  admissionNumber: string,
  secret: string,
): Promise<StudentPortalAuthResult> {
  const admission = String(admissionNumber || '').trim().toUpperCase();
  const trimmedSecret = String(secret || '').trim();

  if (!admission) {
    return { ok: false, status: 400, message: 'Student ID is required' };
  }
  if (!trimmedSecret) {
    return { ok: false, status: 400, message: 'Date of birth or password is required' };
  }

  const studentRepo = AppDataSource.getRepository(Student);
  const student = await studentRepo.findOne({
    where: { admissionNumber: admission, isActive: true },
    relations: { user: true },
  });

  if (!student) {
    return { ok: false, status: 401, message: 'Invalid Student ID or credentials' };
  }

  const userRepo = AppDataSource.getRepository(User);
  let user: User | null = null;

  if (student.userId) {
    user = await userRepo.findOne({
      where: { id: student.userId },
      relations: USER_PROFILES,
    });
  }

  if (user?.portalPasswordCustomized) {
    if (!user.isActive) {
      return { ok: false, status: 403, message: 'This student portal account is inactive. Contact the school office.' };
    }

    if (!(await verifyUserPassword(user, trimmedSecret))) {
      return (await recordFailedStudentLogin(user))!;
    }

    await clearStudentLoginFailures(user);
    const full = await userRepo.findOne({ where: { id: user.id }, relations: USER_PROFILES });
    return { ok: true, user: full ?? user };
  }

  if (!student.dateOfBirth) {
    return {
      ok: false,
      status: 403,
      message: 'Date of birth is not on file for this student. Please contact the school office.',
    };
  }

  const recordDob = normalizeDateOnly(student.dateOfBirth);
  if (!recordDob || !secretMatchesRecordDob(trimmedSecret, recordDob)) {
    return { ok: false, status: 401, message: 'Invalid Student ID or date of birth' };
  }

  if (user?.isActive === false) {
    return { ok: false, status: 403, message: 'This student portal account is inactive. Contact the school office.' };
  }

  if (user) {
    await syncPortalPasswordHash(user, recordDob);
    const full = await userRepo.findOne({ where: { id: user.id }, relations: USER_PROFILES });
    return { ok: true, user: full ?? user };
  }

  user = await createStudentPortalUser(student, recordDob);
  return { ok: true, user };
}
