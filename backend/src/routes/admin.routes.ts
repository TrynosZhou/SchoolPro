// @ts-nocheck
import { Router, Response } from 'express';
import { AppDataSource } from '../config/data-source';
import { In } from 'typeorm';
import {
  SchoolYear, Term, Form, SchoolClass, Subject, Department, ClassSubject, Staff, User, TuckshopItem, UniformSale, TuckshopSale,
  SchoolSettings, ExamType, ClassPromotionRule, Student, Parent, Guardian, SchoolRole,
} from '../entities';
import { UserRole } from '../entities/enums';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import bcrypt from 'bcryptjs';
import { relations } from '../utils/typeorm-helpers';
import { PORTAL_ROLE_LABELS } from '../config/permissions';
import { generateEmployeeNumber, today } from '../utils/helpers';
import { DEFAULT_GRADE_BOUNDARIES, validateGradeBoundaries } from '../types/grade-boundaries';
import { DEFAULT_SECURITY_POLICY, normalizeSecurityPolicy, validateSecurityPolicy, validatePasswordAgainstPolicy } from '../types/security-policy';
import { invalidateGradeBoundariesCache } from '../services/grade.service';
import { getSecurityPolicy, invalidateSecurityPolicyCache } from '../services/security-policy.service';
import {
  getIntegrationsPublic,
  saveIntegrationsConfig,
  testCustomApiConnection,
  testWebhookConnection,
} from '../services/integrations.service';
import { DEFAULT_INTEGRATIONS } from '../types/integrations-config';
import { sendWhatsAppReminder } from '../services/whatsapp.service';
import permissionsRoutes from './permissions.routes';
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
      securityPolicy: DEFAULT_SECURITY_POLICY,
      integrationsConfig: DEFAULT_INTEGRATIONS,
    }));
  }
  if (!settings.gradeBoundaries?.length) {
    settings.gradeBoundaries = DEFAULT_GRADE_BOUNDARIES;
    await repo.save(settings);
  }
  if (!settings.securityPolicy) {
    settings.securityPolicy = DEFAULT_SECURITY_POLICY;
    await repo.save(settings);
  }
  if (!settings.integrationsConfig) {
    settings.integrationsConfig = DEFAULT_INTEGRATIONS;
    await repo.save(settings);
  }
  return settings;
}

