// @ts-nocheck
import { Router, Response } from 'express';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { UserRole } from '../entities/enums';
import { AppDataSource } from '../config/data-source';
import { ConsentForm, ConsentSubmission } from '../entities/Consent';
import { Student } from '../entities';
import { studentNames, userNames } from '../utils/lookups';
import { today } from '../utils/helpers';

const router = Router();

router.use(authenticate);

const MANAGE: UserRole[] = [UserRole.ADMIN, UserRole.PRINCIPAL, UserRole.DIRECTOR];

async function parentStudentIds(req: AuthRequest): Promise<string[]> {
  const parentId = (req.user as any).parentId || req.user!.userId;
  const rows = await AppDataSource.getRepository(Student)
    .createQueryBuilder('s')
    .innerJoin('guardians', 'g', 'g.studentId = s.id')
    .where('g.parentId = :parentId', { parentId })
    .select('s.id', 'id')
    .getRawMany();
  return rows.map((r: any) => r.id || r.s_id);
}

// ---------------- Forms (admin) ----------------

router.get('/forms', async (req: AuthRequest, res: Response) => {
  try {
    const { type, status } = req.query as any;
    const repo = AppDataSource.getRepository(ConsentForm);
    const qb = repo.createQueryBuilder('f').orderBy('f.createdAt', 'DESC');
    if (type) qb.andWhere('f.type = :type', { type });
    // Non-managers only see published forms.
    const isManager = [UserRole.ADMIN, UserRole.PRINCIPAL, UserRole.DIRECTOR].includes(req.user!.role);
    const effectiveStatus = isManager ? status : 'published';
    if (effectiveStatus) qb.andWhere('f.status = :status', { status: effectiveStatus });
    const rows = await qb.getMany();

    // submission counts
    const subs = await AppDataSource.getRepository(ConsentSubmission).find();
    const counts = new Map<string, { total: number; signed: number; pending: number; declined: number }>();
    for (const s of subs) {
      const c = counts.get(s.formId) || { total: 0, signed: 0, pending: 0, declined: 0 };
      c.total++;
      if (s.status === 'signed') c.signed++;
      else if (s.status === 'pending') c.pending++;
      else if (s.status === 'declined') c.declined++;
      counts.set(s.formId, c);
    }
    res.json(rows.map((f) => ({ ...f, submissions: counts.get(f.id) || { total: 0, signed: 0, pending: 0, declined: 0 } })));
  } catch (e) {
    console.error('[consents:forms]', e);
    res.status(500).json({ message: 'Could not load consent forms.' });
  }
});

/** Headline figures for the Consent Forms page header (managers only). */
router.get('/overview', authorize(...MANAGE), async (_req: AuthRequest, res: Response) => {
  try {
    const [forms, subs] = await Promise.all([
      AppDataSource.getRepository(ConsentForm).find(),
      AppDataSource.getRepository(ConsentSubmission).find(),
    ]);
    const t = today();
    res.json({
      forms: forms.length,
      published: forms.filter((f) => f.status === 'published').length,
      archived: forms.filter((f) => f.status === 'archived').length,
      overdue: forms.filter((f) => f.status === 'published' && f.dueDate && f.dueDate < t).length,
      signed: subs.filter((s) => s.status === 'signed').length,
      pending: subs.filter((s) => s.status === 'pending').length,
      declined: subs.filter((s) => s.status === 'declined').length,
    });
  } catch (e) {
    console.error('[consents:overview]', e);
    res.status(500).json({ message: 'Could not load consents overview.' });
  }
});

router.post('/forms', authorize(...MANAGE), async (req: AuthRequest, res: Response) => {
  try {
    const b = req.body ?? {};
    if (!b.title || !b.body) return res.status(400).json({ message: 'title and body are required.' });
    const repo = AppDataSource.getRepository(ConsentForm);
    const row = await repo.save(
      repo.create({
        title: b.title,
        type: b.type || 'general',
        body: b.body,
        eventId: b.eventId || undefined,
        termId: b.termId || undefined,
        requiresSignature: b.requiresSignature !== false,
        status: b.status || 'published',
        dueDate: b.dueDate || undefined,
      }),
    );
    res.status(201).json(row);
  } catch (e) {
    console.error('[consents:create-form]', e);
    res.status(500).json({ message: 'Could not create consent form.' });
  }
});

