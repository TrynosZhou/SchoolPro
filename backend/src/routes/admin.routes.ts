// @ts-nocheck
import { Router, Response } from 'express';
import { AppDataSource } from '../config/data-source';
import {
  SchoolYear, Term, Form, SchoolClass, Subject, ClassSubject, Staff, User, TuckshopItem, UniformSale, TuckshopSale,
  SchoolSettings, ExamType,
} from '../entities';
import { UserRole } from '../entities/enums';
import { authenticate, authorize } from '../middleware/auth';
import bcrypt from 'bcryptjs';
import { relations } from '../utils/typeorm-helpers';
import { generateEmployeeNumber, today } from '../utils/helpers';
import { DEFAULT_GRADE_BOUNDARIES, validateGradeBoundaries } from '../types/grade-boundaries';
import { invalidateGradeBoundariesCache } from '../services/grade.service';
import { env } from '../config/env';
import { sendWhatsAppReminder } from '../services/whatsapp.service';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { ensureUploadDirs } from '../utils/pdf';

const router = Router();
router.use(authenticate);

const SETTINGS_ID = 'default';
const logosDir = path.join(process.cwd(), 'uploads', 'logos');

const logoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      ensureUploadDirs();
      cb(null, logosDir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const safeExt = ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext) ? ext : '.png';
      cb(null, `school-logo${safeExt}`);
    },
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(png|jpe?g|webp|gif)$/i.test(file.mimetype);
    cb(ok ? null : new Error('Only image files are allowed'), ok);
  },
});

async function getOrCreateSettings() {
  const repo = AppDataSource.getRepository(SchoolSettings);
  let settings = await repo.findOne({ where: { id: SETTINGS_ID } });
  if (!settings) {
    settings = await repo.save(repo.create({
      id: SETTINGS_ID,
      schoolName: 'School Pro Academy',
      tagline: 'Excellence in Education',
      address: 'Harare, Zimbabwe',
      phone: '+263 4 123 4567',
      email: 'info@schoolpro.ac.zw',
      currency: 'USD',
      feeReminderTemplate: 'Fee reminder: {student} ({class}) owes ${amount}. Please arrange payment.',
      gradeBoundaries: DEFAULT_GRADE_BOUNDARIES,
    }));
  }
  if (!settings.gradeBoundaries?.length) {
    settings.gradeBoundaries = DEFAULT_GRADE_BOUNDARIES;
    await repo.save(settings);
  }
  return settings;
}

router.get('/settings', authorize(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.PRINCIPAL), async (_req, res: Response) => {
  const school = await getOrCreateSettings();
  res.json({
    school,
    whatsapp: {
      enabled: env.whatsapp.enabled,
      configured: !!(env.whatsapp.accountSid && env.whatsapp.authToken && env.whatsapp.from),
      from: env.whatsapp.from ? env.whatsapp.from.replace(/(\+\d{3}).+(\d{4})/, '$1***$2') : null,
    },
  });
});

router.patch('/settings', authorize(UserRole.ADMIN), async (req, res: Response) => {
  const repo = AppDataSource.getRepository(SchoolSettings);
  const settings = await getOrCreateSettings();
  if (req.body.gradeBoundaries !== undefined) {
    const err = validateGradeBoundaries(req.body.gradeBoundaries);
    if (err) return res.status(400).json({ message: err });
    settings.gradeBoundaries = req.body.gradeBoundaries.map((b: { grade: string; label?: string; minPercent: number }) => ({
      grade: String(b.grade).trim(),
      label: b.label?.trim() || undefined,
      minPercent: Number(b.minPercent),
    }));
    invalidateGradeBoundariesCache();
  }
  const { gradeBoundaries: _gb, logoUrl: _logo, ...rest } = req.body;
  Object.assign(settings, rest);
  const saved = await repo.save(settings);
  if (req.body.gradeBoundaries !== undefined) invalidateGradeBoundariesCache();
  res.json(saved);
});

router.post(
  '/settings/logo',
  authorize(UserRole.ADMIN),
  logoUpload.single('logo'),
  async (req, res: Response) => {
    if (!req.file) return res.status(400).json({ message: 'Logo image file is required' });
    const repo = AppDataSource.getRepository(SchoolSettings);
    const settings = await getOrCreateSettings();
    settings.logoUrl = `/uploads/logos/${req.file.filename}`;
    const saved = await repo.save(settings);
    res.json(saved);
  },
);

