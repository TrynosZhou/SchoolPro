// @ts-nocheck
import { Router, Response } from 'express';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { UserRole } from '../entities/enums';
import { AppDataSource } from '../config/data-source';
import { VisitorLog, AuthorizedPickup, EarlyLeaveRequest } from '../entities/Gate';
import { Student } from '../entities';
import { notifyStudentParents } from '../services/parent-notify.service';
import { studentNames } from '../utils/lookups';
import { today } from '../utils/helpers';
import crypto from 'crypto';

const router = Router();

const MANAGE: UserRole[] = [UserRole.ADMIN, UserRole.PRINCIPAL, UserRole.DIRECTOR];
const GATE_STAFF: UserRole[] = [...MANAGE, UserRole.TEACHER];

router.use(authenticate);

// ---------------- Visitor log ----------------

router.get('/visitors', authorize(...GATE_STAFF), async (req: AuthRequest, res: Response) => {
  try {
    const { date, status, q } = req.query as any;
    const repo = AppDataSource.getRepository(VisitorLog);
    const qb = repo.createQueryBuilder('v').orderBy('v.createdAt', 'DESC');
    qb.andWhere('v.date = :date', { date: date || today() });
    if (status) qb.andWhere('v.status = :status', { status });
    if (q) {
      qb.andWhere('(v.visitorName ILIKE :q OR v.personVisited ILIKE :q OR v.purpose ILIKE :q)', { q: `%${q}%` });
    }
    const rows = await qb.take(500).getMany();
    const names = await staffNamesSafe(rows.map((r) => r.loggedById));
    res.json(rows.map((r) => ({ ...r, loggedByName: r.loggedByName || names.get(r.loggedById || '') })));
  } catch (e) {
    console.error('[gate:visitors]', e);
    res.status(500).json({ message: 'Could not load visitor log.' });
  }
});

async function staffNamesSafe(ids: any[]) {
  const { staffNames } = await import('../utils/lookups');
  return staffNames(ids);
}

