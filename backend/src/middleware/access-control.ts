import { Response, NextFunction } from 'express';
import { CrudAction } from '../config/access-matrix';
import { AccessControlService } from '../services/access-control.service';
import { AuthRequest } from './auth';

/**
 * Express middleware: enforce module-level CRUD grants from the access matrix.
 * Record-level scoping (assigned/linked/self) is applied inside route handlers.
 */
export function requireModuleAccess(moduleId: string, action: CrudAction) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    if (!AccessControlService.can(req.user, moduleId, action)) {
      return res.status(403).json({
        message: `You do not have permission to ${action} ${moduleId.replace(/_/g, ' ')} records.`,
      });
    }
    next();
  };
}

/** Reject the request when the user lacks module access (for inline checks). */
export function denyUnlessModuleAccess(
  req: AuthRequest,
  res: Response,
  moduleId: string,
  action: CrudAction,
): boolean {
  if (!req.user) {
    res.status(401).json({ message: 'Authentication required' });
    return false;
  }
  if (!AccessControlService.can(req.user, moduleId, action)) {
    res.status(403).json({
      message: `You do not have permission to ${action} ${moduleId.replace(/_/g, ' ')} records.`,
    });
    return false;
  }
  return true;
}

/** Module + student record access (assigned / linked / self). */
export async function denyUnlessStudentRecordAccess(
  req: AuthRequest,
  res: Response,
  moduleId: string,
  action: CrudAction,
  studentId: string,
): Promise<boolean> {
  if (!denyUnlessModuleAccess(req, res, moduleId, action)) return false;
  if (!(await AccessControlService.userCanAccessStudent(req.user!, studentId))) {
    res.status(403).json({ message: 'You do not have access to this student record' });
    return false;
  }
  return true;
}
