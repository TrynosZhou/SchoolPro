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
const router = (0, express_1.Router)();
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password required' });
        }
        const userRepo = data_source_1.AppDataSource.getRepository(entities_1.User);
        const user = await userRepo.findOne({
            where: { email: email.toLowerCase(), isActive: true },
            relations: typeorm_helpers_1.USER_PROFILES,
        });
        if (!user || !(await bcryptjs_1.default.compare(password, user.passwordHash))) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }
        const payload = {
            userId: user.id,
            email: user.email,
            role: user.role,
        };
        if (user.staffProfile)
            payload.staffId = user.staffProfile.id;
        if (user.parentProfile)
            payload.parentId = user.parentProfile.id;
        if (user.studentProfile)
            payload.studentId = user.studentProfile.id;
        const token = jsonwebtoken_1.default.sign(payload, env_1.env.jwt.secret, { expiresIn: env_1.env.jwt.expiresIn });
        res.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                role: user.role,
                staffId: user.staffProfile?.id,
                parentId: user.parentProfile?.id,
                studentId: user.studentProfile?.id,
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
    const userRepo = data_source_1.AppDataSource.getRepository(entities_1.User);
    const user = await userRepo.findOne({
        where: { id: req.user.userId },
        relations: typeorm_helpers_1.USER_PROFILES,
    });
    if (!user)
        return res.status(404).json({ message: 'User not found' });
    res.json({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        phone: user.phone,
        staffId: user.staffProfile?.id,
        parentId: user.parentProfile?.id,
        studentId: user.studentProfile?.id,
    });
});
router.post('/register', async (req, res) => {
    const { email, password, firstName, lastName, role, phone } = req.body;
    const allowedRoles = [enums_1.UserRole.TEACHER, enums_1.UserRole.PARENT, enums_1.UserRole.ADMIN];
    if (!allowedRoles.includes(role)) {
        return res.status(400).json({ message: 'Invalid role for registration' });
    }
    const userRepo = data_source_1.AppDataSource.getRepository(entities_1.User);
    const existing = await userRepo.findOne({ where: { email: email.toLowerCase() } });
    if (existing)
        return res.status(409).json({ message: 'Email already registered' });
    const passwordHash = await bcryptjs_1.default.hash(password, 10);
    const user = userRepo.create({
        email: email.toLowerCase(),
        passwordHash,
        firstName,
        lastName,
        role,
        phone,
    });
    await userRepo.save(user);
    if (role === enums_1.UserRole.TEACHER) {
        const staffRepo = data_source_1.AppDataSource.getRepository(entities_1.Staff);
        await staffRepo.save(staffRepo.create({
            userId: user.id,
            employeeNumber: `EMP-${Date.now()}`,
        }));
    }
    if (role === enums_1.UserRole.PARENT) {
        const parentRepo = data_source_1.AppDataSource.getRepository(entities_1.Parent);
        await parentRepo.save(parentRepo.create({ userId: user.id }));
    }
    res.status(201).json({ message: 'User registered', userId: user.id });
});
exports.default = router;
