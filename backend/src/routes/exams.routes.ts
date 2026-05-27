// @ts-nocheck
import { Router, Response } from 'express';
import { AppDataSource } from '../config/data-source';
import { ExamType, ExamMark, ReportCard, Student, HonourRoll, SchoolYear, SchoolSettings } from '../entities';
import { UserRole } from '../entities/enums';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { gradeForMarks } from '../services/grade.service';
import { ClassSubject } from '../entities';
import { calculateHonoursRoll } from '../services/honours.service';
import { generateClassReportCards, syncReportCardForStudent } from '../services/report-card.service';
import { generateMarkSheetPdf, generateRankingsPdf, generateReportCardPdf } from '../utils/pdf';
import { buildMarkSheet } from '../services/mark-sheet.service';
import { buildResultsAnalysis } from '../services/results-analysis.service';
import { buildRankings, RankingType } from '../services/ranking.service';
import { relations } from '../utils/typeorm-helpers';

const router = Router();
router.use(authenticate);

router.get('/types', async (_req, res: Response) => {
  const repo = AppDataSource.getRepository(ExamType);
  res.json(await repo.find());
});

router.get('/terms', authorize(UserRole.TEACHER, UserRole.ADMIN, UserRole.PRINCIPAL, UserRole.DIRECTOR), async (_req, res: Response) => {
  const years = await AppDataSource.getRepository(SchoolYear).find({
    relations: relations('terms'),
    order: { startDate: 'DESC' },
  });
  const terms = years.flatMap((y) => y.terms || []).sort((a, b) => a.name.localeCompare(b.name));
  res.json(terms);
});

router.get('/class-subjects', authorize(UserRole.TEACHER, UserRole.ADMIN, UserRole.PRINCIPAL, UserRole.DIRECTOR), async (req, res: Response) => {
  const { classId } = req.query;
  if (!classId) return res.status(400).json({ message: 'classId is required' });
  const rows = await AppDataSource.getRepository(ClassSubject).find({
    where: { classId: classId as string },
    relations: relations('subject'),
    order: { subject: { name: 'ASC' } },
  });
  res.json(rows.map((r) => r.subject).filter(Boolean));
});

router.get('/marks/entry', authorize(UserRole.TEACHER, UserRole.ADMIN, UserRole.PRINCIPAL, UserRole.DIRECTOR), async (req, res: Response) => {
  const { classId, subjectId, examTypeId, termId } = req.query;
  if (!classId || !subjectId || !examTypeId || !termId) {
    return res.status(400).json({ message: 'classId, subjectId, examTypeId, and termId are required' });
  }

  const examType = await AppDataSource.getRepository(ExamType).findOne({ where: { id: examTypeId as string } });
  const studentRepo = AppDataSource.getRepository(Student);
  const markRepo = AppDataSource.getRepository(ExamMark);

  const students = await studentRepo.find({
    where: { classId: classId as string, isActive: true },
    order: { lastName: 'ASC', firstName: 'ASC' },
  });

  const existing = await markRepo.find({
    where: {
      classId: classId as string,
      subjectId: subjectId as string,
      examTypeId: examTypeId as string,
      termId: termId as string,
    },
  });
  const markByStudent = new Map(existing.map((m) => [m.studentId, m]));

  res.json({
    maxMarks: examType ? Number(examType.maxMarks) : 100,
    examTypeName: examType?.name,
    students: students.map((s) => {
      const m = markByStudent.get(s.id);
      return {
        studentId: s.id,
        studentNumber: s.admissionNumber,
        lastName: s.lastName,
        firstName: s.firstName,
        gender: s.gender || '—',
        marks: m != null ? Number(m.marks) : null,
        remarks: m?.remarks || '',
        grade: m?.grade || null,
        markId: m?.id || null,
      };
    }),
  });
});

router.get('/marks', authorize(UserRole.TEACHER, UserRole.ADMIN, UserRole.PRINCIPAL, UserRole.DIRECTOR, UserRole.PARENT, UserRole.STUDENT), async (req, res: Response) => {
  const repo = AppDataSource.getRepository(ExamMark);
  const { classId, subjectId, termId, examTypeId, studentId } = req.query;
  const where: Record<string, string> = {};
  if (classId) where.classId = classId as string;
  if (subjectId) where.subjectId = subjectId as string;
  if (termId) where.termId = termId as string;
  if (examTypeId) where.examTypeId = examTypeId as string;
  if (studentId) where.studentId = studentId as string;

  const marks = await repo.find({
    where,
    relations: relations('student', 'subject', 'examType', 'term', 'enteredBy', 'enteredBy.user'),
    order: { student: { lastName: 'ASC' } },
  });
  res.json(marks);
});

