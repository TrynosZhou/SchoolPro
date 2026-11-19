// @ts-nocheck
import { Router, Response } from 'express';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { UserRole } from '../entities/enums';
import { AppDataSource } from '../config/data-source';
import { MeetingSlot, MeetingBooking } from '../entities/Meeting';
import { notifyUser, notifyStudentParents } from '../services/parent-notify.service';
import { staffNames, userNames, studentNames } from '../utils/lookups';
import { In } from 'typeorm';

const router = Router();

router.use(authenticate);

const ALL_ROLES: UserRole[] = [
  UserRole.ADMIN,
  UserRole.PRINCIPAL,
  UserRole.DIRECTOR,
  UserRole.TEACHER,
  UserRole.PARENT,
];

async function enrichBookings(rows: MeetingBooking[]) {
  const parentIds = [...new Set(rows.map((r) => r.parentId))];
  const slotIds = [...new Set(rows.map((r) => r.slotId))];
  const studentIds = [...new Set(rows.filter((r) => r.studentId).map((r) => r.studentId!))];
  const [parents, slots, students] = await Promise.all([
    userNames(parentIds),
    AppDataSource.getRepository(MeetingSlot).find({ where: { id: In(slotIds) } }),
    studentNames(studentIds),
  ]);
  const slotMap = new Map(slots.map((s) => [s.id, s]));
  return rows.map((r) => {
    const slot = slotMap.get(r.slotId);
    return {
      ...r,
      parentName: parents.get(r.parentId),
      studentName: r.studentId ? students.get(r.studentId) : undefined,
      slot: slot
        ? {
            id: slot.id,
            teacherId: slot.teacherId,
            teacherName: slot.teacherName,
            date: slot.date,
            startTime: slot.startTime,
            endTime: slot.endTime,
            location: slot.location,
            topic: slot.topic,
          }
        : undefined,
    };
  });
}

/** List slots. Teachers see own; parents see bookable upcoming; admin sees all. */
router.get('/slots', async (req: AuthRequest, res: Response) => {
  try {
    const { date, teacherId, from, to } = req.query as any;
    const repo = AppDataSource.getRepository(MeetingSlot);
    const qb = repo.createQueryBuilder('s').orderBy('s.date', 'ASC').addOrderBy('s.startTime', 'ASC');
    if (date) qb.andWhere('s.date = :date', { date });
    if (from) qb.andWhere('s.date >= :from', { from });
    if (to) qb.andWhere('s.date <= :to', { to });
    if (teacherId) qb.andWhere('s.teacherId = :teacherId', { teacherId });
    if (req.user!.role === UserRole.TEACHER) {
      qb.andWhere('s.teacherId = :myId', { myId: req.user!.userId });
    }
    let slots = await qb.getMany();

    // Attach confirmed-booking counts with a single grouped query (was one query per slot)
    const counts = new Map<string, number>();
    if (slots.length) {
      const grouped = await AppDataSource.getRepository(MeetingBooking)
        .createQueryBuilder('b')
        .select('b.slotId', 'slotId')
        .addSelect('COUNT(*)', 'n')
        .where('b.slotId IN (:...ids)', { ids: slots.map((s) => s.id) })
        .andWhere('b.status = :st', { st: 'confirmed' })
        .groupBy('b.slotId')
        .getRawMany();
      for (const g of grouped) counts.set(g.slotId, Number(g.n));
    }
    res.json(slots.map((s) => ({ ...s, bookedCount: counts.get(s.id) || 0 })));
  } catch (e) {
    console.error('[meetings:slots]', e);
    res.status(500).json({ message: 'Could not load meeting slots.' });
  }
});

/** Headline figures for the Meetings page header (same visibility rules as the lists). */
router.get('/overview', async (req: AuthRequest, res: Response) => {
  try {
    const { from, to } = req.query as any;
    const slotQb = AppDataSource.getRepository(MeetingSlot).createQueryBuilder('s');
    if (from) slotQb.andWhere('s.date >= :from', { from });
    if (to) slotQb.andWhere('s.date <= :to', { to });
    if (req.user!.role === UserRole.TEACHER) slotQb.andWhere('s.teacherId = :me', { me: req.user!.userId });
    const slots = await slotQb.getMany();

    const bookQb = AppDataSource.getRepository(MeetingBooking).createQueryBuilder('b');
    if (req.user!.role === UserRole.PARENT) {
      bookQb.andWhere('b.parentId = :pid', { pid: (req.user as any).parentId || req.user!.userId });
    } else if (slots.length) {
      bookQb.andWhere('b.slotId IN (:...ids)', { ids: slots.map((s) => s.id) });
    } else {
      bookQb.andWhere('1 = 0');
    }
    const bookings = await bookQb.getMany();
    const by = (st: string) => bookings.filter((b) => b.status === st).length;

    res.json({
      slots: slots.length,
      openSlots: slots.filter((s) => s.status === 'open').length,
      confirmed: by('confirmed'),
      completed: by('completed'),
      cancelled: by('cancelled'),
    });
  } catch (e) {
    console.error('[meetings:overview]', e);
    res.status(500).json({ message: 'Could not load meetings overview.' });
  }
});

