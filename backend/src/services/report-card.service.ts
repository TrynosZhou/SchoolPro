import { AppDataSource } from '../config/data-source';
import { ExamMark, ExamType, ReportCard, SchoolClass, Student, Term } from '../entities';
import { gradeForMarks } from './grade.service';
import { buildReportCardRemarks, sanitizeReportCardRemark } from './report-card-remarks.service';
import { relations } from '../utils/typeorm-helpers';
import { termReportDateRange } from '../utils/helpers';
import { In } from 'typeorm';

export interface StudentTermAttendance {
  daysMarked: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  attendancePercent: number | null;
}

function parseAttendanceRow(r: Record<string, number | string>): StudentTermAttendance {
  const daysMarked = Number(r.daysMarked) || 0;
  const present = Number(r.present) || 0;
  const absent = Number(r.absent) || 0;
  const late = Number(r.late) || 0;
  const excused = Number(r.excused) || 0;
  const attendancePercent = daysMarked
    ? Math.round(((present + late) / daysMarked) * 1000) / 10
    : null;
  return { daysMarked, present, absent, late, excused, attendancePercent };
}

/** Class attendance totals for a term (same logic as attendance report). */
export async function getClassTermAttendanceMap(
  classId: string,
  termId: string,
): Promise<Map<string, StudentTermAttendance>> {
  const map = new Map<string, StudentTermAttendance>();
  const term = await AppDataSource.getRepository(Term).findOne({ where: { id: termId } });
  if (!term) return map;

  const { startDate, endDate } = termReportDateRange(term);
  const rows = await AppDataSource.query(
    `
    SELECT
      s.id AS "studentId",
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
    GROUP BY s.id
    `,
    [classId, startDate, endDate],
  );

  for (const row of rows) {
    map.set(String(row.studentId), parseAttendanceRow(row));
  }
  return map;
}

export async function getStudentTermAttendance(
  studentId: string,
  termId: string,
  classId?: string,
): Promise<StudentTermAttendance> {
  let resolvedClassId = classId;
  if (!resolvedClassId) {
    const student = await AppDataSource.getRepository(Student).findOne({
      where: { id: studentId },
    });
    resolvedClassId = student?.classId;
  }
  if (!resolvedClassId) {
    return parseAttendanceRow({});
  }
  const map = await getClassTermAttendanceMap(resolvedClassId, termId);
  return map.get(studentId) ?? parseAttendanceRow({});
}

export function attachAttendanceToReports<T extends { studentId: string }>(
  reports: T[],
  attendanceMap: Map<string, StudentTermAttendance>,
): (T & { attendance: StudentTermAttendance })[] {
  return reports.map((r) => ({
    ...r,
    attendance: attendanceMap.get(r.studentId) ?? parseAttendanceRow({}),
  }));
}

export interface ClassReportCardParams {
  examTypeId: string;
  termId: string;
  classId: string;
}

export interface SubjectResultRow {
  subject: string;
  subjectName?: string;
  subjectCode?: string;
  subjectId?: string;
  examTypeId?: string;
  examType?: string;
  marks: number;
  grade: string;
  remarks?: string;
  mean?: number;
  subjectPosition?: number;
  /** Stream/form enrollment used as subject position denominator (e.g. 200). */
  subjectPositionTotal?: number;
}

function groupKey(subjectId: string, examTypeId: string): string {
  return `${subjectId}|${examTypeId}`;
}

function studentSubjectKey(studentId: string, subjectId: string, examTypeId: string): string {
  return `${studentId}|${subjectId}|${examTypeId}`;
}

/** Class average mark per subject (within the learner's class only). */
export function buildClassMeanMap(classMarks: ExamMark[]) {
  const meanMap = new Map<string, number>();
  const byGroup = new Map<string, ExamMark[]>();
  for (const m of classMarks) {
    const gk = groupKey(m.subjectId, m.examTypeId);
    const list = byGroup.get(gk) || [];
    list.push(m);
    byGroup.set(gk, list);
  }
  for (const [gk, marks] of byGroup) {
    const mean = marks.reduce((s, m) => s + Number(m.marks), 0) / marks.length;
    meanMap.set(gk, Math.round(mean * 100) / 100);
  }
  return meanMap;
}

