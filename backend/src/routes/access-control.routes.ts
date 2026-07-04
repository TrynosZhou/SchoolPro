import { Router, Response } from 'express';
import { AppDataSource } from '../config/data-source';
import { UserRole } from '../entities/enums';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { AccessControlService } from '../services/access-control.service';
import { queryAuditLogs } from '../services/audit-log.service';
import { ACCESS_MODULES, mapUserRoleToAccessRole } from '../config/access-matrix';

const router = Router();
router.use(authenticate);

const boardRoles = [UserRole.ADMIN, UserRole.DIRECTOR, UserRole.PRINCIPAL] as const;

/**
 * Phase 1 — preview the CRUD permissions matrix (not yet enforced on routes).
 * Use this to confirm defaults before Phase 2 rollout.
 */
router.get('/matrix', authorize(...boardRoles), (_req: AuthRequest, res: Response) => {
  res.json(AccessControlService.getMatrixPreview());
});

/** Current user's resolved access role and module grants (for future UI guards). */
router.get('/me', (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: 'Authentication required' });
  const accessRole = mapUserRoleToAccessRole(req.user.role);
  const preview = AccessControlService.getMatrixPreview();
  const roleMatrix = preview.roles.find((r) => r.role === accessRole);
  res.json({
    userId: req.user.userId,
    portalRole: req.user.role,
    accessRole,
    modules: roleMatrix?.modules ?? {},
    note: 'Phase 1: grants are informational only — not enforced on API routes yet.',
  });
});

/** Filter options for the admin audit trail viewer. */
router.get('/audit-logs/meta', authorize(UserRole.ADMIN), async (_req: AuthRequest, res: Response) => {
  const logged: { module: string }[] = await AppDataSource.query(
    `SELECT DISTINCT module FROM audit_logs ORDER BY module`,
  );
  res.json({
    modules: ACCESS_MODULES.map((m) => ({ id: m.id, label: m.label })),
    loggedModules: logged.map((r) => r.module),
    actions: [
      { id: 'create', label: 'Create' },
      { id: 'update', label: 'Update' },
      { id: 'delete', label: 'Delete' },
    ],
  });
});

/**
 * Phase 3 — read-only audit log viewer API (admin only).
 * No update/delete endpoints exist; logs are append-only.
 */
router.get('/audit-logs', authorize(UserRole.ADMIN), async (req: AuthRequest, res: Response) => {
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  const result = await queryAuditLogs({
    userId: str(req.query.userId),
    userEmail: str(req.query.userEmail),
    module: str(req.query.module),
    action: str(req.query.action) as 'create' | 'update' | 'delete' | 'edit' | undefined,
    recordId: str(req.query.recordId),
    dateFrom: str(req.query.dateFrom),
    dateTo: str(req.query.dateTo),
    limit: req.query.limit ? Number(req.query.limit) : undefined,
    offset: req.query.offset ? Number(req.query.offset) : undefined,
  });
  res.json(result);
});

export default router;
