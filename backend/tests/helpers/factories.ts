import bcrypt from 'bcryptjs';
import { AppDataSource } from '../../src/config/data-source';
import { Staff, Student, User } from '../../src/entities';
import { StudentStatus, StudentType, UserRole } from '../../src/entities/enums';

let sequence = 0;

/** Short, process-unique token so parallel-safe fixtures never collide. */
export function uniqueTag(): string {
  sequence += 1;
  const stamp = Date.now().toString(36);
  const pid = process.pid.toString(36);
  return `${stamp}${pid}${sequence.toString(36)}`.slice(-12);
}

export async function findAdminUserId(): Promise<string> {
  const admin = await AppDataSource.getRepository(User).findOne({ where: { role: UserRole.ADMIN } });
  if (!admin) throw new Error('No admin user found — the baseline seed did not run.');
  return admin.id;
}

export async function createTestStudent(overrides: Partial<Student> = {}): Promise<Student> {
  const tag = uniqueTag();
  const repo = AppDataSource.getRepository(Student);
  const student = repo.create({
    admissionNumber: `TST${tag.toUpperCase()}`,
    firstName: 'Test',
    lastName: `Student${tag}`,
    studentType: StudentType.DAY_SCHOLAR,
    status: StudentStatus.ACTIVE,
    isActive: true,
    ...overrides,
  });
  return repo.save(student);
}

/** Creates a staff member (user + staff row) that payroll runs can pick up. */
export async function createTestStaff(): Promise<{ user: User; staff: Staff }> {
  const tag = uniqueTag();
  const userRepo = AppDataSource.getRepository(User);
  const user = await userRepo.save(
    userRepo.create({
      email: `teacher.${tag}@schoolpro.test`,
      username: `teacher${tag}`,
      passwordHash: await bcrypt.hash('Password123!', 4),
      firstName: 'Test',
      lastName: `Teacher${tag}`,
      role: UserRole.TEACHER,
    }),
  );

  const staffRepo = AppDataSource.getRepository(Staff);
  const staff = await staffRepo.save(
    staffRepo.create({
      userId: user.id,
      employeeNumber: `EMP${tag.toUpperCase()}`.slice(0, 16),
      department: 'Testing',
      qualification: 'B.Ed',
      isActive: true,
    }),
  );

  // `payroll.service` joins staff -> user; return the user attached for convenience.
  return { user, staff };
}