async function upsertExamMark(
  repo: ReturnType<typeof AppDataSource.getRepository<ExamMark>>,
  data: {
    studentId: string;
    examTypeId: string;
    classId: string;
    subjectId: string;
    termId: string;
    marks: number;
    remarks?: string;
    enteredById?: string;
  }
) {
  const examType = await AppDataSource.getRepository(ExamType).findOne({ where: { id: data.examTypeId } });
  const maxMarks = examType ? Number(examType.maxMarks) : 100;
  const grade = await gradeForMarks(data.marks, maxMarks);

  let existing = await repo.findOne({
    where: {
      studentId: data.studentId,
      examTypeId: data.examTypeId,
      subjectId: data.subjectId,
      termId: data.termId,
    },
  });

  if (existing) {
    existing.marks = data.marks;
    existing.grade = grade;
    existing.remarks = data.remarks ?? existing.remarks;
    existing.classId = data.classId;
    if (data.enteredById) existing.enteredById = data.enteredById;
  } else {
    existing = repo.create({
      ...data,
      grade,
    });
  }

  const saved = await repo.save(existing);
  await syncReportCardForStudent(data.studentId, data.termId);
  return saved;
}

router.post('/marks/save-one', authorize(UserRole.TEACHER, UserRole.ADMIN, UserRole.PRINCIPAL, UserRole.DIRECTOR), async (req: AuthRequest, res: Response) => {
  const { studentId, examTypeId, classId, subjectId, termId, marks, remarks } = req.body;
  if (!studentId || !examTypeId || !classId || !subjectId || !termId) {
    return res.status(400).json({ message: 'Missing required fields' });
  }
  if (marks === null || marks === undefined || marks === '') {
    return res.status(400).json({ message: 'Marks value required' });
  }

  const repo = AppDataSource.getRepository(ExamMark);
  const saved = await upsertExamMark(repo, {
    studentId,
    examTypeId,
    classId,
    subjectId,
    termId,
    marks: Number(marks),
    remarks: remarks || '',
    enteredById: req.user!.staffId,
  });
  res.json(saved);
});

router.post('/marks/bulk', authorize(UserRole.TEACHER, UserRole.ADMIN, UserRole.PRINCIPAL, UserRole.DIRECTOR), async (req: AuthRequest, res: Response) => {
  const repo = AppDataSource.getRepository(ExamMark);
  const { examTypeId, classId, subjectId, termId, marks } = req.body;
  const saved = [];
  const syncedStudents = new Set<string>();

  for (const m of marks) {
    if (m.marks === null || m.marks === undefined || m.marks === '') continue;
    const row = await upsertExamMark(repo, {
      studentId: m.studentId,
      examTypeId,
      classId,
      subjectId,
      termId,
      marks: Number(m.marks),
      remarks: m.remarks || '',
      enteredById: req.user!.staffId,
    });
    saved.push(row);
    syncedStudents.add(m.studentId);
  }

  res.json({ saved: saved.length, students: syncedStudents.size });
});