/** Teacher/admin creates a slot. */
router.post('/slots', authorize(UserRole.ADMIN, UserRole.PRINCIPAL, UserRole.DIRECTOR, UserRole.TEACHER), async (req: AuthRequest, res: Response) => {
  try {
    const b = req.body ?? {};
    if (!b.date || !b.startTime || !b.endTime) {
      return res.status(400).json({ message: 'date, startTime and endTime are required.' });
    }
    const teacherId = b.teacherId || req.user!.userId;
    const teacherName = b.teacherName || req.user!.email;
    const repo = AppDataSource.getRepository(MeetingSlot);
    const row = await repo.save(
      repo.create({
        teacherId,
        teacherName,
        date: b.date,
        startTime: b.startTime,
        endTime: b.endTime,
        location: b.location || undefined,
        topic: b.topic || undefined,
        maxBookings: b.maxBookings != null ? Number(b.maxBookings) : undefined,
        status: 'open',
      }),
    );
    res.status(201).json(row);
  } catch (e) {
    console.error('[meetings:create-slot]', e);
    res.status(500).json({ message: 'Could not create slot.' });
  }
});

router.patch('/slots/:id', authorize(UserRole.ADMIN, UserRole.PRINCIPAL, UserRole.DIRECTOR, UserRole.TEACHER), async (req: AuthRequest, res: Response) => {
  try {
    const repo = AppDataSource.getRepository(MeetingSlot);
    const row = await repo.findOne({ where: { id: String(req.params.id) } });
    if (!row) return res.status(404).json({ message: 'Slot not found.' });
    if (req.user!.role === UserRole.TEACHER && row.teacherId !== req.user!.userId) {
      return res.status(403).json({ message: 'Not your slot.' });
    }
    const b = req.body ?? {};
    for (const k of ['date', 'startTime', 'endTime', 'location', 'topic', 'maxBookings', 'status']) {
      if (b[k] !== undefined) (row as any)[k] = b[k];
    }
    await repo.save(row);
    res.json(row);
  } catch (e) {
    console.error('[meetings:update-slot]', e);
    res.status(500).json({ message: 'Could not update slot.' });
  }
});

router.delete('/slots/:id', authorize(UserRole.ADMIN, UserRole.PRINCIPAL, UserRole.DIRECTOR, UserRole.TEACHER), async (req: AuthRequest, res: Response) => {
  try {
    const repo = AppDataSource.getRepository(MeetingSlot);
    const row = await repo.findOne({ where: { id: String(req.params.id) } });
    if (!row) return res.status(404).json({ message: 'Slot not found.' });
    if (req.user!.role === UserRole.TEACHER && row.teacherId !== req.user!.userId) {
      return res.status(403).json({ message: 'Not your slot.' });
    }
    await repo.delete(row.id);
    res.json({ ok: true });
  } catch (e) {
    console.error('[meetings:delete-slot]', e);
    res.status(500).json({ message: 'Could not delete slot.' });
  }
});

/** Parent books a slot. */
router.post('/bookings', authorize(UserRole.PARENT), async (req: AuthRequest, res: Response) => {
  try {
    const b = req.body ?? {};
    if (!b.slotId) return res.status(400).json({ message: 'slotId is required.' });
    const slotRepo = AppDataSource.getRepository(MeetingSlot);
    const slot = await slotRepo.findOne({ where: { id: b.slotId } });
    if (!slot || slot.status !== 'open') return res.status(404).json({ message: 'Slot unavailable.' });
    if (slot.date < new Date().toISOString().slice(0, 10)) {
      return res.status(400).json({ message: 'Cannot book a past slot.' });
    }
    const bookingRepo = AppDataSource.getRepository(MeetingBooking);
    const existing = await bookingRepo.find({ where: { slotId: slot.id, status: 'confirmed' as any } });
    if (slot.maxBookings != null && existing.length >= slot.maxBookings) {
      return res.status(409).json({ message: 'Slot is fully booked.' });
    }
    const dup = await bookingRepo.findOne({
      where: { slotId: slot.id, parentId: req.user!.userId, status: 'confirmed' as any },
    });
    if (dup) return res.status(409).json({ message: 'You already have a booking for this slot.' });

    const parentId = (req.user as any).parentId || req.user!.userId;
    const row = await bookingRepo.save(
      bookingRepo.create({
        slotId: slot.id,
        parentId,
        studentId: b.studentId || undefined,
        note: b.note || undefined,
        status: 'confirmed',
      }),
    );

    // Notify the teacher
    await notifyUser(slot.teacherId, {
      title: 'Meeting booked',
      message: `A parent booked your ${slot.date} ${slot.startTime} slot${slot.topic ? ` (${slot.topic})` : ''}.`,
      type: 'meeting',
      metadata: { bookingId: row.id, slotId: slot.id },
    }).catch(() => undefined);
    if (b.studentId) {
      await notifyStudentParents([b.studentId], {
        title: 'Parent-teacher meeting booked',
        message: `A meeting was booked with ${slot.teacherName || 'your teacher'} on ${slot.date} at ${slot.startTime}.`,
        type: 'meeting',
        metadata: { bookingId: row.id },
      }).catch(() => undefined);
    }

    res.status(201).json(row);
  } catch (e) {
    console.error('[meetings:book]', e);
    res.status(500).json({ message: 'Could not book the slot.' });
  }
});

