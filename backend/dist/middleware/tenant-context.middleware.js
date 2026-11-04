"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.tenantContextMiddleware = tenantContextMiddleware;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
const tenant_context_1 = require("../config/tenant-context");
/**
 * Mounted globally, before every router. Peeks at the JWT (if any) purely to detect
 * the `demo` claim and establish the AsyncLocalStorage tenant context for the
 * lifetime of the request — it does NOT enforce authentication (each router's own
 * `authenticate` middleware still runs afterwards and 401s as before for missing/
 * invalid/expired tokens). This separation means demo detection never changes the
 * auth behaviour of a single existing route.
 */
function tenantContextMiddleware(req, res, next) {
    let isDemo = false;
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
        try {
            const payload = jsonwebtoken_1.default.verify(header.slice(7), env_1.env.jwt.secret);
            if (payload?.demo === true) {
                isDemo = true;
                req.demoUser = payload;
            }
        }
        catch {
            // Invalid/expired token — leave as non-demo; the router's `authenticate` will
            // reject it with a proper 401 further down the chain.
        }
    }
    tenant_context_1.tenantContext.run({ isDemo, demoUserId: req.demoUser?.userId }, () => next());
}
