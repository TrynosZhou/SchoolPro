"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateStudentPortal = authenticateStudentPortal;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const data_source_1 = require("../config/data-source");
const entities_1 = require("../entities");
const enums_1 = require("../entities/enums");
const security_policy_service_1 = require("./security-policy.service");
const date_only_1 = require("../utils/date-only");
const typeorm_helpers_1 = require("../utils/typeorm-helpers");
const user_password_1 = require("../utils/user-password");
function studentPortalEmail(admissionNumber) {
    const safe = admissionNumber.toLowerCase().replace(/[^a-z0-9]/g, '');
    return `${safe}@student.portal`;
}
async function syncPortalPasswordHash(user, dateOfBirth) {
    if (user.portalPasswordCustomized)
        return;
    const matches = await (0, user_password_1.verifyUserPassword)(user, dateOfBirth);
    if (matches)
        return;
    user.passwordHash = await bcryptjs_1.default.hash(dateOfBirth, 10);
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    await data_source_1.AppDataSource.getRepository(entities_1.User).save(user);
}
async function createStudentPortalUser(student, dateOfBirth) {
    const userRepo = data_source_1.AppDataSource.getRepository(entities_1.User);
    const admission = student.admissionNumber.trim().toUpperCase();
    const email = studentPortalEmail(admission);
    const existing = await userRepo.findOne({ where: { email } });
    if (existing) {
        student.userId = existing.id;
        await data_source_1.AppDataSource.getRepository(entities_1.Student).save(student);
        if (!existing.portalPasswordCustomized) {
            await syncPortalPasswordHash(existing, dateOfBirth);
        }
        return (await userRepo.findOne({ where: { id: existing.id }, relations: typeorm_helpers_1.USER_PROFILES }));
    }
    const passwordHash = await bcryptjs_1.default.hash(dateOfBirth, 10);
    const user = await userRepo.save(userRepo.create({
        email,
        username: admission,
        passwordHash,
        firstName: student.firstName,
        lastName: student.lastName,
        role: enums_1.UserRole.STUDENT,
        isActive: true,
        portalPasswordCustomized: false,
    }));
    student.userId = user.id;
    await data_source_1.AppDataSource.getRepository(entities_1.Student).save(student);
    const full = await userRepo.findOne({ where: { id: user.id }, relations: typeorm_helpers_1.USER_PROFILES });
    if (!full)
        throw new Error('Failed to create student portal account');
    return full;
}
function formatLockoutRemaining(until) {
    const mins = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 60000));
    if (mins >= 60) {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return m ? `${h}h ${m}m` : `${h}h`;
    }
    return `${mins} minute${mins === 1 ? '' : 's'}`;
}
async function recordFailedStudentLogin(user) {
    const policy = await (0, security_policy_service_1.getSecurityPolicy)();
    const userRepo = data_source_1.AppDataSource.getRepository(entities_1.User);
    if (user.lockedUntil && new Date() < new Date(user.lockedUntil)) {
        return {
            ok: false,
            status: 423,
            message: `Account temporarily locked. Try again in ${formatLockoutRemaining(new Date(user.lockedUntil))}.`,
        };
    }
    if (user.lockedUntil && new Date() >= new Date(user.lockedUntil)) {
        user.lockedUntil = null;
        user.failedLoginAttempts = 0;
    }
    user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
    if (user.failedLoginAttempts >= policy.maxLoginAttempts) {
        user.lockedUntil = new Date(Date.now() + policy.lockoutDurationMinutes * 60000);
        user.failedLoginAttempts = 0;
        await userRepo.save(user);
        return {
            ok: false,
            status: 423,
            message: `Too many failed attempts. Account locked for ${policy.lockoutDurationMinutes} minutes.`,
        };
    }
    await userRepo.save(user);
    const remaining = policy.maxLoginAttempts - user.failedLoginAttempts;
    return {
        ok: false,
        status: 401,
        message: remaining > 0
            ? `Invalid Student ID or password. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
            : 'Invalid Student ID or password',
    };
}
async function clearStudentLoginFailures(user) {
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    await data_source_1.AppDataSource.getRepository(entities_1.User).save(user);
}
/**
 * Authenticate a student using admission number + date of birth (first sign-in)
 * or admission number + custom password (after the student changes their password).
 */
async function authenticateStudentPortal(admissionNumber, secret) {
    const admission = String(admissionNumber || '').trim().toUpperCase();
    const trimmedSecret = String(secret || '').trim();
    if (!admission) {
        return { ok: false, status: 400, message: 'Student ID is required' };
    }
    if (!trimmedSecret) {
        return { ok: false, status: 400, message: 'Date of birth or password is required' };
    }
    const studentRepo = data_source_1.AppDataSource.getRepository(entities_1.Student);
    const student = await studentRepo.findOne({
        where: { admissionNumber: admission, isActive: true },
        relations: { user: true },
    });
    if (!student) {
        return { ok: false, status: 401, message: 'Invalid Student ID or credentials' };
    }
    const userRepo = data_source_1.AppDataSource.getRepository(entities_1.User);
    let user = null;
    if (student.userId) {
        user = await userRepo.findOne({
            where: { id: student.userId },
            relations: typeorm_helpers_1.USER_PROFILES,
        });
    }
    if (user?.portalPasswordCustomized) {
        if (!user.isActive) {
            return { ok: false, status: 403, message: 'This student portal account is inactive. Contact the school office.' };
        }
        if (!(await (0, user_password_1.verifyUserPassword)(user, trimmedSecret))) {
            return (await recordFailedStudentLogin(user));
        }
        await clearStudentLoginFailures(user);
        const full = await userRepo.findOne({ where: { id: user.id }, relations: typeorm_helpers_1.USER_PROFILES });
        return { ok: true, user: full ?? user };
    }
    if (!student.dateOfBirth) {
        return {
            ok: false,
            status: 403,
            message: 'Date of birth is not on file for this student. Please contact the school office.',
        };
    }
    const recordDob = (0, date_only_1.normalizeDateOnly)(student.dateOfBirth);
    if (!recordDob || !(0, date_only_1.secretMatchesRecordDob)(trimmedSecret, recordDob)) {
        return { ok: false, status: 401, message: 'Invalid Student ID or date of birth' };
    }
    if (user?.isActive === false) {
        return { ok: false, status: 403, message: 'This student portal account is inactive. Contact the school office.' };
    }
    if (user) {
        await syncPortalPasswordHash(user, recordDob);
        const full = await userRepo.findOne({ where: { id: user.id }, relations: typeorm_helpers_1.USER_PROFILES });
        return { ok: true, user: full ?? user };
    }
    user = await createStudentPortalUser(student, recordDob);
    return { ok: true, user };
}
