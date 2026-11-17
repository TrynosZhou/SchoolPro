// @ts-nocheck
import { Router, Response } from 'express';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { UserRole } from '../entities/enums';
import { AppDataSource } from '../config/data-source';
import {
  StudentHealthProfile,
  StudentImmunisation,
  SickbayVisit,
  StudentEmergencyContact,
} from '../entities/StudentHealth';
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

router.use(authenticate);

/** Resolve the set of student ids a parent may see. */
async function parentStudentIds(req: AuthRequest): Promise<string[] | null> {
  if (req.user!.role !== UserRole.PARENT && req.user!.role !== UserRole.STUDENT) return null;
  const studentId = (req.user as any).studentId;
  if (req.user!.role === UserRole.STUDENT && studentId) return [studentId];
  const parentId = (req.user as any).parentId;
  const rows = await AppDataSource.getRepository(Student)
    .createQueryBuilder('s')
    .innerJoin('guardians', 'g', 'g.studentId = s.id')
    .where('g.parentId = :parentId', { parentId: parentId || req.user!.userId })
    .select('s.id', 'id')
    .getRawMany();
  return rows.map((r: any) => r.id || r.s_id);
}

function guardStudent(req: AuthRequest, studentId: string): boolean {
  return req.user!.role !== UserRole.PARENT && req.user!.role !== UserRole.STUDENT;
}

// ---------- Health profiles ----------

router.get('/profiles', async (req: AuthRequest, res: Response) => {
  try {
    const { studentId, q } = req.query as any;
    const repo = AppDataSource.getRepository(StudentHealthProfile);
    let rows = await repo.find();
    const allowed = await parentStudentIds(req);
    if (allowed) rows = rows.filter((r) => allowed.includes(r.studentId));
    if (studentId) rows = rows.filter((r) => r.studentId === studentId);
    const names = await studentNames(rows.map((r) => r.studentId));
    res.json(rows.map((r) => ({ ...r, studentName: names.get(r.studentId) } )));
  } catch (e) {
    console.error('[health:profiles]', e);
    res.status(500).json({ message: 'Could not load health profiles.' });
  }
});

router.get('/profiles/:studentId', async (req: AuthRequest, res: Response) => {
  try {
    const studentId = String(req.params.studentId);
    const allowed = await parentStudentIds(req);
    if (allowed && !allowed.includes(studentId)) {
      return res.status(403).json({ message: 'Not your child.' });
    }
    const profile = await AppDataSource.getRepository(StudentHealthProfile).findOne({ where: { studentId } });
    const immunisations = await AppDataSource.getRepository(StudentImmunisation).find({
      where: { studentId },
      order: { dateGiven: 'DESC' } as any,
    });
    const contacts = await AppDataSource.getRepository(StudentEmergencyContact).find({
      where: { studentId },
      order: { priority: 'ASC' } as any,
    });
    res.json({ profile: profile || null, immunisations, emergencyContacts: contacts });
  } catch (e) {
    console.error('[health:profile]', e);
    res.status(500).json({ message: 'Could not load health record.' });
  }
});

router.put('/profiles/:studentId', authorize(...STAFF_ROLES), async (req: AuthRequest, res: Response) => {
  try {
    const studentId = String(req.params.studentId);
    const repo = AppDataSource.getRepository(StudentHealthProfile);
    let row = await repo.findOne({ where: { studentId } });
    const b = req.body ?? {};
    if (!row) row = repo.create({ studentId });
    const fields = ['bloodGroup', 'allergies', 'chronicConditions', 'currentMedications', 'doctorName', 'doctorPhone', 'notes'];
    for (const f of fields) if (b[f] !== undefined) (row as any)[f] = b[f];
    await repo.save(row);
    res.json(row);
  } catch (e) {
    console.error('[health:save-profile]', e);
    res.status(500).json({ message: 'Could not save health profile.' });
  }
});

// ---------- Immunisations ----------

