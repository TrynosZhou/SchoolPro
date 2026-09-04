import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { env } from './config/env';
import { getStartupState } from './server';

import authRoutes from './routes/auth.routes';
import studentsRoutes from './routes/students.routes';
import attendanceRoutes from './routes/attendance.routes';
import examsRoutes from './routes/exams.routes';
import billingRoutes from './routes/billing.routes';
import financeRoutes from './routes/finance.routes';
import academicsRoutes from './routes/academics.routes';
import timetableRoutes from './routes/timetable.routes';
import adminRoutes from './routes/admin.routes';
import dashboardRoutes from './routes/dashboard.routes';
import payrollRoutes from './routes/payroll.routes';
import generalLedgerRoutes from './routes/general-ledger.routes';
import chartOfAccountsRoutes from './routes/chart-of-accounts.routes';
import teacherAssignmentRoutes from './routes/teacher-assignment.routes';
import admissionsRoutes from './routes/admissions.routes';
import publicRoutes from './routes/public.routes';
import communicationRoutes from './routes/communication.routes';
import analyticsRoutes from './routes/analytics.routes';
import reportsRoutes from './routes/reports.routes';
import accessControlRoutes from './routes/access-control.routes';
import webhooksRoutes from './routes/webhooks.routes';
import lmsRoutes from './routes/lms.routes';
import { tenantContextMiddleware } from './middleware/tenant-context.middleware';
import { demoGlobalWriteGuard, demoWriteRateLimiter } from './middleware/demo-guard.middleware';

const app = express();

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);
function stripTrailingSlash(s: string): string {
  return s.endsWith('/') ? s.slice(0, -1) : s;
}

const allowedOrigins = env.frontendUrl
  .split(',')
  .map((v) => stripTrailingSlash(v.trim()))
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const normalizedOrigin = stripTrailingSlash(origin);
      if (allowedOrigins.includes(normalizedOrigin)) return callback(null, true);
      if (allowedOrigins.includes('*')) return callback(null, true);
      if (env.nodeEnv === 'development' && /^http:\/\/localhost:\d+$/.test(normalizedOrigin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
  }),
);
app.use(express.json());
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

app.use((req, res, next) => {
  const state = getStartupState();
  if (state.ok) return next();
  const url = req.originalUrl;
  const isGet = req.method === 'GET';
  const isPublicSafe =
    url === '/api/health' ||
    url.startsWith('/api/public/') ||
    url === '/api/auth/password-policy' ||
    url.startsWith('/webhooks/');
  if (isPublicSafe) return next();
  if (!isGet) {
    res.setHeader('Retry-After', '30');
    return res.status(503).json({
      message: 'Database is warming up or unreachable — please retry in a moment.',
    });
  }
  const authRequired =
    url.startsWith('/api/auth/') && url !== '/api/auth/password-policy';
  if (authRequired) {
    res.setHeader('Retry-After', '30');
    return res.status(503).json({
      message: 'Database is warming up or unreachable — please retry in a moment.',
    });
  }
  return next();
});

app.use(tenantContextMiddleware);
app.use(demoWriteRateLimiter);
app.use(demoGlobalWriteGuard);

app.get('/api/health', (_req, res) => {
  const state = getStartupState();
  res.json({
    status: state.ok ? 'ok' : 'degraded',
    degraded: !state.ok,
    error: state.error ? { name: state.error.name, message: state.error.message } : undefined,
    service: 'School Pro API',
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/students', studentsRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/exams', examsRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/academics', academicsRoutes);
app.use('/api/timetable', timetableRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/general-ledger', generalLedgerRoutes);
app.use('/api/chart-of-accounts', chartOfAccountsRoutes);
app.use('/api/admin/assignments', teacherAssignmentRoutes);
app.use('/api/admissions', admissionsRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/communication', communicationRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/access-control', accessControlRoutes);
app.use('/api/lms', lmsRoutes);
app.use('/webhooks', webhooksRoutes);

app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const payload: Record<string, unknown> = {
    name: err?.name,
    message: err?.message,
    code: (err as { code?: string })?.code,
    url: req.originalUrl,
    method: req.method,
    user: (req as { user?: { userId?: string; role?: string; email?: string } })?.user
      ? {
          userId: (req as { user?: { userId?: string } }).user?.userId,
          role: (req as { user?: { role?: string } }).user?.role,
          email: (req as { user?: { email?: string } }).user?.email,
        }
      : undefined,
    stack: err?.stack?.split('\n').slice(0, 6).join('\n'),
  };
  console.error('[http:500] request failed:', JSON.stringify(payload, null, 2));
  res.status(500).json({ message: 'Internal server error', error: env.nodeEnv === 'development' ? err.message : undefined });
});

export default app;

