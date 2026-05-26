"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-nocheck
const express_1 = require("express");
const data_source_1 = require("../config/data-source");
const entities_1 = require("../entities");
const enums_1 = require("../entities/enums");
const auth_1 = require("../middleware/auth");
const typeorm_helpers_1 = require("../utils/typeorm-helpers");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
router.get('/timetable', async (req, res) => {
    const { classId } = req.query;
    const repo = data_source_1.AppDataSource.getRepository(entities_1.Timetable);
    const where = {};
    if (classId)
        where.classId = classId;
    res.json(await repo.find({
        where,
        relations: (0, typeorm_helpers_1.relations)('subject', 'teacher', 'teacher.user', 'schoolClass'),
        order: { dayOfWeek: 'ASC', startTime: 'ASC' },
    }));
});
router.post('/timetable', (0, auth_1.authorize)(enums_1.UserRole.TEACHER, enums_1.UserRole.ADMIN), async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.Timetable);
    const entry = await repo.save(repo.create(req.body));
    res.status(201).json(entry);
});
router.get('/learning-schedules', (0, auth_1.authorize)(enums_1.UserRole.TEACHER, enums_1.UserRole.ADMIN, enums_1.UserRole.PARENT, enums_1.UserRole.PRINCIPAL), async (req, res) => {
    const { classId, termId, weekStart } = req.query;
    const repo = data_source_1.AppDataSource.getRepository(entities_1.LearningSchedule);
    const where = {};
    if (classId)
        where.classId = classId;
    if (termId)
        where.termId = termId;
    if (weekStart)
        where.weekStart = weekStart;
    res.json(await repo.find({
        where,
        relations: (0, typeorm_helpers_1.relations)('subject', 'teacher', 'teacher.user', 'schoolClass'),
        order: { weekStart: 'DESC' },
    }));
});
router.post('/learning-schedules', (0, auth_1.authorize)(enums_1.UserRole.TEACHER, enums_1.UserRole.ADMIN), async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.LearningSchedule);
    const entry = await repo.save(repo.create({ ...req.body, teacherId: req.user.staffId }));
    res.status(201).json(entry);
});
router.get('/weekly-assessments', (0, auth_1.authorize)(enums_1.UserRole.TEACHER, enums_1.UserRole.ADMIN, enums_1.UserRole.PARENT, enums_1.UserRole.PRINCIPAL), async (req, res) => {
    const { studentId, classId, termId, weekStart } = req.query;
    const repo = data_source_1.AppDataSource.getRepository(entities_1.WeeklyAssessment);
    const qb = repo.createQueryBuilder('a')
        .leftJoinAndSelect('a.student', 's')
        .leftJoinAndSelect('a.subject', 'sub')
        .leftJoinAndSelect('a.teacher', 't');
    if (studentId)
        qb.andWhere('a.studentId = :studentId', { studentId });
    if (classId)
        qb.andWhere('s.classId = :classId', { classId });
    if (termId)
        qb.andWhere('a.termId = :termId', { termId });
    if (weekStart)
        qb.andWhere('a.weekStart = :weekStart', { weekStart });
    res.json(await qb.orderBy('a.weekStart', 'DESC').getMany());
});
router.post('/weekly-assessments/bulk', (0, auth_1.authorize)(enums_1.UserRole.TEACHER, enums_1.UserRole.ADMIN), async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.WeeklyAssessment);
    const { assessments } = req.body;
    const saved = [];
    for (const a of assessments) {
        saved.push(await repo.save(repo.create({ ...a, teacherId: req.user.staffId })));
    }
    res.json(saved);
});
router.get('/messages', async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.Message);
    const messages = await repo.find({
        where: [{ recipientId: req.user.userId }, { senderId: req.user.userId }],
        relations: (0, typeorm_helpers_1.relations)('sender', 'recipient', 'student'),
        order: { sentAt: 'DESC' },
    });
    res.json(messages);
});
router.post('/messages', (0, auth_1.authorize)(enums_1.UserRole.TEACHER, enums_1.UserRole.PARENT, enums_1.UserRole.ADMIN), async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.Message);
    const msg = await repo.save(repo.create({ ...req.body, senderId: req.user.userId }));
    res.status(201).json(msg);
});
exports.default = router;
