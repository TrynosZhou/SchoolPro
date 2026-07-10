import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { tenantContext } from '../config/tenant-context';
import { AuthPayload } from './auth';

export interface DemoAwareRequest extends Request {
  /** Set only when the request carries a valid JWT with `demo: true`. */
  demoUser?: AuthPayload;
}

/**
 * Mounted globally, before every router. Peeks at the JWT (if any) purely to detect
 * the `demo` claim and establish the AsyncLocalStorage tenant context for the
 * lifetime of the request — it does NOT enforce authentication (each router's own
 * `authenticate` middleware still runs afterwards and 401s as before for missing/
 * invalid/expired tokens). This separation means demo detection never changes the
 * auth behaviour of a single existing route.
 */
export function tenantContextMiddleware(req: DemoAwareRequest, res: Response, next: NextFunction) {
  let isDemo = false;

  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(header.slice(7), env.jwt.secret) as AuthPayload;
      if (payload?.demo === true) {
        isDemo = true;
        req.demoUser = payload;
      }
    } catch {
      // Invalid/expired token — leave as non-demo; the router's `authenticate` will
      // reject it with a proper 401 further down the chain.
    }
  }

  tenantContext.run({ isDemo, demoUserId: req.demoUser?.userId }, () => next());
}
