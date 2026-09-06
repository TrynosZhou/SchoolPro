import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import fs from 'fs';
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
  const path = req.path.endsWith('/') && req.path.length > 1
    ? req.path.slice(0, -1)
    : req.path;
  const isPublicSafe =
    path === '/api/health' ||
    path.startsWith('/api/public') ||
    path === '/api/auth/password-policy' ||
    path.startsWith('/webhooks');
  if (isPublicSafe) return next();
  // #region debug-point H2:middleware-503
  (()=>{try{const f=require('fs'),p=require('path');let rp='.dbg/db-warming-503.env';const roots=[process.cwd(),p.resolve(__dirname,'..','..'),p.resolve(__dirname,'..','..','..')];let found=null;for(const r of roots){const cand=p.join(r,rp);if(f.existsSync(cand)){found=cand;break;}}let u='http://127.0.0.1:7777/event',s='db-warming-503';try{if(found){const e=f.readFileSync(found,'utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s;}}catch{}require('http').request({method:'POST',host:new URL(u).hostname,port:new URL(u).port,path:new URL(u).pathname,headers:{'Content-Type':'application/json'}},()=>{}).on('error',()=>{}).end(JSON.stringify({sessionId:s,runId:'pre',hypothesisId:'H2',location:'app.ts:startup-middleware-503',msg:'[DEBUG] Startup middleware serving 503 for request URL',data:{method:req.method,reqPath:req.path,originalUrl:req.originalUrl,query:req.query,stateOk:state.ok,startedAt:state.startedAt,publicSafe:false,ipHeader:req.headers['x-forwarded-for']||''},ts:Date.now()}));}catch{}})();
  // #endregion
  res.setHeader('Retry-After', '30');
  return res.status(503).json({
    message: 'Database is warming up or unreachable — please retry in a moment.',
  });
});

app.use(tenantContextMiddleware);
app.use(demoWriteRateLimiter);
app.use(demoGlobalWriteGuard);

app.get('/api/health', (_req, res) => {
  const state = getStartupState();
  res.json({
    status: state.ok ? 'ok' : 'degraded',
    degraded: !state.ok,
    sslMode: state.sslMode,
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

function resolveFrontendBrowserDir(): string | null {
  const candidates = [
    path.resolve(process.cwd(), '..', 'frontend', 'dist', 'browser'),
    path.resolve(process.cwd(), 'frontend', 'dist', 'browser'),
    path.resolve(__dirname, '..', '..', 'frontend', 'dist', 'browser'),
    path.resolve(__dirname, '..', '..', '..', 'frontend', 'dist', 'browser'),
  ];
  for (const candidate of candidates) {
    try {
      const indexHtml = path.join(candidate, 'index.html');
      if (fs.existsSync(indexHtml)) return candidate;
    } catch {
      /* ignore */
    }
  }
  return null;
}

const frontendDir = resolveFrontendBrowserDir();
if (frontendDir) {
  app.use(
    express.static(frontendDir, {
      maxAge: env.nodeEnv === 'production' ? '1y' : 0,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('index.html')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        }
      },
    }),
  );
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    const pathname = req.path;
    if (
      pathname.startsWith('/api/') ||
      pathname.startsWith('/uploads/') ||
      pathname.startsWith('/webhooks/') ||
      pathname === '/api/health'
    ) {
      return next();
    }
    const indexHtml = path.join(frontendDir, 'index.html');
    if (fs.existsSync(indexHtml)) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      return res.sendFile(indexHtml);
    }
    next();
  });
} else {
  console.warn(
    '[app] Frontend build (frontend/dist/browser/index.html) not found — ' +
      'SPA routes like /login will 404. Run `npm run build:frontend` from the monorepo root ' +
      'or serve the Angular dev server separately via `cd frontend && npm start`.',
  );
}

app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // #region debug-point H5:global-error-middleware
  (()=>{try{const f=require('fs'),p=require('path');let rp='.dbg/db-warming-503.env';const roots=[process.cwd(),p.resolve(__dirname,'..','..'),p.resolve(__dirname,'..','..','..')];let found=null;for(const r of roots){const cand=p.join(r,rp);if(f.existsSync(cand)){found=cand;break;}}let u='http://127.0.0.1:7777/event',s='db-warming-503';try{if(found){const e=f.readFileSync(found,'utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s;}}catch{}const s2=getStartupState();require('http').request({method:'POST',host:new URL(u).hostname,port:new URL(u).port,path:new URL(u).pathname,headers:{'Content-Type':'application/json'}},()=>{}).on('error',()=>{}).end(JSON.stringify({sessionId:s,runId:'pre',hypothesisId:'H5',location:'app.ts:global-error-middleware',msg:'[DEBUG] Global error middleware triggered',data:{errName:err?.name,errMessage:err?.message,errCode:(err as {code?:string})?.code,url:req.originalUrl,method:req.method,headersSent:res.headersSent,statusCodeNow:res.statusCode,stateOk:s2.ok,stackSnippet:err?.stack?.split('\n').slice(0,4).join('|'),user:typeof (req as any).user?{userId:(req as any).user?.userId,role:(req as any).user?.role,email:(req as any).user?.email}:undefined},ts:Date.now()}));}catch{}})();
  // #endregion
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

