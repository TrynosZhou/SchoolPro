// @ts-nocheck
import { Router, Response } from 'express';
import { AppDataSource } from '../config/data-source';
import { Timetable, LearningSchedule, WeeklyAssessment, Message, User } from '../entities';
import { UserRole } from '../entities/enums';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { relations } from '../utils/typeorm-helpers';

const router = Router();
router.use(authenticate);

router.get('/timetable', async (req, res: Response) => {
  const { classId } = req.query;
  const repo = AppDataSource.getRepository(Timetable);
  const where: Record<string, string> = {};
  if (classId) where.classId = classId as string;
  res.json(await repo.find({
    where,
    relations: relations('subject', 'teacher', 'teacher.user', 'schoolClass'),
    order: { dayOfWeek: 'ASC', startTime: 'ASC' },
  }));
});

router.post('/timetable', authorize(UserRole.TEACHER, UserRole.ADMIN), async (req, res: Response) => {
  const repo = AppDataSource.getRepository(Timetable);
  const entry = await repo.save(repo.create(req.body));
  res.status(201).json(entry);
});

router.get('/learning-schedules', authorize(UserRole.TEACHER, UserRole.ADMIN, UserRole.PARENT, UserRole.PRINCIPAL), async (req, res: Response) => {
  const { classId, termId, weekStart } = req.query;
  const repo = AppDataSource.getRepository(LearningSchedule);
  const where: Record<string, string> = {};
  if (classId) where.classId = classId as string;
  if (termId) where.termId = termId as string;
  if (weekStart) where.weekStart = weekStart as string;
  res.json(await repo.find({
    where,
    relations: relations('subject', 'teacher', 'teacher.user', 'schoolClass'),
    order: { weekStart: 'DESC' },
  }));
});

router.post('/learning-schedules', authorize(UserRole.TEACHER, UserRole.ADMIN), async (req: AuthRequest, res: Response) => {
  const repo = AppDataSource.getRepository(LearningSchedule);
  const entry = await repo.save(repo.create({ ...req.body, teacherId: req.user!.staffId }));
  res.status(201).json(entry);
});

router.get('/weekly-assessments', authorize(UserRole.TEACHER, UserRole.ADMIN, UserRole.PARENT, UserRole.PRINCIPAL), async (req, res: Response) => {
  const { studentId, classId, termId, weekStart } = req.query;
  const repo = AppDataSource.getRepository(WeeklyAssessment);
  const qb = repo.createQueryBuilder('a')
    .leftJoinAndSelect('a.student', 's')
    .leftJoinAndSelect('a.subject', 'sub')
    .leftJoinAndSelect('a.teacher', 't');

  if (studentId) qb.andWhere('a.studentId = :studentId', { studentId });
  if (classId) qb.andWhere('s.classId = :classId', { classId });
  if (termId) qb.andWhere('a.termId = :termId', { termId });
  if (weekStart) qb.andWhere('a.weekStart = :weekStart', { weekStart });

  res.json(await qb.orderBy('a.weekStart', 'DESC').getMany());
});

router.post('/weekly-assessments/bulk', authorize(UserRole.TEACHER, UserRole.ADMIN), async (req: AuthRequest, res: Response) => {
  const repo = AppDataSource.getRepository(WeeklyAssessment);
  const { assessments } = req.body;
  const saved = [];
  for (const a of assessments) {
    saved.push(await repo.save(repo.create({ ...a, teacherId: req.user!.staffId })));
  }
  res.json(saved);
});

router.get('/messages/recipients', authorize(UserRole.TEACHER, UserRole.ADMIN, UserRole.DIRECTOR, UserRole.PRINCIPAL), async (req: AuthRequest, res: Response) => {
  const userRepo = AppDataSource.getRepository(User);
  const users = await userRepo.find({
    where: { isActive: true },
    relations: relations('parentProfile'),
    order: { lastName: 'ASC', firstName: 'ASC' },
  });
  const registeredParentCount = users.filter(
    (u) => u.role === UserRole.PARENT && u.parentProfile && u.id !== req.user!.userId,
  ).length;
  res.json({
    recipients: users
      .filter((u) => u.id !== req.user!.userId)
      .map((u) => ({
        id: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        role: u.role,
      })),
    registeredParentCount,
  });
});

router.get('/messages/inbox', authorize(UserRole.TEACHER, UserRole.PARENT, UserRole.ADMIN, UserRole.DIRECTOR, UserRole.PRINCIPAL), async (req: AuthRequest, res: Response) => {
  const repo = AppDataSource.getRepository(Message);
  const messages = await repo.find({
    where: { recipientId: req.user!.userId },
    relations: relations('sender', 'recipient', 'student'),
    order: { sentAt: 'DESC' },
  });
  res.json(messages);
});

