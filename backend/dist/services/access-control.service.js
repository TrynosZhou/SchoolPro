"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AccessControlService = void 0;
const access_matrix_1 = require("../config/access-matrix");
const data_source_1 = require("../config/data-source");
const COMMUNICATION = 'communication';
/**
 * Access-control helpers. Phase 2 enforces module grants via middleware + route checks.
 */
class AccessControlService {
    /** Full matrix for admin review before Phase 2 rollout. */
    static getMatrixPreview() {
        return (0, access_matrix_1.buildMatrixPreview)();
    }
    static resolveAccessRole(user) {
        return (0, access_matrix_1.mapUserRoleToAccessRole)(user.role);
    }
    /** Check whether a role may perform an action on a module (role-level only). */
    static can(user, moduleId, action) {
        const accessRole = (0, access_matrix_1.mapUserRoleToAccessRole)(user.role);
        return (0, access_matrix_1.canPerformAction)(accessRole, moduleId, action);
    }
    static getGrants(accessRole, moduleId) {
        return (0, access_matrix_1.getDefaultGrants)(accessRole, moduleId);
    }
    static getModule(moduleId) {
        return (0, access_matrix_1.getModuleDefinition)(moduleId);
    }
    /** Student IDs the user may access for a given module scope. */
    static async getAccessibleStudentIds(user) {
        const role = (0, access_matrix_1.mapUserRoleToAccessRole)(user.role);
        if (role === 'admin' || role === 'accountant')
            return 'all';
        if (role === 'teacher' && user.staffId) {
            const rows = await data_source_1.AppDataSource.query(`
        SELECT DISTINCT s.id
        FROM students s
        JOIN class_subjects cs ON cs."classId" = s."classId"
        WHERE s."isActive" = true AND cs."teacherId" = $1
        UNION
        SELECT DISTINCT s.id
        FROM students s
        JOIN classes c ON c.id = s."classId"
        WHERE s."isActive" = true AND c."classTeacherId" = $1
        `, [user.staffId]);
            return rows.map((r) => r.id);
        }
        if (role === 'parent' && user.parentId) {
            const rows = await data_source_1.AppDataSource.query(`SELECT "studentId" FROM guardians WHERE "parentId" = $1 AND "studentId" IS NOT NULL`, [user.parentId]);
            return rows.map((r) => r.studentId);
        }
        if (role === 'student' && user.studentId) {
            return [user.studentId];
        }
        return [];
    }
    static async userCanAccessStudent(user, studentId) {
        const ids = await this.getAccessibleStudentIds(user);
        if (ids === 'all')
            return true;
        return ids.includes(studentId);
    }
    /** Whether a message thread/message belongs to the current user (inbox participant). */
    static userParticipatesInMessage(user, message) {
        return message.senderId === user.userId || message.recipientId === user.userId;
    }
    static scopeForAction(user, moduleId, action) {
        const accessRole = (0, access_matrix_1.mapUserRoleToAccessRole)(user.role);
        return (0, access_matrix_1.getDefaultGrants)(accessRole, moduleId)[action];
    }
    /**
     * Record-level access check used when scoping queries (Phase 2+).
     */
    static async assertRecordAccess(user, moduleId, action, recordId) {
        if (!this.can(user, moduleId, action)) {
            return { allowed: false, reason: 'Insufficient module permission' };
        }
        const scope = this.scopeForAction(user, moduleId, action);
        if (scope === 'all')
            return { allowed: true };
        if (scope === 'none')
            return { allowed: false, reason: 'Action not permitted for your role' };
        if (moduleId === COMMUNICATION) {
            // Message record IDs are validated in route handlers via participant check.
            return { allowed: true };
        }
        if (moduleId === 'students' || moduleId === 'enrollment') {
            const ok = await this.userCanAccessStudent(user, recordId);
            return ok
                ? { allowed: true }
                : { allowed: false, reason: 'You do not have access to this student record' };
        }
        return { allowed: true };
    }
}
exports.AccessControlService = AccessControlService;
