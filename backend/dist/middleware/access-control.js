"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireModuleAccess = requireModuleAccess;
exports.denyUnlessModuleAccess = denyUnlessModuleAccess;
exports.denyUnlessStudentRecordAccess = denyUnlessStudentRecordAccess;
exports.requireFinanceOrModuleAccess = requireFinanceOrModuleAccess;
const access_control_service_1 = require("../services/access-control.service");
/**
 * Express middleware: enforce module-level CRUD grants from the access matrix.
 * Record-level scoping (assigned/linked/self) is applied inside route handlers.
 */
function requireModuleAccess(moduleId, action) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required' });
        }
        if (!access_control_service_1.AccessControlService.can(req.user, moduleId, action)) {
            return res.status(403).json({
                message: `You do not have permission to ${action} ${moduleId.replace(/_/g, ' ')} records.`,
            });
        }
        next();
    };
}
/** Reject the request when the user lacks module access (for inline checks). */
function denyUnlessModuleAccess(req, res, moduleId, action) {
    if (!req.user) {
        res.status(401).json({ message: 'Authentication required' });
        return false;
    }
    if (!access_control_service_1.AccessControlService.can(req.user, moduleId, action)) {
        res.status(403).json({
            message: `You do not have permission to ${action} ${moduleId.replace(/_/g, ' ')} records.`,
        });
        return false;
    }
    return true;
}
/** Module + student record access (assigned / linked / self). */
async function denyUnlessStudentRecordAccess(req, res, moduleId, action, studentId) {
    if (!denyUnlessModuleAccess(req, res, moduleId, action))
        return false;
    if (!(await access_control_service_1.AccessControlService.userCanAccessStudent(req.user, studentId))) {
        res.status(403).json({ message: 'You do not have access to this student record' });
        return false;
    }
    return true;
}
/** Allow finance staff or users with module-level access (e.g. terms for billing). */
function requireFinanceOrModuleAccess(moduleId, action) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required' });
        }
        if (access_control_service_1.AccessControlService.can(req.user, 'finance', 'view')) {
            return next();
        }
        if (!access_control_service_1.AccessControlService.can(req.user, moduleId, action)) {
            return res.status(403).json({
                message: `You do not have permission to ${action} ${moduleId.replace(/_/g, ' ')} records.`,
            });
        }
        next();
    };
}