router.get('/immunisations', async (req: AuthRequest, res: Response) => {
  try {
    const { studentId } = req.query as any;
    const repo = AppDataSource.getRepository(StudentImmunisation);
    const qb = repo.createQueryBuilder('i').orderBy('i.dateGiven', 'DESC');
    if (studentId) qb.where('i.studentId = :studentId', { studentId });
    let rows = await qb.getMany();
    const allowed = await parentStudentIds(req);
    if (allowed) rows = rows.filter((r) => allowed.includes(r.studentId));
    const names = await studentNames(rows.map((r) => r.studentId));
    res.json(rows.map((r) => ({ ...r, studentName: names.get(r.studentId) })));
  } catch (e) {
    console.error('[health:immunisations]', e);
    res.status(500).json({ message: 'Could not load immunisations.' });
  }
});

router.post('/immunisations', authorize(...STAFF_ROLES), async (req: AuthRequest, res: Response) => {
  try {
    const b = req.body ?? {};
    if (!b.studentId || !b.vaccine || !b.dateGiven) {
      return res.status(400).json({ message: 'studentId, vaccine and dateGiven are required.' });
    }
    const repo = AppDataSource.getRepository(StudentImmunisation);
    const row = await repo.save(
      repo.create({
        studentId: b.studentId,
        vaccine: b.vaccine,
        dateGiven: b.dateGiven,
        batchNumber: b.batchNumber || undefined,
        nextDueDate: b.nextDueDate || undefined,
        notes: b.notes || undefined,
      }),
    );
    res.status(201).json(row);
  } catch (e) {
    console.error('[health:add-immunisation]', e);
    res.status(500).json({ message: 'Could not save immunisation.' });
  }
});

router.delete('/immunisations/:id', authorize(...STAFF_ROLES), async (req: AuthRequest, res: Response) => {
  try {
    await AppDataSource.getRepository(StudentImmunisation).delete(String(req.params.id));
    res.json({ ok: true });
  } catch (e) {
    console.error('[health:delete-immunisation]', e);
    res.status(500).json({ message: 'Could not delete immunisation.' });
  }
});

// ---------- Emergency contacts ----------

router.get('/emergency-contacts', async (req: AuthRequest, res: Response) => {
  try {
    const { studentId } = req.query as any;
    const repo = AppDataSource.getRepository(StudentEmergencyContact);
    const qb = repo.createQueryBuilder('c').orderBy('c.priority', 'ASC');
    if (studentId) qb.where('c.studentId = :studentId', { studentId });
    let rows = await qb.getMany();
    const allowed = await parentStudentIds(req);
    if (allowed) rows = rows.filter((r) => allowed.includes(r.studentId));
    res.json(rows);
  } catch (e) {
    console.error('[health:contacts]', e);
    res.status(500).json({ message: 'Could not load emergency contacts.' });
  }
});

router.post('/emergency-contacts', authorize(...STAFF_ROLES), async (req: AuthRequest, res: Response) => {
  try {
    const b = req.body ?? {};
    if (!b.studentId || !b.name || !b.relationship || !b.phone) {
      return res.status(400).json({ message: 'studentId, name, relationship and phone are required.' });
    }
    const repo = AppDataSource.getRepository(StudentEmergencyContact);
    const row = await repo.save(
      repo.create({
        studentId: b.studentId,
        name: b.name,
        relationship: b.relationship,
        phone: b.phone,
        email: b.email || undefined,
        priority: Number(b.priority) || 1,
      }),
    );
    res.status(201).json(row);
  } catch (e) {
    console.error('[health:add-contact]', e);
    res.status(500).json({ message: 'Could not save emergency contact.' });
  }
});

router.delete('/emergency-contacts/:id', authorize(...STAFF_ROLES), async (req: AuthRequest, res: Response) => {
  try {
    await AppDataSource.getRepository(StudentEmergencyContact).delete(String(req.params.id));
    res.json({ ok: true });
  } catch (e) {
    console.error('[health:delete-contact]', e);
    res.status(500).json({ message: 'Could not delete contact.' });
  }
});

// ---------- Sickbay visits ----------