/** Subject rank across the whole form/stream (all classes in the grade). */
export function buildFormSubjectPositionMap(formMarks: ExamMark[]) {
  const byGroup = new Map<string, ExamMark[]>();
  for (const m of formMarks) {
    const gk = groupKey(m.subjectId, m.examTypeId);
    const list = byGroup.get(gk) || [];
    list.push(m);
    byGroup.set(gk, list);
  }

  const positionMap = new Map<string, number>();

  for (const marks of byGroup.values()) {
    const sorted = [...marks].sort((a, b) => {
      const diff = Number(b.marks) - Number(a.marks);
      if (diff !== 0) return diff;
      return a.studentId.localeCompare(b.studentId);
    });

    let position = 0;
    let lastScore: number | null = null;
    sorted.forEach((m, index) => {
      const score = Number(m.marks);
      if (index === 0 || score !== lastScore) {
        position = index + 1;
        lastScore = score;
      }
      positionMap.set(studentSubjectKey(m.studentId, m.subjectId, m.examTypeId), position);
    });
  }

  return positionMap;
}

function resolveFormId(student: Student): string | undefined {
  return student.formId ?? student.schoolClass?.formId;
}

async function getFormClassIds(formId: string): Promise<string[]> {
  const classes = await AppDataSource.getRepository(SchoolClass).find({
    where: { formId },
    select: { id: true },
  });
  return classes.map((c) => c.id);
}

/** All exam marks for every class in a form/stream (used for subject ranking). */
async function loadFormMarksForRanking(
  formId: string,
  termId: string,
  examTypeId?: string,
): Promise<ExamMark[]> {
  const classIds = await getFormClassIds(formId);
  if (!classIds.length) return [];

  const markRepo = AppDataSource.getRepository(ExamMark);
  const where: { termId: string; classId: ReturnType<typeof In>; examTypeId?: string } = {
    termId,
    classId: In(classIds),
  };
  if (examTypeId) where.examTypeId = examTypeId;

  return markRepo.find({ where, relations: relations('subject') });
}

function codesMatch(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  return a.trim().toUpperCase() === b.trim().toUpperCase();
}

function findMarkForRow(
  marks: ExamMark[],
  studentId: string,
  row: SubjectResultRow,
  subjectId?: string,
): ExamMark | undefined {
  return marks.find((m) => {
    if (m.studentId !== studentId) return false;
    if (subjectId) return m.subjectId === subjectId;
    if (row.subjectId) return m.subjectId === row.subjectId;
    if (row.subjectCode) return codesMatch(m.subject?.code, row.subjectCode);
    const rowName = (row.subjectName || row.subject || '').split(' — ')[0].trim().toLowerCase();
    return rowName && m.subject?.name?.trim().toLowerCase() === rowName;
  });
}

/** Rank students in a form by overall average for an exam session. */
export async function computeFormPositionMap(
  examTypeId: string,
  termId: string,
  formId: string,
): Promise<Map<string, number>> {
  const formMarks = await loadFormMarksForRanking(formId, termId, examTypeId);
  const marksByStudent = new Map<string, number[]>();
  for (const m of formMarks) {
    const list = marksByStudent.get(m.studentId) || [];
    list.push(Number(m.marks));
    marksByStudent.set(m.studentId, list);
  }

  const averages: { studentId: string; average: number }[] = [];
  marksByStudent.forEach((markList, studentId) => {
    if (!markList.length) return;
    averages.push({
      studentId,
      average: markList.reduce((s, v) => s + v, 0) / markList.length,
    });
  });

  averages.sort((a, b) => b.average - a.average);
  const positionMap = new Map<string, number>();
  let rank = 0;
  let lastAvg: number | null = null;
  averages.forEach((row, idx) => {
    if (idx === 0 || row.average !== lastAvg) {
      rank = idx + 1;
      lastAvg = row.average;
    }
    positionMap.set(row.studentId, rank);
  });
  return positionMap;
}