router.get('/messages/sent', authorize(UserRole.TEACHER, UserRole.PARENT, UserRole.ADMIN, UserRole.DIRECTOR, UserRole.PRINCIPAL), async (req: AuthRequest, res: Response) => {
  const repo = AppDataSource.getRepository(Message);
  const messages = await repo.find({
    where: { senderId: req.user!.userId },
    relations: relations('sender', 'recipient', 'student'),
    order: { sentAt: 'DESC' },
  });
  res.json(messages);
});

router.get('/messages', async (req: AuthRequest, res: Response) => {
  const repo = AppDataSource.getRepository(Message);
  const messages = await repo.find({
    where: [{ recipientId: req.user!.userId }, { senderId: req.user!.userId }],
    relations: relations('sender', 'recipient', 'student'),
    order: { sentAt: 'DESC' },
  });
  res.json(messages);
});

router.post('/messages', authorize(UserRole.TEACHER, UserRole.PARENT, UserRole.ADMIN, UserRole.DIRECTOR, UserRole.PRINCIPAL), async (req: AuthRequest, res: Response) => {
  const { recipientId, subject, body, studentId, broadcastToAllParents } = req.body || {};
  const trimmedSubject = String(subject || '').trim();
  const trimmedBody = String(body || '').trim();
  const ALL_REGISTERED_PARENTS = '__all_registered_parents__';
  const wantsBroadcast =
    broadcastToAllParents === true ||
    recipientId === ALL_REGISTERED_PARENTS ||
    String(recipientId || '') === ALL_REGISTERED_PARENTS;

  if (!trimmedSubject || !trimmedBody) {
    return res.status(400).json({ message: 'subject and body are required' });
  }

  const repo = AppDataSource.getRepository(Message);
  const userRepo = AppDataSource.getRepository(User);

  if (wantsBroadcast) {
    const canBroadcast = [UserRole.ADMIN, UserRole.DIRECTOR, UserRole.PRINCIPAL].includes(req.user!.role);
    if (!canBroadcast) {
      return res.status(403).json({ message: 'Only administrators can send announcements to all parents' });
    }

    const parentUsers = await userRepo.find({
      where: { role: UserRole.PARENT, isActive: true },
      relations: relations('parentProfile'),
    });
    const recipients = parentUsers.filter((u) => u.parentProfile && u.id !== req.user!.userId);
    if (!recipients.length) {
      return res.status(400).json({ message: 'No registered parents found to receive this announcement' });
    }

    const messages = recipients.map((recipient) =>
      repo.create({
        recipientId: recipient.id,
        subject: trimmedSubject,
        body: trimmedBody,
        senderId: req.user!.userId,
        isRead: false,
      }),
    );
    await repo.save(messages);

    return res.status(201).json({
      broadcast: true,
      sentCount: messages.length,
      subject: trimmedSubject,
    });
  }

  if (!recipientId) {
    return res.status(400).json({ message: 'recipientId is required' });
  }

  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(String(recipientId))) {
    return res.status(400).json({ message: 'Invalid recipient selected' });
  }

  const recipient = await userRepo.findOne({ where: { id: recipientId, isActive: true } });
  if (!recipient) return res.status(404).json({ message: 'Recipient not found' });

  const msg = await repo.save(
    repo.create({
      recipientId,
      subject: trimmedSubject,
      body: trimmedBody,
      studentId: studentId || undefined,
      senderId: req.user!.userId,
      isRead: false,
    }),
  );
  const full = await repo.findOne({
    where: { id: msg.id },
    relations: relations('sender', 'recipient', 'student'),
  });
  res.status(201).json(full);
});

router.patch('/messages/:id/read', authorize(UserRole.TEACHER, UserRole.PARENT, UserRole.ADMIN, UserRole.DIRECTOR, UserRole.PRINCIPAL), async (req: AuthRequest, res: Response) => {
  const repo = AppDataSource.getRepository(Message);
  const msg = await repo.findOne({
    where: { id: req.params.id, recipientId: req.user!.userId },
    relations: relations('sender', 'recipient', 'student'),
  });
  if (!msg) return res.status(404).json({ message: 'Message not found' });
  msg.isRead = true;
  await repo.save(msg);
  res.json(msg);
});

router.delete('/messages/:id', authorize(UserRole.TEACHER, UserRole.ADMIN, UserRole.DIRECTOR, UserRole.PRINCIPAL), async (req: AuthRequest, res: Response) => {
  const repo = AppDataSource.getRepository(Message);
  const msg = await repo.findOne({
    where: { id: req.params.id },
  });
  if (!msg) return res.status(404).json({ message: 'Message not found' });
  if (msg.senderId !== req.user!.userId && msg.recipientId !== req.user!.userId) {
    return res.status(403).json({ message: 'Not allowed to delete this message' });
  }
  await repo.remove(msg);
  res.json({ ok: true });
});

export default router;


