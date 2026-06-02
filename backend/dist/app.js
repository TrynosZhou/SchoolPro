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
const admin_routes_1 = __importDefault(require("./routes/admin.routes"));
const dashboard_routes_1 = __importDefault(require("./routes/dashboard.routes"));
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
app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'School Pro API' }));
app.use('/api/auth', auth_routes_1.default);
app.use('/api/students', students_routes_1.default);
app.use('/api/attendance', attendance_routes_1.default);
app.use('/api/exams', exams_routes_1.default);
app.use('/api/billing', billing_routes_1.default);
app.use('/api/finance', finance_routes_1.default);
app.use('/api/academics', academics_routes_1.default);
app.use('/api/admin', admin_routes_1.default);
app.use('/api/dashboard', dashboard_routes_1.default);
app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ message: 'Internal server error', error: env_1.env.nodeEnv === 'development' ? err.message : undefined });
});
exports.default = app;
