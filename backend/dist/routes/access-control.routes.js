"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const data_source_1 = require("../config/data-source");
const enums_1 = require("../entities/enums");
const auth_1 = require("../middleware/auth");
const access_control_service_1 = require("../services/access-control.service");
const audit_log_service_1 = require("../services/audit-log.service");
const access_matrix_1 = require("../config/access-matrix");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
const boardRoles = [enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL];
/**
 * Phase 1 — preview the CRUD permissions matrix (not yet enforced on routes).
 * Use this to confirm defaults before Phase 2 rollout.
 */
router.get('/matrix', (0, auth_1.authorize)(...boardRoles), (_req, res) => {
    res.json(access_control_service_1.AccessControlService.getMatrixPreview());
});
/** Current user's resolved access role and module grants (for future UI guards). */
router.get('/me', (req, res) => {
    if (!req.user)
        return res.status(401).json({ message: 'Authentication required' });
    const accessRole = (0, access_matrix_1.mapUserRoleToAccessRole)(req.user.role);
    const preview = access_control_service_1.AccessControlService.getMatrixPreview();
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
router.get('/audit-logs/meta', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (_req, res) => {
    const logged = await data_source_1.AppDataSource.query(`SELECT DISTINCT module FROM audit_logs ORDER BY module`);
    res.json({
        modules: access_matrix_1.ACCESS_MODULES.map((m) => ({ id: m.id, label: m.label })),
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
router.get('/audit-logs', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (req, res) => {
    const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
    const result = await (0, audit_log_service_1.queryAuditLogs)({
        userId: str(req.query.userId),
        userEmail: str(req.query.userEmail),
        module: str(req.query.module),
        action: str(req.query.action),
        recordId: str(req.query.recordId),
        dateFrom: str(req.query.dateFrom),
        dateTo: str(req.query.dateTo),
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        offset: req.query.offset ? Number(req.query.offset) : undefined,
    });
    res.json(result);
});
exports.default = router;
