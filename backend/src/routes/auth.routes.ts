// @ts-nocheck
import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { AppDataSource } from '../config/data-source';
import { User, Staff, Parent, Student } from '../entities';
import { UserRole } from '../entities/enums';
import { env } from '../config/env';
import { authenticate, AuthRequest } from '../middleware/auth';
import { USER_PROFILES } from '../utils/typeorm-helpers';

const router = Router();

router.post('/login', async (req, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password required' });
    }

    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOne({
      where: { email: email.toLowerCase(), isActive: true },
      relations: USER_PROFILES,
    });

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const payload: Record<string, string> = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };

    if (user.staffProfile) payload.staffId = user.staffProfile.id;
    if (user.parentProfile) payload.parentId = user.parentProfile.id;
    if (user.studentProfile) payload.studentId = user.studentProfile.id;

    const token = jwt.sign(payload, env.jwt.secret, { expiresIn: env.jwt.expiresIn as jwt.SignOptions['expiresIn'] });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        staffId: user.staffProfile?.id,
        parentId: user.parentProfile?.id,
        studentId: user.studentProfile?.id,
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
  const userRepo = AppDataSource.getRepository(User);
  const user = await userRepo.findOne({
    where: { id: req.user!.userId },
    relations: USER_PROFILES,
  });
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json({
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    phone: user.phone,
    staffId: user.staffProfile?.id,
    parentId: user.parentProfile?.id,
    studentId: user.studentProfile?.id,
  });
});

router.post('/register', async (req, res: Response) => {
  const { email, password, firstName, lastName, role, phone } = req.body;
  const allowedRoles = [UserRole.TEACHER, UserRole.PARENT, UserRole.ADMIN];
  if (!allowedRoles.includes(role)) {
    return res.status(400).json({ message: 'Invalid role for registration' });
  }

  const userRepo = AppDataSource.getRepository(User);
  const existing = await userRepo.findOne({ where: { email: email.toLowerCase() } });
  if (existing) return res.status(409).json({ message: 'Email already registered' });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = userRepo.create({
    email: email.toLowerCase(),
    passwordHash,
    firstName,
    lastName,
    role,
    phone,
  });
  await userRepo.save(user);

  if (role === UserRole.TEACHER) {
    const staffRepo = AppDataSource.getRepository(Staff);
    await staffRepo.save(staffRepo.create({
      userId: user.id,
      employeeNumber: `EMP-${Date.now()}`,
    }));
  }
  if (role === UserRole.PARENT) {
    const parentRepo = AppDataSource.getRepository(Parent);
    await parentRepo.save(parentRepo.create({ userId: user.id }));
  }

  res.status(201).json({ message: 'User registered', userId: user.id });
});

export default router;


