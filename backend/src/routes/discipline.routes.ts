// @ts-nocheck
import { Router, Request, Response } from 'express';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { UserRole } from '../entities/enums';
import { AppDataSource } from '../config/data-source';
import { DisciplineIncident } from '../entities/DisciplineIncident';
import { Student } from '../entities';
import { notifyStudentParents } from '../services/parent-notify.service';
import { studentNames } from '../utils/lookups';
import { today } from '../utils/helpers';

const router = Router();
const STAFF_ROLES: UserRole[] = [
  UserRole.ADMIN,
  UserRole.PRINCIPAL,
  UserRole.DIRECTOR,
  UserRole.TEACHER,
];

function actor(req: Request) {
  return { userId: req.user!.userId, name: req.user!.email };
}

/** Parents may only read their own children's records — enforced in the parent branch. */
router.use(authenticate);

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const repo = AppDataSource.getRepository(DisciplineIncident);
    const { studentId, classId, termId, kind, status, from, to, limit } = req.query as any;
    const qb = repo.createQueryBuilder('d').orderBy('d.date', 'DESC').addOrderBy('d.createdAt', 'DESC');
    if (studentId) qb.andWhere('d.studentId = :studentId', { studentId });
    if (classId) qb.andWhere('d.classId = :classId', { classId });
    if (termId) qb.andWhere('d.termId = :termId', { termId });
    if (kind) qb.andWhere('d.kind = :kind', { kind });
    if (status) qb.andWhere('d.status = :status', { status });
    if (from) qb.andWhere('d.date >= :from', { from });
    if (to) qb.andWhere('d.date <= :to', { to });
    qb.take(Math.min(Number(limit) || 500, 1000));
    const rows = await qb.getMany();

    // Parents only see their own children
    let visible = rows;
    if (req.user!.role === UserRole.PARENT) {
      const parentId = (req.user as any).parentId;
      const kids = await AppDataSource.getRepository(Student)
        .createQueryBuilder('s')
        .innerJoin('guardians', 'g', 'g.studentId = s.id')
        .where('g.parentId = :parentId', { parentId: parentId || req.user!.userId })
        .select('s.id', 'id')
        .getRawMany();
      const kidIds = new Set(kids.map((k: any) => k.id || k.s_id));
      visible = rows.filter((r: any) => kidIds.has(r.studentId));
    }

    const names = await studentNames(visible.map((r: any) => r.studentId));
    res.json(
      visible.map((r: any) => ({ ...r, studentName: names.get(r.studentId) || r.studentId })),
    );
  } catch (e) {
    console.error('[discipline:list]', e);
    res.status(500).json({ message: 'Could not load discipline records.' });
  }
});

/**
 * Headline figures for the Discipline page header.
 * Parents only ever see figures for their own children.
 */
router.get('/overview', async (req: AuthRequest, res: Response) => {
  try {
    const { termId, from, to } = req.query as any;
    const qb = AppDataSource.getRepository(DisciplineIncident).createQueryBuilder('d');
    if (termId) qb.andWhere('d.termId = :termId', { termId });
    if (from) qb.andWhere('d.date >= :from', { from });
    if (to) qb.andWhere('d.date <= :to', { to });
    let rows = await qb.getMany();

    if (req.user!.role === UserRole.PARENT) {
      const parentId = (req.user as any).parentId;
      const kids = await AppDataSource.getRepository(Student)
        .createQueryBuilder('s')
        .innerJoin('guardians', 'g', 'g.studentId = s.id')
        .where('g.parentId = :parentId', { parentId: parentId || req.user!.userId })
        .select('s.id', 'id')
        .getRawMany();
      const kidIds = new Set(kids.map((k: any) => k.id || k.s_id));
      rows = rows.filter((r: any) => kidIds.has(r.studentId));
    }

    const t = today();
    res.json({
      total: rows.length,
      merits: rows.filter((r) => r.kind === 'merit').length,
      demerits: rows.filter((r) => r.kind === 'demerit').length,
      incidents: rows.filter((r) => r.kind === 'incident').length,
      activeSanctions: rows.filter(
        (r) =>
          r.sanctionType &&
          r.sanctionType !== 'none' &&
          r.status === 'open' &&
          (!r.sanctionEndDate || r.sanctionEndDate >= t),
      ).length,
      awaitingParentNotice: rows.filter((r) => !r.parentNotified).length,
    });
  } catch (e) {
    console.error('[discipline:overview]', e);
    res.status(500).json({ message: 'Could not load discipline overview.' });
  }
});