router.delete('/settings/logo', authorize(UserRole.ADMIN), async (_req, res: Response) => {
  const repo = AppDataSource.getRepository(SchoolSettings);
  const settings = await getOrCreateSettings();
  if (settings.logoUrl) {
    const filePath = path.join(process.cwd(), settings.logoUrl.replace(/^\/+/, ''));
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    settings.logoUrl = null;
    await repo.save(settings);
  }
  res.json(settings);
});

router.post('/settings/test-whatsapp', authorize(UserRole.ADMIN), async (req, res: Response) => {
  const { phone, message } = req.body;
  if (!phone) return res.status(400).json({ message: 'Phone number required' });
  const ok = await sendWhatsAppReminder(
    phone,
    message || 'Test message from School Pro — WhatsApp integration is working.'
  );
  if (!ok) return res.status(400).json({ message: 'WhatsApp not configured or send failed. Check .env TWILIO settings.' });
  res.json({ sent: true });
});

router.get('/school-years', authorize(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.PRINCIPAL), async (_req, res: Response) => {
  const repo = AppDataSource.getRepository(SchoolYear);
  res.json(await repo.find({ relations: relations('terms'), order: { startDate: 'DESC' } }));
});

router.post('/school-years', authorize(UserRole.ADMIN), async (req, res: Response) => {
  const repo = AppDataSource.getRepository(SchoolYear);
  if (req.body.isCurrent) {
    await repo.update({ isCurrent: true }, { isCurrent: false });
  }
  const year = await repo.save(repo.create(req.body));
  res.status(201).json(year);
});

router.post('/terms', authorize(UserRole.ADMIN), async (req, res: Response) => {
  const repo = AppDataSource.getRepository(Term);
  if (req.body.isCurrent) {
    await repo.update({ isCurrent: true }, { isCurrent: false });
  }
  const term = await repo.save(repo.create(req.body));
  res.status(201).json(term);
});

router.patch('/school-years/:id', authorize(UserRole.ADMIN), async (req, res: Response) => {
  const repo = AppDataSource.getRepository(SchoolYear);
  const year = await repo.findOne({ where: { id: req.params.id } });
  if (!year) return res.status(404).json({ message: 'School year not found' });
  if (req.body.isCurrent) {
    await repo.update({ isCurrent: true }, { isCurrent: false });
  }
  Object.assign(year, req.body);
  res.json(await repo.save(year));
});

router.patch('/terms/:id', authorize(UserRole.ADMIN), async (req, res: Response) => {
  const repo = AppDataSource.getRepository(Term);
  const term = await repo.findOne({ where: { id: req.params.id } });
  if (!term) return res.status(404).json({ message: 'Term not found' });
  if (req.body.isCurrent) {
    await repo.update({ isCurrent: true }, { isCurrent: false });
  }
  Object.assign(term, req.body);
  res.json(await repo.save(term));
});

router.get('/forms', async (_req, res: Response) => {
  res.json(await AppDataSource.getRepository(Form).find({ relations: relations('classes'), order: { level: 'ASC' } }));
});

router.post('/forms', authorize(UserRole.ADMIN), async (req, res: Response) => {
  const form = await AppDataSource.getRepository(Form).save(
    AppDataSource.getRepository(Form).create(req.body)
  );
  res.status(201).json(form);
});

router.get('/classes', async (_req, res: Response) => {
  res.json(await AppDataSource.getRepository(SchoolClass).find({
    relations: relations('form', 'students'),
    order: { name: 'ASC' },
  }));
});

router.post('/classes', authorize(UserRole.ADMIN), async (req, res: Response) => {
  const cls = await AppDataSource.getRepository(SchoolClass).save(
    AppDataSource.getRepository(SchoolClass).create(req.body)
  );
  res.status(201).json(cls);
});

router.get('/subjects', async (_req, res: Response) => {
  res.json(await AppDataSource.getRepository(Subject).find({ order: { name: 'ASC' } }));
});

router.post('/subjects', authorize(UserRole.ADMIN), async (req, res: Response) => {
  const subject = await AppDataSource.getRepository(Subject).save(
    AppDataSource.getRepository(Subject).create(req.body)
  );
  res.status(201).json(subject);
});

router.get('/class-subjects', authorize(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.PRINCIPAL), async (req, res: Response) => {
  const { classId } = req.query;
  const qb = AppDataSource.getRepository(ClassSubject).createQueryBuilder('cs')
    .leftJoinAndSelect('cs.subject', 'subject')
    .leftJoinAndSelect('cs.teacher', 'teacher')
    .leftJoinAndSelect('teacher.user', 'user')
    .leftJoinAndSelect('cs.schoolClass', 'schoolClass');
  if (classId) qb.where('cs.classId = :classId', { classId });
  res.json(await qb.getMany());
});