/** Apply form-wide rankings (by average mark across the stream) to loaded report cards. */
export async function applyFormRankingsToReports(
  reports: ReportCard[],
  examTypeId: string,
  termId: string,
): Promise<void> {
  if (!reports.length || !examTypeId || !termId) return;
  const student = reports[0].student;
  if (!student) return;
  const formId = resolveFormId(student);
  if (!formId) return;

  const formPosMap = await computeFormPositionMap(examTypeId, termId, formId);
  const { formTotal } = await getEnrollmentTotals(undefined, formId);
  for (const report of reports) {
    const pos = formPosMap.get(report.studentId);
    if (pos != null) report.formPosition = pos;
    if (formTotal > 0) report.formTotal = formTotal;
  }
}

function attachRankingToRow(
  row: SubjectResultRow,
  studentId: string,
  subjectId: string,
  examTypeId: string,
  positionMap: Map<string, number>,
  meanMap: Map<string, number>,
  formTotal: number,
): SubjectResultRow {
  const gk = groupKey(subjectId, examTypeId);
  return {
    ...row,
    subjectId,
    examTypeId,
    mean: meanMap.get(gk),
    subjectPosition: positionMap.get(studentSubjectKey(studentId, subjectId, examTypeId)),
    subjectPositionTotal: formTotal > 0 ? formTotal : undefined,
  };
}

const PASS_PERCENT = 50;

/** Count subjects at or above the pass percentage (default 50% of max marks). */
export function countSubjectsPassed(
  rows: SubjectResultRow[],
  maxMarks: number,
  minPercent = PASS_PERCENT,
): number {
  return rows.filter((r) => {
    const pct = maxMarks > 0 ? (Number(r.marks) / maxMarks) * 100 : Number(r.marks);
    return pct >= minPercent;
  }).length;
}

export async function getEnrollmentTotals(classId?: string, formId?: string) {
  const studentRepo = AppDataSource.getRepository(Student);
  const classTotal = classId
    ? await studentRepo.count({ where: { classId, isActive: true } })
    : 0;

  let formTotal = 0;
  if (formId) {
    const classIds = await getFormClassIds(formId);
    if (classIds.length) {
      formTotal = await studentRepo.count({
        where: { classId: In(classIds), isActive: true },
      });
    } else {
      formTotal = await studentRepo.count({ where: { formId, isActive: true } });
    }
  }

  return { classTotal, formTotal };
}

export interface ReportCardPdfMetrics {
  subjectResults: SubjectResultRow[];
  classTotal: number;
  formTotal: number;
  classPosition?: number;
  formPosition?: number;
  subjectsPassed: number;
  totalSubjects: number;
  attendance: StudentTermAttendance;
}

/** Metrics and enriched rows for PDF / API display. */
export async function getReportCardPdfMetrics(
  report: ReportCard,
  maxMarks = 100,
): Promise<ReportCardPdfMetrics> {
  const subjectResults = await enrichReportCardSubjectResults(report);
  const student = report.student;
  const classId = student?.classId;
  const formId = student ? resolveFormId(student) : undefined;
  const { classTotal, formTotal } = await getEnrollmentTotals(classId, formId);
  const totalSubjects = subjectResults.length;
  const subjectsPassed = countSubjectsPassed(subjectResults, maxMarks);

  let formPosition = report.formPosition ?? undefined;
  let classPosition = report.classPosition ?? undefined;

  if (report.examTypeId && formId) {
    const formPosMap = await computeFormPositionMap(report.examTypeId, report.termId, formId);
    formPosition = formPosMap.get(report.studentId) ?? formPosition;
  }

  const attendance = await getStudentTermAttendance(
    report.studentId,
    report.termId,
    student?.classId,
  );

  return {
    subjectResults,
    classTotal: report.classTotal ?? classTotal,
    formTotal: report.formTotal ?? formTotal,
    classPosition: classPosition ?? undefined,
    formPosition: formPosition ?? undefined,
    subjectsPassed: report.subjectsPassed ?? subjectsPassed,
    totalSubjects: report.totalSubjects ?? totalSubjects,
    attendance,
  };
}

