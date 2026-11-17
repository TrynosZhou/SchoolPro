// @ts-nocheck
import { Router, Response } from 'express';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { UserRole } from '../entities/enums';
import { AppDataSource } from '../config/data-source';
import { House, Activity, ActivityMember, ActivityPoints, Competition } from '../entities/Activities';
import { Student } from '../entities';
import { studentNames, staffNames } from '../utils/lookups';
import { today } from '../utils/helpers';
import { In } from 'typeorm';

const router = Router();

const MANAGE: UserRole[] = [UserRole.ADMIN, UserRole.PRINCIPAL, UserRole.DIRECTOR];
const STAFF: UserRole[] = [...MANAGE, UserRole.TEACHER];

router.use(authenticate);

// ---------------- Houses ----------------

router.get('/houses', async (_req: AuthRequest, res: Response) => {
  try {
    res.json(await AppDataSource.getRepository(House).find({ order: { name: 'ASC' } }));
  } catch (e) {
    res.status(500).json({ message: 'Could not load houses.' });
  }
});

router.post('/houses', authorize(...MANAGE), async (req: AuthRequest, res: Response) => {
  try {
    const b = req.body ?? {};
    if (!b.name) return res.status(400).json({ message: 'name is required.' });
    const repo = AppDataSource.getRepository(House);
    res.status(201).json(await repo.save(repo.create({ name: b.name, color: b.color, motto: b.motto })));
  } catch (e) {
    res.status(500).json({ message: 'Could not create house.' });
  }
});

// ---------------- Activities & members ----------------

router.get('/activities', async (_req: AuthRequest, res: Response) => {
  try {
    const activities = await AppDataSource.getRepository(Activity).find({ order: { name: 'ASC' } });
    const members = await AppDataSource.getRepository(ActivityMember).find({ where: { isActive: true } });
    const coaches = await staffNames(activities.map((a) => a.coachStaffId));
    const byActivity = new Map<string, number>();
    for (const m of members) byActivity.set(m.activityId, (byActivity.get(m.activityId) || 0) + 1);
    res.json(
      activities.map((a) => ({
        ...a,
        coachName: coaches.get(a.coachStaffId || ''),
        memberCount: byActivity.get(a.id) || 0,
      })),
    );
  } catch (e) {
    console.error('[activities:list]', e);
    res.status(500).json({ message: 'Could not load activities.' });
  }
});

router.post('/activities', authorize(...STAFF), async (req: AuthRequest, res: Response) => {
  try {
    const b = req.body ?? {};
    if (!b.name) return res.status(400).json({ message: 'name is required.' });
    const repo = AppDataSource.getRepository(Activity);
    res.status(201).json(
      await repo.save(
        repo.create({
          name: b.name,
          type: b.type || 'club',
          coachStaffId: b.coachStaffId || undefined,
          description: b.description || undefined,
          termId: b.termId || undefined,
        }),
      ),
    );
  } catch (e) {
    res.status(500).json({ message: 'Could not create activity.' });
  }
});

router.patch('/activities/:id', authorize(...STAFF), async (req: AuthRequest, res: Response) => {
  try {
    const repo = AppDataSource.getRepository(Activity);
    const row = await repo.findOne({ where: { id: String(req.params.id) } });
    if (!row) return res.status(404).json({ message: 'Activity not found.' });
    const b = req.body ?? {};
    for (const k of ['name', 'type', 'coachStaffId', 'description', 'termId', 'isActive']) {
      if (b[k] !== undefined) (row as any)[k] = b[k];
    }
    await repo.save(row);
    res.json(row);
  } catch (e) {
    res.status(500).json({ message: 'Could not update activity.' });
  }
});

router.get('/activities/:id/members', async (req: AuthRequest, res: Response) => {
  try {
    const members = await AppDataSource.getRepository(ActivityMember).find({
      where: { activityId: String(req.params.id), isActive: true },
    });
    const names = await studentNames(members.map((m) => m.studentId));
    res.json(members.map((m) => ({ ...m, studentName: names.get(m.studentId) })));
  } catch (e) {
    res.status(500).json({ message: 'Could not load members.' });
  }
});

router.post('/members', authorize(...STAFF), async (req: AuthRequest, res: Response) => {
  try {
    const b = req.body ?? {};
    if (!b.activityId || !b.studentId) {
      return res.status(400).json({ message: 'activityId and studentId are required.' });
    }
    const repo = AppDataSource.getRepository(ActivityMember);
    const existing = await repo.findOne({ where: { activityId: b.activityId, studentId: b.studentId } });
    if (existing) {
      existing.isActive = true;
      existing.role = b.role || existing.role;
      await repo.save(existing);
      return res.json(existing);
    }
    const row = await repo.save(
      repo.create({
        activityId: b.activityId,
        studentId: b.studentId,
        role: b.role || 'member',
        joinedDate: b.joinedDate || today(),
      }),
    );
    res.status(201).json(row);
  } catch (e) {
    res.status(500).json({ message: 'Could not add member.' });
  }
});