router.post('/class-subjects', authorize(UserRole.ADMIN), async (req, res: Response) => {
  const cs = await AppDataSource.getRepository(ClassSubject).save(
    AppDataSource.getRepository(ClassSubject).create(req.body)
  );
  res.status(201).json(cs);
});

router.patch('/class-subjects/:id', authorize(UserRole.ADMIN), async (req, res: Response) => {
  const repo = AppDataSource.getRepository(ClassSubject);
  const cs = await repo.findOne({ where: { id: req.params.id } });
  if (!cs) return res.status(404).json({ message: 'Assignment not found' });
  Object.assign(cs, req.body);
  res.json(await repo.save(cs));
});

router.delete('/class-subjects/:id', authorize(UserRole.ADMIN), async (req, res: Response) => {
  await AppDataSource.getRepository(ClassSubject).delete({ id: req.params.id });
  res.json({ deleted: true });
});

router.patch('/classes/:id', authorize(UserRole.ADMIN), async (req, res: Response) => {
  const repo = AppDataSource.getRepository(SchoolClass);
  const cls = await repo.findOne({ where: { id: req.params.id } });
  if (!cls) return res.status(404).json({ message: 'Class not found' });
  Object.assign(cls, req.body);
  res.json(await repo.save(cls));
});

router.get('/exam-types', authorize(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.PRINCIPAL), async (_req, res: Response) => {
  res.json(await AppDataSource.getRepository(ExamType).find({ order: { name: 'ASC' } }));
});

router.patch('/exam-types/:id', authorize(UserRole.ADMIN), async (req, res: Response) => {
  const repo = AppDataSource.getRepository(ExamType);
  const et = await repo.findOne({ where: { id: req.params.id } });
  if (!et) return res.status(404).json({ message: 'Exam type not found' });
  Object.assign(et, req.body);
  res.json(await repo.save(et));
});

router.get('/staff/next-employee-id', authorize(UserRole.ADMIN), async (_req, res: Response) => {
  const employeeNumber = await generateEmployeeNumber();
  res.json({ employeeNumber });
});

router.get('/staff', authorize(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.PRINCIPAL), async (req, res: Response) => {
  const { search, role, status } = req.query;
  const qb = AppDataSource.getRepository(Staff).createQueryBuilder('s')
    .leftJoinAndSelect('s.user', 'user')
    .orderBy('s.createdAt', 'DESC');

  if (status === 'inactive') {
    qb.andWhere('s.isActive = false');
  } else if (status !== 'all') {
    qb.andWhere('s.isActive = true');
  }

  if (role) qb.andWhere('user.role = :role', { role });
  if (search) {
    qb.andWhere(
      `(user.firstName ILIKE :q OR user.lastName ILIKE :q OR user.email ILIKE :q OR s.employeeNumber ILIKE :q OR s.department ILIKE :q)`,
      { q: `%${search}%` }
    );
  }

  res.json(await qb.getMany());
});

router.get('/staff/:id', authorize(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.PRINCIPAL), async (req, res: Response) => {
  const staff = await AppDataSource.getRepository(Staff).findOne({
    where: { id: req.params.id },
    relations: relations('user'),
  });
  if (!staff) return res.status(404).json({ message: 'Staff member not found' });
  res.json(staff);
});

router.post('/staff', authorize(UserRole.ADMIN), async (req, res: Response) => {
  const {
    email,
    password,
    firstName,
    lastName,
    phone,
    role = UserRole.TEACHER,
    department,
    qualification,
    hireDate,
    employeeNumber: _ignored,
  } = req.body;
  const userRepo = AppDataSource.getRepository(User);
  const staffRepo = AppDataSource.getRepository(Staff);

  const existing = await userRepo.findOne({ where: { email: email?.toLowerCase() } });
  if (existing) return res.status(400).json({ message: 'Email already registered' });

  const allowedRoles = [UserRole.TEACHER, UserRole.ADMIN, UserRole.PRINCIPAL];
  const staffRole = allowedRoles.includes(role) ? role : UserRole.TEACHER;

  const passwordHash = await bcrypt.hash(password || 'Teacher123!', 10);
  const user = await userRepo.save(userRepo.create({
    email: email.toLowerCase(),
    passwordHash,
    firstName,
    lastName,
    phone,
    role: staffRole,
  }));

  const employeeNumber = await generateEmployeeNumber();
  const staff = await staffRepo.save(staffRepo.create({
    userId: user.id,
    employeeNumber,
    department,
    qualification,
    hireDate: hireDate || today(),
    isActive: true,
  }));

  const full = await staffRepo.findOne({
    where: { id: staff.id },
    relations: relations('user'),
  });
  res.status(201).json(full);
});

