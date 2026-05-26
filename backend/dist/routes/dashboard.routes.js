"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-nocheck
const express_1 = require("express");
const data_source_1 = require("../config/data-source");
const enums_1 = require("../entities/enums");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
router.get('/overview', (0, auth_1.authorize)(enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.ADMIN), async (_req, res) => {
    const [students, staff, attendanceToday, collections, debtors, lowStock] = await Promise.all([
        data_source_1.AppDataSource.query(`SELECT COUNT(*) as count FROM students WHERE "isActive" = true`),
        data_source_1.AppDataSource.query(`SELECT COUNT(*) as count FROM staff WHERE "isActive" = true`),
        data_source_1.AppDataSource.query(`
      SELECT status, COUNT(*) as count FROM student_attendance
      WHERE date = CURRENT_DATE GROUP BY status
    `),
        data_source_1.AppDataSource.query(`
      SELECT COALESCE(SUM(amount), 0) as total FROM payments
      WHERE "paidAt" >= date_trunc('month', CURRENT_DATE)
    `),
        data_source_1.AppDataSource.query(`
      SELECT COALESCE(SUM("totalAmount" - "amountPaid"), 0) as total
      FROM invoices WHERE status IN ('sent', 'partial', 'overdue')
    `),
        data_source_1.AppDataSource.query(`
      SELECT COUNT(*) as count FROM tuckshop_items
      WHERE "stockQuantity" <= "reorderLevel" AND "isActive" = true
    `),
    ]);
    res.json({
        totalStudents: Number(students[0]?.count || 0),
        totalStaff: Number(staff[0]?.count || 0),
        attendanceToday,
        monthlyCollections: Number(collections[0]?.total || 0),
        totalDebtors: Number(debtors[0]?.total || 0),
        lowStockItems: Number(lowStock[0]?.count || 0),
    });
});
router.get('/teacher', (0, auth_1.authorize)(enums_1.UserRole.TEACHER), async (req, res) => {
    const staffId = req.user.staffId;
    const classes = await data_source_1.AppDataSource.query(`
    SELECT DISTINCT c.* FROM classes c
    JOIN class_subjects cs ON cs."classId" = c.id
    WHERE cs."teacherId" = $1
  `, [staffId]);
    res.json({ assignedClasses: classes, staffId });
});
router.get('/parent', (0, auth_1.authorize)(enums_1.UserRole.PARENT), async (req, res) => {
    const children = await data_source_1.AppDataSource.query(`
    SELECT s.*, c.name as "className", f.name as "formName"
    FROM guardians g
    JOIN students s ON s.id = g."studentId"
    LEFT JOIN classes c ON c.id = s."classId"
    LEFT JOIN forms f ON f.id = c."formId"
    WHERE g."parentId" = $1
  `, [req.user.parentId]);
    const summaries = [];
    for (const child of children) {
        const [attendance, balance, recentAssessment] = await Promise.all([
            data_source_1.AppDataSource.query(`
        SELECT status, COUNT(*) FROM student_attendance
        WHERE "studentId" = $1 AND date >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY status
      `, [child.id]),
            data_source_1.AppDataSource.query(`
        SELECT COALESCE(SUM("totalAmount" - "amountPaid"), 0) as owed
        FROM invoices WHERE "studentId" = $1 AND status IN ('sent','partial','overdue')
      `, [child.id]),
            data_source_1.AppDataSource.query(`
        SELECT * FROM weekly_assessments WHERE "studentId" = $1
        ORDER BY "weekStart" DESC LIMIT 5
      `, [child.id]),
        ]);
        summaries.push({
            student: child,
            attendance: attendance,
            balanceOwed: Number(balance[0]?.owed || 0),
            recentAssessments: recentAssessment,
        });
    }
    res.json(summaries);
});
router.get('/notifications', async (req, res) => {
    const notifs = await data_source_1.AppDataSource.query(`
    SELECT * FROM notifications
    WHERE "userId" = $1 OR "userId" IS NULL
    ORDER BY "createdAt" DESC LIMIT 50
  `, [req.user.userId]);
    res.json(notifs);
});
exports.default = router;
