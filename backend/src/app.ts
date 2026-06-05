import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { env } from './config/env';

import authRoutes from './routes/auth.routes';
import studentsRoutes from './routes/students.routes';
import attendanceRoutes from './routes/attendance.routes';
import examsRoutes from './routes/exams.routes';
import billingRoutes from './routes/billing.routes';
import financeRoutes from './routes/finance.routes';
import academicsRoutes from './routes/academics.routes';
import adminRoutes from './routes/admin.routes';
import dashboardRoutes from './routes/dashboard.routes';
import payrollRoutes from './routes/payroll.routes';

const app = express();

app.use(
  helmet({
    // Allow frontend (different origin) to load /uploads images (school logo, etc.)
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);
const allowedOrigins = env.frontendUrl
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      if (env.nodeEnv === 'development' && /^http:\/\/localhost:\d+$/.test(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
  }),
);
app.use(express.json());
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'School Pro API' }));

app.use('/api/auth', authRoutes);
app.use('/api/students', studentsRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/exams', examsRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/academics', academicsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/payroll', payrollRoutes);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ message: 'Internal server error', error: env.nodeEnv === 'development' ? err.message : undefined });
});

export default app;