router.post('/visitors', authorize(...GATE_STAFF), async (req: AuthRequest, res: Response) => {
  try {
    const b = req.body ?? {};
    if (!b.visitorName) return res.status(400).json({ message: 'visitorName is required.' });
    const repo = AppDataSource.getRepository(VisitorLog);
    const row = await repo.save(
      repo.create({
        visitorName: b.visitorName,
        idNumber: b.idNumber || undefined,
        phone: b.phone || undefined,
        organization: b.organization || undefined,
        purpose: b.purpose || undefined,
        personVisited: b.personVisited || undefined,
        vehicleRegistration: b.vehicleRegistration || undefined,
        signInTime: b.signInTime || new Date().toTimeString().slice(0, 5),
        badgeNumber: `V-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
        status: 'inside',
        loggedById: req.user!.userId,
        loggedByName: req.user!.email,
        date: b.date || today(),
      }),
    );
    res.status(201).json(row);
  } catch (e) {
    console.error('[gate:sign-in]', e);
    res.status(500).json({ message: 'Could not sign in visitor.' });
  }
});

router.patch('/visitors/:id', authorize(...GATE_STAFF), async (req: AuthRequest, res: Response) => {
  try {
    const repo = AppDataSource.getRepository(VisitorLog);
    const row = await repo.findOne({ where: { id: String(req.params.id) } });
    if (!row) return res.status(404).json({ message: 'Visitor record not found.' });
    const b = req.body ?? {};
    if (b.signOut) {
      row.status = 'signed_out';
      row.signOutTime = new Date().toTimeString().slice(0, 5);
    } else {
      for (const k of ['visitorName', 'idNumber', 'phone', 'organization', 'purpose', 'personVisited', 'vehicleRegistration', 'signInTime', 'signOutTime', 'badgeNumber', 'status']) {
        if (b[k] !== undefined) (row as any)[k] = b[k];
      }
    }
    await repo.save(row);
    res.json(row);
  } catch (e) {
    res.status(500).json({ message: 'Could not update visitor record.' });
  }
});

// ---------------- Authorised pickups ----------------

router.get('/pickups', async (req: AuthRequest, res: Response) => {
  try {
    const { studentId, activeOnly } = req.query as any;
    const repo = AppDataSource.getRepository(AuthorizedPickup);
    const qb = repo.createQueryBuilder('p').orderBy('p.createdAt', 'DESC');
    if (studentId) qb.andWhere('p.studentId = :studentId', { studentId });
    if (activeOnly !== 'false') qb.andWhere('p.isActive = true');
    let rows = await qb.take(500).getMany();

    if (req.user!.role === UserRole.PARENT) {
      const kids = await AppDataSource.getRepository(Student)
        .createQueryBuilder('s')
        .innerJoin('guardians', 'g', 'g.studentId = s.id')
        .where('g.parentId = :pid', { pid: (req.user as any).parentId || req.user!.userId })
        .select('s.id', 'id')
        .getRawMany();
      const kidIds = new Set(kids.map((k: any) => k.id || k.s_id));
      rows = rows.filter((r) => kidIds.has(r.studentId));
    }

    const names = await studentNames(rows.map((r) => r.studentId));
    res.json(rows.map((r) => ({ ...r, studentName: names.get(r.studentId) })));
  } catch (e) {
    console.error('[gate:pickups]', e);
    res.status(500).json({ message: 'Could not load authorised pickups.' });
  }
});

router.post('/pickups', authorize(...MANAGE), async (req: AuthRequest, res: Response) => {
  try {
    const b = req.body ?? {};
    if (!b.studentId || !b.name || !b.relationship) {
      return res.status(400).json({ message: 'studentId, name and relationship are required.' });
    }
    const repo = AppDataSource.getRepository(AuthorizedPickup);
    const row = await repo.save(
      repo.create({
        studentId: b.studentId,
        name: b.name,
        relationship: b.relationship,
        phone: b.phone || undefined,
        idNumber: b.idNumber || undefined,
        validFrom: b.validFrom || undefined,
        validTo: b.validTo || undefined,
        isActive: true,
      }),
    );
    res.status(201).json(row);
  } catch (e) {
    console.error('[gate:create-pickup]', e);
    res.status(500).json({ message: 'Could not save authorised pickup.' });
  }
});

router.patch('/pickups/:id', authorize(...MANAGE), async (req: AuthRequest, res: Response) => {
  try {
    const repo = AppDataSource.getRepository(AuthorizedPickup);
    const row = await repo.findOne({ where: { id: String(req.params.id) } });
    if (!row) return res.status(404).json({ message: 'Pickup record not found.' });
    const b = req.body ?? {};
    for (const k of ['name', 'relationship', 'phone', 'idNumber', 'validFrom', 'validTo', 'isActive']) {
      if (b[k] !== undefined) (row as any)[k] = b[k];
    }
    await repo.save(row);
    res.json(row);
  } catch (e) {
    res.status(500).json({ message: 'Could not update pickup.' });
  }
});

// ---------------- Early leave ----------------

router.get('/early-leave', async (req: AuthRequest, res: Response) => {
  try {
    const { status, date } = req.query as any;
    const repo = AppDataSource.getRepository(EarlyLeaveRequest);
    const qb = repo.createQueryBuilder('e').orderBy('e.date', 'DESC').addOrderBy('e.time', 'DESC');
    if (status) qb.andWhere('e.status = :status', { status });
    if (date) qb.andWhere('e.date = :date', { date });
    let rows = await qb.take(300).getMany();

    if (req.user!.role === UserRole.PARENT) {
      const kids = await AppDataSource.getRepository(Student)
        .createQueryBuilder('s')
        .innerJoin('guardians', 'g', 'g.studentId = s.id')
        .where('g.parentId = :pid', { pid: (req.user as any).parentId || req.user!.userId })
        .select('s.id', 'id')
        .getRawMany();
      const kidIds = new Set(kids.map((k: any) => k.id || k.s_id));
      rows = rows.filter((r) => kidIds.has(r.studentId));
    }

    const names = await studentNames(rows.map((r) => r.studentId));
    res.json(rows.map((r) => ({ ...r, studentName: names.get(r.studentId) })));
  } catch (e) {
    console.error('[gate:early-leave]', e);
    res.status(500).json({ message: 'Could not load early leave requests.' });
  }
});

/** Parents request early leave for their child. */
router.post('/early-leave', authorize(UserRole.PARENT, ...GATE_STAFF), async (req: AuthRequest, res: Response) => {
  try {
    const b = req.body ?? {};
    if (!b.studentId || !b.date || !b.time) {
      return res.status(400).json({ message: 'studentId, date and time are required.' });
    }
    const repo = AppDataSource.getRepository(EarlyLeaveRequest);
    const row = await repo.save(
      repo.create({
        studentId: b.studentId,
        requestedById: req.user!.userId,
        reason: b.reason || undefined,
        date: b.date,
        time: b.time,
        status: 'pending',
      }),
    );
    // Notify teachers/admins? At minimum confirm to parents.
    await notifyStudentParents([b.studentId], {
      title: 'Early leave requested',
      message: `Early leave for ${b.date} at ${b.time} is pending approval.`,
      type: 'gate',
      metadata: { earlyLeaveId: row.id, studentId: b.studentId },
    }).catch(() => undefined);
    res.status(201).json(row);
  } catch (e) {
    console.error('[gate:create-early-leave]', e);
    res.status(500).json({ message: 'Could not submit early leave request.' });
  }
});

router.patch('/early-leave/:id', authorize(...GATE_STAFF), async (req: AuthRequest, res: Response) => {
  try {
    const repo = AppDataSource.getRepository(EarlyLeaveRequest);
    const row = await repo.findOne({ where: { id: String(req.params.id) } });
    if (!row) return res.status(404).json({ message: 'Request not found.' });
    const b = req.body ?? {};
    if (b.status) {
      row.status = b.status;
      if (['approved', 'rejected'].includes(b.status)) {
        row.approvedById = req.user!.userId;
        row.decisionNote = b.decisionNote || undefined;
      }
      if (b.status === 'completed') row.departedAt = b.departedAt || new Date().toTimeString().slice(0, 5);
      await notifyStudentParents([row.studentId], {
        title: `Early leave ${b.status}`,
        message: `The early leave request for ${row.date} at ${row.time} was ${b.status}.`,
        type: 'gate',
        metadata: { earlyLeaveId: row.id, studentId: row.studentId },
      }).catch(() => undefined);
    }
    await repo.save(row);
    res.json(row);
  } catch (e) {
    console.error('[gate:update-early-leave]', e);
    res.status(500).json({ message: 'Could not update request.' });
  }
});

export default router;