router.get('/sickbay', async (req: AuthRequest, res: Response) => {
  try {
    const { studentId, from, to, limit } = req.query as any;
    const repo = AppDataSource.getRepository(SickbayVisit);
    const qb = repo.createQueryBuilder('v').orderBy('v.date', 'DESC').addOrderBy('v.time', 'DESC');
    if (studentId) qb.andWhere('v.studentId = :studentId', { studentId });
    if (from) qb.andWhere('v.date >= :from', { from });
    if (to) qb.andWhere('v.date <= :to', { to });
    qb.take(Math.min(Number(limit) || 300, 1000));
    let rows = await qb.getMany();
    const allowed = await parentStudentIds(req);
    if (allowed) rows = rows.filter((r) => allowed.includes(r.studentId));
    const names = await studentNames(rows.map((r) => r.studentId));
    res.json(rows.map((r) => ({ ...r, studentName: names.get(r.studentId) })));
  } catch (e) {
    console.error('[health:sickbay]', e);
    res.status(500).json({ message: 'Could not load sickbay visits.' });
  }
});

router.post('/sickbay', authorize(...STAFF_ROLES), async (req: AuthRequest, res: Response) => {
  try {
    const b = req.body ?? {};
    if (!b.studentId || !b.date) {
      return res.status(400).json({ message: 'studentId and date are required.' });
    }
    const repo = AppDataSource.getRepository(SickbayVisit);
    const row = await repo.save(
      repo.create({
        studentId: b.studentId,
        date: b.date,
        time: b.time || undefined,
        symptoms: b.symptoms || undefined,
        diagnosis: b.diagnosis || undefined,
        treatment: b.treatment || undefined,
        medicationGiven: b.medicationGiven || undefined,
        sentHome: !!b.sentHome,
        parentNotified: false,
        recordedById: req.user!.userId,
        recordedByName: req.user!.email,
      }),
    );

    if (b.notifyParent !== false) {
      const names = await studentNames([row.studentId]);
      const who = names.get(row.studentId) || 'Your child';
      await notifyStudentParents([row.studentId], {
        title: 'Sickbay visit',
        message: `${who} visited the sickbay on ${row.date}${row.symptoms ? ` — ${row.symptoms}` : ''}${row.sentHome ? ' and was sent home.' : '.'}`,
        type: 'health',
        metadata: { visitId: row.id, studentId: row.studentId },
      }).catch((err) => console.error('[health:notify]', err));
      await repo.update(row.id, { parentNotified: true });
    }

    res.status(201).json(row);
  } catch (e) {
    console.error('[health:sickbay-create]', e);
    res.status(500).json({ message: 'Could not save sickbay visit.' });
  }
});

router.post('/sickbay/:id/notify-parent', authorize(...STAFF_ROLES), async (req: AuthRequest, res: Response) => {
  try {
    const repo = AppDataSource.getRepository(SickbayVisit);
    const row = await repo.findOne({ where: { id: String(req.params.id) } });
    if (!row) return res.status(404).json({ message: 'Visit not found.' });
    const names = await studentNames([row.studentId]);
    const who = names.get(row.studentId) || 'Your child';
    const sent = await notifyStudentParents([row.studentId], {
      title: 'Sickbay visit',
      message: `${who} visited the sickbay on ${row.date}${row.symptoms ? ` — ${row.symptoms}` : ''}.`,
      type: 'health',
      metadata: { visitId: row.id, studentId: row.studentId },
    });
    await repo.update(row.id, { parentNotified: true });
    res.json({ notified: sent });
  } catch (e) {
    console.error('[health:notify-parent]', e);
    res.status(500).json({ message: 'Could not notify parents.' });
  }
});

/** Emergency alert to parents — e.g. critical allergy incident. */
router.post('/alert', authorize(...STAFF_ROLES), async (req: AuthRequest, res: Response) => {
  try {
    const { studentIds, title, message } = req.body ?? {};
    if (!Array.isArray(studentIds) || !studentIds.length || !message) {
      return res.status(400).json({ message: 'studentIds and message are required.' });
    }
    const sent = await notifyStudentParents(studentIds, {
      title: title || 'School health alert',
      message,
      type: 'health_alert',
      metadata: { alertedBy: req.user!.userId },
    });
    res.json({ notified: sent });
  } catch (e) {
    console.error('[health:alert]', e);
    res.status(500).json({ message: 'Could not send alert.' });
  }
});

export default router;
