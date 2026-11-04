"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.demoWriteRateLimiter = exports.DEMO_RESTRICTED_MESSAGE = void 0;
exports.blockInDemo = blockInDemo;
exports.demoGlobalWriteGuard = demoGlobalWriteGuard;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const env_1 = require("../config/env");
exports.DEMO_RESTRICTED_MESSAGE = "This action isn't available in demo mode.";
/**
 * Drop this into any specific route's middleware chain (alongside `authenticate`,
 * `authorize(...)`, etc.) to block it outright for demo sessions, e.g.:
 *   router.delete('/:id', authenticate, authorize(UserRole.ADMIN), blockInDemo, handler)
 */
function blockInDemo(req, res, next) {
    if (req.demoUser) {
        return res.status(403).json({ message: exports.DEMO_RESTRICTED_MESSAGE, demoRestricted: true });
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
function demoGlobalWriteGuard(req, res, next) {
    if (!req.demoUser)
        return next();
    const path = req.path.toLowerCase();
    const isExportDownload = /\/export|\.pdf($|\?)|\.csv($|\?)|\.xlsx($|\?)/.test(path);
    if (isExportDownload) {
        return res.status(403).json({ message: exports.DEMO_RESTRICTED_MESSAGE, demoRestricted: true });
    }
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
        return next();
    }
    const isDelete = req.method === 'DELETE';
    const isBulkAction = path.includes('/bulk');
    const isBillingWrite = path.startsWith('/api/billing');
    const isIntegrationsWrite = path.startsWith('/api/admin/integrations');
    if (isDelete || isBulkAction || isBillingWrite || isIntegrationsWrite) {
        return res.status(403).json({ message: exports.DEMO_RESTRICTED_MESSAGE, demoRestricted: true });
    }
    next();
}
/** Rate limiting scoped only to demo write traffic — real users are never affected. */
exports.demoWriteRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60000,
    max: env_1.env.demo.writeRateLimitPerMinute,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.demoUser?.userId || req.ip || 'anonymous',
    skip: (req) => !req.demoUser || req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS',
    message: { message: 'Too many actions in demo mode — please slow down and try again shortly.' },
});
