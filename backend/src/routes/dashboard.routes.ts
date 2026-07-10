// @ts-nocheck
import { Router, Response } from 'express';
import { AppDataSource } from '../config/data-source';
import { SchoolSettings } from '../entities';
import { UserRole } from '../entities/enums';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { fetchSchoolOutstandingBalance } from '../services/fin-reports.service';

const router = Router();
router.use(authenticate);

router.get('/school-links', async (_req, res: Response) => {
  const settings = await AppDataSource.getRepository(SchoolSettings).findOne({
    where: { id: 'default' },
  });
  res.json({
    schoolName: settings?.schoolName?.trim() || null,
    logoUrl: settings?.logoUrl?.trim() || null,
    website: settings?.website?.trim() || null,
    facebookPageUrl: settings?.facebookPageUrl?.trim() || null,
    developerPhotoUrl: settings?.developerPhotoUrl?.trim() || null,
  });
});

router.get('/overview', authorize(UserRole.DIRECTOR, UserRole.PRINCIPAL, UserRole.ADMIN), async (_req, res: Response) => {
  const [students, staff, attendanceToday, collections, debtors, lowStock] = await Promise.all([
    AppDataSource.query(`
      SELECT
        COUNT(*)::int AS count,
        COUNT(*) FILTER (WHERE "studentType" = 'boarder')::int AS boarders,
        COUNT(*) FILTER (WHERE "studentType" IS DISTINCT FROM 'boarder')::int AS "dayScholars"
      FROM students WHERE "isActive" = true
    `),
    AppDataSource.query(`
      SELECT
        COUNT(*)::int AS count,
        COUNT(*) FILTER (
          WHERE lower(gender) = 'male'
             OR (gender IS NULL AND lower(title) = 'mr')
        )::int AS "maleStaff",
        COUNT(*) FILTER (
          WHERE lower(gender) = 'female'
             OR (gender IS NULL AND lower(title) IN ('mrs', 'ms', 'miss'))
        )::int AS "femaleStaff"
      FROM staff WHERE "isActive" = true
    `),
    AppDataSource.query(`
      SELECT status, COUNT(*) as count FROM student_attendance
      WHERE date = CURRENT_DATE GROUP BY status
    `),
    AppDataSource.query(`
      SELECT COALESCE(SUM(amount), 0) as total FROM payments
      WHERE "paidAt" >= date_trunc('month', CURRENT_DATE)
    `),
    fetchSchoolOutstandingBalance(),
    AppDataSource.query(`
      SELECT COUNT(*) as count FROM tuckshop_items
      WHERE "stockQuantity" <= "reorderLevel" AND "isActive" = true
    `),
  ]);

  res.json({
    totalStudents: Number(students[0]?.count || 0),
    boarders: Number(students[0]?.boarders || 0),
    dayScholars: Number(students[0]?.dayScholars || 0),
    totalStaff: Number(staff[0]?.count || 0),
    maleStaff: Number(staff[0]?.maleStaff || 0),
    femaleStaff: Number(staff[0]?.femaleStaff || 0),
    attendanceToday,
    monthlyCollections: Number(collections[0]?.total || 0),
    totalDebtors: Number(debtors || 0),
    lowStockItems: Number(lowStock[0]?.count || 0),
  });
});

