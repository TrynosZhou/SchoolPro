// @ts-nocheck
import { Router, Response } from 'express';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { UserRole } from '../entities/enums';
import { AppDataSource } from '../config/data-source';
import { Alumni, AlumniEvent, AlumniDonation } from '../entities/Alumni';
import { Student } from '../entities';
import { generateNumber, today } from '../utils/helpers';

const router = Router();

const MANAGE: UserRole[] = [UserRole.ADMIN, UserRole.PRINCIPAL, UserRole.DIRECTOR];

router.use(authenticate);

// ---------------- Directory ----------------

router.get('/directory', authorize(...MANAGE), async (req: AuthRequest, res: Response) => {
  try {
    const { q, graduationYear } = req.query as any;
    const repo = AppDataSource.getRepository(Alumni);
    const qb = repo.createQueryBuilder('a').orderBy('a.lastName', 'ASC');
    if (graduationYear) qb.andWhere('a.graduationYear = :gy', { gy: Number(graduationYear) });
    let rows = await qb.getMany();
    if (q) {
      const needle = String(q).toLowerCase();
      rows = rows.filter((r) =>
        `${r.firstName} ${r.lastName} ${r.email || ''} ${r.currentOccupation || ''} ${r.location || ''}`.toLowerCase().includes(needle),
      );
    }
    res.json(rows);
  } catch (e) {
    console.error('[alumni:directory]', e);
    res.status(500).json({ message: 'Could not load alumni directory.' });
  }
});

router.post('/directory', authorize(...MANAGE), async (req: AuthRequest, res: Response) => {
  try {
    const b = req.body ?? {};
    if (!b.firstName || !b.lastName) {
      return res.status(400).json({ message: 'firstName and lastName are required.' });
    }
    const repo = AppDataSource.getRepository(Alumni);
    const row = await repo.save(
      repo.create({
        studentId: b.studentId || undefined,
        firstName: b.firstName,
        lastName: b.lastName,
        graduationYear: b.graduationYear != null ? Number(b.graduationYear) : undefined,
        className: b.className || undefined,
        email: b.email || undefined,
        phone: b.phone || undefined,
        currentOccupation: b.currentOccupation || undefined,
        location: b.location || undefined,
        notes: b.notes || undefined,
      }),
    );
    res.status(201).json(row);
  } catch (e) {
    console.error('[alumni:create]', e);
    res.status(500).json({ message: 'Could not add alumni.' });
  }
});

/** Auto-populate alumni from graduated students. */
router.post('/directory/sync-graduated', authorize(...MANAGE), async (_req: AuthRequest, res: Response) => {
  try {
    const students = await AppDataSource.getRepository(Student).find({
      where: { status: 'graduated' },
      relations: { schoolClass: true },
    });
    const repo = AppDataSource.getRepository(Alumni);
    const existing = await repo.find();
    const have = new Set(existing.map((a) => a.studentId).filter(Boolean));
    let created = 0;
    const year = new Date().getFullYear();
    for (const s of students) {
      if (have.has(s.id)) continue;
      await repo.save(
        repo.create({
          studentId: s.id,
          firstName: s.firstName,
          lastName: s.lastName,
          graduationYear: year,
          className: (s as any).schoolClass?.name,
        }),
      );
      created++;
    }
    res.json({ created, scanned: students.length });
  } catch (e) {
    console.error('[alumni:sync]', e);
    res.status(500).json({ message: 'Could not sync alumni.' });
  }
});

router.patch('/directory/:id', authorize(...MANAGE), async (req: AuthRequest, res: Response) => {
  try {
    const repo = AppDataSource.getRepository(Alumni);
    const row = await repo.findOne({ where: { id: String(req.params.id) } });
    if (!row) return res.status(404).json({ message: 'Alumni record not found.' });
    const b = req.body ?? {};
    const fields = ['firstName', 'lastName', 'graduationYear', 'className', 'email', 'phone', 'currentOccupation', 'location', 'notes', 'isActive'];
    for (const f of fields) if (b[f] !== undefined) (row as any)[f] = b[f];
    await repo.save(row);
    res.json(row);
  } catch (e) {
    res.status(500).json({ message: 'Could not update alumni.' });
  }
});

