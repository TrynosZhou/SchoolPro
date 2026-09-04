"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const path_1 = __importDefault(require("path"));
const env_1 = require("./config/env");
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const students_routes_1 = __importDefault(require("./routes/students.routes"));
const attendance_routes_1 = __importDefault(require("./routes/attendance.routes"));
const exams_routes_1 = __importDefault(require("./routes/exams.routes"));
const billing_routes_1 = __importDefault(require("./routes/billing.routes"));
const finance_routes_1 = __importDefault(require("./routes/finance.routes"));
const academics_routes_1 = __importDefault(require("./routes/academics.routes"));
const timetable_routes_1 = __importDefault(require("./routes/timetable.routes"));
const admin_routes_1 = __importDefault(require("./routes/admin.routes"));
const dashboard_routes_1 = __importDefault(require("./routes/dashboard.routes"));
const payroll_routes_1 = __importDefault(require("./routes/payroll.routes"));
const general_ledger_routes_1 = __importDefault(require("./routes/general-ledger.routes"));
const chart_of_accounts_routes_1 = __importDefault(require("./routes/chart-of-accounts.routes"));
const teacher_assignment_routes_1 = __importDefault(require("./routes/teacher-assignment.routes"));
const admissions_routes_1 = __importDefault(require("./routes/admissions.routes"));
const public_routes_1 = __importDefault(require("./routes/public.routes"));
const communication_routes_1 = __importDefault(require("./routes/communication.routes"));
const analytics_routes_1 = __importDefault(require("./routes/analytics.routes"));
const reports_routes_1 = __importDefault(require("./routes/reports.routes"));
const access_control_routes_1 = __importDefault(require("./routes/access-control.routes"));
const webhooks_routes_1 = __importDefault(require("./routes/webhooks.routes"));
const lms_routes_1 = __importDefault(require("./routes/lms.routes"));
const tenant_context_middleware_1 = require("./middleware/tenant-context.middleware");
const demo_guard_middleware_1 = require("./middleware/demo-guard.middleware");
const app = (0, express_1.default)();
app.use((0, helmet_1.default)({
    // Allow frontend (different origin) to load /uploads images (school logo, etc.)
    crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
const allowedOrigins = env_1.env.frontendUrl
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        if (!origin)
            return callback(null, true);
        if (allowedOrigins.includes(origin))
            return callback(null, true);
        if (env_1.env.nodeEnv === 'development' && /^http:\/\/localhost:\d+$/.test(origin)) {
            return callback(null, true);
        }
        return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
}));
app.use(express_1.default.json());
app.use('/uploads', express_1.default.static(path_1.default.join(process.cwd(), 'uploads')));
/**
 * Demo tenant detection (peeks at the JWT's `demo` claim, doesn't enforce auth) +
 * guardrails. Mounted globally, ahead of every router, so demo requests are routed
 * to the demo database and destructive routes are blocked regardless of which
 * router eventually handles them. See middleware/tenant-context.middleware.ts and
 * middleware/demo-guard.middleware.ts for details.
 */
app.use(tenant_context_middleware_1.tenantContextMiddleware);
app.use(demo_guard_middleware_1.demoWriteRateLimiter);
app.use(demo_guard_middleware_1.demoGlobalWriteGuard);
app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'School Pro API' }));
app.use('/api/auth', auth_routes_1.default);
app.use('/api/students', students_routes_1.default);
app.use('/api/attendance', attendance_routes_1.default);
app.use('/api/exams', exams_routes_1.default);
app.use('/api/billing', billing_routes_1.default);
app.use('/api/finance', finance_routes_1.default);
app.use('/api/academics', academics_routes_1.default);
app.use('/api/timetable', timetable_routes_1.default);
app.use('/api/admin', admin_routes_1.default);
app.use('/api/dashboard', dashboard_routes_1.default);
app.use('/api/payroll', payroll_routes_1.default);
app.use('/api/general-ledger', general_ledger_routes_1.default);
app.use('/api/chart-of-accounts', chart_of_accounts_routes_1.default);
app.use('/api/admin/assignments', teacher_assignment_routes_1.default);
app.use('/api/admissions', admissions_routes_1.default);
app.use('/api/public', public_routes_1.default);
app.use('/api/communication', communication_routes_1.default);
app.use('/api/analytics', analytics_routes_1.default);
app.use('/api/reports', reports_routes_1.default);
app.use('/api/access-control', access_control_routes_1.default);
app.use('/api/lms', lms_routes_1.default);
app.use('/webhooks', webhooks_routes_1.default);
app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ message: 'Internal server error', error: env_1.env.nodeEnv === 'development' ? err.message : undefined });
});
exports.default = app;
