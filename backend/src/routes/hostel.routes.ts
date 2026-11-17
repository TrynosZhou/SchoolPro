// @ts-nocheck
import { Router, Response } from 'express';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { UserRole } from '../entities/enums';
import { AppDataSource } from '../config/data-source';
import {
  Dormitory,
  DormBed,
  BoardingRollCall,
  ExeatPass,
  HostelItem,
} from '../entities/Hostel';
import { Student } from '../entities';
import { notifyStudentParents } from '../services/parent-notify.service';
import { studentNames, staffNames } from '../utils/lookups';
import { today } from '../utils/helpers';
import { In } from 'typeorm';

const router = Router();

const MANAGE: UserRole[] = [UserRole.ADMIN, UserRole.PRINCIPAL, UserRole.DIRECTOR];
const STAFF: UserRole[] = [...MANAGE, UserRole.TEACHER];

router.use(authenticate);

// ---------------- Dormitories & beds ----------------

router.get('/overview', authorize(...STAFF), async (_req: AuthRequest, res: Response) => {
  try {
    const [dorms, beds] = await Promise.all([
      AppDataSource.getRepository(Dormitory).find({ order: { name: 'ASC' } }),
      AppDataSource.getRepository(DormBed).find(),
    ]);
    const occupied = beds.filter((b) => b.status === 'occupied').length;
    const wardens = await staffNames(dorms.map((d) => d.wardenStaffId));
    res.json({
      dormitories: dorms.map((d) => ({
        ...d,
        wardenName: wardens.get(d.wardenStaffId || ''),
        occupied: beds.filter((b) => b.dormitoryId === d.id && b.status === 'occupied').length,
        totalBeds: beds.filter((b) => b.dormitoryId === d.id).length,
      })),
      beds,
      stats: {
        dormitories: dorms.length,
        beds: beds.length,
        occupied,
        occupancyRate: beds.length ? Math.round((occupied / beds.length) * 100) : 0,
      },
    });
  } catch (e) {
    console.error('[hostel:overview]', e);
    res.status(500).json({ message: 'Could not load hostel data.' });
  }
});

router.post('/dormitories', authorize(...MANAGE), async (req: AuthRequest, res: Response) => {
  try {
    const b = req.body ?? {};
    if (!b.name) return res.status(400).json({ message: 'name is required.' });
    const repo = AppDataSource.getRepository(Dormitory);
    const row = await repo.save(
      repo.create({
        name: b.name,
        type: b.type || 'mixed',
        capacity: Number(b.capacity) || 0,
        wardenStaffId: b.wardenStaffId || undefined,
        location: b.location || undefined,
      }),
    );
    res.status(201).json(row);
  } catch (e) {
    console.error('[hostel:create-dorm]', e);
    res.status(500).json({ message: 'Could not create dormitory.' });
  }
});

router.patch('/dormitories/:id', authorize(...MANAGE), async (req: AuthRequest, res: Response) => {
  try {
    const repo = AppDataSource.getRepository(Dormitory);
    const row = await repo.findOne({ where: { id: String(req.params.id) } });
    if (!row) return res.status(404).json({ message: 'Dormitory not found.' });
    const b = req.body ?? {};
    for (const k of ['name', 'type', 'capacity', 'wardenStaffId', 'location', 'isActive']) {
      if (b[k] !== undefined) (row as any)[k] = b[k];
    }
    await repo.save(row);
    res.json(row);
  } catch (e) {
    res.status(500).json({ message: 'Could not update dormitory.' });
  }
});

router.post('/beds', authorize(...MANAGE), async (req: AuthRequest, res: Response) => {
  try {
    const b = req.body ?? {};
    if (!b.dormitoryId || !b.bedNumber) {
      return res.status(400).json({ message: 'dormitoryId and bedNumber are required.' });
    }
    const repo = AppDataSource.getRepository(DormBed);
    const row = await repo.save(
      repo.create({
        dormitoryId: b.dormitoryId,
        bedNumber: b.bedNumber,
        roomLabel: b.roomLabel || undefined,
        status: 'vacant',
      }),
    );
    res.status(201).json(row);
  } catch (e) {
    console.error('[hostel:create-bed]', e);
    res.status(500).json({ message: 'Could not create bed.' });
  }
});

