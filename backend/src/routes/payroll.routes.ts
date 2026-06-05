import { Router, Response } from 'express';
import { AppDataSource } from '../config/data-source';
import { PayrollRun, StaffPayrollProfile } from '../entities';
import { UserRole } from '../entities/enums';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { relations } from '../utils/typeorm-helpers';
import {
  cancelRun,
  createRun,
  getPayrollSummary,
  getRunWithPayslips,
  getStaffLeaveSummary,
  listLeaveBalances,
  listProfilesWithStaff,
  markRunPaid,
  previewRun,
  processRun,
  updatePayslip,
  upsertProfile,
} from '../services/payroll.service';

const router = Router();
const PAYROLL_ROLES = [UserRole.ADMIN, UserRole.DIRECTOR, UserRole.PRINCIPAL];

router.use(authenticate);
router.use(authorize(...PAYROLL_ROLES));

router.get('/summary', async (_req, res: Response) => {
  res.json(await getPayrollSummary());
});

router.get('/leave/balances', async (_req, res: Response) => {
  res.json(await listLeaveBalances());
});

router.get('/leave/:staffId', async (req, res: Response) => {
  res.json(await getStaffLeaveSummary(String(req.params.staffId)));
});

router.get('/profiles', async (_req, res: Response) => {
  res.json(await listProfilesWithStaff());
});

router.get('/profiles/:staffId', async (req, res: Response) => {
  const staffId = String(req.params.staffId);
  const profile = await AppDataSource.getRepository(StaffPayrollProfile).findOne({
    where: { staffId },
    relations: relations('staff', 'staff.user'),
  });
  res.json(profile);
});

router.put('/profiles/:staffId', async (req, res: Response) => {
  const staffId = String(req.params.staffId);
  try {
    const profile = await upsertProfile(staffId, req.body);
    res.json(profile);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to save profile';
    res.status(400).json({ message: msg });
  }
});

router.get('/runs', async (_req, res: Response) => {
  const runs = await AppDataSource.getRepository(PayrollRun).find({
    order: { year: 'DESC', month: 'DESC', createdAt: 'DESC' },
  });
  res.json(runs);
});

router.get('/runs/preview', async (req, res: Response) => {
  const year = parseInt(req.query.year as string, 10);
  const month = parseInt(req.query.month as string, 10);
  if (!year || !month) {
    return res.status(400).json({ message: 'year and month are required' });
  }
  try {
    res.json(await previewRun(year, month));
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Preview failed';
    res.status(400).json({ message: msg });
  }
});

router.get('/runs/:id', async (req, res: Response) => {
  const data = await getRunWithPayslips(String(req.params.id));
  if (!data) return res.status(404).json({ message: 'Payroll run not found' });
  res.json(data);
});

router.post('/runs', async (req: AuthRequest, res: Response) => {
  const { year, month, payDate, notes } = req.body;
  if (!year || !month) {
    return res.status(400).json({ message: 'year and month are required' });
  }
  try {
    const data = await createRun(Number(year), Number(month), {
      payDate,
      notes,
      createdByUserId: req.user?.userId,
    });
    res.status(201).json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to create payroll run';
    res.status(400).json({ message: msg });
  }
});

router.post('/runs/:id/process', async (req: AuthRequest, res: Response) => {
  const id = String(req.params.id);
  try {
    res.json(await processRun(id, req.user?.userId));
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Process failed';
    res.status(400).json({ message: msg });
  }
});

router.post('/runs/:id/mark-paid', async (req: AuthRequest, res: Response) => {
  const id = String(req.params.id);
  try {
    res.json(await markRunPaid(id, req.user?.userId));
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Mark paid failed';
    res.status(400).json({ message: msg });
  }
});

router.delete('/runs/:id', async (req, res: Response) => {
  try {
    res.json(await cancelRun(String(req.params.id)));
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Cancel failed';
    res.status(400).json({ message: msg });
  }
});

router.patch('/payslips/:id', async (req, res: Response) => {
  try {
    res.json(await updatePayslip(String(req.params.id), req.body));
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Update failed';
    res.status(400).json({ message: msg });
  }
});

export default router;
