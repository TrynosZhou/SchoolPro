import { Router, Response } from 'express';
import { UserRole } from '../entities/enums';
import { authenticate, authorize } from '../middleware/auth';
import { ensureChartOfAccountsSeeded } from '../services/ledger.service';
import { listChartOfAccounts } from '../services/general-ledger-report.service';

const router = Router();
const GL_ROLES = [UserRole.ADMIN, UserRole.DIRECTOR, UserRole.PRINCIPAL];

router.use(authenticate);
router.use(authorize(...GL_ROLES));

router.get('/', async (_req, res: Response) => {
  await ensureChartOfAccountsSeeded();
  const accounts = await listChartOfAccounts();
  res.json(accounts);
});

export default router;
