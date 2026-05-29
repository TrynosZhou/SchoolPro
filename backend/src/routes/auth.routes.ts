// @ts-nocheck
import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { AppDataSource } from '../config/data-source';
import { User, Parent, Student, Guardian } from '../entities';
import { UserRole } from '../entities/enums';
import { env } from '../config/env';
import { authenticate, AuthRequest } from '../middleware/auth';
import { USER_PROFILES } from '../utils/typeorm-helpers';
import { getSecurityPolicy } from '../services/security-policy.service';
import { sessionTimeoutToJwtExpires, validatePasswordAgainstPolicy } from '../types/security-policy';
import {
  ensureDefaultRoles,
  loadUserWithRole,
  resolvePermissionsForUser,
} from '../services/role-permissions.service';

const router = Router();

function formatLockoutRemaining(until: Date): string {
  const mins = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 60_000));
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  return `${mins} minute${mins === 1 ? '' : 's'}`;
}

router.post('/login', async (req, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password required' });
    }

    const policy = await getSecurityPolicy();
    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOne({
      where: { email: email.toLowerCase(), isActive: true },
      relations: USER_PROFILES,
    });

    if (user?.lockedUntil && new Date() < new Date(user.lockedUntil)) {
      return res.status(423).json({
        message: `Account temporarily locked. Try again in ${formatLockoutRemaining(new Date(user.lockedUntil))}.`,
        lockedUntil: user.lockedUntil,
      });
    }

    if (user?.lockedUntil && new Date() >= new Date(user.lockedUntil)) {
      user.lockedUntil = null;
      user.failedLoginAttempts = 0;
    }

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      if (user) {
        user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
        if (user.failedLoginAttempts >= policy.maxLoginAttempts) {
          user.lockedUntil = new Date(Date.now() + policy.lockoutDurationMinutes * 60_000);
          user.failedLoginAttempts = 0;
          await userRepo.save(user);
          return res.status(423).json({
            message: `Too many failed attempts. Account locked for ${policy.lockoutDurationMinutes} minutes.`,
            lockedUntil: user.lockedUntil,
          });
        }
        await userRepo.save(user);
        const remaining = policy.maxLoginAttempts - user.failedLoginAttempts;
        return res.status(401).json({
          message: remaining > 0
            ? `Invalid credentials. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
            : 'Invalid credentials',
        });
      }
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    await userRepo.save(user);

    await ensureDefaultRoles();
    const fullUser = (await loadUserWithRole(user.id)) ?? user;
    const permissions = resolvePermissionsForUser(fullUser);

    const payload: Record<string, unknown> = {
      userId: fullUser.id,
      email: fullUser.email,
      role: fullUser.role,
      permissions,
    };

    if (fullUser.schoolRoleId) payload.schoolRoleId = fullUser.schoolRoleId;
    if (fullUser.staffProfile) payload.staffId = fullUser.staffProfile.id;
    if (fullUser.parentProfile) payload.parentId = fullUser.parentProfile.id;
    if (fullUser.studentProfile) payload.studentId = fullUser.studentProfile.id;

    const expiresIn = sessionTimeoutToJwtExpires(policy.sessionTimeoutMinutes);
    const token = jwt.sign(payload, env.jwt.secret, { expiresIn: expiresIn as jwt.SignOptions['expiresIn'] });

    res.json({
      token,
      sessionTimeoutMinutes: policy.sessionTimeoutMinutes,
      user: {
        id: fullUser.id,
        email: fullUser.email,
        firstName: fullUser.firstName,
        lastName: fullUser.lastName,
        role: fullUser.role,
        schoolRoleId: fullUser.schoolRoleId ?? null,
        schoolRoleName: fullUser.schoolRole?.name ?? null,
        permissions,
        staffId: fullUser.staffProfile?.id,
        parentId: fullUser.parentProfile?.id,
        studentId: fullUser.studentProfile?.id,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({
      message: 'Login failed',
      error: env.nodeEnv === 'development' && err instanceof Error ? err.message : undefined,
    });
  }
});

router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  const user = await loadUserWithRole(req.user!.userId);
  if (!user) return res.status(404).json({ message: 'User not found' });
  const permissions = resolvePermissionsForUser(user);
  res.json({
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    phone: user.phone,
    schoolRoleId: user.schoolRoleId ?? null,
    schoolRoleName: user.schoolRole?.name ?? null,
    permissions,
    staffId: user.staffProfile?.id,
    parentId: user.parentProfile?.id,
    studentId: user.studentProfile?.id,
  });
});

router.get('/password-policy', async (_req, res: Response) => {
  const policy = await getSecurityPolicy();
  res.json({
    minPasswordLength: policy.minPasswordLength,
    requireUppercase: policy.requireUppercase,
    requireLowercase: policy.requireLowercase,
    requireNumber: policy.requireNumber,
    requireSpecialChar: policy.requireSpecialChar,
  });
});

router.post('/register', async (req, res: Response) => {
  try {
    const {
      email,
      password,
      firstName,
      lastName,
      role,
      phone,
      admissionNumber,
      dateOfBirth,
      linkAdmissionNumber,
      relationship,
    } = req.body;

    const allowedRoles = [UserRole.PARENT, UserRole.STUDENT];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ message: 'Registration is only available for parent and student accounts' });
    }
    if (!email?.trim() || !password || !firstName?.trim() || !lastName?.trim()) {
      return res.status(400).json({ message: 'Email, password, first name, and last name are required' });
    }

    const userRepo = AppDataSource.getRepository(User);
    const existing = await userRepo.findOne({ where: { email: email.toLowerCase().trim() } });
    if (existing) return res.status(409).json({ message: 'Email already registered' });

    const policy = await getSecurityPolicy();
    const pwdErr = validatePasswordAgainstPolicy(password, policy);
    if (pwdErr) return res.status(400).json({ message: pwdErr });

    const passwordHash = await bcrypt.hash(password, 10);
    let linkedStudent: Student | null = null;

    if (role === UserRole.STUDENT) {
      if (!admissionNumber?.trim()) {
        return res.status(400).json({ message: 'Student ID (admission number) is required' });
      }
      const studentRepo = AppDataSource.getRepository(Student);
      const admission = String(admissionNumber).trim().toUpperCase();
      const student = await studentRepo.findOne({ where: { admissionNumber: admission, isActive: true } });
      if (!student) {
        return res.status(404).json({ message: 'No matching student record found. Ask the school office to register you first.' });
      }
      if (student.userId) {
        return res.status(409).json({ message: 'A portal account is already linked to this student ID' });
      }
      const fn = String(firstName).trim().toLowerCase();
      const ln = String(lastName).trim().toLowerCase();
      if (student.dateOfBirth && dateOfBirth) {
        if (student.dateOfBirth !== dateOfBirth) {
          return res.status(400).json({ message: 'Date of birth does not match school records' });
        }
      } else if (
        student.firstName.trim().toLowerCase() !== fn ||
        student.lastName.trim().toLowerCase() !== ln
      ) {
        return res.status(400).json({ message: 'Name does not match school records for this student ID' });
      }
      linkedStudent = student;
    }

    const user = await userRepo.save(userRepo.create({
      email: email.toLowerCase().trim(),
      passwordHash,
      firstName: String(firstName).trim(),
      lastName: String(lastName).trim(),
      role,
      phone: phone?.trim() || undefined,
    }));

    if (role === UserRole.PARENT) {
      const parentRepo = AppDataSource.getRepository(Parent);
      const parent = await parentRepo.save(parentRepo.create({ userId: user.id }));

      if (linkAdmissionNumber?.trim()) {
        const studentRepo = AppDataSource.getRepository(Student);
        const guardianRepo = AppDataSource.getRepository(Guardian);
        const admission = String(linkAdmissionNumber).trim().toUpperCase();
        const student = await studentRepo.findOne({ where: { admissionNumber: admission, isActive: true } });
        if (student) {
          let guardian = await guardianRepo.findOne({
            where: { studentId: student.id, email: user.email },
          });
          if (guardian) {
            guardian.parentId = parent.id;
            if (relationship) guardian.relationship = relationship;
          } else {
            guardian = guardianRepo.create({
              studentId: student.id,
              parentId: parent.id,
              fullName: `${user.firstName} ${user.lastName}`,
              relationship: relationship || 'Parent',
              phone: user.phone,
              email: user.email,
              isPrimary: false,
            });
          }
          await guardianRepo.save(guardian);
        }
      }
    }

    if (role === UserRole.STUDENT && linkedStudent) {
      linkedStudent.userId = user.id;
      await AppDataSource.getRepository(Student).save(linkedStudent);
    }

    const fullUser = await userRepo.findOne({
      where: { id: user.id },
      relations: USER_PROFILES,
    });

    const payload: Record<string, string> = {
      userId: fullUser!.id,
      email: fullUser!.email,
      role: fullUser!.role,
    };
    if (fullUser!.staffProfile) payload.staffId = fullUser!.staffProfile.id;
    if (fullUser!.parentProfile) payload.parentId = fullUser!.parentProfile.id;
    if (fullUser!.studentProfile) payload.studentId = fullUser!.studentProfile.id;

    const expiresIn = sessionTimeoutToJwtExpires(policy.sessionTimeoutMinutes);
    const token = jwt.sign(payload, env.jwt.secret, { expiresIn: expiresIn as jwt.SignOptions['expiresIn'] });

    res.status(201).json({
      message: 'Account created successfully',
      token,
      user: {
        id: fullUser!.id,
        email: fullUser!.email,
        firstName: fullUser!.firstName,
        lastName: fullUser!.lastName,
        role: fullUser!.role,
        staffId: fullUser!.staffProfile?.id,
        parentId: fullUser!.parentProfile?.id,
        studentId: fullUser!.studentProfile?.id,
      },
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({
      message: 'Registration failed',
      error: env.nodeEnv === 'development' && err instanceof Error ? err.message : undefined,
    });
  }
});

export default router;