// ---------------- Events ----------------

router.get('/events', authorize(...MANAGE), async (_req: AuthRequest, res: Response) => {
  try {
    const events = await AppDataSource.getRepository(AlumniEvent).find({ order: { date: 'DESC' } });
    res.json(events);
  } catch (e) {
    res.status(500).json({ message: 'Could not load events.' });
  }
});

router.post('/events', authorize(...MANAGE), async (req: AuthRequest, res: Response) => {
  try {
    const b = req.body ?? {};
    if (!b.title) return res.status(400).json({ message: 'title is required.' });
    const repo = AppDataSource.getRepository(AlumniEvent);
    res.status(201).json(
      await repo.save(
        repo.create({
          title: b.title,
          description: b.description || undefined,
          date: b.date ? new Date(b.date) : undefined,
          venue: b.venue || undefined,
          type: b.type || 'reunion',
          fundraisingTarget: Number(b.fundraisingTarget) || 0,
          status: b.status || 'upcoming',
        }),
      ),
    );
  } catch (e) {
    res.status(500).json({ message: 'Could not create event.' });
  }
});

router.patch('/events/:id', authorize(...MANAGE), async (req: AuthRequest, res: Response) => {
  try {
    const repo = AppDataSource.getRepository(AlumniEvent);
    const row = await repo.findOne({ where: { id: String(req.params.id) } });
    if (!row) return res.status(404).json({ message: 'Event not found.' });
    const b = req.body ?? {};
    for (const k of ['title', 'description', 'date', 'venue', 'type', 'fundraisingTarget', 'amountRaised', 'status']) {
      if (b[k] !== undefined) (row as any)[k] = b[k];
    }
    await repo.save(row);
    res.json(row);
  } catch (e) {
    res.status(500).json({ message: 'Could not update event.' });
  }
});

// ---------------- Fundraising ----------------

router.get('/donations', authorize(...MANAGE), async (req: AuthRequest, res: Response) => {
  try {
    const { alumniId, eventId } = req.query as any;
    const repo = AppDataSource.getRepository(AlumniDonation);
    const qb = repo.createQueryBuilder('d').orderBy('d.date', 'DESC');
    if (alumniId) qb.andWhere('d.alumniId = :alumniId', { alumniId });
    if (eventId) qb.andWhere('d.eventId = :eventId', { eventId });
    const rows = await qb.take(500).getMany();
    const alumni = await AppDataSource.getRepository(Alumni).find();
    res.json(
      rows.map((r) => ({
        ...r,
        alumni: alumni.find((a) => a.id === r.alumniId),
      })),
    );
  } catch (e) {
    res.status(500).json({ message: 'Could not load donations.' });
  }
});

router.post('/donations', authorize(...MANAGE), async (req: AuthRequest, res: Response) => {
  try {
    const b = req.body ?? {};
    if (!b.alumniId || !b.amount || Number(b.amount) <= 0) {
      return res.status(400).json({ message: 'alumniId and a positive amount are required.' });
    }
    const repo = AppDataSource.getRepository(AlumniDonation);
    const row = await repo.save(
      repo.create({
        alumniId: b.alumniId,
        eventId: b.eventId || undefined,
        amount: Number(b.amount),
        method: b.method || 'cash',
        date: b.date || today(),
        notes: b.notes || undefined,
        recordedById: req.user!.userId,
      }),
    );

    // Roll up to event amountRaised
    if (b.eventId) {
      const eventRepo = AppDataSource.getRepository(AlumniEvent);
      const event = await eventRepo.findOne({ where: { id: b.eventId } });
      if (event) {
        const total = await repo
          .createQueryBuilder('d')
          .select('COALESCE(SUM(d.amount),0)', 'total')
          .where('d.eventId = :eid', { eid: b.eventId })
          .getRawOne();
        await eventRepo.update(event.id, { amountRaised: Number(total?.total || 0) });
      }
    }

    res.status(201).json(row);
  } catch (e) {
    console.error('[alumni:donate]', e);
    res.status(500).json({ message: 'Could not record donation.' });
  }
});

export default router;