router.patch('/staff/:id', authorize(UserRole.ADMIN), async (req, res: Response) => {
  const staffRepo = AppDataSource.getRepository(Staff);
  const userRepo = AppDataSource.getRepository(User);

  const staff = await staffRepo.findOne({
    where: { id: req.params.id },
    relations: relations('user'),
  });
  if (!staff) return res.status(404).json({ message: 'Staff member not found' });

  const {
    email,
    password,
    firstName,
    lastName,
    phone,
    role,
    department,
    qualification,
    hireDate,
    employeeNumber: _ignored,
    isActive,
  } = req.body;

  if (email && email.toLowerCase() !== staff.user.email) {
    const dup = await userRepo.findOne({ where: { email: email.toLowerCase() } });
    if (dup) return res.status(400).json({ message: 'Email already in use' });
    staff.user.email = email.toLowerCase();
  }
  if (firstName) staff.user.firstName = firstName;
  if (lastName) staff.user.lastName = lastName;
  if (phone !== undefined) staff.user.phone = phone;
  if (role && [UserRole.TEACHER, UserRole.ADMIN, UserRole.PRINCIPAL].includes(role)) {
    staff.user.role = role;
  }
  if (password) staff.user.passwordHash = await bcrypt.hash(password, 10);
  if (department !== undefined) staff.department = department;
  if (qualification !== undefined) staff.qualification = qualification;
  if (hireDate !== undefined) staff.hireDate = hireDate;
  if (isActive !== undefined) {
    staff.isActive = isActive;
    staff.user.isActive = isActive;
  }

  await userRepo.save(staff.user);
  await staffRepo.save(staff);

  const full = await staffRepo.findOne({
    where: { id: staff.id },
    relations: relations('user'),
  });
  res.json(full);
});

router.get('/tuckshop/items', authorize(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.PRINCIPAL), async (_req, res: Response) => {
  res.json(await AppDataSource.getRepository(TuckshopItem).find({ order: { name: 'ASC' } }));
});

router.post('/tuckshop/items', authorize(UserRole.ADMIN), async (req, res: Response) => {
  const item = await AppDataSource.getRepository(TuckshopItem).save(
    AppDataSource.getRepository(TuckshopItem).create(req.body)
  );
  res.status(201).json(item);
});

router.patch('/tuckshop/items/:id', authorize(UserRole.ADMIN), async (req, res: Response) => {
  const repo = AppDataSource.getRepository(TuckshopItem);
  const item = await repo.findOne({ where: { id: req.params.id } });
  if (!item) return res.status(404).json({ message: 'Item not found' });
  Object.assign(item, req.body);
  res.json(await repo.save(item));
});

router.post('/tuckshop/sales', authorize(UserRole.ADMIN), async (req, res: Response) => {
  const itemRepo = AppDataSource.getRepository(TuckshopItem);
  const saleRepo = AppDataSource.getRepository(TuckshopSale);
  const { itemId, quantity, studentId } = req.body;

  const item = await itemRepo.findOne({ where: { id: itemId } });
  if (!item) return res.status(404).json({ message: 'Item not found' });
  if (item.stockQuantity < quantity) return res.status(400).json({ message: 'Insufficient stock' });

  item.stockQuantity -= quantity;
  await itemRepo.save(item);

  const sale = await saleRepo.save(saleRepo.create({
    itemId,
    quantity,
    studentId,
    totalAmount: Number(item.unitPrice) * quantity,
  }));
  res.status(201).json(sale);
});

router.get('/uniform/sales', authorize(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.PRINCIPAL), async (_req, res: Response) => {
  res.json(await AppDataSource.getRepository(UniformSale).find({
    relations: relations('student'),
    order: { soldAt: 'DESC' },
    take: 100,
  }));
});

router.post('/uniform/sales', authorize(UserRole.ADMIN), async (req, res: Response) => {
  const sale = await AppDataSource.getRepository(UniformSale).save(
    AppDataSource.getRepository(UniformSale).create({
      ...req.body,
      totalAmount: req.body.unitPrice * (req.body.quantity || 1),
    })
  );
  res.status(201).json(sale);
});

export default router;