/** Recompute subject means/positions from class marks (e.g. before PDF export). */
export async function enrichReportCardSubjectResults(
  report: ReportCard,
): Promise<SubjectResultRow[]> {
  const raw = (report.subjectResults || []) as unknown as SubjectResultRow[];
  if (!raw.length) return raw;

  const student =
    report.student ||
    (await AppDataSource.getRepository(Student).findOne({
      where: { id: report.studentId },
      relations: relations('schoolClass', 'schoolClass.form'),
    }));
  if (!student) return raw;

  const formId = resolveFormId(student);
  const { formTotal } = await getEnrollmentTotals(student.classId, formId);

  const markRepo = AppDataSource.getRepository(ExamMark);
  const classMarks = student.classId
    ? await markRepo.find({
        where: {
          termId: report.termId,
          classId: student.classId,
          ...(report.examTypeId ? { examTypeId: report.examTypeId } : {}),
        },
        relations: relations('subject'),
      })
    : [];
  const formMarks = formId
    ? await loadFormMarksForRanking(formId, report.termId, report.examTypeId)
    : [];

  const meanMap = buildClassMeanMap(classMarks);
  const positionMap = buildFormSubjectPositionMap(formMarks);

  return raw.map((row) => {
    let subjectId = row.subjectId;
    let examTypeId = row.examTypeId || report.examTypeId;

    if (!subjectId || !examTypeId) {
      const mark = findMarkForRow(
        [...classMarks, ...formMarks],
        report.studentId,
        row,
        subjectId,
      );
      if (mark) {
        subjectId = mark.subjectId;
        examTypeId = mark.examTypeId;
      }
    }

    if (!subjectId || !examTypeId) {
      return { ...row, subjectPositionTotal: formTotal > 0 ? formTotal : row.subjectPositionTotal };
    }

    const enriched = attachRankingToRow(
      row,
      report.studentId,
      subjectId,
      examTypeId,
      positionMap,
      meanMap,
      formTotal,
    );
    if (enriched.subjectPosition == null && row.subjectPosition != null) {
      enriched.subjectPosition = row.subjectPosition;
    }
    return enriched;
  });
}

/** Rebuild a student's report card from all exam marks for the term. */
export async function syncReportCardForStudent(studentId: string, termId: string) {
  const markRepo = AppDataSource.getRepository(ExamMark);
  const reportRepo = AppDataSource.getRepository(ReportCard);
  const studentRepo = AppDataSource.getRepository(Student);

  const student = await studentRepo.findOne({
    where: { id: studentId },
    relations: relations('schoolClass', 'schoolClass.form'),
  });
  if (!student) return null;

  const marks = await markRepo.find({
    where: { studentId, termId },
    relations: relations('subject', 'examType'),
  });

  if (!marks.length) {
    const existing = await reportRepo.findOne({ where: { studentId, termId } });
    if (existing) {
      existing.subjectResults = [];
      existing.averageMark = null;
      existing.overallGrade = null;
      await reportRepo.save(existing);
    }
    return existing;
  }

  const formId = resolveFormId(student);
  const { classTotal, formTotal } = await getEnrollmentTotals(student.classId, formId);
  const classMarks = student.classId
    ? await markRepo.find({ where: { termId, classId: student.classId } })
    : [];
  const formMarks = formId ? await loadFormMarksForRanking(formId, termId) : [];
  const meanMap = buildClassMeanMap(classMarks);
  const positionMap = buildFormSubjectPositionMap(formMarks);

  const sortedMarks = marks.sort((a, b) => a.subject.name.localeCompare(b.subject.name));
  const subjectResults: SubjectResultRow[] = await Promise.all(
    sortedMarks.map(async (m) => {
      const base: SubjectResultRow = {
        subject: `${m.subject.name} — ${m.examType.name}`,
        subjectName: m.subject.name,
        subjectCode: m.subject.code,
        subjectId: m.subjectId,
        examTypeId: m.examTypeId,
        examType: m.examType.name,
        marks: Number(m.marks),
        grade:
          m.grade ||
          (await gradeForMarks(Number(m.marks), Number(m.examType.maxMarks))),
        remarks: m.remarks || '',
      };
      return attachRankingToRow(
        base,
        studentId,
        m.subjectId,
        m.examTypeId,
        positionMap,
        meanMap,
        formTotal,
      );
    }),
  );

  const avg = subjectResults.reduce((s, r) => s + r.marks, 0) / subjectResults.length;
  const maxMarksByType = new Map<string, number>();
  for (const m of marks) {
    maxMarksByType.set(m.examTypeId, Number(m.examType.maxMarks) || 100);
  }
  const subjectsPassed = subjectResults.filter((r) => {
    const max = r.examTypeId ? maxMarksByType.get(r.examTypeId) || 100 : 100;
    return countSubjectsPassed([r], max) === 1;
  }).length;

  const primaryExamTypeId = marks[0]?.examTypeId;
  let report = primaryExamTypeId
    ? await reportRepo.findOne({ where: { studentId, termId, examTypeId: primaryExamTypeId } })
    : await reportRepo.findOne({ where: { studentId, termId } });
  if (!report) {
    report = reportRepo.create({
      studentId,
      termId,
      examTypeId: primaryExamTypeId,
      isPublished: false,
    });
  }
  report.subjectResults = subjectResults as unknown as Record<string, unknown>[];
  report.averageMark = Math.round(avg * 100) / 100;
  report.overallGrade = await gradeForMarks(avg);
  report.classTotal = classTotal;
  report.formTotal = formTotal;
  report.subjectsPassed = subjectsPassed;
  report.totalSubjects = subjectResults.length;
  report.isPublished = false;
  await reportRepo.save(report);
  return report;
}

