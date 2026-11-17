// @ts-nocheck
import { Router, Response } from 'express';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { UserRole } from '../entities/enums';
import { AppDataSource } from '../config/data-source';
import {
  StaffContract,
  StaffAppraisal,
  StaffDevelopment,
  StaffDocument,
  JobPosting,
  JobApplication,
} from '../entities/StaffHr';
import { Staff } from '../entities';
import { staffNames, userNames } from '../utils/lookups';
import { today } from '../utils/helpers';

const router = Router();

const MANAGE: UserRole[] = [UserRole.ADMIN, UserRole.PRINCIPAL, UserRole.DIRECTOR];

router.use(authenticate);

async function staffDirectory() {
  return AppDataSource.getRepository(Staff).find({ relations: { user: true } });
}

function enrichStaff(rows: any[], staffMap: Map<string, any>) {
  return rows.map((r) => {
    const s = staffMap.get(r.staffId);
    return {
      ...r,
      staffName: s ? `${s.user?.firstName || ''} ${s.user?.lastName || ''}`.trim() || s.employeeNumber : undefined,
      employeeNumber: s?.employeeNumber,
      department: s?.department,
    };
  });
}

// ---------------- Contracts ----------------

router.get('/contracts', authorize(...MANAGE), async (req: AuthRequest, res: Response) => {
  try {
    const { staffId, status } = req.query as any;
    const repo = AppDataSource.getRepository(StaffContract);
    const qb = repo.createQueryBuilder('c').orderBy('c.startDate', 'DESC');
    if (staffId) qb.andWhere('c.staffId = :staffId', { staffId });
    if (status) qb.andWhere('c.status = :status', { status });
    const rows = await qb.take(500).getMany();
    const staff = await staffDirectory();
    res.json(enrichStaff(rows, new Map(staff.map((s) => [s.id, s]))));
  } catch (e) {
    console.error('[hr:contracts]', e);
    res.status(500).json({ message: 'Could not load contracts.' });
  }
});

router.post('/contracts', authorize(...MANAGE), async (req: AuthRequest, res: Response) => {
  try {
    const b = req.body ?? {};
    if (!b.staffId || !b.startDate) return res.status(400).json({ message: 'staffId and startDate are required.' });
    const repo = AppDataSource.getRepository(StaffContract);
    const row = await repo.save(
      repo.create({
        staffId: b.staffId,
        contractType: b.contractType || 'permanent',
        startDate: b.startDate,
        endDate: b.endDate || undefined,
        position: b.position || undefined,
        salary: b.salary != null ? Number(b.salary) : undefined,
        status: b.status || 'active',
        documentUrl: b.documentUrl || undefined,
        notes: b.notes || undefined,
      }),
    );
    res.status(201).json(row);
  } catch (e) {
    res.status(500).json({ message: 'Could not create contract.' });
  }
});

router.patch('/contracts/:id', authorize(...MANAGE), async (req: AuthRequest, res: Response) => {
  try {
    const repo = AppDataSource.getRepository(StaffContract);
    const row = await repo.findOne({ where: { id: String(req.params.id) } });
    if (!row) return res.status(404).json({ message: 'Contract not found.' });
    const b = req.body ?? {};
    for (const k of ['contractType', 'startDate', 'endDate', 'position', 'salary', 'status', 'documentUrl', 'notes']) {
      if (b[k] !== undefined) (row as any)[k] = b[k];
    }
    await repo.save(row);
    res.json(row);
  } catch (e) {
    res.status(500).json({ message: 'Could not update contract.' });
  }
});

// ---------------- Appraisals ----------------

router.get('/appraisals', authorize(...MANAGE), async (req: AuthRequest, res: Response) => {
  try {
    const { staffId, period } = req.query as any;
    const repo = AppDataSource.getRepository(StaffAppraisal);
    const qb = repo.createQueryBuilder('a').orderBy('a.date', 'DESC');
    if (staffId) qb.andWhere('a.staffId = :staffId', { staffId });
    if (period) qb.andWhere('a.period = :period', { period });
    const rows = await qb.take(500).getMany();
    const staff = await staffDirectory();
    const map = new Map(staff.map((s) => [s.id, s]));
    const enriched = enrichStaff(rows, map);
    const appraiserNames = await staffNames(rows.map((r) => r.appraiserId));
    res.json(enriched.map((r, i) => ({ ...r, appraiserName: r.appraiserName || appraiserNames.get(rows[i].appraiserId || '') })));
  } catch (e) {
    console.error('[hr:appraisals]', e);
    res.status(500).json({ message: 'Could not load appraisals.' });
  }
});

