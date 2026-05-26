// @ts-nocheck
import { Router, Response } from 'express';
import { In } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import { StudentAttendance, StaffAttendance, Student, Term } from '../entities';
import { UserRole } from '../entities/enums';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { today, termReportDateRange } from '../utils/helpers';
import { relations } from '../utils/typeorm-helpers';
import { assertTeacherClassAccess } from '../utils/teacher-class-access';

const router = Router();
router.use(authenticate);

router.get('/students', authorize(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.PRINCIPAL, UserRole.TEACHER, UserRole.PARENT), async (req: AuthRequest, res: Response) => {
  const { studentId, classId, date, from, to } = req.query;
  if (classId && !(await assertTeacherClassAccess(req, classId as string))) {
    return res.status(403).json({ message: 'You are not assigned to this class' });
  }

  const repo = AppDataSource.getRepository(StudentAttendance);
  const qb = repo.createQueryBuilder('a').leftJoinAndSelect('a.student', 's');

  if (studentId) qb.andWhere('a.studentId = :studentId', { studentId });
  if (classId) qb.andWhere('s.classId = :classId', { classId });
  if (date) qb.andWhere('a.date = :date', { date });
  if (from && to) qb.andWhere('a.date BETWEEN :from AND :to', { from, to });

  const records = await qb.orderBy('a.date', 'DESC').getMany();
  res.json(records);
});

router.post('/students/bulk', authorize(UserRole.TEACHER, UserRole.ADMIN), async (req: AuthRequest, res: Response) => {
  const repo = AppDataSource.getRepository(StudentAttendance);
  const studentRepo = AppDataSource.getRepository(Student);
  const { date = today(), records } = req.body;

  if (!Array.isArray(records) || !records.length) {
    return res.status(400).json({ message: 'records array is required' });
  }

  const studentIds = [...new Set(records.map((r: { studentId: string }) => r.studentId))];
  const students = await studentRepo.find({
    where: { id: In(studentIds) },
    select: { id: true, classId: true },
  });
  if (students.length !== studentIds.length) {
    return res.status(400).json({ message: 'One or more students were not found' });
  }

  const classIds = [...new Set(students.map((s) => s.classId).filter(Boolean))];
  if (classIds.length !== 1) {
    return res.status(400).json({ message: 'All students must belong to the same class' });
  }

  if (!(await assertTeacherClassAccess(req, classIds[0]!))) {
    return res.status(403).json({ message: 'You are not assigned to this class' });
  }

  const saved = [];
  for (const r of records) {
    let existing = await repo.findOne({ where: { studentId: r.studentId, date } });
    if (existing) {
      existing.status = r.status;
      existing.remarks = r.remarks;
      existing.markedById = req.user!.staffId;
      saved.push(await repo.save(existing));
    } else {
      saved.push(await repo.save(repo.create({ ...r, date, markedById: req.user!.staffId })));
    }
  }
  res.json(saved);
});

router.get(
  '/students/report',
  authorize(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.PRINCIPAL, UserRole.TEACHER),
  async (req: AuthRequest, res: Response) => {
    const classId = req.query.classId as string;
    const termId = req.query.termId as string;
    if (!classId || !termId) {
      return res.status(400).json({ message: 'classId and termId are required' });
    }

    if (!(await assertTeacherClassAccess(req, classId))) {
      return res.status(403).json({ message: 'You are not assigned to this class' });
    }

    const termRepo = AppDataSource.getRepository(Term);
    const term = await termRepo.findOne({
      where: { id: termId },
      relations: relations('schoolYear'),
    });
    if (!term) return res.status(404).json({ message: 'Term not found' });

    const { startDate, endDate, extendedEnd } = termReportDateRange(term);

    const rows = await AppDataSource.query(
      `
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
      `,
      [classId, startDate, endDate],
    );

    const classRow = await AppDataSource.query(
      `SELECT c.id, c.name, f.name AS "formName"
       FROM classes c
       LEFT JOIN forms f ON f.id = c."formId"
       WHERE c.id = $1`,
      [classId],
    );

    const students = rows.map((r: Record<string, number | string>) => {
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
  },
);

router.get('/staff', authorize(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.PRINCIPAL), async (req, res: Response) => {
  const repo = AppDataSource.getRepository(StaffAttendance);
  const { staffId, date } = req.query;
  const where: Record<string, string> = {};
  if (staffId) where.staffId = staffId as string;
  if (date) where.date = date as string;
  const records = await repo.find({ where, relations: relations('staff', 'staff.user'), order: { date: 'DESC' } });
  res.json(records);
});

router.post('/staff/bulk', authorize(UserRole.ADMIN), async (req: AuthRequest, res: Response) => {
  const repo = AppDataSource.getRepository(StaffAttendance);
  const { date = today(), records } = req.body;
  const saved = [];
  for (const r of records) {
    let existing = await repo.findOne({ where: { staffId: r.staffId, date } });
    if (existing) {
      Object.assign(existing, r);
      saved.push(await repo.save(existing));
    } else {
      saved.push(await repo.save(repo.create({ ...r, date, markedById: req.user!.userId })));
    }
  }
  res.json(saved);
});

router.get('/summary/class/:classId', authorize(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.PRINCIPAL, UserRole.TEACHER), async (req: AuthRequest, res: Response) => {
  const { date = today() } = req.query;
  if (!(await assertTeacherClassAccess(req, req.params.classId))) {
    return res.status(403).json({ message: 'You are not assigned to this class' });
  }
  const result = await AppDataSource.query(
    `
    SELECT a.status, COUNT(*) as count
    FROM student_attendance a
    JOIN students s ON s.id = a."studentId"
    WHERE s."classId" = $1 AND a.date = $2
    GROUP BY a.status
  `,
    [req.params.classId, date],
  );
  res.json(result);
});

export default router;