router.get('/director', authorize(UserRole.DIRECTOR, UserRole.PRINCIPAL), async (_req, res: Response) => {
  const [
    students,
    staff,
    enrolled,
    attendanceToday,
    collections,
    debtors,
    lowStock,
    outstandingInvoices,
    cashbook,
    termRow,
    yearRow,
    topDebtors,
    recentPayments,
    classDebt,
    lowStockItems,
    paymentsLast7Days,
  ] = await Promise.all([
    AppDataSource.query(`SELECT COUNT(*)::int AS count FROM students WHERE "isActive" = true`),
    AppDataSource.query(`SELECT COUNT(*)::int AS count FROM staff WHERE "isActive" = true`),
    AppDataSource.query(`SELECT COUNT(*)::int AS count FROM students WHERE "isActive" = true AND "classId" IS NOT NULL`),
    AppDataSource.query(`
      SELECT status, COUNT(*)::int AS count FROM student_attendance
      WHERE date = CURRENT_DATE GROUP BY status ORDER BY status
    `),
    AppDataSource.query(`
      SELECT COALESCE(SUM(amount), 0) AS total FROM payments
      WHERE "paidAt" >= date_trunc('month', CURRENT_DATE)
    `),
    fetchSchoolOutstandingBalance(),
    AppDataSource.query(`
      SELECT COUNT(*)::int AS count FROM tuckshop_items
      WHERE "stockQuantity" <= "reorderLevel" AND "isActive" = true
    `),
    AppDataSource.query(`
      SELECT COUNT(*)::int AS count
      FROM invoices i
      INNER JOIN students s ON s.id = i."studentId"
      WHERE s."isActive" = true
        AND i.status IN ('sent', 'partial', 'overdue')
        AND (i."totalAmount" - i."amountPaid") > 0.005
    `),
    AppDataSource.query(`
      SELECT balance FROM cashbook_entries ORDER BY "entryDate" DESC, "createdAt" DESC LIMIT 1
    `),
    AppDataSource.query(`SELECT id, name FROM terms WHERE "isCurrent" = true ORDER BY "startDate" DESC LIMIT 1`),
    AppDataSource.query(`SELECT id, name FROM school_years WHERE "isCurrent" = true ORDER BY "startDate" DESC LIMIT 1`),
    AppDataSource.query(`
      SELECT
        s.id AS "studentId",
        s."firstName",
        s."lastName",
        s."admissionNumber",
        c.name AS "className",
        f.name AS "formName",
        COALESCE(SUM(i."totalAmount" - i."amountPaid"), 0) AS owed
      FROM students s
      LEFT JOIN classes c ON c.id = s."classId"
      LEFT JOIN forms f ON f.id = COALESCE(c."formId", s."formId")
      JOIN invoices i ON i."studentId" = s.id AND i.status IN ('sent', 'partial', 'overdue')
      WHERE s."isActive" = true AND i."totalAmount" > i."amountPaid"
      GROUP BY s.id, s."firstName", s."lastName", s."admissionNumber", c.name, f.name
      ORDER BY owed DESC
      LIMIT 5
    `),
    AppDataSource.query(`
      SELECT p.id, p.amount, p.label, p.method, p."paidAt",
        s."firstName", s."lastName", s."admissionNumber"
      FROM payments p
      JOIN students s ON s.id = p."studentId"
      ORDER BY p."paidAt" DESC
      LIMIT 5
    `),
    AppDataSource.query(`
      SELECT c.id, c.name, f.name AS "formName",
        COALESCE(SUM(i."totalAmount" - i."amountPaid"), 0) AS owed,
        COUNT(DISTINCT CASE WHEN i."totalAmount" > i."amountPaid" THEN s.id END)::int AS "studentsOwing"
      FROM classes c
      LEFT JOIN forms f ON f.id = c."formId"
      LEFT JOIN students s ON s."classId" = c.id AND s."isActive" = true
      LEFT JOIN invoices i ON i."studentId" = s.id AND i.status IN ('sent', 'partial', 'overdue')
      GROUP BY c.id, c.name, f.name
      HAVING COALESCE(SUM(i."totalAmount" - i."amountPaid"), 0) > 0
      ORDER BY owed DESC
      LIMIT 5
    `),
    AppDataSource.query(`
      SELECT name, "stockQuantity", "reorderLevel", "unitPrice"
      FROM tuckshop_items
      WHERE "stockQuantity" <= "reorderLevel" AND "isActive" = true
      ORDER BY "stockQuantity" ASC
      LIMIT 5
    `),
    AppDataSource.query(`
      SELECT to_char(p."paidAt"::date, 'YYYY-MM-DD') AS day, COALESCE(SUM(p.amount), 0) AS total
      FROM payments p
      WHERE p."paidAt" >= CURRENT_DATE - INTERVAL '6 days'
      GROUP BY day
      ORDER BY day ASC
    `),
  ]);

  const totalStudents = Number(students[0]?.count || 0);
  const enrolledStudents = Number(enrolled[0]?.count || 0);
  const monthlyCollections = Number(collections[0]?.total || 0);
  const totalDebtors = Number(debtors || 0);
  const cashBalance = Number(cashbook[0]?.balance || 0);
  const debtRatio = monthlyCollections > 0 ? (totalDebtors / monthlyCollections) * 100 : totalDebtors > 0 ? 100 : 0;
  let financeHealth = 'Healthy';
  if (debtRatio >= 80) financeHealth = 'High Risk';
  else if (debtRatio >= 40) financeHealth = 'Watch List';

  res.json({
    currentTerm: termRow[0] ? { id: termRow[0].id, name: termRow[0].name } : null,
    currentSchoolYear: yearRow[0] ? { id: yearRow[0].id, name: yearRow[0].name } : null,
    totalStudents,
    totalStaff: Number(staff[0]?.count || 0),
    enrolledStudents,
    unenrolledStudents: Math.max(0, totalStudents - enrolledStudents),
    attendanceToday,
    monthlyCollections,
    totalDebtors,
    cashBalance,
    lowStockItems: Number(lowStock[0]?.count || 0),
    outstandingInvoices: Number(outstandingInvoices[0]?.count || 0),
    debtRatio,
    financeHealth,
    topDebtors: topDebtors.map((r: Record<string, unknown>) => ({
      studentId: r.studentId,
      firstName: r.firstName,
      lastName: r.lastName,
      admissionNumber: r.admissionNumber,
      className: r.className,
      formName: r.formName,
      owed: Number(r.owed || 0),
    })),
    recentPayments: recentPayments.map((r: Record<string, unknown>) => ({
      id: r.id,
      amount: Number(r.amount || 0),
      label: r.label,
      method: r.method,
      paidAt: r.paidAt,
      firstName: r.firstName,
      lastName: r.lastName,
      admissionNumber: r.admissionNumber,
    })),
    classDebtSummary: classDebt.map((r: Record<string, unknown>) => ({
      id: r.id,
      name: r.name,
      formName: r.formName,
      owed: Number(r.owed || 0),
      studentsOwing: Number(r.studentsOwing || 0),
    })),
    lowStockAlerts: lowStockItems.map((r: Record<string, unknown>) => ({
      name: r.name,
      stockQuantity: Number(r.stockQuantity || 0),
      reorderLevel: Number(r.reorderLevel || 0),
      unitPrice: Number(r.unitPrice || 0),
    })),
    collectionsTrend: paymentsLast7Days.map((r: { day: string; total: string | number }) => ({
      day: r.day,
      total: Number(r.total || 0),
    })),
  });
});

