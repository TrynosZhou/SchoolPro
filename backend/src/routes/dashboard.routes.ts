// @ts-nocheck
import { Router, Response } from 'express';
import { AppDataSource } from '../config/data-source';
import { UserRole } from '../entities/enums';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/overview', authorize(UserRole.DIRECTOR, UserRole.PRINCIPAL, UserRole.ADMIN), async (_req, res: Response) => {
  const [students, staff, attendanceToday, collections, debtors, lowStock] = await Promise.all([
    AppDataSource.query(`SELECT COUNT(*) as count FROM students WHERE "isActive" = true`),
    AppDataSource.query(`SELECT COUNT(*) as count FROM staff WHERE "isActive" = true`),
    AppDataSource.query(`
      SELECT status, COUNT(*) as count FROM student_attendance
      WHERE date = CURRENT_DATE GROUP BY status
    `),
    AppDataSource.query(`
      SELECT COALESCE(SUM(amount), 0) as total FROM payments
      WHERE "paidAt" >= date_trunc('month', CURRENT_DATE)
    `),
    AppDataSource.query(`
      SELECT COALESCE(SUM("totalAmount" - "amountPaid"), 0) as total
      FROM invoices WHERE status IN ('sent', 'partial', 'overdue')
    `),
    AppDataSource.query(`
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

router.get('/teacher', authorize(UserRole.TEACHER), async (req: AuthRequest, res: Response) => {
  const staffId = req.user!.staffId;
  const classes = await AppDataSource.query(`
    SELECT DISTINCT c.* FROM classes c
    JOIN class_subjects cs ON cs."classId" = c.id
    WHERE cs."teacherId" = $1
  `, [staffId]);

  res.json({ assignedClasses: classes, staffId });
});

router.get('/parent', authorize(UserRole.PARENT), async (req: AuthRequest, res: Response) => {
  const children = await AppDataSource.query(`
    SELECT s.*, c.name as "className", f.name as "formName"
    FROM guardians g
    JOIN students s ON s.id = g."studentId"
    LEFT JOIN classes c ON c.id = s."classId"
    LEFT JOIN forms f ON f.id = c."formId"
    WHERE g."parentId" = $1
  `, [req.user!.parentId]);

  const summaries = [];
  for (const child of children) {
    const [attendance, balance, recentAssessment] = await Promise.all([
      AppDataSource.query(`
        SELECT status, COUNT(*) FROM student_attendance
        WHERE "studentId" = $1 AND date >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY status
      `, [child.id]),
      AppDataSource.query(`
        SELECT COALESCE(SUM("totalAmount" - "amountPaid"), 0) as owed
        FROM invoices WHERE "studentId" = $1 AND status IN ('sent','partial','overdue')
      `, [child.id]),
      AppDataSource.query(`
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

router.get('/notifications', async (req: AuthRequest, res: Response) => {
  const notifs = await AppDataSource.query(`
    SELECT * FROM notifications
    WHERE "userId" = $1 OR "userId" IS NULL
    ORDER BY "createdAt" DESC LIMIT 50
  `, [req.user!.userId]);
  res.json(notifs);
});

export default router;


