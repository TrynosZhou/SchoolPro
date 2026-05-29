"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticate = authenticate;
exports.authorize = authorize;
exports.authorizePermission = authorizePermission;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
const enums_1 = require("../entities/enums");
function authenticate(req, res, next) {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Authentication required' });
    }
    try {
        const token = header.split(' ')[1];
        const payload = jsonwebtoken_1.default.verify(token, env_1.env.jwt.secret);
        req.user = payload;
        next();
    }
    catch {
        return res.status(401).json({ message: 'Invalid or expired token' });
    }
}
function authorize(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required' });
        }
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ message: 'Insufficient permissions' });
        }
        next();
    };
}
function authorizePermission(...required) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required' });
        }
        if (req.user.role === enums_1.UserRole.ADMIN) {
            return next();
        }
        const granted = new Set(req.user.permissions ?? []);
        if (required.some((key) => granted.has(key))) {
            return next();
        }
        return res.status(403).json({ message: 'Insufficient permissions' });
    };
}