router.patch('/forms/:id', authorize(...MANAGE), async (req: AuthRequest, res: Response) => {
  try {
    const repo = AppDataSource.getRepository(ConsentForm);
    const row = await repo.findOne({ where: { id: String(req.params.id) } });
    if (!row) return res.status(404).json({ message: 'Form not found.' });
    const b = req.body ?? {};
    for (const k of ['title', 'type', 'body', 'eventId', 'termId', 'requiresSignature', 'status', 'dueDate']) {
      if (b[k] !== undefined) (row as any)[k] = b[k];
    }
    await repo.save(row);
    res.json(row);
  } catch (e) {
    res.status(500).json({ message: 'Could not update form.' });
  }
});

router.delete('/forms/:id', authorize(...MANAGE), async (req: AuthRequest, res: Response) => {
  try {
    await AppDataSource.getRepository(ConsentForm).delete(String(req.params.id));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: 'Could not delete form.' });
  }
});

// ---------------- Submissions ----------------

/** All submissions (admin) or the caller's own (parent). */
router.get('/submissions', async (req: AuthRequest, res: Response) => {
  try {
    const { formId, status, studentId } = req.query as any;
    const repo = AppDataSource.getRepository(ConsentSubmission);
    const qb = repo.createQueryBuilder('c').orderBy('c.createdAt', 'DESC');
    if (formId) qb.andWhere('c.formId = :formId', { formId });
    if (status) qb.andWhere('c.status = :status', { status });
    if (studentId) qb.andWhere('c.studentId = :studentId', { studentId });
    if (req.user!.role === UserRole.PARENT) {
      qb.andWhere('c.parentId = :parentId', { parentId: (req.user as any).parentId || req.user!.userId });
    }
    const rows = await qb.take(1000).getMany();

    const forms = await AppDataSource.getRepository(ConsentForm).find();
    const [sNames, pNames] = await Promise.all([
      studentNames(rows.map((r) => r.studentId)),
      userNames(rows.map((r) => r.parentId)),
    ]);
    res.json(
      rows.map((r) => ({
        ...r,
        form: forms.find((f) => f.id === r.formId),
        studentName: sNames.get(r.studentId || ''),
        parentName: pNames.get(r.parentId),
      })),
    );
  } catch (e) {
    console.error('[consents:submissions]', e);
    res.status(500).json({ message: 'Could not load submissions.' });
  }
});

/** Published forms visible to the caller with their submission state. */
router.get('/my-forms', async (req: AuthRequest, res: Response) => {
  try {
    const forms = await AppDataSource.getRepository(ConsentForm).find({
      where: { status: 'published' },
      order: { createdAt: 'DESC' },
    });
    const parentId = (req.user as any).parentId || req.user!.userId;
    const subs = await AppDataSource.getRepository(ConsentSubmission).find({
      where: { parentId },
    });
    const kids = req.user!.role === UserRole.PARENT ? await parentStudentIds(req) : [];
    const subMap = new Map(subs.map((s) => [`${s.formId}:${s.studentId || ''}`, s]));
    res.json(
      forms.map((f) => ({
        ...f,
        // for each of my children, the submission state (or a pending placeholder)
        submissions: kids.map((sid) => {
          const existing = subMap.get(`${f.id}:${sid}`);
          return existing || { formId: f.id, studentId: sid, status: 'pending' };
        }),
        mySubmission: subs.find((s) => s.formId === f.id && !s.studentId) || null,
      })),
    );
  } catch (e) {
    console.error('[consents:my-forms]', e);
    res.status(500).json({ message: 'Could not load consent forms.' });
  }
});

/** Parent signs or declines a consent for a child. */
router.post('/sign', authorize(UserRole.PARENT), async (req: AuthRequest, res: Response) => {
  try {
    const { formId, studentId, decision, signatureName, note } = req.body ?? {};
    if (!formId || !['signed', 'declined'].includes(decision)) {
      return res.status(400).json({ message: 'formId and decision (signed|declined) are required.' });
    }
    const form = await AppDataSource.getRepository(ConsentForm).findOne({ where: { id: formId } });
    if (!form || form.status !== 'published') return res.status(404).json({ message: 'Form not found or not published.' });

    const parentId = (req.user as any).parentId || req.user!.userId;
    const repo = AppDataSource.getRepository(ConsentSubmission);
    let row = await repo.findOne({
      where: { formId, parentId, studentId: studentId || undefined } as any,
    });
    if (!row) {
      row = repo.create({ formId, parentId, studentId: studentId || undefined, status: 'pending' });
    }
    row.status = decision;
    row.signatureName = signatureName || undefined;
    row.note = note || undefined;
    if (decision === 'signed') {
      row.signedAt = new Date();
      row.ipAddress = req.ip || undefined;
    }
    await repo.save(row);
    res.json(row);
  } catch (e) {
    console.error('[consents:sign]', e);
    res.status(500).json({ message: 'Could not record consent.' });
  }
});

export default router;