router.post('/appraisals', authorize(...MANAGE), async (req: AuthRequest, res: Response) => {
  try {
    const b = req.body ?? {};
    if (!b.staffId || !b.period) return res.status(400).json({ message: 'staffId and period are required.' });
    const repo = AppDataSource.getRepository(StaffAppraisal);
    const row = await repo.save(
      repo.create({
        staffId: b.staffId,
        period: b.period,
        rating: b.rating != null ? Number(b.rating) : undefined,
        score: b.score != null ? Number(b.score) : undefined,
        strengths: b.strengths || undefined,
        areasForImprovement: b.areasForImprovement || undefined,
        goals: b.goals || undefined,
        appraiserId: req.user!.userId,
        appraiserName: req.user!.email,
        date: b.date || today(),
      }),
    );
    res.status(201).json(row);
  } catch (e) {
    res.status(500).json({ message: 'Could not save appraisal.' });
  }
});

// ---------------- Professional development ----------------

router.get('/development', authorize(...MANAGE), async (req: AuthRequest, res: Response) => {
  try {
    const { staffId } = req.query as any;
    const repo = AppDataSource.getRepository(StaffDevelopment);
    const qb = repo.createQueryBuilder('d').orderBy('d.date', 'DESC');
    if (staffId) qb.andWhere('d.staffId = :staffId', { staffId });
    const rows = await qb.take(500).getMany();
    const staff = await staffDirectory();
    res.json(enrichStaff(rows, new Map(staff.map((s) => [s.id, s]))));
  } catch (e) {
    res.status(500).json({ message: 'Could not load development records.' });
  }
});

router.post('/development', authorize(...MANAGE), async (req: AuthRequest, res: Response) => {
  try {
    const b = req.body ?? {};
    if (!b.staffId || !b.course) return res.status(400).json({ message: 'staffId and course are required.' });
    const repo = AppDataSource.getRepository(StaffDevelopment);
    res.status(201).json(
      await repo.save(
        repo.create({
          staffId: b.staffId,
          course: b.course,
          provider: b.provider || undefined,
          date: b.date || undefined,
          hours: b.hours != null ? Number(b.hours) : undefined,
          cost: b.cost != null ? Number(b.cost) : undefined,
          certificateUrl: b.certificateUrl || undefined,
          notes: b.notes || undefined,
        }),
      ),
    );
  } catch (e) {
    res.status(500).json({ message: 'Could not save development record.' });
  }
});

// ---------------- Documents & expiry reminders ----------------

router.get('/documents', authorize(...MANAGE), async (req: AuthRequest, res: Response) => {
  try {
    const { staffId, expiringWithinDays } = req.query as any;
    const repo = AppDataSource.getRepository(StaffDocument);
    const qb = repo.createQueryBuilder('d').orderBy('d.expiryDate', 'ASC');
    if (staffId) qb.andWhere('d.staffId = :staffId', { staffId });
    let rows = await qb.take(1000).getMany();
    rows = rows.filter((r) => r.isActive);
    if (expiringWithinDays) {
      const cutoff = new Date(Date.now() + Number(expiringWithinDays) * 86400000).toISOString().slice(0, 10);
      rows = rows.filter((r) => r.expiryDate && r.expiryDate <= cutoff);
    }
    const staff = await staffDirectory();
    res.json(enrichStaff(rows, new Map(staff.map((s) => [s.id, s]))));
  } catch (e) {
    res.status(500).json({ message: 'Could not load staff documents.' });
  }
});

router.post('/documents', authorize(...MANAGE), async (req: AuthRequest, res: Response) => {
  try {
    const b = req.body ?? {};
    if (!b.staffId || !b.docType || !b.title) {
      return res.status(400).json({ message: 'staffId, docType and title are required.' });
    }
    const repo = AppDataSource.getRepository(StaffDocument);
    res.status(201).json(
      await repo.save(
        repo.create({
          staffId: b.staffId,
          docType: b.docType,
          title: b.title,
          documentUrl: b.documentUrl || undefined,
          issueDate: b.issueDate || undefined,
          expiryDate: b.expiryDate || undefined,
        }),
      ),
    );
  } catch (e) {
    res.status(500).json({ message: 'Could not save document.' });
  }
});

