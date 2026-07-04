import {
  AccessRole,
  CrudAction,
  buildMatrixPreview,
  canPerformAction,
  getDefaultGrants,
  getModuleDefinition,
  mapUserRoleToAccessRole,
  AccessScope,
} from '../config/access-matrix';
import { UserRole } from '../entities/enums';
import { AuthPayload } from '../middleware/auth';
import { AppDataSource } from '../config/data-source';

const COMMUNICATION = 'communication';

/**
 * Access-control helpers. Phase 2 enforces module grants via middleware + route checks.
 */
export class AccessControlService {
  /** Full matrix for admin review before Phase 2 rollout. */
  static getMatrixPreview() {
    return buildMatrixPreview();
  }

  static resolveAccessRole(user: Pick<AuthPayload, 'role'>): AccessRole {
    return mapUserRoleToAccessRole(user.role as UserRole);
  }

  /** Check whether a role may perform an action on a module (role-level only). */
  static can(user: Pick<AuthPayload, 'role'>, moduleId: string, action: CrudAction): boolean {
    const accessRole = mapUserRoleToAccessRole(user.role as UserRole);
    return canPerformAction(accessRole, moduleId, action);
  }

  static getGrants(accessRole: AccessRole, moduleId: string) {
    return getDefaultGrants(accessRole, moduleId);
  }

  static getModule(moduleId: string) {
    return getModuleDefinition(moduleId);
  }

  /** Student IDs the user may access for a given module scope. */
  static async getAccessibleStudentIds(user: AuthPayload): Promise<string[] | 'all'> {
    const role = mapUserRoleToAccessRole(user.role);
    if (role === 'admin') return 'all';
    if (role === 'teacher' && user.staffId) {
      const rows: { id: string }[] = await AppDataSource.query(
        `
        SELECT DISTINCT s.id
        FROM students s
        JOIN class_subjects cs ON cs."classId" = s."classId"
        WHERE s."isActive" = true AND cs."teacherId" = $1
        UNION
        SELECT DISTINCT s.id
        FROM students s
        JOIN classes c ON c.id = s."classId"
        WHERE s."isActive" = true AND c."classTeacherId" = $1
        `,
        [user.staffId],
      );
      return rows.map((r) => r.id);
    }
    if (role === 'parent' && user.parentId) {
      const rows: { studentId: string }[] = await AppDataSource.query(
        `SELECT "studentId" FROM guardians WHERE "parentId" = $1 AND "studentId" IS NOT NULL`,
        [user.parentId],
      );
      return rows.map((r) => r.studentId);
    }
    if (role === 'student' && user.studentId) {
      return [user.studentId];
    }
    return [];
  }

  static async userCanAccessStudent(user: AuthPayload, studentId: string): Promise<boolean> {
    const ids = await this.getAccessibleStudentIds(user);
    if (ids === 'all') return true;
    return ids.includes(studentId);
  }

  /** Whether a message thread/message belongs to the current user (inbox participant). */
  static userParticipatesInMessage(
    user: AuthPayload,
    message: { senderId: string; recipientId: string },
  ): boolean {
    return message.senderId === user.userId || message.recipientId === user.userId;
  }

  static scopeForAction(user: AuthPayload, moduleId: string, action: CrudAction): AccessScope {
    const accessRole = mapUserRoleToAccessRole(user.role as UserRole);
    return getDefaultGrants(accessRole, moduleId)[action];
  }

  /**
   * Record-level access check used when scoping queries (Phase 2+).
   */
  static async assertRecordAccess(
    user: AuthPayload,
    moduleId: string,
    action: CrudAction,
    recordId: string,
  ): Promise<{ allowed: boolean; reason?: string }> {
    if (!this.can(user, moduleId, action)) {
      return { allowed: false, reason: 'Insufficient module permission' };
    }
    const scope = this.scopeForAction(user, moduleId, action);
    if (scope === 'all') return { allowed: true };
    if (scope === 'none') return { allowed: false, reason: 'Action not permitted for your role' };

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