router.post('/report-cards/generate', authorize(UserRole.ADMIN, UserRole.PRINCIPAL), async (req, res: Response) => {
  const { termId, classId } = req.body;
  const markRepo = AppDataSource.getRepository(ExamMark);
  const reportRepo = AppDataSource.getRepository(ReportCard);
  const studentRepo = AppDataSource.getRepository(Student);

  await calculateHonoursRoll(termId, classId);

  const students = await studentRepo.find({
    where: classId ? { classId, isActive: true } : { isActive: true },
    relations: relations('schoolClass', 'schoolClass.form'),
  });

  const generated = [];
  for (const student of students) {
    const marks = await markRepo.find({
      where: { studentId: student.id, termId },
      relations: relations('subject', 'examType'),
    });
    if (!marks.length) continue;

    const subjectMap = new Map<string, { marks: number; count: number; remarks?: string }>();
    for (const m of marks) {
      const key = m.subject.name;
      const cur = subjectMap.get(key) || { marks: 0, count: 0 };
      cur.marks += Number(m.marks);
      cur.count += 1;
      if (m.remarks) cur.remarks = m.remarks;
      subjectMap.set(key, cur);
    }

    const subjectResults = await Promise.all(
      [...subjectMap.entries()].map(async ([subject, v]) => {
        const avgMark = v.marks / v.count;
        return {
          subject,
          marks: Math.round(avgMark),
          grade: await gradeForMarks(avgMark),
          remarks: v.remarks,
        };
      })
    );

    const avg = subjectResults.reduce((s, r) => s + r.marks, 0) / subjectResults.length;

    const honour = await AppDataSource.getRepository('HonourRoll' as never).findOne?.({
      where: { studentId: student.id, termId },
    }).catch(() => null);

    let report = await reportRepo.findOne({ where: { studentId: student.id, termId } });
    if (!report) {
      report = reportRepo.create({ studentId: student.id, termId });
    }
    report.subjectResults = subjectResults;
    report.averageMark = avg;
    report.overallGrade = await gradeForMarks(avg);
    report.isPublished = true;
    await reportRepo.save(report);
    generated.push(report);
  }

  res.json({ message: `Generated ${generated.length} report cards`, count: generated.length });
});

router.get(
  '/mark-sheet',
  authorize(UserRole.ADMIN, UserRole.PRINCIPAL, UserRole.DIRECTOR, UserRole.TEACHER),
  async (req, res: Response) => {
    const { examTypeId, termId, classId } = req.query;
    if (!examTypeId || !termId || !classId) {
      return res.status(400).json({ message: 'examTypeId, termId, and classId are required' });
    }
    try {
      const sheet = await buildMarkSheet({
        examTypeId: examTypeId as string,
        termId: termId as string,
        classId: classId as string,
      });
      if (!sheet.subjects.length) {
        return res.status(404).json({
          message: 'No subjects assigned to this class. Add subjects in School Settings first.',
        });
      }
      const hasAnyMarks = sheet.students.some((s) =>
        Object.values(s.marksBySubject).some((c) => c.marks != null),
      );
      if (!hasAnyMarks) {
        return res.status(404).json({
          message: 'No exam marks found for this class, exam type, and term. Enter marks first.',
        });
      }
      res.json(sheet);
    } catch (err) {
      return res.status(400).json({ message: err instanceof Error ? err.message : 'Failed to build mark sheet' });
    }
  },
);

router.get(
  '/results-analysis',
  authorize(UserRole.ADMIN, UserRole.PRINCIPAL, UserRole.DIRECTOR, UserRole.TEACHER),
  async (req, res: Response) => {
    const { examTypeId, termId, classId, topN } = req.query;
    if (!examTypeId || !termId || !classId) {
      return res.status(400).json({ message: 'examTypeId, termId, and classId are required' });
    }
    try {
      const analysis = await buildResultsAnalysis({
        examTypeId: examTypeId as string,
        termId: termId as string,
        classId: classId as string,
        topN: topN ? Number(topN) : undefined,
      });
      if (analysis.summary.studentsWithExamMarks === 0) {
        return res.status(404).json({
          message: 'No exam marks found for this class, exam type, and term. Enter marks first.',
        });
      }
      res.json(analysis);
    } catch (err) {
      return res.status(400).json({
        message: err instanceof Error ? err.message : 'Failed to build results analysis',
      });
    }
  },
);

router.get(
  '/rankings',
  authorize(UserRole.ADMIN, UserRole.PRINCIPAL, UserRole.DIRECTOR, UserRole.TEACHER),
  async (req, res: Response) => {
    const { examTypeId, termId, rankingType, classId, formId, subjectId } = req.query;
    if (!examTypeId || !termId || !rankingType) {
      return res.status(400).json({ message: 'examTypeId, termId, and rankingType are required' });
    }
    const type = rankingType as RankingType;
    if (!['class', 'form', 'subject'].includes(type)) {
      return res.status(400).json({ message: 'rankingType must be class, form, or subject' });
    }
    try {
      const rankings = await buildRankings({
        examTypeId: examTypeId as string,
        termId: termId as string,
        rankingType: type,
        classId: classId as string | undefined,
        formId: formId as string | undefined,
        subjectId: subjectId as string | undefined,
      });
      if (!rankings.students.length) {
        return res.status(404).json({
          message: 'No ranked students found for this selection. Enter exam marks first.',
        });
      }
      res.json(rankings);
    } catch (err) {
      return res.status(400).json({
        message: err instanceof Error ? err.message : 'Failed to build rankings',
      });
    }
  },
);