router.get(
  '/teacher',
  authorize(UserRole.TEACHER, UserRole.ADMIN, UserRole.PRINCIPAL, UserRole.DIRECTOR),
  async (req: AuthRequest, res: Response) => {
  const staffId = req.user!.staffId;
  const userId = req.user!.userId;
  const isLeadership = [UserRole.ADMIN, UserRole.PRINCIPAL, UserRole.DIRECTOR].includes(req.user!.role);

  // Admins / principals often have no staff profile; still need class lists for LMS & shared pages.
  if (!staffId && isLeadership) {
    const allClasses = await AppDataSource.query(`
      SELECT c.id, c.name, f.name AS "formName"
      FROM classes c
      JOIN forms f ON f.id = c."formId"
      ORDER BY f.level ASC, c.name ASC
    `);
    return res.json({
      staffId: null,
      currentTerm: null,
      stats: {
        assignedClasses: allClasses.length,
        subjectsTeaching: 0,
        totalStudents: 0,
        unreadMessages: 0,
      },
      assignments: [],
      classTeacherOf: allClasses.map((c: { id: string; name: string; formName: string }) => ({
        classId: c.id,
        className: c.name,
        formName: c.formName,
        studentCount: 0,
        attendanceMarkedToday: false,
      })),
      attendanceToday: [],
      todaySchedule: [],
      assignedClasses: allClasses.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })),
    });
  }

  if (!staffId) {
    return res.json({
      staffId: null,
      currentTerm: null,
      stats: { assignedClasses: 0, subjectsTeaching: 0, totalStudents: 0, unreadMessages: 0 },
      assignments: [],
      classTeacherOf: [],
      attendanceToday: [],
      todaySchedule: [],
      assignedClasses: [],
    });
  }

  const assignments = await AppDataSource.query(
    `
    SELECT
      cs.id,
      c.id AS "classId",
      c.name AS "className",
      f.name AS "formName",
      s.id AS "subjectId",
      s.name AS "subjectName",
      s.code AS "subjectCode",
      (c."classTeacherId" = $1) AS "isClassTeacher"
    FROM class_subjects cs
    JOIN classes c ON c.id = cs."classId"
    JOIN forms f ON f.id = c."formId"
    JOIN subjects s ON s.id = cs."subjectId"
    WHERE cs."teacherId" = $1
    ORDER BY f.level ASC, c.name ASC, s.name ASC
    `,
    [staffId],
  );

  const classTeacherRows = await AppDataSource.query(
    `
    SELECT c.id AS "classId", c.name AS "className", f.name AS "formName"
    FROM classes c
    JOIN forms f ON f.id = c."formId"
    WHERE c."classTeacherId" = $1
    ORDER BY f.level ASC, c.name ASC
    `,
    [staffId],
  );

  const classIds = [...new Set([
    ...assignments.map((a: { classId: string }) => a.classId),
    ...classTeacherRows.map((c: { classId: string }) => c.classId),
  ])];

  let studentCounts: Record<string, number> = {};
  if (classIds.length) {
    const counts = await AppDataSource.query(
      `
      SELECT "classId", COUNT(*)::int AS count
      FROM students
      WHERE "classId" = ANY($1::uuid[]) AND "isActive" = true
      GROUP BY "classId"
      `,
      [classIds],
    );
    studentCounts = Object.fromEntries(counts.map((r: { classId: string; count: number }) => [r.classId, r.count]));
  }

  const assignmentsWithCounts = assignments.map((a: { classId: string }) => ({
    ...a,
    studentCount: studentCounts[a.classId] ?? 0,
    isClassTeacher: Boolean(a.isClassTeacher),
  }));

  let attendanceMarkedClassIds = new Set<string>();
  if (classIds.length) {
    const marked = await AppDataSource.query(
      `
      SELECT DISTINCT st."classId"
      FROM student_attendance sa
      JOIN students st ON st.id = sa."studentId"
      WHERE sa.date = CURRENT_DATE AND st."classId" = ANY($1::uuid[])
      `,
      [classIds],
    );
    attendanceMarkedClassIds = new Set(marked.map((r: { classId: string }) => r.classId));
  }

  const classTeacherOf = classTeacherRows.map((c: { classId: string; className: string; formName: string }) => ({
    ...c,
    studentCount: studentCounts[c.classId] ?? 0,
    attendanceMarkedToday: attendanceMarkedClassIds.has(c.classId),
  }));

  const attendanceToday = classIds.length
    ? await AppDataSource.query(
        `
        SELECT sa.status, COUNT(*)::int AS count
        FROM student_attendance sa
        JOIN students st ON st.id = sa."studentId"
        WHERE sa.date = CURRENT_DATE AND st."classId" = ANY($1::uuid[])
        GROUP BY sa.status
        ORDER BY sa.status
        `,
        [classIds],
      )
    : [];

  const totalStudents = classIds.length
    ? Number(
        (
          await AppDataSource.query(
            `
            SELECT COUNT(DISTINCT id)::int AS count
            FROM students
            WHERE "classId" = ANY($1::uuid[]) AND "isActive" = true
            `,
            [classIds],
          )
        )[0]?.count || 0,
      )
    : 0;

  const unreadRow = await AppDataSource.query(
    `SELECT COUNT(*)::int AS count FROM messages WHERE "recipientId" = $1 AND "isRead" = false`,
    [userId],
  );

  const termRow = await AppDataSource.query(
    `SELECT id, name FROM terms WHERE "isCurrent" = true ORDER BY "startDate" DESC LIMIT 1`,
  );

  const jsDay = new Date().getDay();
  const dayOfWeek = jsDay === 0 ? 7 : jsDay;
  const todaySchedule = await AppDataSource.query(
    `
    SELECT
      t.id,
      t."startTime",
      t."endTime",
      t.room,
      c.name AS "className",
      f.name AS "formName",
      s.name AS "subjectName"
    FROM timetables t
    JOIN classes c ON c.id = t."classId"
    JOIN forms f ON f.id = c."formId"
    JOIN subjects s ON s.id = t."subjectId"
    WHERE t."teacherId" = $1 AND t."dayOfWeek" = $2
    ORDER BY t."startTime" ASC
    `,
    [staffId, dayOfWeek],
  );

  res.json({
    staffId,
    currentTerm: termRow[0] ? { id: termRow[0].id, name: termRow[0].name } : null,
    stats: {
      assignedClasses: classIds.length,
      subjectsTeaching: assignments.length,
      totalStudents,
      unreadMessages: Number(unreadRow[0]?.count || 0),
    },
    assignments: assignmentsWithCounts,
    classTeacherOf,
    attendanceToday,
    todaySchedule,
    assignedClasses: classTeacherRows.length
      ? classTeacherRows.map((c: { classId: string; className: string }) => ({ id: c.classId, name: c.className }))
      : [...new Set(assignments.map((a: { classId: string; className: string }) => JSON.stringify({ id: a.classId, name: a.className })))].map((s) => JSON.parse(s)),
  });
});

