import { Router, Request, Response } from 'express';
import { AppDataSource } from '../config/data-source';
import { SchoolSettings } from '../entities';

const router = Router();

/**
 * Public school branding (name, tagline, logo) for unauthenticated pages such as
 * the login screen and the public admissions pages. Reads the same settings that
 * admins manage on /admin/settings.
 */
router.get('/branding', async (_req: Request, res: Response) => {
  const settings = await AppDataSource.getRepository(SchoolSettings).findOne({
    where: { id: 'default' },
  });
  res.json({
    schoolName: settings?.schoolName?.trim() || 'School Pro Academy',
    tagline: settings?.tagline?.trim() || null,
    logoUrl: settings?.logoUrl?.trim() || null,
  });
});

export default router;