router.get(
  '/rankings/pdf',
  authorize(UserRole.ADMIN, UserRole.PRINCIPAL, UserRole.DIRECTOR, UserRole.TEACHER),
  async (req, res: Response) => {
    const { examTypeId, termId, rankingType, classId, formId, subjectId } = req.query;
    if (!examTypeId || !termId || !rankingType) {
      return res.status(400).json({ message: 'examTypeId, termId, and rankingType are required' });
    }
    const type = rankingType as RankingType;
    if (!['class', 'form', 'subject'].includes(type)) {
      return res.status(400).json({ message: 'rankingType must be class, form, or subject' });
    }
    try {
      const rankings = await buildRankings({
        examTypeId: examTypeId as string,
        termId: termId as string,
        rankingType: type,
        classId: classId as string | undefined,
        formId: formId as string | undefined,
        subjectId: subjectId as string | undefined,
      });
      if (!rankings.students.length) {
        return res.status(404).json({
          message: 'No ranked students found for this selection. Enter exam marks first.',
        });
      }

      const scopeParts: string[] = [];
      if (rankings.class) scopeParts.push(`Class: ${rankings.class.name}`);
      if (rankings.form) scopeParts.push(`Form: ${rankings.form.name}`);
      if (rankings.subject) scopeParts.push(`Subject: ${rankings.subject.name}`);

      const pdf = await generateRankingsPdf({
        schoolName: rankings.schoolName,
        tagline: rankings.tagline,
        logoUrl: rankings.logoUrl,
        rankingType: rankings.rankingType,
        rankingLabel: rankings.rankingLabel,
        examTypeName: rankings.examType.name,
        termName: rankings.term.name,
        scopeLabel: scopeParts.join(' · '),
        maxMarks: rankings.examType.maxMarks,
        generatedAt: new Date(),
        students: rankings.students,
      });

      const safeName = rankings.rankingLabel.replace(/[^\w\-]+/g, '-').replace(/-+/g, '-');
      const filename = `rankings-${safeName}.pdf`;
      const inline = req.query.preview === 'true';

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `${inline ? 'inline' : 'attachment'}; filename="${filename}"`,
      );
      res.send(pdf);
    } catch (err) {
      return res.status(400).json({
        message: err instanceof Error ? err.message : 'Failed to generate rankings PDF',
      });
    }
  },
);

router.get(
  '/mark-sheet/pdf',
  authorize(UserRole.ADMIN, UserRole.PRINCIPAL, UserRole.DIRECTOR, UserRole.TEACHER),
  async (req, res: Response) => {
    const { examTypeId, termId, classId } = req.query;
    if (!examTypeId || !termId || !classId) {
      return res.status(400).json({ message: 'examTypeId, termId, and classId are required' });
    }
    try {
      const sheet = await buildMarkSheet({
        examTypeId: examTypeId as string,
        termId: termId as string,
        classId: classId as string,
      });
      if (!sheet.subjects.length) {
        return res.status(404).json({ message: 'No subjects assigned to this class.' });
      }

      const pdf = await generateMarkSheetPdf({
        schoolName: sheet.schoolName,
        tagline: sheet.tagline,
        logoUrl: sheet.logoUrl,
        examTypeName: sheet.examType.name,
        termName: sheet.term.name,
        className: sheet.class.name,
        maxMarks: sheet.examType.maxMarks,
        generatedAt: new Date(),
        subjects: sheet.subjects.map((s) => ({ code: s.code, name: s.name })),
        students: sheet.students.map((row) => ({
          position: row.position,
          admissionNumber: row.admissionNumber,
          lastName: row.lastName,
          firstName: row.firstName,
          gender: row.gender,
          subjectCount: row.subjectCount,
          subjectsPassed: row.subjectsPassed,
          averagePercent: row.averagePercent,
          gradeCounts: row.gradeCounts,
          cells: sheet.subjects.map((sub) => row.marksBySubject[sub.id]?.marks ?? null),
        })),
      });

      const safeName = `${sheet.class.name}-${sheet.examType.name}`.replace(/[^\w\-]+/g, '-').replace(/-+/g, '-');
      const filename = `mark-sheet-${safeName}.pdf`;
      const inline = req.query.preview === 'true';

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `${inline ? 'inline' : 'attachment'}; filename="${filename}"`,
      );
      res.send(pdf);
    } catch (err) {
      return res.status(400).json({ message: err instanceof Error ? err.message : 'Failed to generate PDF' });
    }
  },
);