router.get('/parent', authorize(UserRole.PARENT), async (req: AuthRequest, res: Response) => {
  const children = await AppDataSource.query(`
    SELECT s.*, c.name as "className", f.name as "formName",
           g.id as "linkId", g.relationship
    FROM guardians g
    JOIN students s ON s.id = g."studentId"
    LEFT JOIN classes c ON c.id = s."classId"
    LEFT JOIN forms f ON f.id = COALESCE(c."formId", s."formId")
    WHERE g."parentId" = $1 AND s."isActive" = true
    ORDER BY s."lastName", s."firstName"
  `, [req.user!.parentId]);

  const summaries = [];
  for (const child of children) {
    const [attendance, balance, recentAssessment] = await Promise.all([
      AppDataSource.query(`
        SELECT status, COUNT(*)::text as count FROM student_attendance
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
      linkId: child.linkId,
      relationship: child.relationship,
      student: child,
      attendance,
      balanceOwed: Number(balance[0]?.owed || 0),
      recentAssessments: recentAssessment,
    });
  }

  res.json(summaries);
});

router.get('/student', authorize(UserRole.STUDENT), async (req: AuthRequest, res: Response) => {
  const studentId = req.user!.studentId;
  if (!studentId) {
    return res.json({
      student: null,
      currentTerm: null,
      balanceOwed: 0,
      attendance: [],
      recentAssessments: [],
      recentClassAssignments: [],
      recentSchedules: [],
      unreadMessages: 0,
    });
  }

  const studentRows = await AppDataSource.query(
    `
    SELECT s.*, c.name AS "className", f.name AS "formName"
    FROM students s
    LEFT JOIN classes c ON c.id = s."classId"
    LEFT JOIN forms f ON f.id = COALESCE(c."formId", s."formId")
    WHERE s.id = $1 AND s."isActive" = true
    LIMIT 1
    `,
    [studentId],
  );
  const student = studentRows[0] || null;

  const [attendance, balance, recentAssessment, unreadRow, termRow, recentSchedules, recentClassAssignments] = await Promise.all([
    AppDataSource.query(
      `
      SELECT status, COUNT(*)::text AS count FROM student_attendance
      WHERE "studentId" = $1 AND date >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY status
      `,
      [studentId],
    ),
    AppDataSource.query(
      `
      SELECT COALESCE(SUM("totalAmount" - "amountPaid"), 0) AS owed
      FROM invoices WHERE "studentId" = $1 AND status IN ('sent','partial','overdue')
      `,
      [studentId],
    ),
    AppDataSource.query(
      `
      SELECT a.*, sub.name AS "subjectName"
      FROM weekly_assessments a
      LEFT JOIN subjects sub ON sub.id = a."subjectId"
      WHERE a."studentId" = $1
      ORDER BY a."weekStart" DESC
      LIMIT 8
      `,
      [studentId],
    ),
    AppDataSource.query(
      `SELECT COUNT(*)::int AS count FROM messages WHERE "recipientId" = $1 AND "isRead" = false`,
      [req.user!.userId],
    ),
    AppDataSource.query(`SELECT id, name FROM terms WHERE "isCurrent" = true ORDER BY "startDate" DESC LIMIT 1`),
    student?.classId
      ? AppDataSource.query(
          `
          SELECT ls.*, sub.name AS "subjectName", sub.code AS "subjectCode"
          FROM learning_schedules ls
          LEFT JOIN subjects sub ON sub.id = ls."subjectId"
          WHERE ls."classId" = $1
          ORDER BY ls."weekStart" DESC
          LIMIT 6
          `,
          [student.classId],
        )
      : Promise.resolve([]),
    student?.classId
      ? AppDataSource.query(
          `
          SELECT ha.id, ha.title, ha.instructions, ha."originalFileName", ha."storedFileName",
                 ha."mimeType", ha."fileSize", ha."dueDate", ha."createdAt",
                 sub.name AS "subjectName",
                 TRIM(CONCAT(u."firstName", ' ', u."lastName")) AS "teacherName"
          FROM homework_assignments ha
          LEFT JOIN subjects sub ON sub.id = ha."subjectId"
          LEFT JOIN staff st ON st.id = ha."teacherId"
          LEFT JOIN users u ON u.id = st."userId"
          WHERE ha."classId" = $1
          ORDER BY ha."createdAt" DESC
          LIMIT 8
          `,
          [student.classId],
        )
      : Promise.resolve([]),
  ]);

  res.json({
    student,
    currentTerm: termRow[0] ? { id: termRow[0].id, name: termRow[0].name } : null,
    balanceOwed: Number(balance[0]?.owed || 0),
    attendance,
    recentAssessments: recentAssessment,
    recentClassAssignments: recentClassAssignments.map((row: {
      storedFileName: string;
      [key: string]: unknown;
    }) => ({
      ...row,
      fileUrl: `/uploads/homework-assignments/${row.storedFileName}`,
    })),
    recentSchedules,
    unreadMessages: Number(unreadRow[0]?.count || 0),
  });
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