/** List bookings — parents see own; staff see slots they host or all for admin. */
router.get('/bookings', async (req: AuthRequest, res: Response) => {
  try {
    const { slotId, status, from, to } = req.query as any;
    const repo = AppDataSource.getRepository(MeetingBooking);
    const qb = repo.createQueryBuilder('b').orderBy('b.createdAt', 'DESC');
    if (slotId) qb.andWhere('b.slotId = :slotId', { slotId });
    if (status) qb.andWhere('b.status = :status', { status });

    if (req.user!.role === UserRole.PARENT) {
      qb.andWhere('b.parentId = :parentId', { parentId: (req.user as any).parentId || req.user!.userId });
      // restrict to upcoming/param range if given
      if (from || to) {
        const slotQb = AppDataSource.getRepository(MeetingSlot).createQueryBuilder('s').select('s.id');
        if (from) slotQb.andWhere('s.date >= :from', { from });
        if (to) slotQb.andWhere('s.date <= :to', { to });
        const slotIds = (await slotQb.getMany()).map((s) => s.id);
        if (slotIds.length) qb.andWhere('b.slotId IN (:...slotIds)', { slotIds });
        else return res.json([]);
      }
    } else if (req.user!.role === UserRole.TEACHER) {
      const slotIds = (
        await AppDataSource.getRepository(MeetingSlot).find({ where: { teacherId: req.user!.userId } })
      ).map((s) => s.id);
      if (slotIds.length) qb.andWhere('b.slotId IN (:...slotIds)', { slotIds });
      else return res.json([]);
      if (from || to) {
        const slotQb = AppDataSource.getRepository(MeetingSlot).createQueryBuilder('s').select('s.id');
        if (from) slotQb.andWhere('s.date >= :from', { from });
        if (to) slotQb.andWhere('s.date <= :to', { to });
        const filtered = (await slotQb.getMany()).map((s) => s.id);
        if (filtered.length) qb.andWhere('b.slotId IN (:...filtered)', { filtered });
        else return res.json([]);
      }
    }

    const rows = await qb.getMany();
    res.json(await enrichBookings(rows));
  } catch (e) {
    console.error('[meetings:bookings]', e);
    res.status(500).json({ message: 'Could not load bookings.' });
  }
});

router.patch('/bookings/:id', authorize(...ALL_ROLES), async (req: AuthRequest, res: Response) => {
  try {
    const repo = AppDataSource.getRepository(MeetingBooking);
    const row = await repo.findOne({ where: { id: String(req.params.id) } });
    if (!row) return res.status(404).json({ message: 'Booking not found.' });
    const isOwner = req.user!.role === UserRole.PARENT && row.parentId === ((req.user as any).parentId || req.user!.userId);
    const isStaff = [UserRole.ADMIN, UserRole.PRINCIPAL, UserRole.DIRECTOR].includes(req.user!.role) ||
      (req.user!.role === UserRole.TEACHER && (await AppDataSource.getRepository(MeetingSlot).findOne({ where: { id: row.slotId } }))?.teacherId === req.user!.userId);
    if (!isOwner && !isStaff) return res.status(403).json({ message: 'Not allowed.' });

    const b = req.body ?? {};
    const newStatus = b.status || row.status;
    // Parents may only cancel; staff may set any status
    if (isOwner && !isStaff && newStatus !== 'cancelled') {
      return res.status(403).json({ message: 'Parents can only cancel bookings.' });
    }
    row.status = newStatus;
    if (b.arrivedAt !== undefined) row.arrivedAt = b.arrivedAt;
    await repo.save(row);
    res.json(row);
  } catch (e) {
    console.error('[meetings:update-booking]', e);
    res.status(500).json({ message: 'Could not update booking.' });
  }
});

export default router;