/** Generate report cards for all students in a class (filtered by exam type + term), ranked by class position. */
export async function generateClassReportCards(params: ClassReportCardParams) {
  const { examTypeId, termId, classId } = params;
  const markRepo = AppDataSource.getRepository(ExamMark);
  const reportRepo = AppDataSource.getRepository(ReportCard);
  const studentRepo = AppDataSource.getRepository(Student);
  const examTypeRepo = AppDataSource.getRepository(ExamType);

  const examType = await examTypeRepo.findOne({ where: { id: examTypeId } });
  if (!examType) {
    throw new Error('Exam type not found');
  }

  const schoolClass = await AppDataSource.getRepository(SchoolClass).findOne({
    where: { id: classId },
    relations: relations('classTeacher', 'classTeacher.user'),
  });
  const classTeacherName = schoolClass?.classTeacher?.user
    ? formatStaffSignature(schoolClass.classTeacher.user)
    : null;

  const students = await studentRepo.find({
    where: { classId, isActive: true },
    relations: relations('schoolClass', 'schoolClass.form'),
    order: { lastName: 'ASC', firstName: 'ASC' },
  });

  const classTotal = students.length;
  const formId = students[0] ? resolveFormId(students[0]) : undefined;
  const { formTotal } = await getEnrollmentTotals(classId, formId);

  const classMarks = await markRepo.find({
    where: { examTypeId, termId, classId },
    relations: relations('subject'),
  });

  const formMarks = formId
    ? await loadFormMarksForRanking(formId, termId, examTypeId)
    : [];
  const meanMap = buildClassMeanMap(classMarks);
  const positionMap = buildFormSubjectPositionMap(formMarks);

  const marksByStudent = new Map<string, ExamMark[]>();
  for (const m of classMarks) {
    const list = marksByStudent.get(m.studentId) || [];
    list.push(m);
    marksByStudent.set(m.studentId, list);
  }

  const scoreRows: { studentId: string; average: number; subjectResults: SubjectResultRow[] }[] = [];

  for (const student of students) {
    const marks = marksByStudent.get(student.id) || [];
    if (!marks.length) continue;

    const subjectResults: SubjectResultRow[] = await Promise.all(
      [...marks]
        .sort((a, b) => a.subject.name.localeCompare(b.subject.name))
        .map(async (m) => {
          const base: SubjectResultRow = {
            subject: m.subject.name,
            subjectName: m.subject.name,
            subjectCode: m.subject.code,
            subjectId: m.subjectId,
            examTypeId: m.examTypeId,
            examType: examType.name,
            marks: Number(m.marks),
            grade:
              m.grade ||
              (await gradeForMarks(Number(m.marks), Number(examType.maxMarks))),
            remarks: m.remarks || '',
          };
          return attachRankingToRow(
            base,
            student.id,
            m.subjectId,
            m.examTypeId,
            positionMap,
            meanMap,
            formTotal,
          );
        }),
    );

    const average = subjectResults.reduce((s, r) => s + Number(r.marks), 0) / subjectResults.length;
    scoreRows.push({ studentId: student.id, average, subjectResults });
  }

  scoreRows.sort((a, b) => b.average - a.average);
  const classPositionMap = new Map<string, number>();
  let classRank = 0;
  let lastAvg: number | null = null;
  scoreRows.forEach((row, idx) => {
    if (idx === 0 || row.average !== lastAvg) {
      classRank = idx + 1;
      lastAvg = row.average;
    }
    classPositionMap.set(row.studentId, classRank);
  });

  const formPositionMap = formId
    ? await computeFormPositionMap(examTypeId, termId, formId)
    : new Map<string, number>();

  const saved: ReportCard[] = [];
  for (const row of scoreRows) {
    const student = students.find((s) => s.id === row.studentId);
    let report = await reportRepo.findOne({
      where: { studentId: row.studentId, termId, examTypeId },
    });
    if (!report) {
      report = reportRepo.create({ studentId: row.studentId, termId, examTypeId });
    }
    report.subjectResults = row.subjectResults as unknown as Record<string, unknown>[];
    report.averageMark = Math.round(row.average * 100) / 100;
    report.overallGrade = await gradeForMarks(row.average, Number(examType.maxMarks));
    report.classPosition = classPositionMap.get(row.studentId);
    report.formPosition = formPositionMap.get(row.studentId);
    report.classTotal = classTotal;
    report.formTotal = formTotal;
    report.subjectsPassed = countSubjectsPassed(row.subjectResults, Number(examType.maxMarks));
    report.totalSubjects = row.subjectResults.length;
    report.isPublished = false;

    if (student) {
      const remarks = buildReportCardRemarks({
        firstName: student.firstName,
        lastName: student.lastName,
        averageMark: report.averageMark,
        overallGrade: report.overallGrade ?? undefined,
        subjectsPassed: report.subjectsPassed,
        totalSubjects: report.totalSubjects,
        subjectResults: row.subjectResults,
        classTeacherName,
      });

      if (!(report.classTeacherRemarks || '').trim()) {
        report.classTeacherRemarks = remarks.classTeacherRemarks;
      } else {
        report.classTeacherRemarks = sanitizeReportCardRemark(
          report.classTeacherRemarks,
          student.firstName,
          student.lastName,
        );
      }

      if (!(report.principalRemarks || '').trim()) {
        report.principalRemarks = remarks.principalRemarks;
      } else {
        report.principalRemarks = sanitizeReportCardRemark(
          report.principalRemarks,
          student.firstName,
          student.lastName,
        );
      }
    }

    await reportRepo.save(report);

    const full = await reportRepo.findOne({
      where: { id: report.id },
      relations: relations('student', 'student.schoolClass', 'student.schoolClass.form', 'term', 'examType'),
    });
    if (full) saved.push(full);
  }

  saved.sort((a, b) => (a.classPosition ?? 999) - (b.classPosition ?? 999));

  const attendanceMap = await getClassTermAttendanceMap(classId, termId);
  return {
    examType: { id: examType.id, name: examType.name },
    count: saved.length,
    reports: attachAttendanceToReports(saved, attendanceMap),
  };
}

function formatStaffSignature(user: { firstName?: string; lastName?: string }): string {
  const first = (user.firstName || '').trim();
  const last = (user.lastName || '').trim();
  if (!first && !last) return '';
  if (last && first) {
    return `${last} ${first.charAt(0).toUpperCase()}.`;
  }
  return `${first} ${last}`.trim();
}
