// @ts-nocheck
import { Router, Response } from 'express';
import { AppDataSource } from '../config/data-source';
import { ExamType, ExamMark, ReportCard, Student, HonourRoll, SchoolYear, SchoolSettings, SchoolClass, Guardian } from '../entities';
import { UserRole } from '../entities/enums';
import { fetchStudentInvoiceBalance } from '../services/fin-reports.service';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { gradeForMarks, getGradeBoundaries } from '../services/grade.service';
import { formatStudentClassLabel, isALevelClassOption } from '../utils/class-display';
import { ClassSubject } from '../entities';
import { calculateHonoursRoll } from '../services/honours.service';
import {
  attachAttendanceToReports,
  generateClassReportCards,
  getClassTermAttendanceMap,
  getReportCardPdfMetrics,
  applyFormRankingsToReports,
  syncReportCardForStudent,
} from '../services/report-card.service';
import { loadSchoolBranding } from '../services/school-branding.service';
import { DEFAULT_GRADE_BOUNDARIES } from '../types/grade-boundaries';
import { generateMarkSheetPdf, generateRankingsPdf, generateReportCardPdf, generateResultsAnalysisPdf } from '../utils/pdf';
import { buildMarkSheet } from '../services/mark-sheet.service';
import {
  buildResultsAnalysis,
  buildStudentSubjectAnalysis,
  buildSubjectAnalysis,
} from '../services/results-analysis.service';
import { buildRankings, RankingType } from '../services/ranking.service';
import { sanitizeReportCardRemark } from '../services/report-card-remarks.service';
import { reportCardPdfFilename } from '../utils/helpers';
import { relations } from '../utils/typeorm-helpers';
import {
  getPublicationStatus,
  listPublishedExamTypesForTerm,
  publishResults,
  unpublishResults,
} from '../services/publish-results.service';
import { ResultsPublication } from '../entities/ResultsPublication';
import { requireModuleAccess } from '../middleware/access-control';
import { AccessControlService } from '../services/access-control.service';
import { assertTeacherClassAccess } from '../utils/teacher-class-access';

const PUBLISH_ROLES = [UserRole.ADMIN, UserRole.PRINCIPAL, UserRole.DIRECTOR];

const acadView = requireModuleAccess('academics', 'view');
const acadCreate = requireModuleAccess('academics', 'create');
const acadEdit = requireModuleAccess('academics', 'edit');

function isPortalViewer(role: UserRole): boolean {
  return role === UserRole.PARENT || role === UserRole.STUDENT;
}

async function assertReportVisibleToPortalUser(
  report: ReportCard,
  examTypeId?: string,
): Promise<string | null> {
  if (!report.isPublished) {
    return 'Results for this term and exam type have not been published yet.';
  }
  const effectiveExamTypeId = examTypeId || report.examTypeId;
  if (!effectiveExamTypeId) return null;
  const pub = await AppDataSource.getRepository(ResultsPublication).findOne({
    where: { termId: report.termId, examTypeId: effectiveExamTypeId },
  });
  if (!pub) {
    return 'Results for this term and exam type have not been published yet.';
  }
  return null;
}

/**
 * Gate report-card access for portal users (parents & students). Returns an error
 * message string to block with a 403, or null to allow. Admin/teacher/etc. bypass.
 * Enforces, in order:
 *   1. the viewer is actually linked to the student (student = self, parent = guardian),
 *   2. the results have been published,
 *   3. the student has NO outstanding fees balance.
 */
async function assertPortalReportCardAccess(
  req: AuthRequest,
  report: ReportCard,
  examTypeId?: string,
): Promise<string | null> {
  const role = req.user!.role;
  if (!isPortalViewer(role)) return null;

  const studentId = report.studentId;

  if (role === UserRole.STUDENT) {
    if (req.user!.studentId !== studentId) {
      return 'You can only view your own report card.';
    }
  } else if (role === UserRole.PARENT) {
    if (!req.user!.parentId) {
      return 'Parent profile not linked. Please sign out and sign in again.';
    }
    const link = await AppDataSource.getRepository(Guardian).findOne({
      where: { parentId: req.user!.parentId, studentId },
    });
    if (!link) {
      return 'You can only view report cards for your linked children.';
    }
  }

  const publishBlock = await assertReportVisibleToPortalUser(report, examTypeId);
  if (publishBlock) return publishBlock;

  const owed = await fetchStudentInvoiceBalance(studentId);
  if (owed > 0.005) {
    return `This report card is locked because of an outstanding fees balance of $${owed.toFixed(2)}. Please settle the balance with the school finance office to view or download the report card.`;
  }

  return null;
}