router.get('/conduct-summary', async (req: AuthRequest, res: Response) => {
  try {
    const { studentId, termId, from, to } = req.query as any;
    if (!studentId) return res.status(400).json({ message: 'studentId is required.' });
    const repo = AppDataSource.getRepository(DisciplineIncident);
    const qb = repo.createQueryBuilder('d').where('d.studentId = :studentId', { studentId });
    if (termId) qb.andWhere('d.termId = :termId', { termId });
    if (from) qb.andWhere('d.date >= :from', { from });
    if (to) qb.andWhere('d.date <= :to', { to });
    const rows = await qb.getMany();

    const merits = rows.filter((r) => r.kind === 'merit');
    const demerits = rows.filter((r) => r.kind === 'demerit');
    const incidents = rows.filter((r) => r.kind === 'incident');
    const activeSanctions = rows.filter(
      (r) => r.sanctionType && r.sanctionType !== 'none' && r.status === 'open' && (!r.sanctionEndDate || r.sanctionEndDate >= today()),
    );

    res.json({
      studentId,
      totals: {
        merits: merits.length,
        meritPoints: merits.reduce((a, r) => a + Math.max(0, r.points), 0),
        demerits: demerits.length,
        demeritPoints: demerits.reduce((a, r) => a + Math.abs(Math.min(0, r.points)), 0),
        incidents: incidents.length,
        netPoints: rows.reduce((a, r) => a + r.points, 0),
      },
      activeSanctions: activeSanctions.map((r) => ({
        id: r.id,
        sanctionType: r.sanctionType,
        sanctionDetails: r.sanctionDetails,
        sanctionEndDate: r.sanctionEndDate,
        date: r.date,
      })),
      records: rows,
    });
  } catch (e) {
    console.error('[discipline:summary]', e);
    res.status(500).json({ message: 'Could not load conduct summary.' });
  }
});

router.post('/', authorize(...STAFF_ROLES), async (req: AuthRequest, res: Response) => {
  try {
    const b = req.body ?? {};
    if (!b.studentId || !b.kind || !b.category || !b.description || !b.date) {
      return res.status(400).json({ message: 'studentId, kind, category, description and date are required.' });
    }
    const student = await AppDataSource.getRepository(Student).findOne({ where: { id: b.studentId } });
    if (!student) return res.status(404).json({ message: 'Student not found.' });

    const a = actor(req);
    const repo = AppDataSource.getRepository(DisciplineIncident);
    const row = await repo.save(
      repo.create({
        studentId: b.studentId,
        classId: b.classId || student.classId || undefined,
        date: b.date,
        kind: b.kind,
        category: b.category,
        description: b.description,
        points: Number(b.points) || 0,
        sanctionType: b.sanctionType || 'none',
        sanctionDetails: b.sanctionDetails || undefined,
        sanctionEndDate: b.sanctionEndDate || undefined,
        termId: b.termId || undefined,
        status: 'open',
        recordedById: a.userId,
        recordedByName: a.name,
      }),
    );

    if (b.notifyParent !== false) {
      const kindLabel = row.kind === 'merit' ? 'Merit' : row.kind === 'demerit' ? 'Demerit' : 'Incident';
      await notifyStudentParents([row.studentId], {
        title: `${kindLabel} recorded`,
        message: `${kindLabel} (${row.category}) on ${row.date}: ${row.description}`,
        type: 'discipline',
        metadata: { incidentId: row.id, studentId: row.studentId },
      }).catch((err) => console.error('[discipline:notify]', err));
      await repo.update(row.id, { parentNotified: true });
    }

    res.status(201).json(row);
  } catch (e) {
    console.error('[discipline:create]', e);
    res.status(500).json({ message: 'Could not save the record.' });
  }
});

