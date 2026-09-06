"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const env_1 = require("./config/env");
const server_1 = require("./server");
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
    crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
function stripTrailingSlash(s) {
    return s.endsWith('/') ? s.slice(0, -1) : s;
}
const allowedOrigins = env_1.env.frontendUrl
    .split(',')
    .map((v) => stripTrailingSlash(v.trim()))
    .filter(Boolean);
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        if (!origin)
            return callback(null, true);
        const normalizedOrigin = stripTrailingSlash(origin);
        if (allowedOrigins.includes(normalizedOrigin))
            return callback(null, true);
        if (allowedOrigins.includes('*'))
            return callback(null, true);
        if (env_1.env.nodeEnv === 'development' && /^http:\/\/localhost:\d+$/.test(normalizedOrigin)) {
            return callback(null, true);
        }
        return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
}));
app.use(express_1.default.json());
app.use('/uploads', express_1.default.static(path_1.default.join(process.cwd(), 'uploads')));
app.use((req, res, next) => {
    const state = (0, server_1.getStartupState)();
    if (state.ok)
        return next();
    const path = req.path.endsWith('/') && req.path.length > 1
        ? req.path.slice(0, -1)
        : req.path;
    const isPublicSafe = path === '/api/health' ||
        path.startsWith('/api/public') ||
        path === '/api/auth/password-policy' ||
        path.startsWith('/webhooks');
    if (isPublicSafe)
        return next();
    // #region debug-point H2:middleware-503
    (() => { try {
        const f = require('fs'), p = require('path');
        let rp = '.dbg/db-warming-503.env';
        const roots = [process.cwd(), p.resolve(__dirname, '..', '..'), p.resolve(__dirname, '..', '..', '..')];
        let found = null;
        for (const r of roots) {
            const cand = p.join(r, rp);
            if (f.existsSync(cand)) {
                found = cand;
                break;
            }
        }
        let u = 'http://127.0.0.1:7777/event', s = 'db-warming-503';
        try {
            if (found) {
                const e = f.readFileSync(found, 'utf8');
                u = e.match(/DEBUG_SERVER_URL=(.+)/)?.[1] || u;
                s = e.match(/DEBUG_SESSION_ID=(.+)/)?.[1] || s;
            }
        }
        catch { }
        require('http').request({ method: 'POST', host: new URL(u).hostname, port: new URL(u).port, path: new URL(u).pathname, headers: { 'Content-Type': 'application/json' } }, () => { }).on('error', () => { }).end(JSON.stringify({ sessionId: s, runId: 'pre', hypothesisId: 'H2', location: 'app.ts:startup-middleware-503', msg: '[DEBUG] Startup middleware serving 503 for request URL', data: { method: req.method, reqPath: req.path, originalUrl: req.originalUrl, query: req.query, stateOk: state.ok, startedAt: state.startedAt, publicSafe: false, ipHeader: req.headers['x-forwarded-for'] || '' }, ts: Date.now() }));
    }
    catch { } })();
    // #endregion
    res.setHeader('Retry-After', '30');
    return res.status(503).json({
        message: 'Database is warming up or unreachable — please retry in a moment.',
    });
});
app.use(tenant_context_middleware_1.tenantContextMiddleware);
app.use(demo_guard_middleware_1.demoWriteRateLimiter);
app.use(demo_guard_middleware_1.demoGlobalWriteGuard);
app.get('/api/health', (_req, res) => {
    const state = (0, server_1.getStartupState)();
    res.json({
        status: state.ok ? 'ok' : 'degraded',
        degraded: !state.ok,
        sslMode: state.sslMode,
        error: state.error ? { name: state.error.name, message: state.error.message } : undefined,
        service: 'School Pro API',
    });
});
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
function resolveFrontendBrowserDir() {
    const candidates = [
        path_1.default.resolve(process.cwd(), '..', 'frontend', 'dist', 'browser'),
        path_1.default.resolve(process.cwd(), 'frontend', 'dist', 'browser'),
        path_1.default.resolve(__dirname, '..', '..', 'frontend', 'dist', 'browser'),
        path_1.default.resolve(__dirname, '..', '..', '..', 'frontend', 'dist', 'browser'),
    ];
    for (const candidate of candidates) {
        try {
            const indexHtml = path_1.default.join(candidate, 'index.html');
            if (fs_1.default.existsSync(indexHtml))
                return candidate;
        }
        catch {
            /* ignore */
        }
    }
    return null;
}
const frontendDir = resolveFrontendBrowserDir();
if (frontendDir) {
    app.use(express_1.default.static(frontendDir, {
        maxAge: env_1.env.nodeEnv === 'production' ? '1y' : 0,
        setHeaders: (res, filePath) => {
            if (filePath.endsWith('index.html')) {
                res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            }
        },
    }));
    app.use((req, res, next) => {
        if (req.method !== 'GET')
            return next();
        const pathname = req.path;
        if (pathname.startsWith('/api/') ||
            pathname.startsWith('/uploads/') ||
            pathname.startsWith('/webhooks/') ||
            pathname === '/api/health') {
            return next();
        }
        const indexHtml = path_1.default.join(frontendDir, 'index.html');
        if (fs_1.default.existsSync(indexHtml)) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            return res.sendFile(indexHtml);
        }
        next();
    });
}
else {
    console.warn('[app] Frontend build (frontend/dist/browser/index.html) not found — ' +
        'SPA routes like /login will 404. Run `npm run build:frontend` from the monorepo root ' +
        'or serve the Angular dev server separately via `cd frontend && npm start`.');
}
app.use((err, req, res, _next) => {
    // #region debug-point H5:global-error-middleware
    (() => { try {
        const f = require('fs'), p = require('path');
        let rp = '.dbg/db-warming-503.env';
        const roots = [process.cwd(), p.resolve(__dirname, '..', '..'), p.resolve(__dirname, '..', '..', '..')];
        let found = null;
        for (const r of roots) {
            const cand = p.join(r, rp);
            if (f.existsSync(cand)) {
                found = cand;
                break;
            }
        }
        let u = 'http://127.0.0.1:7777/event', s = 'db-warming-503';
        try {
            if (found) {
                const e = f.readFileSync(found, 'utf8');
                u = e.match(/DEBUG_SERVER_URL=(.+)/)?.[1] || u;
                s = e.match(/DEBUG_SESSION_ID=(.+)/)?.[1] || s;
            }
        }
        catch { }
        const s2 = (0, server_1.getStartupState)();
        require('http').request({ method: 'POST', host: new URL(u).hostname, port: new URL(u).port, path: new URL(u).pathname, headers: { 'Content-Type': 'application/json' } }, () => { }).on('error', () => { }).end(JSON.stringify({ sessionId: s, runId: 'pre', hypothesisId: 'H5', location: 'app.ts:global-error-middleware', msg: '[DEBUG] Global error middleware triggered', data: { errName: err?.name, errMessage: err?.message, errCode: err?.code, url: req.originalUrl, method: req.method, headersSent: res.headersSent, statusCodeNow: res.statusCode, stateOk: s2.ok, stackSnippet: err?.stack?.split('\n').slice(0, 4).join('|'), user: typeof req.user ? { userId: req.user?.userId, role: req.user?.role, email: req.user?.email } : undefined }, ts: Date.now() }));
    }
    catch { } })();
    // #endregion
    const payload = {
        name: err?.name,
        message: err?.message,
        code: err?.code,
        url: req.originalUrl,
        method: req.method,
        user: req?.user
            ? {
                userId: req.user?.userId,
                role: req.user?.role,
                email: req.user?.email,
            }
            : undefined,
        stack: err?.stack?.split('\n').slice(0, 6).join('\n'),
    };
    console.error('[http:500] request failed:', JSON.stringify(payload, null, 2));
    res.status(500).json({ message: 'Internal server error', error: env_1.env.nodeEnv === 'development' ? err.message : undefined });
});
exports.default = app;