router.patch('/documents/:id', authorize(...MANAGE), async (req: AuthRequest, res: Response) => {
  try {
    const repo = AppDataSource.getRepository(StaffDocument);
    const row = await repo.findOne({ where: { id: String(req.params.id) } });
    if (!row) return res.status(404).json({ message: 'Document not found.' });
    const b = req.body ?? {};
    for (const k of ['docType', 'title', 'documentUrl', 'issueDate', 'expiryDate', 'isActive']) {
      if (b[k] !== undefined) (row as any)[k] = b[k];
    }
    await repo.save(row);
    res.json(row);
  } catch (e) {
    res.status(500).json({ message: 'Could not update document.' });
  }
});

/** Documents expiring soon — powers reminder banner. */
router.get('/expiring', authorize(...MANAGE), async (_req: AuthRequest, res: Response) => {
  try {
    const within = Number((_req.query as any).days) || 30;
    const cutoff = new Date(Date.now() + within * 86400000).toISOString().slice(0, 10);
    const docs = await AppDataSource.getRepository(StaffDocument).find();
    const expiring = docs.filter((d) => d.isActive && d.expiryDate && d.expiryDate <= cutoff);
    const staff = await staffDirectory();
    res.json(enrichStaff(expiring, new Map(staff.map((s) => [s.id, s]))));
  } catch (e) {
    res.status(500).json({ message: 'Could not load expiring documents.' });
  }
});

// ---------------- Recruitment ----------------

router.get('/jobs', authorize(...MANAGE), async (_req: AuthRequest, res: Response) => {
  try {
    const [jobs, apps] = await Promise.all([
      AppDataSource.getRepository(JobPosting).find({ order: { createdAt: 'DESC' } }),
      AppDataSource.getRepository(JobApplication).find({ order: { createdAt: 'DESC' } }),
    ]);
    const counts = new Map<string, number>();
    for (const a of apps) counts.set(a.jobPostingId, (counts.get(a.jobPostingId) || 0) + 1);
    res.json(jobs.map((j) => ({ ...j, applicationCount: counts.get(j.id) || 0 })));
  } catch (e) {
    res.status(500).json({ message: 'Could not load job postings.' });
  }
});

router.post('/jobs', authorize(...MANAGE), async (req: AuthRequest, res: Response) => {
  try {
    const b = req.body ?? {};
    if (!b.title) return res.status(400).json({ message: 'title is required.' });
    const repo = AppDataSource.getRepository(JobPosting);
    res.status(201).json(
      await repo.save(
        repo.create({
          title: b.title,
          department: b.department || undefined,
          description: b.description || undefined,
          employmentType: b.employmentType || 'full_time',
          status: b.status || 'open',
          closingDate: b.closingDate || undefined,
        }),
      ),
    );
  } catch (e) {
    res.status(500).json({ message: 'Could not create job posting.' });
  }
});

router.patch('/jobs/:id', authorize(...MANAGE), async (req: AuthRequest, res: Response) => {
  try {
    const repo = AppDataSource.getRepository(JobPosting);
    const row = await repo.findOne({ where: { id: String(req.params.id) } });
    if (!row) return res.status(404).json({ message: 'Job posting not found.' });
    const b = req.body ?? {};
    for (const k of ['title', 'department', 'description', 'employmentType', 'status', 'closingDate']) {
      if (b[k] !== undefined) (row as any)[k] = b[k];
    }
    await repo.save(row);
    res.json(row);
  } catch (e) {
    res.status(500).json({ message: 'Could not update job posting.' });
  }
});

router.get('/jobs/:id/applications', authorize(...MANAGE), async (req: AuthRequest, res: Response) => {
  try {
    const rows = await AppDataSource.getRepository(JobApplication).find({
      where: { jobPostingId: String(req.params.id) },
      order: { createdAt: 'DESC' },
    });
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: 'Could not load applications.' });
  }
});

router.patch('/applications/:id', authorize(...MANAGE), async (req: AuthRequest, res: Response) => {
  try {
    const repo = AppDataSource.getRepository(JobApplication);
    const row = await repo.findOne({ where: { id: String(req.params.id) } });
    if (!row) return res.status(404).json({ message: 'Application not found.' });
    const b = req.body ?? {};
    if (b.status) row.status = b.status;
    if (b.coverNote !== undefined) row.coverNote = b.coverNote;
    if (b.cvUrl !== undefined) row.cvUrl = b.cvUrl;
    await repo.save(row);
    res.json(row);
  } catch (e) {
    res.status(500).json({ message: 'Could not update application.' });
  }
});

/** Public job application submission (no auth required — mounted separately if needed). */

export default router;
