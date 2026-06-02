"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-nocheck
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const data_source_1 = require("../config/data-source");
const entities_1 = require("../entities");
const enums_1 = require("../entities/enums");
const env_1 = require("../config/env");
const auth_1 = require("../middleware/auth");
const typeorm_helpers_1 = require("../utils/typeorm-helpers");
const security_policy_service_1 = require("../services/security-policy.service");
const security_policy_1 = require("../types/security-policy");
const role_permissions_service_1 = require("../services/role-permissions.service");
const password_reset_service_1 = require("../services/password-reset.service");
const user_auth_1 = require("../utils/user-auth");
const router = (0, express_1.Router)();
function formatLockoutRemaining(until) {
    const mins = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 60000));
    if (mins >= 60) {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return m ? `${h}h ${m}m` : `${h}h`;
    }
    return `${mins} minute${mins === 1 ? '' : 's'}`;
}
router.post('/login', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        const loginId = String(username || email || '').trim();
        if (!loginId || !password) {
            return res.status(400).json({ message: 'Username and password required' });
        }
        const policy = await (0, security_policy_service_1.getSecurityPolicy)();
        const userRepo = data_source_1.AppDataSource.getRepository(entities_1.User);
        const user = await (0, user_auth_1.findActiveUserByLoginIdentifier)(loginId, typeorm_helpers_1.USER_PROFILES);
        if (user?.lockedUntil && new Date() < new Date(user.lockedUntil)) {
            return res.status(423).json({
                message: `Account temporarily locked. Try again in ${formatLockoutRemaining(new Date(user.lockedUntil))}.`,
                lockedUntil: user.lockedUntil,
            });
        }
        if (user?.lockedUntil && new Date() >= new Date(user.lockedUntil)) {
            user.lockedUntil = null;
            user.failedLoginAttempts = 0;
        }
        if (!user || !(await bcryptjs_1.default.compare(password, user.passwordHash))) {
            if (user) {
                user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
                if (user.failedLoginAttempts >= policy.maxLoginAttempts) {
                    user.lockedUntil = new Date(Date.now() + policy.lockoutDurationMinutes * 60000);
                    user.failedLoginAttempts = 0;
                    await userRepo.save(user);
                    return res.status(423).json({
                        message: `Too many failed attempts. Account locked for ${policy.lockoutDurationMinutes} minutes.`,
                        lockedUntil: user.lockedUntil,
                    });
                }
                await userRepo.save(user);
                const remaining = policy.maxLoginAttempts - user.failedLoginAttempts;
                return res.status(401).json({
                    message: remaining > 0
                        ? `Invalid credentials. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
                        : 'Invalid credentials',
                });
            }
            return res.status(401).json({ message: 'Invalid credentials' });
        }
        user.failedLoginAttempts = 0;
        user.lockedUntil = null;
        await userRepo.save(user);
        await (0, role_permissions_service_1.ensureDefaultRoles)();
        const fullUser = (await (0, role_permissions_service_1.loadUserWithRole)(user.id)) ?? user;
        const permissions = (0, role_permissions_service_1.resolvePermissionsForUser)(fullUser);
        const payload = {
            userId: fullUser.id,
            email: fullUser.email,
            role: fullUser.role,
            permissions,
        };
        if (fullUser.schoolRoleId)
            payload.schoolRoleId = fullUser.schoolRoleId;
        if (fullUser.staffProfile)
            payload.staffId = fullUser.staffProfile.id;
        if (fullUser.parentProfile)
            payload.parentId = fullUser.parentProfile.id;
        if (fullUser.studentProfile)
            payload.studentId = fullUser.studentProfile.id;
        const expiresIn = (0, security_policy_1.sessionTimeoutToJwtExpires)(policy.sessionTimeoutMinutes);
        const token = jsonwebtoken_1.default.sign(payload, env_1.env.jwt.secret, { expiresIn: expiresIn });
        res.json({
            token,
            sessionTimeoutMinutes: policy.sessionTimeoutMinutes,
            user: {
                id: fullUser.id,
                email: fullUser.email,
                username: fullUser.username ?? null,
                firstName: fullUser.firstName,
                lastName: fullUser.lastName,
                role: fullUser.role,
                schoolRoleId: fullUser.schoolRoleId ?? null,
                schoolRoleName: fullUser.schoolRole?.name ?? null,
                permissions,
                staffId: fullUser.staffProfile?.id,
                parentId: fullUser.parentProfile?.id,
                studentId: fullUser.studentProfile?.id,
            },
        });
    }
    catch (err) {
        console.error('Login error:', err);
        res.status(500).json({
            message: 'Login failed',
            error: env_1.env.nodeEnv === 'development' && err instanceof Error ? err.message : undefined,
        });
    }
});
router.get('/me', auth_1.authenticate, async (req, res) => {
    const user = await (0, role_permissions_service_1.loadUserWithRole)(req.user.userId);
    if (!user)
        return res.status(404).json({ message: 'User not found' });
    const permissions = (0, role_permissions_service_1.resolvePermissionsForUser)(user);
    res.json({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        phone: user.phone,
        schoolRoleId: user.schoolRoleId ?? null,
        schoolRoleName: user.schoolRole?.name ?? null,
        permissions,
        staffId: user.staffProfile?.id,
        parentId: user.parentProfile?.id,
        studentId: user.studentProfile?.id,
    });
});
router.post('/forgot-password', async (req, res) => {
    try {
        const { username, email } = req.body;
        const result = await (0, password_reset_service_1.requestPasswordReset)(String(username || email || ''));
        res.json(result);
    }
    catch (err) {
        console.error('Forgot password error:', err);
        res.status(500).json({ message: 'Could not process password reset request.' });
    }
});
router.post('/reset-password', async (req, res) => {
    try {
        const { token, password } = req.body;
        const result = await (0, password_reset_service_1.resetPasswordWithToken)(String(token || ''), String(password || ''));
        res.json(result);
    }
    catch (err) {
        return res.status(400).json({
            message: err instanceof Error ? err.message : 'Could not reset password',
        });
    }
});
router.get('/password-policy', async (_req, res) => {
    const policy = await (0, security_policy_service_1.getSecurityPolicy)();
    res.json({
        minPasswordLength: policy.minPasswordLength,
        requireUppercase: policy.requireUppercase,
        requireLowercase: policy.requireLowercase,
        requireNumber: policy.requireNumber,
        requireSpecialChar: policy.requireSpecialChar,
    });
});
router.post('/register', async (req, res) => {
    try {
        const { email, password, firstName, lastName, role, phone, admissionNumber, dateOfBirth, linkAdmissionNumber, relationship, } = req.body;
        const allowedRoles = [enums_1.UserRole.PARENT, enums_1.UserRole.STUDENT];
        if (!allowedRoles.includes(role)) {
            return res.status(400).json({ message: 'Registration is only available for parent and student accounts' });
        }
        if (!email?.trim() || !password || !firstName?.trim() || !lastName?.trim()) {
            return res.status(400).json({ message: 'Email, password, first name, and last name are required' });
        }
        const userRepo = data_source_1.AppDataSource.getRepository(entities_1.User);
        const existing = await userRepo.findOne({ where: { email: email.toLowerCase().trim() } });
        if (existing)
            return res.status(409).json({ message: 'Email already registered' });
        const policy = await (0, security_policy_service_1.getSecurityPolicy)();
        const pwdErr = (0, security_policy_1.validatePasswordAgainstPolicy)(password, policy);
        if (pwdErr)
            return res.status(400).json({ message: pwdErr });
        const passwordHash = await bcryptjs_1.default.hash(password, 10);
        let linkedStudent = null;
        if (role === enums_1.UserRole.STUDENT) {
            if (!admissionNumber?.trim()) {
                return res.status(400).json({ message: 'Student ID (admission number) is required' });
            }
            const studentRepo = data_source_1.AppDataSource.getRepository(entities_1.Student);
            const admission = String(admissionNumber).trim().toUpperCase();
            const student = await studentRepo.findOne({ where: { admissionNumber: admission, isActive: true } });
            if (!student) {
                return res.status(404).json({ message: 'No matching student record found. Ask the school office to register you first.' });
            }
            if (student.userId) {
                return res.status(409).json({ message: 'A portal account is already linked to this student ID' });
            }
            const fn = String(firstName).trim().toLowerCase();
            const ln = String(lastName).trim().toLowerCase();
            if (student.dateOfBirth && dateOfBirth) {
                if (student.dateOfBirth !== dateOfBirth) {
                    return res.status(400).json({ message: 'Date of birth does not match school records' });
                }
            }
            else if (student.firstName.trim().toLowerCase() !== fn ||
                student.lastName.trim().toLowerCase() !== ln) {
                return res.status(400).json({ message: 'Name does not match school records for this student ID' });
            }
            linkedStudent = student;
        }
        const user = await userRepo.save(userRepo.create({
            email: email.toLowerCase().trim(),
            passwordHash,
            firstName: String(firstName).trim(),
            lastName: String(lastName).trim(),
            role,
            phone: phone?.trim() || undefined,
        }));
        if (role === enums_1.UserRole.PARENT) {
            const parentRepo = data_source_1.AppDataSource.getRepository(entities_1.Parent);
            const parent = await parentRepo.save(parentRepo.create({ userId: user.id }));
            if (linkAdmissionNumber?.trim()) {
                const studentRepo = data_source_1.AppDataSource.getRepository(entities_1.Student);
                const guardianRepo = data_source_1.AppDataSource.getRepository(entities_1.Guardian);
                const admission = String(linkAdmissionNumber).trim().toUpperCase();
                const student = await studentRepo.findOne({ where: { admissionNumber: admission, isActive: true } });
                if (student) {
                    let guardian = await guardianRepo.findOne({
                        where: { studentId: student.id, email: user.email },
                    });
                    if (guardian) {
                        guardian.parentId = parent.id;
                        if (relationship)
                            guardian.relationship = relationship;
                    }
                    else {
                        guardian = guardianRepo.create({
                            studentId: student.id,
                            parentId: parent.id,
                            fullName: `${user.firstName} ${user.lastName}`,
                            relationship: relationship || 'Parent',
                            phone: user.phone,
                            email: user.email,
                            isPrimary: false,
                        });
                    }
                    await guardianRepo.save(guardian);
                }
            }
        }
        if (role === enums_1.UserRole.STUDENT && linkedStudent) {
            linkedStudent.userId = user.id;
            await data_source_1.AppDataSource.getRepository(entities_1.Student).save(linkedStudent);
        }
        const fullUser = await userRepo.findOne({
            where: { id: user.id },
            relations: typeorm_helpers_1.USER_PROFILES,
        });
        const payload = {
            userId: fullUser.id,
            email: fullUser.email,
            role: fullUser.role,
        };
        if (fullUser.staffProfile)
            payload.staffId = fullUser.staffProfile.id;
        if (fullUser.parentProfile)
            payload.parentId = fullUser.parentProfile.id;
        if (fullUser.studentProfile)
            payload.studentId = fullUser.studentProfile.id;
        const expiresIn = (0, security_policy_1.sessionTimeoutToJwtExpires)(policy.sessionTimeoutMinutes);
        const token = jsonwebtoken_1.default.sign(payload, env_1.env.jwt.secret, { expiresIn: expiresIn });
        res.status(201).json({
            message: 'Account created successfully',
            token,
            user: {
                id: fullUser.id,
                email: fullUser.email,
                firstName: fullUser.firstName,
                lastName: fullUser.lastName,
                role: fullUser.role,
                staffId: fullUser.staffProfile?.id,
                parentId: fullUser.parentProfile?.id,
                studentId: fullUser.studentProfile?.id,
            },
        });
    }
    catch (err) {
        console.error('Register error:', err);
        res.status(500).json({
            message: 'Registration failed',
            error: env_1.env.nodeEnv === 'development' && err instanceof Error ? err.message : undefined,
        });
    }
});
exports.default = router;