router.delete('/members/:id', authorize(...STAFF), async (req: AuthRequest, res: Response) => {
  try {
    await AppDataSource.getRepository(ActivityMember).update(String(req.params.id), { isActive: false });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: 'Could not remove member.' });
  }
});

// ---------------- Points ----------------

router.get('/points', async (req: AuthRequest, res: Response) => {
  try {
    const { studentId, activityId, from, to, limit } = req.query as any;
    const repo = AppDataSource.getRepository(ActivityPoints);
    const qb = repo.createQueryBuilder('p').orderBy('p.date', 'DESC');
    if (studentId) qb.andWhere('p.studentId = :studentId', { studentId });
    if (activityId) qb.andWhere('p.activityId = :activityId', { activityId });
    if (from) qb.andWhere('p.date >= :from', { from });
    if (to) qb.andWhere('p.date <= :to', { to });
    qb.take(Math.min(Number(limit) || 500, 1000));
    const rows = await qb.getMany();
    const names = await studentNames(rows.map((r) => r.studentId));
    res.json(rows.map((r) => ({ ...r, studentName: names.get(r.studentId) })));
  } catch (e) {
    console.error('[activities:points]', e);
    res.status(500).json({ message: 'Could not load points.' });
  }
});

router.post('/points', authorize(...STAFF), async (req: AuthRequest, res: Response) => {
  try {
    const b = req.body ?? {};
    if (!b.studentId || !b.points || !b.reason || !b.date) {
      return res.status(400).json({ message: 'studentId, points, reason and date are required.' });
    }
    const repo = AppDataSource.getRepository(ActivityPoints);
    const row = await repo.save(
      repo.create({
        studentId: b.studentId,
        activityId: b.activityId || undefined,
        competitionId: b.competitionId || undefined,
        points: Number(b.points),
        reason: b.reason,
        date: b.date,
        awardedById: req.user!.userId,
        awardedByName: req.user!.email,
      }),
    );
    res.status(201).json(row);
  } catch (e) {
    res.status(500).json({ message: 'Could not award points.' });
  }
});

/** House points leaderboard. */
router.get('/leaderboard', async (req: AuthRequest, res: Response) => {
  try {
    const rows = await AppDataSource.getRepository(ActivityPoints)
      .createQueryBuilder('p')
      .select('p.studentId', 'studentId')
      .addSelect('SUM(p.points)', 'total')
      .groupBy('p.studentId')
      .orderBy('total', 'DESC')
      .limit(50)
      .getRawMany();
    const names = await studentNames(rows.map((r) => r.studentId));
    res.json(rows.map((r, i) => ({ rank: i + 1, studentId: r.studentId, studentName: names.get(r.studentId), total: Number(r.total) })));
  } catch (e) {
    res.status(500).json({ message: 'Could not load leaderboard.' });
  }
});

// ---------------- Competitions ----------------

router.get('/competitions', async (_req: AuthRequest, res: Response) => {
  try {
    const rows = await AppDataSource.getRepository(Competition).find({ order: { date: 'DESC' } });
    const activities = await AppDataSource.getRepository(Activity).find();
    const studentIds = [...new Set((rows.flatMap((r) => (r.results || []).map((x: any) => x.studentId)).filter(Boolean)))];
    const names = await studentNames(studentIds);
    res.json(
      rows.map((r) => ({
        ...r,
        activity: activities.find((a) => a.id === r.activityId),
        results: (r.results || []).map((x: any) => ({ ...x, studentName: names.get(x.studentId) })),
      })),
    );
  } catch (e) {
    res.status(500).json({ message: 'Could not load competitions.' });
  }
});

router.post('/competitions', authorize(...STAFF), async (req: AuthRequest, res: Response) => {
  try {
    const b = req.body ?? {};
    if (!b.name) return res.status(400).json({ message: 'name is required.' });
    const repo = AppDataSource.getRepository(Competition);
    res.status(201).json(
      await repo.save(
        repo.create({
          name: b.name,
          activityId: b.activityId || undefined,
          date: b.date || undefined,
          location: b.location || undefined,
          status: b.status || 'upcoming',
          results: b.results || undefined,
        }),
      ),
    );
  } catch (e) {
    res.status(500).json({ message: 'Could not create competition.' });
  }
});

router.patch('/competitions/:id', authorize(...STAFF), async (req: AuthRequest, res: Response) => {
  try {
    const repo = AppDataSource.getRepository(Competition);
    const row = await repo.findOne({ where: { id: String(req.params.id) } });
    if (!row) return res.status(404).json({ message: 'Competition not found.' });
    const b = req.body ?? {};
    for (const k of ['name', 'activityId', 'date', 'location', 'status', 'results']) {
      if (b[k] !== undefined) (row as any)[k] = b[k];
    }
    await repo.save(row);
    res.json(row);
  } catch (e) {
    res.status(500).json({ message: 'Could not update competition.' });
  }
});

export default router;