/** Allocate a bed to a student. */
router.post('/beds/:id/allocate', authorize(...MANAGE), async (req: AuthRequest, res: Response) => {
  try {
    const { studentId } = req.body ?? {};
    if (!studentId) return res.status(400).json({ message: 'studentId is required.' });
    const student = await AppDataSource.getRepository(Student).findOne({ where: { id: studentId } });
    if (!student) return res.status(404).json({ message: 'Student not found.' });

    const repo = AppDataSource.getRepository(DormBed);
    const bed = await repo.findOne({ where: { id: String(req.params.id) } });
    if (!bed) return res.status(404).json({ message: 'Bed not found.' });
    if (bed.status === 'occupied' && bed.studentId !== studentId) {
      return res.status(409).json({ message: 'Bed is already occupied.' });
    }

    // Vacate any existing bed for this student
    await AppDataSource.getRepository(DormBed)
      .createQueryBuilder()
      .update()
      .set({ studentId: null as any, status: 'vacant' })
      .where('studentId = :sid', { sid: studentId })
      .execute();

    bed.studentId = studentId;
    bed.status = 'occupied';
    await repo.save(bed);

    await notifyStudentParents([studentId], {
      title: 'Boarding allocation',
      message: `${student.firstName} ${student.lastName} has been allocated a boarding bed.`,
      type: 'hostel',
      metadata: { bedId: bed.id, dormitoryId: bed.dormitoryId },
    }).catch(() => undefined);

    res.json(bed);
  } catch (e) {
    console.error('[hostel:allocate]', e);
    res.status(500).json({ message: 'Could not allocate bed.' });
  }
});

router.post('/beds/:id/vacate', authorize(...MANAGE), async (req: AuthRequest, res: Response) => {
  try {
    const repo = AppDataSource.getRepository(DormBed);
    const bed = await repo.findOne({ where: { id: String(req.params.id) } });
    if (!bed) return res.status(404).json({ message: 'Bed not found.' });
    bed.studentId = null as any;
    bed.status = 'vacant';
    await repo.save(bed);
    res.json(bed);
  } catch (e) {
    res.status(500).json({ message: 'Could not vacate bed.' });
  }
});

// ---------------- Roll calls ----------------

router.get('/roll-calls', authorize(...STAFF), async (req: AuthRequest, res: Response) => {
  try {
    const { dormitoryId, date, from, to } = req.query as any;
    const repo = AppDataSource.getRepository(BoardingRollCall);
    const qb = repo.createQueryBuilder('r').orderBy('r.date', 'DESC').addOrderBy('r.time', 'DESC');
    if (dormitoryId) qb.andWhere('r.dormitoryId = :dormitoryId', { dormitoryId });
    if (date) qb.andWhere('r.date = :date', { date });
    if (from) qb.andWhere('r.date >= :from', { from });
    if (to) qb.andWhere('r.date <= :to', { to });
    const rows = await qb.take(200).getMany();
    const [dorms, names] = await Promise.all([
      AppDataSource.getRepository(Dormitory).find(),
      staffNames(rows.map((r) => r.conductedById)),
    ]);
    // collect student ids across entries for names
    const studentIds = [...new Set(rows.flatMap((r) => (r.entries || []).map((e: any) => e.studentId).filter(Boolean)))];
    const sNames = await studentNames(studentIds);
    res.json(
      rows.map((r) => ({
        ...r,
        dormitory: dorms.find((d) => d.id === r.dormitoryId),
        conductedByName: names.get(r.conductedById || ''),
        entries: (r.entries || []).map((e: any) => ({ ...e, studentName: sNames.get(e.studentId) })),
      })),
    );
  } catch (e) {
    console.error('[hostel:roll-calls]', e);
    res.status(500).json({ message: 'Could not load roll calls.' });
  }
});

router.post('/roll-calls', authorize(...STAFF), async (req: AuthRequest, res: Response) => {
  try {
    const b = req.body ?? {};
    if (!b.dormitoryId || !b.date || !Array.isArray(b.entries)) {
      return res.status(400).json({ message: 'dormitoryId, date and entries are required.' });
    }
    const repo = AppDataSource.getRepository(BoardingRollCall);
    const row = await repo.save(
      repo.create({
        dormitoryId: b.dormitoryId,
        date: b.date,
        time: b.time || undefined,
        entries: b.entries,
        conductedById: req.user!.userId,
        conductedByName: req.user!.email,
      }),
    );
    res.status(201).json(row);
  } catch (e) {
    console.error('[hostel:roll-call]', e);
    res.status(500).json({ message: 'Could not save roll call.' });
  }
});

// ---------------- Exeat passes ----------------

router.get('/exeats', authorize(...STAFF), async (req: AuthRequest, res: Response) => {
  try {
    const { status, studentId } = req.query as any;
    const repo = AppDataSource.getRepository(ExeatPass);
    const qb = repo.createQueryBuilder('x').orderBy('x.departureAt', 'DESC');
    if (status) qb.andWhere('x.status = :status', { status });
    if (studentId) qb.andWhere('x.studentId = :studentId', { studentId });
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

    const [names, approvers] = await Promise.all([
      studentNames(rows.map((r) => r.studentId)),
      staffNames(rows.map((r) => r.approvedById)),
    ]);
    res.json(
      rows.map((r) => ({
        ...r,
        studentName: names.get(r.studentId),
        approvedByName: approvers.get(r.approvedById || ''),
      })),
    );
  } catch (e) {
    console.error('[hostel:exeats]', e);
    res.status(500).json({ message: 'Could not load exeat passes.' });
  }
});