router.get('/settings', authorize(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.PRINCIPAL), async (_req, res: Response) => {
  const school = await getOrCreateSettings();
  const integrations = await getIntegrationsPublic();
  res.json({
    school,
    security: normalizeSecurityPolicy(school.securityPolicy || DEFAULT_SECURITY_POLICY),
    whatsapp: {
      enabled: integrations.status.whatsapp !== 'disabled',
      configured: integrations.status.whatsapp === 'active',
      from: integrations.integrations.whatsapp.from
        ? integrations.integrations.whatsapp.from.replace(/(\+\d{3}).+(\d{4})/, '$1***$2')
        : null,
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
  if (req.body.securityPolicy !== undefined) {
    const err = validateSecurityPolicy(req.body.securityPolicy);
    if (err) return res.status(400).json({ message: err });
    settings.securityPolicy = normalizeSecurityPolicy(req.body.securityPolicy);
    invalidateSecurityPolicyCache();
  }
  const { gradeBoundaries: _gb, securityPolicy: _sp, logoUrl: _logo, ...rest } = req.body;
  Object.assign(settings, rest);
  const saved = await repo.save(settings);
  if (req.body.gradeBoundaries !== undefined) invalidateGradeBoundariesCache();
  if (req.body.securityPolicy !== undefined) invalidateSecurityPolicyCache();
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
  if (!ok) return res.status(400).json({ message: 'WhatsApp not configured or send failed. Check Integrations settings.' });
  res.json({ sent: true });
});

router.get('/integrations', authorize(UserRole.ADMIN), async (_req, res: Response) => {
  res.json(await getIntegrationsPublic());
});

router.patch('/integrations', authorize(UserRole.ADMIN), async (req, res: Response) => {
  const patch = req.body?.integrations ?? req.body;
  if (!patch || typeof patch !== 'object') {
    return res.status(400).json({ message: 'Invalid integrations payload' });
  }
  const saved = await saveIntegrationsConfig(patch);
  res.json({
    integrations: saved,
    status: (await getIntegrationsPublic()).status,
  });
});

router.post('/integrations/test/:provider', authorize(UserRole.ADMIN), async (req, res: Response) => {
  const { provider } = req.params;
  const { phone, message, email } = req.body || {};

  if (provider === 'whatsapp') {
    if (!phone) return res.status(400).json({ message: 'Phone number required' });
    const ok = await sendWhatsAppReminder(
      phone,
      message || 'Test message from School Pro Integrations.',
    );
    if (!ok) return res.status(400).json({ ok: false, message: 'WhatsApp send failed. Check credentials.' });
    return res.json({ ok: true, message: 'Test WhatsApp message sent (or logged in mock mode).' });
  }

  if (provider === 'webhook') {
    const result = await testWebhookConnection();
    return res.status(result.ok ? 200 : 400).json(result);
  }

  if (provider === 'custom-api') {
    const result = await testCustomApiConnection();
    return res.status(result.ok ? 200 : 400).json(result);
  }

  if (provider === 'email') {
    const cfg = (await getIntegrationsPublic()).integrations.email;
    if (!cfg.host || !cfg.user || !cfg.hasPassword) {
      return res.status(400).json({ ok: false, message: 'Complete SMTP host, user, and password first.' });
    }
    if (!email) {
      return res.json({ ok: true, message: 'SMTP settings look complete. Provide a test email address to send (coming soon).' });
    }
    return res.json({ ok: true, message: `SMTP configuration saved. Test delivery to ${email} will be enabled in a future update.` });
  }

  if (provider === 'payment') {
    const cfg = (await getIntegrationsPublic()).integrations.payment;
    if (!cfg.merchantId || !cfg.hasApiKey) {
      return res.status(400).json({ ok: false, message: 'Merchant ID and API key are required.' });
    }
    return res.json({ ok: true, message: `${cfg.provider} credentials saved. Live payment test pending provider SDK.` });
  }

  return res.status(404).json({ message: 'Unknown integration provider' });
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

router.patch('/forms/:id', authorize(UserRole.ADMIN), async (req, res: Response) => {
  const repo = AppDataSource.getRepository(Form);
  const form = await repo.findOne({ where: { id: req.params.id } });
  if (!form) return res.status(404).json({ message: 'Form not found' });
  if (req.body.name !== undefined) form.name = String(req.body.name).trim();
  if (req.body.level !== undefined) form.level = Number(req.body.level);
  await repo.save(form);
  res.json(form);
});

router.delete('/forms/:id', authorize(UserRole.ADMIN), async (req, res: Response) => {
  const repo = AppDataSource.getRepository(Form);
  const form = await repo.findOne({
    where: { id: req.params.id },
    relations: relations('classes'),
  });
  if (!form) return res.status(404).json({ message: 'Form not found' });
  if (form.classes?.length) {
    return res.status(400).json({
      message: `Cannot delete form "${form.name}" — it has ${form.classes.length} class(es). Remove those classes first.`,
    });
  }
  const studentCount = await AppDataSource.query(
    `SELECT COUNT(*) AS cnt FROM students WHERE "formId" = $1`,
    [form.id],
  );
  if (Number(studentCount[0]?.cnt) > 0) {
    return res.status(400).json({
      message: `Cannot delete form "${form.name}" — ${studentCount[0].cnt} student(s) are assigned to it.`,
    });
  }
  await repo.delete({ id: form.id });
  res.json({ message: 'Form deleted' });
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

router.patch('/subjects/:id', authorize(UserRole.ADMIN), async (req, res: Response) => {
  const repo = AppDataSource.getRepository(Subject);
  const subject = await repo.findOne({ where: { id: req.params.id } });
  if (!subject) return res.status(404).json({ message: 'Subject not found' });

  const { code, name, description } = req.body as {
    code?: string;
    name?: string;
    description?: string | null;
  };

  if (code !== undefined) {
    const normalized = String(code).trim().toUpperCase();
    if (!normalized) return res.status(400).json({ message: 'Subject code is required' });
    const clash = await repo.findOne({ where: { code: normalized } });
    if (clash && clash.id !== subject.id) {
      return res.status(409).json({ message: 'A subject with this code already exists' });
    }
    subject.code = normalized;
  }
  if (name !== undefined) {
    const trimmed = String(name).trim();
    if (!trimmed) return res.status(400).json({ message: 'Subject name is required' });
    subject.name = trimmed;
  }
  if (description !== undefined) subject.description = description?.trim() || undefined;

  res.json(await repo.save(subject));
});

router.get('/departments', async (_req, res: Response) => {
  res.json(
    await AppDataSource.getRepository(Department).find({
      order: { sortOrder: 'ASC', name: 'ASC' },
    }),
  );
});

router.post('/departments', authorize(UserRole.ADMIN), async (req, res: Response) => {
  const { code, name, description, isActive, sortOrder } = req.body;
  if (!code?.trim() || !name?.trim()) {
    return res.status(400).json({ message: 'Department code and name are required' });
  }
  const repo = AppDataSource.getRepository(Department);
  const existing = await repo.findOne({ where: { code: String(code).trim().toUpperCase() } });
  if (existing) {
    return res.status(409).json({ message: 'A department with this code already exists' });
  }
  const department = await repo.save(
    repo.create({
      code: String(code).trim().toUpperCase(),
      name: String(name).trim(),
      description: description?.trim() || undefined,
      isActive: isActive !== false,
      sortOrder: Number(sortOrder) || 0,
    }),
  );
  res.status(201).json(department);
});

router.patch('/departments/:id', authorize(UserRole.ADMIN), async (req, res: Response) => {
  const repo = AppDataSource.getRepository(Department);
  const department = await repo.findOne({ where: { id: req.params.id } });
  if (!department) return res.status(404).json({ message: 'Department not found' });

  const { code, name, description, isActive, sortOrder } = req.body;
  if (code !== undefined) {
    const normalized = String(code).trim().toUpperCase();
    const clash = await repo.findOne({ where: { code: normalized } });
    if (clash && clash.id !== department.id) {
      return res.status(409).json({ message: 'A department with this code already exists' });
    }
    department.code = normalized;
  }
  if (name !== undefined) department.name = String(name).trim();
  if (description !== undefined) department.description = description?.trim() || null;
  if (isActive !== undefined) department.isActive = Boolean(isActive);
  if (sortOrder !== undefined) department.sortOrder = Number(sortOrder) || 0;

  res.json(await repo.save(department));
});

router.delete('/departments/:id', authorize(UserRole.ADMIN), async (req, res: Response) => {
  const repo = AppDataSource.getRepository(Department);
  const department = await repo.findOne({ where: { id: req.params.id } });
  if (!department) return res.status(404).json({ message: 'Department not found' });
  await repo.remove(department);
  res.json({ message: 'Department deleted' });
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
  const cls = await repo.findOne({
    where: { id: req.params.id },
    relations: relations('form', 'students'),
  });
  if (!cls) return res.status(404).json({ message: 'Class not found' });

  const { name, formId, capacity, classTeacherId } = req.body as {
    name?: string;
    formId?: string;
    capacity?: number;
    classTeacherId?: string | null;
  };

  if (name !== undefined) {
    const trimmed = String(name).trim();
    if (!trimmed) return res.status(400).json({ message: 'Class name is required' });
    cls.name = trimmed;
  }
  if (formId !== undefined) cls.formId = formId;
  if (capacity !== undefined) cls.capacity = Number(capacity) || cls.capacity;
  if (classTeacherId !== undefined) cls.classTeacherId = classTeacherId || undefined;

  const saved = await repo.save(cls);
  const full = await repo.findOne({
    where: { id: saved.id },
    relations: relations('form', 'students'),
  });
  res.json(full ?? saved);
});

router.get('/promotion-rules', authorize(UserRole.ADMIN), async (_req, res: Response) => {
  const rules = await AppDataSource.getRepository(ClassPromotionRule).find({
    select: {
      id: true,
      fromClassId: true,
      toClassId: true,
      completionLabel: true,
      isActive: true,
      createdAt: true,
    },
    order: { createdAt: 'ASC' },
  });
  res.json(rules);
});

router.put('/promotion-rules', authorize(UserRole.ADMIN), async (req, res: Response) => {
  const payload = req.body?.rules;
  if (!Array.isArray(payload)) {
    return res.status(400).json({ message: 'rules array is required' });
  }

  // A valid rule has a fromClassId plus either a toClassId or a completionLabel.
  const validRules = payload.filter(
    (r) => r?.fromClassId && (r?.toClassId || r?.completionLabel),
  );

  const fromIds = validRules.map((r) => String(r.fromClassId));
  if (fromIds.length !== new Set(fromIds).size) {
    return res.status(400).json({ message: 'Each class can only have one promotion target' });
  }

  for (const r of validRules) {
    if (r.toClassId && r.fromClassId === r.toClassId) {
      return res.status(400).json({ message: 'A class cannot be promoted to itself' });
    }
  }

  // Validate only the class-to-class rules (completion rules have no toClassId).
  const classRules = validRules.filter((r) => r.toClassId);
  const classIds = new Set<string>();
  for (const r of classRules) {
    classIds.add(String(r.fromClassId));
    classIds.add(String(r.toClassId));
  }
  // Also validate fromClassIds for completion rules.
  for (const r of validRules.filter((r) => r.completionLabel)) {
    classIds.add(String(r.fromClassId));
  }

  if (classIds.size) {
    const found = await AppDataSource.getRepository(SchoolClass).find({
      where: { id: In([...classIds]) },
      select: { id: true },
    });
    if (found.length !== classIds.size) {
      return res.status(400).json({ message: 'One or more classes were not found' });
    }
  }

  const ruleRepo = AppDataSource.getRepository(ClassPromotionRule);
  await ruleRepo.clear();
  if (validRules.length) {
    await ruleRepo.save(
      validRules.map((r) =>
        ruleRepo.create({
          fromClassId: String(r.fromClassId),
          toClassId: r.toClassId ? String(r.toClassId) : undefined,
          completionLabel: r.completionLabel ? String(r.completionLabel) : undefined,
          isActive: r.isActive !== false,
        }),
      ),
    );
  }

  const rules = await ruleRepo.find({
    select: {
      id: true,
      fromClassId: true,
      toClassId: true,
      completionLabel: true,
      isActive: true,
      createdAt: true,
    },
    order: { createdAt: 'ASC' },
  });
  res.json(rules);
});

/** Calendar year label for a school year (Jan–Dec), e.g. "2025" or "2025/2026" → 2025 */
function schoolYearCalendarYear(sy: SchoolYear): number {
  const matches = String(sy.name).match(/20\d{2}/g);
  if (matches?.length) return parseInt(matches[0], 10);
  return new Date(sy.startDate).getFullYear();
}

function findTargetSchoolYear(completing: SchoolYear, allYears: SchoolYear[]): SchoolYear | null {
  const nextCal = schoolYearCalendarYear(completing) + 1;
  const matches = allYears
    .filter((y) => schoolYearCalendarYear(y) === nextCal)
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  return matches[0] ?? null;
}

router.post('/class-promotion/promote', authorize(UserRole.ADMIN), async (req, res: Response) => {
  const { classId, completingSchoolYearId, targetSchoolYearId } = req.body || {};
  if (!completingSchoolYearId || !classId) {
    return res.status(400).json({ message: 'completingSchoolYearId and classId are required' });
  }

  const yearRepo = AppDataSource.getRepository(SchoolYear);
  const allYears = await yearRepo.find({ order: { startDate: 'ASC' } });
  const completingYear = allYears.find((y) => y.id === String(completingSchoolYearId));
  if (!completingYear) return res.status(404).json({ message: 'Completing school year not found' });

  let targetYear: SchoolYear | null = null;
  if (targetSchoolYearId) {
    targetYear = allYears.find((y) => y.id === String(targetSchoolYearId)) ?? null;
    if (!targetYear) return res.status(404).json({ message: 'Target school year not found' });
    if (schoolYearCalendarYear(targetYear) !== schoolYearCalendarYear(completingYear) + 1) {
      return res.status(400).json({
        message: `Target school year must be the year after ${completingYear.name} (e.g. ${schoolYearCalendarYear(completingYear)} → ${schoolYearCalendarYear(completingYear) + 1}).`,
      });
    }
  } else {
    targetYear = findTargetSchoolYear(completingYear, allYears);
    if (!targetYear) {
      return res.status(400).json({
        message: `No school year found for ${schoolYearCalendarYear(completingYear) + 1}. Add it under Academic Settings → School Calendar.`,
      });
    }
  }

  const fromClass = await AppDataSource.getRepository(SchoolClass).findOne({
    where: { id: String(classId) },
    relations: relations('form'),
  });
  if (!fromClass) return res.status(404).json({ message: 'Class not found' });

  const rule = await AppDataSource.getRepository(ClassPromotionRule).findOne({
    where: { fromClassId: fromClass.id, isActive: true },
  });
  if (!rule) {
    return res.status(400).json({
      message: `No active promotion rule for ${fromClass.form?.name || 'Form'} ${fromClass.name}. Configure it in Academic Settings → Promotion Rules.`,
    });
  }

  let toClass: SchoolClass | null = null;
  if (rule.toClassId) {
    toClass = await AppDataSource.getRepository(SchoolClass).findOne({
      where: { id: rule.toClassId },
      relations: relations('form'),
    });
    if (!toClass) return res.status(400).json({ message: 'Promotion target class not found' });
  }

  const studentRepo = AppDataSource.getRepository(Student);
  const students = await studentRepo.find({
    where: { classId: fromClass.id, isActive: true },
    select: { id: true, admissionNumber: true },
  });
  if (!students.length) {
    return res.json({
      promoted: 0,
      fromClassId: fromClass.id,
      toClassId: toClass?.id,
      completionLabel: rule.completionLabel,
      message: 'No active students found in this class.',
    });
  }

  const enrollmentDate = targetYear.startDate || today();

  if (toClass) {
    await studentRepo
      .createQueryBuilder()
      .update(Student)
      .set({
        classId: toClass.id,
        formId: toClass.formId,
        enrollmentDate,
      })
      .where('classId = :classId', { classId: fromClass.id })
      .andWhere('isActive = true')
      .execute();
  } else {
    // Completion: remove from class; keep student active.
    await studentRepo
      .createQueryBuilder()
      .update(Student)
      .set({
        classId: null,
        enrollmentDate: null,
      })
      .where('classId = :classId', { classId: fromClass.id })
      .andWhere('isActive = true')
      .execute();
  }

  const fromLabel = `${fromClass.form?.name || 'Form'} ${fromClass.name}`;
  const toLabel = toClass ? `${toClass.form?.name || 'Form'} ${toClass.name}` : null;

  return res.json({
    promoted: students.length,
    completingSchoolYearId: completingYear.id,
    targetSchoolYearId: targetYear.id,
    fromClassId: fromClass.id,
    toClassId: toClass?.id,
    completionLabel: rule.completionLabel,
    message: toClass
      ? `Promoted ${students.length} student(s) from ${fromLabel} (${completingYear.name}) to ${toLabel} for ${targetYear.name}.`
      : `Marked ${students.length} student(s) in ${fromLabel} (${completingYear.name}) as completed (${rule.completionLabel || 'Completed'}) for ${targetYear.name}.`,
  });
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

  const plainPassword = password || 'Teacher123!';
  const policy = await getSecurityPolicy();
  const pwdErr = validatePasswordAgainstPolicy(plainPassword, policy);
  if (pwdErr) return res.status(400).json({ message: pwdErr });

  const passwordHash = await bcrypt.hash(plainPassword, 10);
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
  if (password) {
    const policy = await getSecurityPolicy();
    const pwdErr = validatePasswordAgainstPolicy(password, policy);
    if (pwdErr) return res.status(400).json({ message: pwdErr });
    staff.user.passwordHash = await bcrypt.hash(password, 10);
  }
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

const STAFF_PORTAL_ROLES = [UserRole.DIRECTOR, UserRole.PRINCIPAL, UserRole.ADMIN, UserRole.TEACHER];

function serializeManagedUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone ?? null,
    role: user.role,
    roleLabel: PORTAL_ROLE_LABELS[user.role] ?? user.role,
    isActive: user.isActive,
    schoolRoleId: user.schoolRoleId ?? null,
    schoolRole: user.schoolRole
      ? { id: user.schoolRole.id, name: user.schoolRole.name, baseRole: user.schoolRole.baseRole }
      : null,
    failedLoginAttempts: user.failedLoginAttempts ?? 0,
    lockedUntil: user.lockedUntil ?? null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    staffProfile: user.staffProfile
      ? {
          id: user.staffProfile.id,
          employeeNumber: user.staffProfile.employeeNumber,
          department: user.staffProfile.department ?? null,
          isActive: user.staffProfile.isActive,
        }
      : null,
    parentProfile: user.parentProfile ? { id: user.parentProfile.id } : null,
    studentProfile: user.studentProfile
      ? {
          id: user.studentProfile.id,
          admissionNumber: user.studentProfile.admissionNumber,
          firstName: user.studentProfile.firstName,
          lastName: user.studentProfile.lastName,
        }
      : null,
  };
}

async function loadManagedUser(userId: string) {
  return AppDataSource.getRepository(User).findOne({
    where: { id: userId },
    relations: relations('schoolRole', 'staffProfile', 'parentProfile', 'studentProfile'),
  });
}

router.get('/users', authorize(UserRole.ADMIN), async (req, res: Response) => {
  const { search, role, status } = req.query;
  const qb = AppDataSource.getRepository(User)
    .createQueryBuilder('u')
    .leftJoinAndSelect('u.schoolRole', 'schoolRole')
    .leftJoinAndSelect('u.staffProfile', 'staffProfile')
    .leftJoinAndSelect('u.parentProfile', 'parentProfile')
    .leftJoinAndSelect('u.studentProfile', 'studentProfile')
    .orderBy('u.lastName', 'ASC')
    .addOrderBy('u.firstName', 'ASC');

  if (status === 'inactive') {
    qb.andWhere('u.isActive = false');
  } else if (status !== 'all') {
    qb.andWhere('u.isActive = true');
  }

  if (role) qb.andWhere('u.role = :role', { role: String(role) });

  if (search) {
    qb.andWhere(
      `(u.firstName ILIKE :q OR u.lastName ILIKE :q OR u.email ILIKE :q OR staffProfile.employeeNumber ILIKE :q OR studentProfile.admissionNumber ILIKE :q)`,
      { q: `%${String(search)}%` },
    );
  }

  const users = await qb.getMany();
  res.json(users.map(serializeManagedUser));
});

router.get('/users/:id', authorize(UserRole.ADMIN), async (req, res: Response) => {
  const user = await loadManagedUser(req.params.id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json(serializeManagedUser(user));
});

router.post('/users', authorize(UserRole.ADMIN), async (req: AuthRequest, res: Response) => {
  const {
    email,
    password,
    firstName,
    lastName,
    phone,
    role,
    schoolRoleId,
    department,
    qualification,
    hireDate,
    admissionNumber,
    linkAdmissionNumber,
    relationship,
  } = req.body || {};

  const trimmedEmail = String(email || '').trim().toLowerCase();
  const trimmedFirst = String(firstName || '').trim();
  const trimmedLast = String(lastName || '').trim();
  const portalRole = Object.values(UserRole).includes(role) ? role : null;

  if (!trimmedEmail || !trimmedFirst || !trimmedLast || !portalRole) {
    return res.status(400).json({ message: 'Email, first name, last name, and role are required' });
  }

  const userRepo = AppDataSource.getRepository(User);
  const existing = await userRepo.findOne({ where: { email: trimmedEmail } });
  if (existing) return res.status(409).json({ message: 'Email already registered' });

  const plainPassword = password || 'ChangeMe123!';
  const policy = await getSecurityPolicy();
  const pwdErr = validatePasswordAgainstPolicy(plainPassword, policy);
  if (pwdErr) return res.status(400).json({ message: pwdErr });

  const passwordHash = await bcrypt.hash(plainPassword, 10);
  let schoolRole: SchoolRole | null = null;
  if (schoolRoleId) {
    schoolRole = await AppDataSource.getRepository(SchoolRole).findOne({ where: { id: schoolRoleId } });
    if (!schoolRole) return res.status(404).json({ message: 'Assigned role not found' });
  }

  if (portalRole === UserRole.STUDENT) {
    const admission = String(admissionNumber || '').trim().toUpperCase();
    if (!admission) {
      return res.status(400).json({ message: 'Student ID (admission number) is required for student accounts' });
    }
    const studentRepo = AppDataSource.getRepository(Student);
    const student = await studentRepo.findOne({ where: { admissionNumber: admission, isActive: true } });
    if (!student) return res.status(404).json({ message: 'No active student found with that admission number' });
    if (student.userId) return res.status(409).json({ message: 'That student already has a portal account' });

    const user = await userRepo.save(userRepo.create({
      email: trimmedEmail,
      passwordHash,
      firstName: trimmedFirst,
      lastName: trimmedLast,
      phone: phone?.trim() || undefined,
      role: UserRole.STUDENT,
    }));
    student.userId = user.id;
    await studentRepo.save(student);

    const full = await loadManagedUser(user.id);
    return res.status(201).json(serializeManagedUser(full!));
  }

  const user = await userRepo.save(userRepo.create({
    email: trimmedEmail,
    passwordHash,
    firstName: trimmedFirst,
    lastName: trimmedLast,
    phone: phone?.trim() || undefined,
    role: schoolRole ? schoolRole.baseRole : portalRole,
    schoolRoleId: schoolRole?.id,
  }));

  if (STAFF_PORTAL_ROLES.includes(portalRole)) {
    if (portalRole !== UserRole.DIRECTOR) {
      const staffRepo = AppDataSource.getRepository(Staff);
      const employeeNumber = await generateEmployeeNumber();
      await staffRepo.save(staffRepo.create({
        userId: user.id,
        employeeNumber,
        department: department?.trim() || undefined,
        qualification: qualification?.trim() || undefined,
        hireDate: hireDate || today(),
        isActive: true,
      }));
    }
  } else if (portalRole === UserRole.PARENT) {
    const parentRepo = AppDataSource.getRepository(Parent);
    const parent = await parentRepo.save(parentRepo.create({ userId: user.id }));

    const linkAdmission = String(linkAdmissionNumber || '').trim().toUpperCase();
    if (linkAdmission) {
      const studentRepo = AppDataSource.getRepository(Student);
      const guardianRepo = AppDataSource.getRepository(Guardian);
      const student = await studentRepo.findOne({ where: { admissionNumber: linkAdmission, isActive: true } });
      if (student) {
        let guardian = await guardianRepo.findOne({
          where: [{ studentId: student.id, email: trimmedEmail }, { studentId: student.id, parentId: parent.id }],
        });
        if (guardian) {
          guardian.parentId = parent.id;
          if (relationship) guardian.relationship = String(relationship).trim();
        } else {
          guardian = guardianRepo.create({
            studentId: student.id,
            parentId: parent.id,
            fullName: `${trimmedFirst} ${trimmedLast}`,
            relationship: relationship?.trim() || 'Parent',
            phone: phone?.trim() || undefined,
            email: trimmedEmail,
            isPrimary: false,
          });
        }
        await guardianRepo.save(guardian);
      }
    }
  } else {
    await userRepo.delete({ id: user.id });
    return res.status(400).json({ message: 'Invalid role for user creation' });
  }

  const full = await loadManagedUser(user.id);
  res.status(201).json(serializeManagedUser(full!));
});

router.patch('/users/:id', authorize(UserRole.ADMIN), async (req: AuthRequest, res: Response) => {
  const userRepo = AppDataSource.getRepository(User);
  const user = await userRepo.findOne({
    where: { id: req.params.id },
    relations: relations('schoolRole', 'staffProfile', 'parentProfile', 'studentProfile'),
  });
  if (!user) return res.status(404).json({ message: 'User not found' });

  const {
    email,
    password,
    firstName,
    lastName,
    phone,
    role,
    schoolRoleId,
    isActive,
    department,
    qualification,
    hireDate,
  } = req.body || {};

  if (req.params.id === req.user!.userId && isActive === false) {
    return res.status(400).json({ message: 'You cannot deactivate your own account' });
  }

  if (email !== undefined) {
    const trimmedEmail = String(email).trim().toLowerCase();
    if (!trimmedEmail) return res.status(400).json({ message: 'Email is required' });
    if (trimmedEmail !== user.email) {
      const dup = await userRepo.findOne({ where: { email: trimmedEmail } });
      if (dup) return res.status(409).json({ message: 'Email already in use' });
      user.email = trimmedEmail;
    }
  }
  if (firstName !== undefined) user.firstName = String(firstName).trim();
  if (lastName !== undefined) user.lastName = String(lastName).trim();
  if (phone !== undefined) user.phone = phone?.trim() || undefined;

  if (password) {
    const policy = await getSecurityPolicy();
    const pwdErr = validatePasswordAgainstPolicy(password, policy);
    if (pwdErr) return res.status(400).json({ message: pwdErr });
    user.passwordHash = await bcrypt.hash(password, 10);
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
  }

  if (schoolRoleId !== undefined) {
    if (schoolRoleId === null || schoolRoleId === '') {
      user.schoolRoleId = undefined;
      user.schoolRole = undefined;
    } else if (STAFF_PORTAL_ROLES.includes(user.role)) {
      const schoolRole = await AppDataSource.getRepository(SchoolRole).findOne({ where: { id: schoolRoleId } });
      if (!schoolRole) return res.status(404).json({ message: 'Assigned role not found' });
      user.schoolRoleId = schoolRole.id;
      user.schoolRole = schoolRole;
      user.role = schoolRole.baseRole;
    }
  }

  if (role !== undefined && req.params.id !== req.user!.userId) {
    const nextRole = Object.values(UserRole).includes(role) ? role : null;
    if (!nextRole) return res.status(400).json({ message: 'Invalid role' });
    if (user.role !== nextRole) {
      return res.status(400).json({ message: 'Role changes are not supported here. Create a new account with the correct role instead.' });
    }
  }

  if (isActive !== undefined) {
    user.isActive = Boolean(isActive);
    if (user.staffProfile) user.staffProfile.isActive = user.isActive;
  }

  await userRepo.save(user);
  if (user.staffProfile) {
    if (department !== undefined) user.staffProfile.department = department?.trim() || undefined;
    if (qualification !== undefined) user.staffProfile.qualification = qualification?.trim() || undefined;
    if (hireDate !== undefined) user.staffProfile.hireDate = hireDate || user.staffProfile.hireDate;
    await AppDataSource.getRepository(Staff).save(user.staffProfile);
  }

  const full = await loadManagedUser(user.id);
  res.json(serializeManagedUser(full!));
});

router.post('/users/:id/unlock', authorize(UserRole.ADMIN), async (req, res: Response) => {
  const userRepo = AppDataSource.getRepository(User);
  const user = await userRepo.findOne({ where: { id: req.params.id } });
  if (!user) return res.status(404).json({ message: 'User not found' });
  user.failedLoginAttempts = 0;
  user.lockedUntil = null;
  await userRepo.save(user);
  const full = await loadManagedUser(user.id);
  res.json(serializeManagedUser(full!));
});

router.use('/permissions', permissionsRoutes);

export default router;