router.patch('/:id', authorize(...STAFF_ROLES), async (req: AuthRequest, res: Response) => {
  try {
    const repo = AppDataSource.getRepository(DisciplineIncident);
    const row = await repo.findOne({ where: { id: String(req.params.id) } });
    if (!row) return res.status(404).json({ message: 'Record not found.' });
    const b = req.body ?? {};
    const allowed = ['status', 'sanctionType', 'sanctionDetails', 'sanctionEndDate', 'points', 'description', 'category'];
    for (const k of allowed) {
      if (b[k] !== undefined) (row as any)[k] = b[k];
    }
    await repo.save(row);
    res.json(row);
  } catch (e) {
    console.error('[discipline:update]', e);
    res.status(500).json({ message: 'Could not update the record.' });
  }
});

router.post('/:id/notify-parent', authorize(...STAFF_ROLES), async (req: AuthRequest, res: Response) => {
  try {
    const repo = AppDataSource.getRepository(DisciplineIncident);
    const row = await repo.findOne({ where: { id: String(req.params.id) } });
    if (!row) return res.status(404).json({ message: 'Record not found.' });
    const kindLabel = row.kind === 'merit' ? 'Merit' : row.kind === 'demerit' ? 'Demerit' : 'Incident';
    const sent = await notifyStudentParents([row.studentId], {
      title: `${kindLabel} recorded`,
      message: `${kindLabel} (${row.category}) on ${row.date}: ${row.description}`,
      type: 'discipline',
      metadata: { incidentId: row.id, studentId: row.studentId },
    });
    await repo.update(row.id, { parentNotified: true });
    res.json({ notified: sent });
  } catch (e) {
    console.error('[discipline:notify-parent]', e);
    res.status(500).json({ message: 'Could not notify parents.' });
  }
});

/** Per-class conduct roll-up for a term — feeds report cards / conduct section. */
router.get('/class-summary', authorize(...STAFF_ROLES), async (req: AuthRequest, res: Response) => {
  try {
    const { classId, termId } = req.query as any;
    if (!classId) return res.status(400).json({ message: 'classId is required.' });
    const repo = AppDataSource.getRepository(DisciplineIncident);
    const qb = repo.createQueryBuilder('d').where('d.classId = :classId', { classId });
    if (termId) qb.andWhere('d.termId = :termId', { termId });
    const rows = await qb.getMany();

    const byStudent = new Map<string, any>();
    for (const r of rows) {
      const cur = byStudent.get(r.studentId) || {
        studentId: r.studentId,
        merits: 0,
        demerits: 0,
        incidents: 0,
        netPoints: 0,
        activeSanctions: 0,
      };
      if (r.kind === 'merit') cur.merits++;
      else if (r.kind === 'demerit') cur.demerits++;
      else cur.incidents++;
      cur.netPoints += r.points;
      if (r.sanctionType && r.sanctionType !== 'none' && r.status === 'open') cur.activeSanctions++;
      byStudent.set(r.studentId, cur);
    }

    const names = await studentNames([...byStudent.keys()]);
    res.json(
      [...byStudent.values()].map((r: any) => ({
        ...r,
        studentName: names.get(r.studentId) || r.studentId,
      })),
    );
  } catch (e) {
    console.error('[discipline:class-summary]', e);
    res.status(500).json({ message: 'Could not load class conduct summary.' });
  }
});

export default router;
