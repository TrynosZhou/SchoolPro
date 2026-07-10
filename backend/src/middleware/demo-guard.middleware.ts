import { NextFunction, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env';
import { DemoAwareRequest } from './tenant-context.middleware';

export const DEMO_RESTRICTED_MESSAGE = "This action isn't available in demo mode.";

/**
 * Drop this into any specific route's middleware chain (alongside `authenticate`,
 * `authorize(...)`, etc.) to block it outright for demo sessions, e.g.:
 *   router.delete('/:id', authenticate, authorize(UserRole.ADMIN), blockInDemo, handler)
 */
export function blockInDemo(req: DemoAwareRequest, res: Response, next: NextFunction) {
  if (req.demoUser) {
    return res.status(403).json({ message: DEMO_RESTRICTED_MESSAGE, demoRestricted: true });
  }
  next();
}

/**
 * Global safety net mounted once in app.ts (after `tenantContextMiddleware`, before
 * routers) so every route across the app — not just ones we've manually reviewed —
 * is covered for the three destructive categories called out in the spec:
 * bulk delete, data export, and billing changes. Reads (GET, other than exports)
 * are always allowed so the demo still feels interactive for the guided tour.
 */
export function demoGlobalWriteGuard(req: DemoAwareRequest, res: Response, next: NextFunction) {
  if (!req.demoUser) return next();

  const path = req.path.toLowerCase();
  const isExportDownload = /\/export|\.pdf($|\?)|\.csv($|\?)|\.xlsx($|\?)/.test(path);
  if (isExportDownload) {
    return res.status(403).json({ message: DEMO_RESTRICTED_MESSAGE, demoRestricted: true });
  }

  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }

  const isDelete = req.method === 'DELETE';
  const isBulkAction = path.includes('/bulk');
  const isBillingWrite = path.startsWith('/api/billing');
  const isIntegrationsWrite = path.startsWith('/api/admin/integrations');

  if (isDelete || isBulkAction || isBillingWrite || isIntegrationsWrite) {
    return res.status(403).json({ message: DEMO_RESTRICTED_MESSAGE, demoRestricted: true });
  }

  next();
}

/** Rate limiting scoped only to demo write traffic — real users are never affected. */
export const demoWriteRateLimiter = rateLimit({
  windowMs: 60_000,
  max: env.demo.writeRateLimitPerMinute,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: DemoAwareRequest) => req.demoUser?.userId || req.ip || 'anonymous',
  skip: (req: DemoAwareRequest) =>
    !req.demoUser || req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS',
  message: { message: 'Too many actions in demo mode — please slow down and try again shortly.' },
});
