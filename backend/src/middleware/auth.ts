import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { UserRole } from '../entities/enums';

export interface AuthPayload {
  userId: string;
  email: string;
  role: UserRole;
  permissions?: string[];
  schoolRoleId?: string;
  staffId?: string;
  parentId?: string;
  studentId?: string;
  /** True only for tokens issued by POST /auth/demo-login. Drives tenant routing + guardrails. */
  demo?: boolean;
}

export interface AuthRequest extends Request {
  user?: AuthPayload;
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Authentication required' });
  }
  try {
    const token = header.split(' ')[1];
    const payload = jwt.verify(token, env.jwt.secret) as AuthPayload;
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

export function authorize(...roles: UserRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }
    next();
  };
}

export function authorizePermission(...required: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    if (req.user.role === UserRole.ADMIN) {
      return next();
    }
    const granted = new Set(req.user.permissions ?? []);
    if (required.some((key) => granted.has(key))) {
      return next();
    }
    return res.status(403).json({ message: 'Insufficient permissions' });
  };
}