/** Staff creates an exeat request on behalf of a student. */
router.post('/exeats', authorize(...STAFF), async (req: AuthRequest, res: Response) => {
  try {
    const b = req.body ?? {};
    if (!b.studentId || !b.destination || !b.departureAt || !b.returnAt) {
      return res.status(400).json({ message: 'studentId, destination, departureAt and returnAt are required.' });
    }
    const repo = AppDataSource.getRepository(ExeatPass);
    const row = await repo.save(
      repo.create({
        studentId: b.studentId,
        destination: b.destination,
        departureAt: new Date(b.departureAt),
        returnAt: new Date(b.returnAt),
        reason: b.reason || undefined,
        requestedById: req.user!.userId,
        status: 'requested',
      }),
    );
    await notifyStudentParents([b.studentId], {
      title: 'Exeat pass requested',
      message: `An exeat pass for ${b.destination} departing ${b.departureAt} is awaiting approval.`,
      type: 'hostel',
      metadata: { exeatId: row.id, studentId: b.studentId },
    }).catch(() => undefined);
    res.status(201).json(row);
  } catch (e) {
    console.error('[hostel:create-exeat]', e);
    res.status(500).json({ message: 'Could not create exeat pass.' });
  }
});

router.patch('/exeats/:id', authorize(...MANAGE), async (req: AuthRequest, res: Response) => {
  try {
    const repo = AppDataSource.getRepository(ExeatPass);
    const row = await repo.findOne({ where: { id: String(req.params.id) } });
    if (!row) return res.status(404).json({ message: 'Exeat pass not found.' });
    const b = req.body ?? {};
    if (b.status) {
      row.status = b.status;
      if (['approved', 'rejected'].includes(b.status)) {
        row.approvedById = req.user!.userId;
        row.approvalNote = b.approvalNote || undefined;
      }
      if (b.status === 'returned') row.returnedAt = new Date();
      // notify parents of decision
      await notifyStudentParents([row.studentId], {
        title: `Exeat pass ${b.status}`,
        message: `The exeat pass to ${row.destination} was ${b.status}${b.approvalNote ? `: ${b.approvalNote}` : '.'}`,
        type: 'hostel',
        metadata: { exeatId: row.id, studentId: row.studentId },
      }).catch(() => undefined);
    }
    await repo.save(row);
    res.json(row);
  } catch (e) {
    console.error('[hostel:update-exeat]', e);
    res.status(500).json({ message: 'Could not update exeat pass.' });
  }
});

// ---------------- Inventory ----------------

router.get('/inventory', authorize(...STAFF), async (_req: AuthRequest, res: Response) => {
  try {
    const items = await AppDataSource.getRepository(HostelItem).find({ order: { name: 'ASC' } });
    const dorms = await AppDataSource.getRepository(Dormitory).find();
    res.json(
      items.map((i) => ({ ...i, dormitory: dorms.find((d) => d.id === i.dormitoryId) })),
    );
  } catch (e) {
    console.error('[hostel:inventory]', e);
    res.status(500).json({ message: 'Could not load inventory.' });
  }
});

router.post('/inventory', authorize(...STAFF), async (req: AuthRequest, res: Response) => {
  try {
    const b = req.body ?? {};
    if (!b.name) return res.status(400).json({ message: 'name is required.' });
    const repo = AppDataSource.getRepository(HostelItem);
    const row = await repo.save(
      repo.create({
        name: b.name,
        category: b.category || 'other',
        quantity: Number(b.quantity) || 0,
        condition: b.condition != null ? Number(b.condition) : 100,
        dormitoryId: b.dormitoryId || undefined,
        notes: b.notes || undefined,
      }),
    );
    res.status(201).json(row);
  } catch (e) {
    res.status(500).json({ message: 'Could not save item.' });
  }
});

router.patch('/inventory/:id', authorize(...STAFF), async (req: AuthRequest, res: Response) => {
  try {
    const repo = AppDataSource.getRepository(HostelItem);
    const row = await repo.findOne({ where: { id: String(req.params.id) } });
    if (!row) return res.status(404).json({ message: 'Item not found.' });
    const b = req.body ?? {};
    for (const k of ['name', 'category', 'quantity', 'condition', 'dormitoryId', 'notes']) {
      if (b[k] !== undefined) (row as any)[k] = b[k];
    }
    await repo.save(row);
    res.json(row);
  } catch (e) {
    res.status(500).json({ message: 'Could not update item.' });
  }
});

export default router;
