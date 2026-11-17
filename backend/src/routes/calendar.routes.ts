// @ts-nocheck
import { Router, Response } from 'express';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { UserRole } from '../entities/enums';
import { AppDataSource } from '../config/data-source';
import { SchoolEvent, EventRsvp } from '../entities/SchoolEvent';
import { userNames } from '../utils/lookups';

const router = Router();

router.use(authenticate);

const MANAGE_ROLES: UserRole[] = [
  UserRole.ADMIN,
  UserRole.PRINCIPAL,
  UserRole.DIRECTOR,
];

function icsDate(d: string, allDay = true): string {
  const date = allDay ? `${d}T00:00:00` : `${d}T00:00:00`;
  return date.replace(/[-:]/g, '').split('.')[0] + 'Z';
}

function escapeIcs(s: string): string {
  return (s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

router.get('/events', async (req: AuthRequest, res: Response) => {
  try {
    const { from, to, type, termId } = req.query as any;
    const repo = AppDataSource.getRepository(SchoolEvent);
    const qb = repo.createQueryBuilder('e').orderBy('e.startDate', 'ASC');
    if (from) qb.andWhere('e.startDate >= :from', { from });
    if (to) qb.andWhere('e.startDate <= :to', { to });
    if (type) qb.andWhere('e.type = :type', { type });
    if (termId) qb.andWhere('e.termId = :termId', { termId });

    // Audience targeting: non-admin viewers only see events meant for them.
    const role = req.user!.role;
    if (role === UserRole.PARENT) qb.andWhere("e.audience IN ('all','parents')");
    else if (role === UserRole.STUDENT) qb.andWhere("e.audience IN ('all','students')");
    else if (role === UserRole.TEACHER || role === UserRole.ACCOUNTANT) {
      qb.andWhere("e.audience IN ('all','staff')");
    }

    const rows = await qb.getMany();

    // RSVP summary per event for viewers
    const rsvpRepo = AppDataSource.getRepository(EventRsvp);
    const rsvps = await rsvpRepo.find();
    const byEvent = new Map<string, any>();
    for (const r of rsvps) {
      const cur = byEvent.get(r.eventId) || { attending: 0, maybe: 0, notAttending: 0, total: 0 };
      if (r.response === 'attending') cur.attending++;
      else if (r.response === 'maybe') cur.maybe++;
      else cur.notAttending++;
      cur.total++;
      byEvent.set(r.eventId, cur);
    }
    res.json(rows.map((e) => ({ ...e, rsvps: byEvent.get(e.id) || { attending: 0, maybe: 0, notAttending: 0, total: 0 } })));
  } catch (e) {
    console.error('[calendar:events]', e);
    res.status(500).json({ message: 'Could not load calendar.' });
  }
});

router.post('/events', authorize(...MANAGE_ROLES), async (req: AuthRequest, res: Response) => {
  try {
    const b = req.body ?? {};
    if (!b.title || !b.startDate) {
      return res.status(400).json({ message: 'title and startDate are required.' });
    }
    const repo = AppDataSource.getRepository(SchoolEvent);
    const row = await repo.save(
      repo.create({
        title: b.title,
        description: b.description || undefined,
        type: b.type || 'event',
        startDate: b.startDate,
        endDate: b.endDate || b.startDate,
        allDay: b.allDay !== false,
        location: b.location || undefined,
        termId: b.termId || undefined,
        audience: b.audience || 'all',
        createdById: req.user!.userId,
      }),
    );
    res.status(201).json(row);
  } catch (e) {
    console.error('[calendar:create]', e);
    res.status(500).json({ message: 'Could not create event.' });
  }
});

router.patch('/events/:id', authorize(...MANAGE_ROLES), async (req: AuthRequest, res: Response) => {
  try {
    const repo = AppDataSource.getRepository(SchoolEvent);
    const row = await repo.findOne({ where: { id: String(req.params.id) } });
    if (!row) return res.status(404).json({ message: 'Event not found.' });
    const b = req.body ?? {};
    const fields = ['title', 'description', 'type', 'startDate', 'endDate', 'allDay', 'location', 'termId', 'audience'];
    for (const f of fields) if (b[f] !== undefined) (row as any)[f] = b[f];
    await repo.save(row);
    res.json(row);
  } catch (e) {
    console.error('[calendar:update]', e);
    res.status(500).json({ message: 'Could not update event.' });
  }
});

router.delete('/events/:id', authorize(...MANAGE_ROLES), async (req: AuthRequest, res: Response) => {
  try {
    await AppDataSource.getRepository(SchoolEvent).delete(String(req.params.id));
    res.json({ ok: true });
  } catch (e) {
    console.error('[calendar:delete]', e);
    res.status(500).json({ message: 'Could not delete event.' });
  }
});

/** RSVP — any authenticated user. Upserts per user+event+student. */
router.post('/rsvp', async (req: AuthRequest, res: Response) => {
  try {
    const b = req.body ?? {};
    if (!b.eventId || !b.response) {
      return res.status(400).json({ message: 'eventId and response are required.' });
    }
    const repo = AppDataSource.getRepository(EventRsvp);
    let row = await repo.findOne({
      where: {
        eventId: b.eventId,
        userId: req.user!.userId,
        studentId: b.studentId || undefined,
      } as any,
    });
    if (!row) {
      row = repo.create({
        eventId: b.eventId,
        userId: req.user!.userId,
        studentId: b.studentId || undefined,
        response: b.response,
        guests: Number(b.guests) || 1,
      });
    } else {
      row.response = b.response;
      if (b.guests !== undefined) row.guests = Number(b.guests);
    }
    await repo.save(row);
    res.json(row);
  } catch (e) {
    console.error('[calendar:rsvp]', e);
    res.status(500).json({ message: 'Could not save RSVP.' });
  }
});

router.get('/my-rsvps', async (req: AuthRequest, res: Response) => {
  try {
    const rows = await AppDataSource.getRepository(EventRsvp).find({
      where: { userId: req.user!.userId },
    });
    res.json(rows);
  } catch (e) {
    console.error('[calendar:my-rsvps]', e);
    res.status(500).json({ message: 'Could not load RSVPs.' });
  }
});

/** ICS feed — subscribe in Google/Outlook calendar. */
router.get('/feed.ics', async (req: AuthRequest, res: Response) => {
  try {
    const { from, to } = req.query as any;
    const qb = AppDataSource.getRepository(SchoolEvent)
      .createQueryBuilder('e')
      .orderBy('e.startDate', 'ASC');
    if (from) qb.andWhere('e.startDate >= :from', { from });
    if (to) qb.andWhere('e.startDate <= :to', { to });
    const events = await qb.getMany();

    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//SchoolPro//Calendar//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
    ];
    for (const e of events) {
      const end = e.endDate || e.startDate;
      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${e.id}@schoolpro`);
      lines.push(`DTSTAMP:${icsDate(new Date().toISOString().slice(0, 10))}`);
      lines.push(`DTSTART;VALUE=DATE:${e.startDate.replace(/-/g, '')}`);
      lines.push(`DTEND;VALUE=DATE:${end.replace(/-/g, '')}`);
      lines.push(`SUMMARY:${escapeIcs(`[${e.type}] ${e.title}`)}`);
      if (e.description) lines.push(`DESCRIPTION:${escapeIcs(e.description)}`);
      if (e.location) lines.push(`LOCATION:${escapeIcs(e.location)}`);
      lines.push('END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="school-calendar.ics"');
    res.send(lines.join('\r\n'));
  } catch (e) {
    console.error('[calendar:ics]', e);
    res.status(500).json({ message: 'Could not export calendar.' });
  }
});

export default router;