const router = Router();
router.use(authenticate);

router.get('/types', acadView, async (req: AuthRequest, res: Response) => {
  const { termId } = req.query;
  if (termId && isPortalViewer(req.user!.role)) {
    return res.json(await listPublishedExamTypesForTerm(termId as string));
  }
  const repo = AppDataSource.getRepository(ExamType);
  res.json(await repo.find());
});

router.get(
  '/grade-boundaries',
  authorize(
    UserRole.TEACHER,
    UserRole.ADMIN,
    UserRole.PRINCIPAL,
    UserRole.DIRECTOR,
    UserRole.PARENT,
    UserRole.STUDENT,
  ),
  acadView,
  async (_req, res: Response) => {
    res.json(await getGradeBoundaries());
  },
);

router.get(
  '/results-publications/status',
  authorize(...PUBLISH_ROLES),
  async (req, res: Response) => {
    const { termId, examTypeId } = req.query;
    if (!termId || !examTypeId) {
      return res.status(400).json({ message: 'termId and examTypeId are required' });
    }
    res.json(await getPublicationStatus(termId as string, examTypeId as string));
  },
);

router.post('/results/publish', authorize(...PUBLISH_ROLES), async (req: AuthRequest, res: Response) => {
  const { termId, examTypeId, notifyWhatsApp, notifySms } = req.body as {
    termId?: string;
    examTypeId?: string;
    notifyWhatsApp?: boolean;
    notifySms?: boolean;
  };
  if (!termId || !examTypeId) {
    return res.status(400).json({ message: 'termId and examTypeId are required' });
  }
  try {
    const result = await publishResults({
      termId,
      examTypeId,
      publishedByUserId: req.user!.id,
      notifyWhatsApp: notifyWhatsApp !== false,
      notifySms: notifySms !== false,
    });
    res.json(result);
  } catch (err) {
    return res.status(400).json({ message: err instanceof Error ? err.message : 'Publish failed' });
  }
});

router.post('/results/unpublish', authorize(...PUBLISH_ROLES), async (req: AuthRequest, res: Response) => {
  const { termId, examTypeId } = req.body as { termId?: string; examTypeId?: string };
  if (!termId || !examTypeId) {
    return res.status(400).json({ message: 'termId and examTypeId are required' });
  }
  try {
    const result = await unpublishResults(termId, examTypeId);
    res.json(result);
  } catch (err) {
    return res.status(400).json({ message: err instanceof Error ? err.message : 'Unpublish failed' });
  }
});

router.get(
  '/school-branding',
  authorize(
    UserRole.TEACHER,
    UserRole.ADMIN,
    UserRole.PRINCIPAL,
    UserRole.DIRECTOR,
    UserRole.PARENT,
    UserRole.STUDENT,
  ),
  async (_req, res: Response) => {
    res.json(await loadSchoolBranding());
  },
);

router.get('/terms', authorize(UserRole.TEACHER, UserRole.ADMIN, UserRole.PRINCIPAL, UserRole.DIRECTOR, UserRole.PARENT, UserRole.STUDENT), acadView, async (_req, res: Response) => {
  const years = await AppDataSource.getRepository(SchoolYear).find({
    relations: relations('terms'),
    order: { startDate: 'DESC' },
  });
  const terms = years.flatMap((y) => y.terms || []).sort((a, b) => a.name.localeCompare(b.name));
  res.json(terms);
});

router.get('/class-subjects', authorize(UserRole.TEACHER, UserRole.ADMIN, UserRole.PRINCIPAL, UserRole.DIRECTOR), acadView, async (req: AuthRequest, res: Response) => {
  const { classId } = req.query;
  if (!classId) return res.status(400).json({ message: 'classId is required' });
  if (!(await assertTeacherClassAccess(req, classId as string))) {
    return res.status(403).json({ message: 'You are not assigned to this class' });
  }
  const rows = await AppDataSource.getRepository(ClassSubject).find({
    where: { classId: classId as string },
    relations: relations('subject'),
    order: { subject: { name: 'ASC' } },
  });
  res.json(rows.map((r) => r.subject).filter(Boolean));
});