router.post(
  '/report-cards/generate-class',
  authorize(UserRole.ADMIN, UserRole.PRINCIPAL, UserRole.DIRECTOR, UserRole.TEACHER),
  async (req, res: Response) => {
    const { examTypeId, termId, classId } = req.body;
    if (!examTypeId || !termId || !classId) {
      return res.status(400).json({ message: 'examTypeId, termId, and classId are required' });
    }
    try {
      const result = await generateClassReportCards({ examTypeId, termId, classId });
      if (!result.count) {
        return res.status(404).json({
          message: 'No exam marks found for this class, exam type, and term. Enter marks first.',
        });
      }
      res.json(result);
    } catch (err) {
      return res.status(400).json({ message: err instanceof Error ? err.message : 'Generation failed' });
    }
  },
);

router.get(
  '/report-cards/by-class',
  authorize(UserRole.ADMIN, UserRole.PRINCIPAL, UserRole.DIRECTOR, UserRole.TEACHER),
  async (req, res: Response) => {
    const { examTypeId, termId, classId } = req.query;
    if (!examTypeId || !termId || !classId) {
      return res.status(400).json({ message: 'examTypeId, termId, and classId are required' });
    }
    const reports = await AppDataSource.getRepository(ReportCard)
      .createQueryBuilder('rc')
      .leftJoinAndSelect('rc.student', 'student')
      .leftJoinAndSelect('student.schoolClass', 'schoolClass')
      .leftJoinAndSelect('schoolClass.form', 'form')
      .leftJoinAndSelect('rc.term', 'term')
      .leftJoinAndSelect('rc.examType', 'examType')
      .where('rc.termId = :termId', { termId })
      .andWhere('rc.examTypeId = :examTypeId', { examTypeId })
      .andWhere('student.classId = :classId', { classId })
      .orderBy('rc.classPosition', 'ASC', 'NULLS LAST')
      .addOrderBy('student.lastName', 'ASC')
      .getMany();
    res.json({ count: reports.length, reports });
  },
);

router.get('/report-cards/:studentId/:termId', authorize(UserRole.ADMIN, UserRole.PRINCIPAL, UserRole.DIRECTOR, UserRole.TEACHER, UserRole.PARENT, UserRole.STUDENT), async (req: AuthRequest, res: Response) => {
  const repo = AppDataSource.getRepository(ReportCard);
  const where: { studentId: string; termId: string; examTypeId?: string } = {
    studentId: req.params.studentId,
    termId: req.params.termId,
  };
  if (req.query.examTypeId) {
    where.examTypeId = req.query.examTypeId as string;
  }
  let report = await repo.findOne({
    where,
    relations: relations('student', 'student.schoolClass', 'student.schoolClass.form', 'term', 'examType'),
  });
  if (!report && !req.query.examTypeId) {
    const latest = await repo.find({
      where: { studentId: req.params.studentId, termId: req.params.termId },
      relations: relations('student', 'student.schoolClass', 'student.schoolClass.form', 'term', 'examType'),
      order: { generatedAt: 'DESC' },
      take: 1,
    });
    report = latest[0] ?? null;
  }
  if (!report) return res.status(404).json({ message: 'Report card not found' });
  res.json(report);
});

