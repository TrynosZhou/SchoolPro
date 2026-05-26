"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-nocheck
const express_1 = require("express");
const typeorm_1 = require("typeorm");
const data_source_1 = require("../config/data-source");
const entities_1 = require("../entities");
const enums_1 = require("../entities/enums");
const auth_1 = require("../middleware/auth");
const helpers_1 = require("../utils/helpers");
const typeorm_helpers_1 = require("../utils/typeorm-helpers");
const teacher_class_access_1 = require("../utils/teacher-class-access");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
router.get('/students', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.TEACHER, enums_1.UserRole.PARENT), async (req, res) => {
    const { studentId, classId, date, from, to } = req.query;
    if (classId && !(await (0, teacher_class_access_1.assertTeacherClassAccess)(req, classId))) {
        return res.status(403).json({ message: 'You are not assigned to this class' });
    }
    const repo = data_source_1.AppDataSource.getRepository(entities_1.StudentAttendance);
    const qb = repo.createQueryBuilder('a').leftJoinAndSelect('a.student', 's');
    if (studentId)
        qb.andWhere('a.studentId = :studentId', { studentId });
    if (classId)
        qb.andWhere('s.classId = :classId', { classId });
    if (date)
        qb.andWhere('a.date = :date', { date });
    if (from && to)
        qb.andWhere('a.date BETWEEN :from AND :to', { from, to });
    const records = await qb.orderBy('a.date', 'DESC').getMany();
    res.json(records);
});
router.post('/students/bulk', (0, auth_1.authorize)(enums_1.UserRole.TEACHER, enums_1.UserRole.ADMIN), async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.StudentAttendance);
    const studentRepo = data_source_1.AppDataSource.getRepository(entities_1.Student);
    const { date = (0, helpers_1.today)(), records } = req.body;
    if (!Array.isArray(records) || !records.length) {
        return res.status(400).json({ message: 'records array is required' });
    }
    const studentIds = [...new Set(records.map((r) => r.studentId))];
    const students = await studentRepo.find({
        where: { id: (0, typeorm_1.In)(studentIds) },
        select: { id: true, classId: true },
    });
    if (students.length !== studentIds.length) {
        return res.status(400).json({ message: 'One or more students were not found' });
    }
    const classIds = [...new Set(students.map((s) => s.classId).filter(Boolean))];
    if (classIds.length !== 1) {
        return res.status(400).json({ message: 'All students must belong to the same class' });
    }
    if (!(await (0, teacher_class_access_1.assertTeacherClassAccess)(req, classIds[0]))) {
        return res.status(403).json({ message: 'You are not assigned to this class' });
    }
    const saved = [];
    for (const r of records) {
        let existing = await repo.findOne({ where: { studentId: r.studentId, date } });
        if (existing) {
            existing.status = r.status;
            existing.remarks = r.remarks;
            existing.markedById = req.user.staffId;
            saved.push(await repo.save(existing));
        }
        else {
            saved.push(await repo.save(repo.create({ ...r, date, markedById: req.user.staffId })));
        }
    }
    res.json(saved);
});
router.get('/students/report', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.TEACHER), async (req, res) => {
    const classId = req.query.classId;
    const termId = req.query.termId;
    if (!classId || !termId) {
        return res.status(400).json({ message: 'classId and termId are required' });
    }
    if (!(await (0, teacher_class_access_1.assertTeacherClassAccess)(req, classId))) {
        return res.status(403).json({ message: 'You are not assigned to this class' });
    }
    const termRepo = data_source_1.AppDataSource.getRepository(entities_1.Term);
    const term = await termRepo.findOne({
        where: { id: termId },
        relations: (0, typeorm_helpers_1.relations)('schoolYear'),
    });
    if (!term)
        return res.status(404).json({ message: 'Term not found' });
    const { startDate, endDate, extendedEnd } = (0, helpers_1.termReportDateRange)(term);
    const rows = await data_source_1.AppDataSource.query(`
      SELECT
        s.id AS "studentId",
        s."admissionNumber",
        s."firstName",
        s."lastName",
        COUNT(a.id)::int AS "daysMarked",
        COUNT(*) FILTER (WHERE a.status::text = 'present')::int AS present,
        COUNT(*) FILTER (WHERE a.status::text = 'absent')::int AS absent,
        COUNT(*) FILTER (WHERE a.status::text = 'late')::int AS late,
        COUNT(*) FILTER (WHERE a.status::text = 'excused')::int AS excused
      FROM students s
      LEFT JOIN student_attendance a
        ON a."studentId" = s.id
        AND a.date::date >= $2::date
        AND a.date::date <= $3::date
      WHERE s."classId" = $1 AND s."isActive" = true
      GROUP BY s.id, s."admissionNumber", s."firstName", s."lastName"
      ORDER BY s."lastName" ASC, s."firstName" ASC
      `, [classId, startDate, endDate]);
    const classRow = await data_source_1.AppDataSource.query(`SELECT c.id, c.name, f.name AS "formName"
       FROM classes c
       LEFT JOIN forms f ON f.id = c."formId"
       WHERE c.id = $1`, [classId]);
    const students = rows.map((r) => {
        const daysMarked = Number(r.daysMarked) || 0;
        const present = Number(r.present) || 0;
        const absent = Number(r.absent) || 0;
        const late = Number(r.late) || 0;
        const excused = Number(r.excused) || 0;
        const attendancePercent = daysMarked
            ? Math.round(((present + late) / daysMarked) * 1000) / 10
            : null;
        return {
            studentId: r.studentId,
            admissionNumber: r.admissionNumber,
            firstName: r.firstName,
            lastName: r.lastName,
            daysMarked,
            present,
            absent,
            late,
            excused,
            attendancePercent,
        };
    });
    res.json({
        term: {
            id: term.id,
            name: term.name,
            startDate,
            endDate,
            configuredEndDate: term.endDate,
            extendedEnd,
            schoolYear: term.schoolYear?.name,
        },
        class: classRow[0] || { id: classId },
        students,
    });
});
router.get('/staff', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL), async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.StaffAttendance);
    const { staffId, date } = req.query;
    const where = {};
    if (staffId)
        where.staffId = staffId;
    if (date)
        where.date = date;
    const records = await repo.find({ where, relations: (0, typeorm_helpers_1.relations)('staff', 'staff.user'), order: { date: 'DESC' } });
    res.json(records);
});
router.post('/staff/bulk', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.StaffAttendance);
    const { date = (0, helpers_1.today)(), records } = req.body;
    const saved = [];
    for (const r of records) {
        let existing = await repo.findOne({ where: { staffId: r.staffId, date } });
        if (existing) {
            Object.assign(existing, r);
            saved.push(await repo.save(existing));
        }
        else {
            saved.push(await repo.save(repo.create({ ...r, date, markedById: req.user.userId })));
        }
    }
    res.json(saved);
});
router.get('/summary/class/:classId', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.TEACHER), async (req, res) => {
    const { date = (0, helpers_1.today)() } = req.query;
    if (!(await (0, teacher_class_access_1.assertTeacherClassAccess)(req, req.params.classId))) {
        return res.status(403).json({ message: 'You are not assigned to this class' });
    }
    const result = await data_source_1.AppDataSource.query(`
    SELECT a.status, COUNT(*) as count
    FROM student_attendance a
    JOIN students s ON s.id = a."studentId"
    WHERE s."classId" = $1 AND a.date = $2
    GROUP BY a.status
  `, [req.params.classId, date]);
    res.json(result);
});
exports.default = router;
