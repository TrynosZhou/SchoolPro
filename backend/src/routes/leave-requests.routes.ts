import { Router, Request, Response } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../entities/enums';
import {
  cancelLeaveRequest,
  createLeaveRequest,
  LeaveRequestError,
  listLeaveRequests,
  reviewLeaveRequest,
} from '../services/leave-request.service';

const router = Router();

/** HR managers: administrators, principal and director. */
const LEAVE_ROLES: UserRole[] = [UserRole.ADMIN, UserRole.PRINCIPAL, UserRole.DIRECTOR];

router.use(authenticate);
router.use(authorize(...LEAVE_ROLES));

function actorOf(req: Request) {
  return { userId: req.user!.userId, role: String(req.user!.role), email: req.user!.email };
}

function fail(res: Response, e: unknown, fallback: string) {
  if (e instanceof LeaveRequestError) return res.status(e.status).json({ message: e.message });
  console.error('[leave-requests]', e);
  return res.status(500).json({ message: fallback });
}

router.get('/', async (req: Request, res: Response) => {
  try {
    res.json(await listLeaveRequests(typeof req.query.status === 'string' ? req.query.status : undefined));
  } catch (e) {
    fail(res, e, 'Could not load leave requests.');
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    res.status(201).json(await createLeaveRequest(req.body ?? {}, actorOf(req)));
  } catch (e) {
    fail(res, e, 'Could not save the leave request.');
  }
});

router.patch('/:id/review', async (req: Request, res: Response) => {
  try {
    const { status, note } = req.body ?? {};
    res.json(await reviewLeaveRequest(String(req.params.id), String(status || ''), note, actorOf(req)));
  } catch (e) {
    fail(res, e, 'Could not update the leave request.');
  }
});

router.patch('/:id/cancel', async (req: Request, res: Response) => {
  try {
    res.json(await cancelLeaveRequest(String(req.params.id), actorOf(req)));
  } catch (e) {
    fail(res, e, 'Could not cancel the leave request.');
  }
});

export default router;