router.get('/report-cards/:studentId/:termId/pdf', authorize(UserRole.ADMIN, UserRole.PRINCIPAL, UserRole.DIRECTOR, UserRole.TEACHER, UserRole.PARENT, UserRole.STUDENT), async (req, res: Response) => {
  const repo = AppDataSource.getRepository(ReportCard);
  const where: { studentId: string; termId: string; examTypeId?: string } = {
    studentId: req.params.studentId,
    termId: req.params.termId,
  };
  if (req.query.examTypeId) {
    where.examTypeId = req.query.examTypeId as string;
  }
  const report = await repo.findOne({
    where,
    relations: relations('student', 'student.schoolClass', 'student.schoolClass.form', 'term', 'examType'),
  });
  if (!report) return res.status(404).json({ message: 'Report card not found' });

  const settings = await AppDataSource.getRepository(SchoolSettings).findOne({ where: { id: 'default' } });
  const inline = req.query.preview === 'true';

  const pdf = await generateReportCardPdf({
    schoolName: settings?.schoolName || 'School Pro Academy',
    tagline: settings?.tagline || undefined,
    logoUrl: settings?.logoUrl || undefined,
    studentName: `${report.student.firstName} ${report.student.lastName}`,
    admissionNumber: report.student.admissionNumber,
    className: report.student.schoolClass?.name || '',
    formName: report.student.schoolClass?.form?.name || '',
    termName: report.term.name,
    examTypeName: report.examType?.name,
    subjectResults: report.subjectResults as { subject: string; marks: number; grade: string; remarks?: string }[],
    averageMark: Number(report.averageMark),
    overallGrade: report.overallGrade,
    classPosition: report.classPosition,
    formPosition: report.formPosition,
    classTeacherRemarks: report.classTeacherRemarks,
    principalRemarks: report.principalRemarks,
    generatedAt: report.generatedAt ? new Date(report.generatedAt) : new Date(),
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `${inline ? 'inline' : 'attachment'}; filename="report-card-${report.student.admissionNumber}.pdf"`,
  );
  res.send(pdf);
});

router.patch(
  '/report-cards/:id/remarks',
  authorize(UserRole.ADMIN, UserRole.PRINCIPAL, UserRole.DIRECTOR, UserRole.TEACHER),
  async (req: AuthRequest, res: Response) => {
    const { classTeacherRemarks, principalRemarks } = req.body as {
      classTeacherRemarks?: string;
      principalRemarks?: string;
    };
    const repo = AppDataSource.getRepository(ReportCard);
    const report = await repo.findOne({
      where: { id: req.params.id },
      relations: relations('student'),
    });
    if (!report) return res.status(404).json({ message: 'Report card not found' });

    // Teachers can only update class teacher remarks and only for their assigned class.
    if (req.user!.role === UserRole.TEACHER) {
      if (principalRemarks !== undefined) {
        return res.status(403).json({ message: 'Teachers cannot update principal remarks' });
      }
      const allowed = await AppDataSource.query(
        `SELECT 1 FROM class_subjects cs WHERE cs."classId" = $1 AND cs."teacherId" = $2 LIMIT 1`,
        [report.student.classId, req.user!.staffId],
      );
      if (!allowed.length) {
        return res.status(403).json({ message: 'You are not assigned to this student class' });
      }
    }

    if (classTeacherRemarks !== undefined) {
      report.classTeacherRemarks = String(classTeacherRemarks || '').trim() || null;
    }
    if (principalRemarks !== undefined) {
      report.principalRemarks = String(principalRemarks || '').trim() || null;
    }

    const saved = await repo.save(report);
    const full = await repo.findOne({
      where: { id: saved.id },
      relations: relations('student', 'student.schoolClass', 'student.schoolClass.form', 'term', 'examType'),
    });
    res.json(full || saved);
  },
);

router.post('/honours/calculate', authorize(UserRole.ADMIN, UserRole.PRINCIPAL), async (req, res: Response) => {
  const { termId, classId } = req.body;
  const honours = await calculateHonoursRoll(termId, classId);
  res.json(honours);
});

router.get('/honours', authorize(UserRole.ADMIN, UserRole.PRINCIPAL, UserRole.DIRECTOR, UserRole.TEACHER), async (req, res: Response) => {
  const { termId, classId, formId } = req.query;
  const qb = AppDataSource.getRepository(HonourRoll).createQueryBuilder('h')
    .leftJoinAndSelect('h.student', 's')
    .leftJoinAndSelect('h.schoolClass', 'c')
    .leftJoinAndSelect('c.form', 'f');

  if (termId) qb.andWhere('h.termId = :termId', { termId });
  if (classId) qb.andWhere('h.classId = :classId', { classId });
  if (formId) qb.andWhere('c.formId = :formId', { formId });

  const honours = await qb.orderBy('h.overallRank', 'ASC').getMany();
  res.json(honours);
});

export default router;