router.get('/marks/entry', authorize(UserRole.TEACHER, UserRole.ADMIN, UserRole.PRINCIPAL, UserRole.DIRECTOR), acadView, async (req: AuthRequest, res: Response) => {
  const { classId, subjectId, examTypeId, termId } = req.query;
  if (!classId || !subjectId || !examTypeId || !termId) {
    return res.status(400).json({ message: 'classId, subjectId, examTypeId, and termId are required' });
  }
  if (!(await assertTeacherClassAccess(req, classId as string))) {
    return res.status(403).json({ message: 'You are not assigned to this class' });
  }

  const examType = await AppDataSource.getRepository(ExamType).findOne({ where: { id: examTypeId as string } });
  const schoolClass = await AppDataSource.getRepository(SchoolClass).findOne({
    where: { id: classId as string },
    relations: relations('form'),
  });
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
    showGradePoints: isALevelClassOption(schoolClass),
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

router.get('/marks', authorize(UserRole.TEACHER, UserRole.ADMIN, UserRole.PRINCIPAL, UserRole.DIRECTOR, UserRole.PARENT, UserRole.STUDENT), acadView, async (req: AuthRequest, res: Response) => {
  const repo = AppDataSource.getRepository(ExamMark);
  const { classId, subjectId, termId, examTypeId, studentId } = req.query;
  const where: Record<string, string> = {};
  if (classId) where.classId = classId as string;
  if (subjectId) where.subjectId = subjectId as string;
  if (termId) where.termId = termId as string;
  if (examTypeId) where.examTypeId = examTypeId as string;
  if (studentId) where.studentId = studentId as string;

  if (isPortalViewer(req.user!.role)) {
    const accessible = await AccessControlService.getAccessibleStudentIds(req.user!);
    const ids = accessible === 'all' ? [] : accessible;
    if (studentId && !ids.includes(studentId as string)) {
      return res.status(403).json({ message: 'Access denied' });
    }
    if (!studentId && ids.length === 1) {
      where.studentId = ids[0];
    }
  }

  const marks = await repo.find({
    where,
    relations: relations('student', 'subject', 'examType', 'term', 'enteredBy', 'enteredBy.user'),
    order: { student: { lastName: 'ASC' } },
  });

  if (isPortalViewer(req.user!.role)) {
    const accessible = await AccessControlService.getAccessibleStudentIds(req.user!);
    const ids = new Set(accessible === 'all' ? [] : accessible);
    if (ids.size) {
      return res.json(marks.filter((m) => ids.has(m.studentId)));
    }
  }

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

router.post('/marks/save-one', authorize(UserRole.TEACHER, UserRole.ADMIN, UserRole.PRINCIPAL, UserRole.DIRECTOR), acadCreate, async (req: AuthRequest, res: Response) => {
  const { studentId, examTypeId, classId, subjectId, termId, marks, remarks } = req.body;
  if (!studentId || !examTypeId || !classId || !subjectId || !termId) {
    return res.status(400).json({ message: 'Missing required fields' });
  }
  if (marks === null || marks === undefined || marks === '') {
    return res.status(400).json({ message: 'Marks value required' });
  }
  if (!(await AccessControlService.userCanAccessStudent(req.user!, studentId))) {
    return res.status(403).json({ message: 'You do not have access to this student record' });
  }
  if (!(await assertTeacherClassAccess(req, classId))) {
    return res.status(403).json({ message: 'You are not assigned to this class' });
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

router.post('/marks/bulk', authorize(UserRole.TEACHER, UserRole.ADMIN, UserRole.PRINCIPAL, UserRole.DIRECTOR), acadCreate, async (req: AuthRequest, res: Response) => {
  const repo = AppDataSource.getRepository(ExamMark);
  const { examTypeId, classId, subjectId, termId, marks } = req.body;
  if (classId && !(await assertTeacherClassAccess(req, classId))) {
    return res.status(403).json({ message: 'You are not assigned to this class' });
  }
  const saved = [];
  const syncedStudents = new Set<string>();

  for (const m of marks) {
    if (m.marks === null || m.marks === undefined || m.marks === '') continue;
    if (!(await AccessControlService.userCanAccessStudent(req.user!, m.studentId))) {
      continue;
    }
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

router.post('/report-cards/generate', authorize(UserRole.ADMIN, UserRole.PRINCIPAL), acadCreate, async (req, res: Response) => {
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
    report.isPublished = false;
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
  '/results-analysis/student',
  authorize(UserRole.ADMIN, UserRole.PRINCIPAL, UserRole.DIRECTOR, UserRole.TEACHER),
  async (req, res: Response) => {
    const { examTypeId, termId, classId, studentId } = req.query;
    if (!examTypeId || !termId || !classId || !studentId) {
      return res.status(400).json({
        message: 'examTypeId, termId, classId, and studentId are required',
      });
    }
    try {
      const analysis = await buildStudentSubjectAnalysis({
        examTypeId: examTypeId as string,
        termId: termId as string,
        classId: classId as string,
        studentId: studentId as string,
      });
      res.json(analysis);
    } catch (err) {
      return res.status(400).json({
        message: err instanceof Error ? err.message : 'Failed to build student subject analysis',
      });
    }
  },
);

router.get(
  '/results-analysis/subject',
  authorize(UserRole.ADMIN, UserRole.PRINCIPAL, UserRole.DIRECTOR, UserRole.TEACHER),
  async (req, res: Response) => {
    const { examTypeId, termId, classId, subjectId, topN } = req.query;
    if (!examTypeId || !termId || !classId || !subjectId) {
      return res.status(400).json({
        message: 'examTypeId, termId, classId, and subjectId are required',
      });
    }
    try {
      const analysis = await buildSubjectAnalysis({
        examTypeId: examTypeId as string,
        termId: termId as string,
        classId: classId as string,
        subjectId: subjectId as string,
        topN: topN ? Number(topN) : undefined,
      });
      res.json(analysis);
    } catch (err) {
      return res.status(400).json({
        message: err instanceof Error ? err.message : 'Failed to build subject analysis',
      });
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
  '/results-analysis/pdf',
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

      const branding = await loadSchoolBranding();
      const pdf = await generateResultsAnalysisPdf({
        schoolName: branding.schoolName || 'School Pro Academy',
        tagline: branding.tagline,
        logoUrl: branding.logoUrl,
        examTypeName: analysis.examType.name,
        termName: analysis.term.name,
        className: analysis.class.name,
        maxMarks: analysis.examType.maxMarks,
        minSubjectsForPass: analysis.minSubjectsForPass,
        generatedAt: new Date(),
        summary: analysis.summary,
        topPerformers: analysis.topPerformers,
        bottomPerformers: analysis.bottomPerformers,
      });

      const safeName = `${analysis.class.name}-${analysis.examType.name}`.replace(/[^\w\-]+/g, '-').replace(/-+/g, '-');
      const filename = `results-analysis-${safeName}.pdf`;
      const inline = req.query.preview === 'true';

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `${inline ? 'inline' : 'attachment'}; filename="${filename}"`,
      );
      res.send(pdf);
    } catch (err) {
      return res.status(400).json({
        message: err instanceof Error ? err.message : 'Failed to generate results analysis PDF',
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
      if (rankings.class) scopeParts.push(formatStudentClassLabel(rankings.class.name));
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
    await applyFormRankingsToReports(reports, examTypeId as string, termId as string);
    const attendanceMap = await getClassTermAttendanceMap(classId as string, termId as string);
    res.json({
      count: reports.length,
      reports: attachAttendanceToReports(reports, attendanceMap),
    });
  },
);

router.get('/report-cards/:studentId/:termId', authorize(UserRole.ADMIN, UserRole.PRINCIPAL, UserRole.DIRECTOR, UserRole.TEACHER, UserRole.PARENT, UserRole.STUDENT), acadView, async (req: AuthRequest, res: Response) => {
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

  if (req.user!.role === UserRole.TEACHER) {
    if (!(await AccessControlService.userCanAccessStudent(req.user!, report.studentId))) {
      return res.status(403).json({ message: 'You do not have access to this student record' });
    }
  }

  const portalBlock = await assertPortalReportCardAccess(
    req,
    report,
    req.query.examTypeId as string | undefined,
  );
  if (portalBlock) return res.status(403).json({ message: portalBlock });

  // Recompute class & form position (and totals) so the rank always shows on the
  // portal view, even for reports created via paths that didn't persist positions.
  const maxMarks = Number(report.examType?.maxMarks) || 100;
  const metrics = await getReportCardPdfMetrics(report, maxMarks);
  res.json({
    ...report,
    subjectResults: metrics.subjectResults,
    classPosition: metrics.classPosition ?? report.classPosition ?? null,
    formPosition: metrics.formPosition ?? report.formPosition ?? null,
    classTotal: metrics.classTotal ?? report.classTotal ?? null,
    formTotal: metrics.formTotal ?? report.formTotal ?? null,
    subjectsPassed: metrics.subjectsPassed ?? report.subjectsPassed ?? null,
    totalSubjects: metrics.totalSubjects ?? report.totalSubjects ?? null,
  });
});

router.get('/report-cards/:studentId/:termId/pdf', authorize(UserRole.ADMIN, UserRole.PRINCIPAL, UserRole.DIRECTOR, UserRole.TEACHER, UserRole.PARENT, UserRole.STUDENT), acadView, async (req: AuthRequest, res: Response) => {
  try {
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

    if (req.user!.role === UserRole.TEACHER) {
      if (!(await AccessControlService.userCanAccessStudent(req.user!, report.studentId))) {
        return res.status(403).json({ message: 'You do not have access to this student record' });
      }
    }

    const portalBlock = await assertPortalReportCardAccess(
      req,
      report,
      req.query.examTypeId as string | undefined,
    );
    if (portalBlock) return res.status(403).json({ message: portalBlock });

    const settings = await AppDataSource.getRepository(SchoolSettings).findOne({ where: { id: 'default' } });
    const inline = req.query.preview === 'true';
    const maxMarks = Number(report.examType?.maxMarks) || 100;
    const metrics = await getReportCardPdfMetrics(report, maxMarks);

    const pdf = await generateReportCardPdf({
      schoolName: settings?.schoolName || 'School Pro Academy',
      tagline: settings?.tagline || undefined,
      logoUrl: settings?.logoUrl || undefined,
      address: settings?.address || undefined,
      phone: settings?.phone || undefined,
      email: settings?.email || undefined,
      website: settings?.website || undefined,
      studentName: `${report.student.firstName} ${report.student.lastName}`,
      admissionNumber: report.student.admissionNumber,
      className: report.student.schoolClass?.name || '',
      formName: report.student.schoolClass?.form?.name || '',
      formLevel: report.student.schoolClass?.form?.level,
      termName: report.term.name,
      examTypeName: report.examType?.name,
      subjectResults: metrics.subjectResults,
      averageMark: Number(report.averageMark),
      overallGrade: report.overallGrade,
      classPosition: metrics.classPosition ?? report.classPosition,
      formPosition: metrics.formPosition ?? report.formPosition,
      classTotal: metrics.classTotal,
      formTotal: metrics.formTotal,
      subjectsPassed: metrics.subjectsPassed,
      totalSubjects: metrics.totalSubjects,
      attendance: metrics.attendance,
      classTeacherRemarks: report.classTeacherRemarks,
      principalRemarks: report.principalRemarks,
      generatedAt: report.generatedAt ? new Date(report.generatedAt) : new Date(),
      gradeBoundaries: settings?.gradeBoundaries?.length
        ? settings.gradeBoundaries
        : DEFAULT_GRADE_BOUNDARIES,
      reportCardId: report.id,
    });

    res.setHeader('Content-Type', 'application/pdf');
    const pdfFilename = reportCardPdfFilename(
      report.student.firstName,
      report.student.lastName,
      report.student.admissionNumber || 'report-card',
    );
    res.setHeader(
      'Content-Disposition',
      `${inline ? 'inline' : 'attachment'}; filename="${pdfFilename}"`,
    );
    res.send(pdf);
  } catch (err) {
    console.error('Report card PDF generation failed:', err);
    if (!res.headersSent) {
      res.status(500).json({
        message: err instanceof Error ? err.message : 'Failed to generate report card PDF',
      });
    }
  }
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
      const cleaned = sanitizeReportCardRemark(
        String(classTeacherRemarks || ''),
        report.student.firstName,
        report.student.lastName,
      );
      report.classTeacherRemarks = cleaned.trim() || null;
    }
    if (principalRemarks !== undefined) {
      const cleaned = sanitizeReportCardRemark(
        String(principalRemarks || ''),
        report.student.firstName,
        report.student.lastName,
      );
      report.principalRemarks = cleaned.trim() || null;
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


