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
import { requestPasswordReset, resetPasswordWithToken } from '../services/password-reset.service';
import { findActiveUserByLoginIdentifier } from '../utils/user-auth';
import { verifyUserPassword } from '../utils/user-password';
import { authenticateStudentPortal } from '../services/student-portal-auth.service';
import { resolveParentGender } from '../utils/gender';
import { tenantContext } from '../config/tenant-context';
import { DEMO_ACCOUNTS, findDemoAccount } from '../config/demo-accounts';

const router = Router();

function resolveUserGender(user: User): string | null {
  return (
    user.staffProfile?.gender ??
    user.studentProfile?.gender ??
    user.parentProfile?.gender ??
    null
  );
}

async function issueAuthToken(fullUser: User, res: Response, opts: { demo?: boolean } = {}) {
  await ensureDefaultRoles();
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

  let sessionTimeoutMinutes: number;
  let expiresIn: string;
  if (opts.demo) {
    // Demo sessions always use a short, fixed TTL — never the school's own security
    // policy — regardless of how long that policy's sessionTimeoutMinutes is set to.
    payload.demo = true;
    sessionTimeoutMinutes = env.demo.jwtTtlMinutes;
    expiresIn = `${env.demo.jwtTtlMinutes}m`;
  } else {
    const policy = await getSecurityPolicy();
    sessionTimeoutMinutes = policy.sessionTimeoutMinutes;
    expiresIn = sessionTimeoutToJwtExpires(policy.sessionTimeoutMinutes);
  }

  const token = jwt.sign(payload, env.jwt.secret, { expiresIn: expiresIn as jwt.SignOptions['expiresIn'] });

  res.json({
    token,
    sessionTimeoutMinutes,
    demo: !!opts.demo,
    user: {
      id: fullUser.id,
      email: fullUser.email,
      username: fullUser.username ?? null,
      firstName: fullUser.firstName,
      lastName: fullUser.lastName,
      gender: resolveUserGender(fullUser),
      role: fullUser.role,
      schoolRoleId: fullUser.schoolRoleId ?? null,
      schoolRoleName: fullUser.schoolRole?.name ?? null,
      permissions,
      staffId: fullUser.staffProfile?.id,
      parentId: fullUser.parentProfile?.id,
      studentId: fullUser.studentProfile?.id,
    },
  });
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

router.post('/login', async (req, res: Response) => {
  try {
    const { username, email, password } = req.body;
    const loginId = String(username || email || '').trim();
    if (!loginId || !password) {
      return res.status(400).json({ message: 'Username and password required' });
    }

    const policy = await getSecurityPolicy();
    const userRepo = AppDataSource.getRepository(User);
    const user = await findActiveUserByLoginIdentifier(loginId, USER_PROFILES);

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

    const fullUser = (await loadUserWithRole(user.id)) ?? user;
    await issueAuthToken(fullUser, res);
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({
      message: 'Login failed',
      error: env.nodeEnv === 'development' && err instanceof Error ? err.message : undefined,
    });
  }
});

/** Public: lists the fixed demo roles/credentials for the /demo landing page (no secrets beyond the documented demo passwords). */
router.get('/demo-accounts', (_req, res: Response) => {
  if (!env.demo.enabled) {
    return res.status(404).json({ message: 'Demo mode is not available' });
  }
  res.json({
    accounts: DEMO_ACCOUNTS.map((a) => ({
      role: a.role,
      username: a.username,
      password: a.password,
      label: a.label,
      description: a.description,
    })),
  });
});

/**
 * One-click demo login: validates against the fixed demo accounts in the isolated
 * demo database and issues a JWT with `demo: true` + a short fixed TTL. The whole
 * lookup runs inside a forced demo tenant context so it can never touch production
 * user records even if a demo username collided with a real one.
 */
router.post('/demo-login', async (req, res: Response) => {
  if (!env.demo.enabled) {
    return res.status(404).json({ message: 'Demo mode is not available' });
  }
  try {
    const { role } = req.body as { role?: string };
    const account = findDemoAccount(role);
    if (!account) {
      return res.status(400).json({ message: 'Unknown demo role' });
    }

    await tenantContext.run({ isDemo: true }, async () => {
      const user = await findActiveUserByLoginIdentifier(account.username, USER_PROFILES);
      if (!user || !(await bcrypt.compare(account.password, user.passwordHash))) {
        res.status(503).json({
          message: 'The demo environment is still warming up — please try again in a moment.',
        });
        return;
      }
      const fullUser = (await loadUserWithRole(user.id)) ?? user;
      await issueAuthToken(fullUser, res, { demo: true });
    });
  } catch (err) {
    console.error('Demo login error:', err);
    res.status(500).json({ message: 'Demo login failed' });
  }
});

/** Student portal sign-in: Student ID + date of birth (first sign-in) or custom password. */
router.post('/student-login', async (req, res: Response) => {
  try {
    const { admissionNumber, studentId, dateOfBirth, password, username } = req.body;
    const id = String(admissionNumber || studentId || username || '').trim();
    const secret = String(password || dateOfBirth || '').trim();

    const result = await authenticateStudentPortal(id, secret);
    if (!result.ok) {
      return res.status(result.status).json({ message: result.message });
    }

    const fullUser = (await loadUserWithRole(result.user.id)) ?? result.user;
    await issueAuthToken(fullUser, res);
  } catch (err) {
    console.error('Student login error:', err);
    res.status(500).json({
      message: 'Student login failed',
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
    gender: resolveUserGender(user),
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

router.post('/forgot-password', async (req, res: Response) => {
  try {
    const { username, email } = req.body;
    const result = await requestPasswordReset(String(username || email || ''));
    res.json(result);
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ message: 'Could not process password reset request.' });
  }
});

router.post('/reset-password', async (req, res: Response) => {
  try {
    const { token, password } = req.body;
    const result = await resetPasswordWithToken(String(token || ''), String(password || ''));
    res.json(result);
  } catch (err) {
    return res.status(400).json({
      message: err instanceof Error ? err.message : 'Could not reset password',
    });
  }
});

router.post('/change-password', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current password and new password are required' });
    }

    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOne({ where: { id: req.user!.userId } });
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!(await verifyUserPassword(user, String(currentPassword)))) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    const policy = await getSecurityPolicy();
    const pwdErr = validatePasswordAgainstPolicy(String(newPassword), policy);
    if (pwdErr) return res.status(400).json({ message: pwdErr });

    if (await verifyUserPassword(user, String(newPassword))) {
      return res.status(400).json({ message: 'New password must be different from your current password' });
    }

    user.passwordHash = await bcrypt.hash(String(newPassword), 10);
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    if (user.role === UserRole.STUDENT) {
      user.portalPasswordCustomized = true;
    }
    await userRepo.save(user);

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ message: 'Could not change password' });
  }
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
      gender,
    } = req.body;

    const allowedRoles = [UserRole.PARENT];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ message: 'Registration is only available for parent accounts' });
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
      const parentGender = resolveParentGender(gender, relationship);
      const parent = await parentRepo.save(parentRepo.create({
        userId: user.id,
        gender: parentGender ?? undefined,
      }));

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
        gender: resolveUserGender(fullUser!),
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


