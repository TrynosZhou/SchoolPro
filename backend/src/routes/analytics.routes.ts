import { Router, Response } from 'express';
import { AppDataSource } from '../config/data-source';
import { SchoolYear } from '../entities/SchoolYear';
import { Term } from '../entities/Term';
import { SchoolClass } from '../entities/SchoolClass';
import { Form } from '../entities/Form';
import { UserRole } from '../entities/enums';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import {
  getDemographics,
  getRetention,
  getAtRiskStudents,
} from '../services/analytics.service';

const router = Router();
router.use(authenticate);

const boardRoles = [UserRole.ADMIN, UserRole.DIRECTOR, UserRole.PRINCIPAL] as const;

const str = (v: unknown): string | undefined => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s ? s : undefined;
};

/** Filter option lists for the analytics dashboards (years, terms, classes, forms). */
router.get('/filters', authorize(...boardRoles), async (_req: AuthRequest, res: Response) => {
  const [schoolYears, terms, classes, forms] = await Promise.all([
    AppDataSource.getRepository(SchoolYear).find({ order: { startDate: 'DESC' } }),
    AppDataSource.getRepository(Term).find({ order: { startDate: 'DESC' } }),
    AppDataSource.getRepository(SchoolClass).find({ relations: { form: true }, order: { name: 'ASC' } }),
    AppDataSource.getRepository(Form).find({ order: { level: 'ASC' } }),
  ]);
  res.json({
    schoolYears: schoolYears.map((y) => ({ id: y.id, name: y.name, isCurrent: y.isCurrent })),
    terms: terms.map((t) => ({
      id: t.id,
      name: t.name,
      schoolYearId: t.schoolYearId,
      isCurrent: t.isCurrent,
    })),
    classes: classes.map((c) => ({
      id: c.id,
      name: c.name,
      formId: c.formId,
      formName: c.form?.name,
    })),
    forms: forms.map((f) => ({ id: f.id, name: f.name, level: f.level })),
  });
});

router.get('/demographics', authorize(...boardRoles), async (req: AuthRequest, res: Response) => {
  try {
    const data = await getDemographics({
      schoolYearId: str(req.query.schoolYearId),
      termId: str(req.query.termId),
      classId: str(req.query.classId),
      formId: str(req.query.formId),
    });
    res.json(data);
  } catch (err) {
    console.error('[analytics] demographics failed:', err);
    res.status(500).json({
      message: err instanceof Error ? err.message : 'Failed to load demographics',
    });
  }
});

router.get('/retention', authorize(...boardRoles), async (_req: AuthRequest, res: Response) => {
  res.json(await getRetention());
});

router.get('/at-risk', authorize(...boardRoles), async (req: AuthRequest, res: Response) => {
  const data = await getAtRiskStudents({
    classId: str(req.query.classId),
    formId: str(req.query.formId),
    termId: str(req.query.termId),
  });
  res.json(data);
});

export default router;
