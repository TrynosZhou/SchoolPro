import { AppDataSource } from '../config/data-source';
import { ExamType, SchoolSettings, Term } from '../entities';
import { formatStudentClassLabel } from '../utils/class-display';

export interface MarkEntryProgressParams {
  examTypeId: string;
  termId: string;
  classId?: string;
  formId?: string;
  /** When set, limit to subjects the teacher teaches or classes they class-teach. */
  staffId?: string;
}

export interface MarkEntryProgressRow {
  classId: string;
  className: string;
  formName?: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  teacherName?: string;
  totalStudents: number;
  markedStudents: number;
  progressPercent: number;
}

export interface MarkEntryProgressData {
  schoolName: string;
  tagline?: string;
  examType: { id: string; name: string; maxMarks: number };
  term: { id: string; name: string };
  rows: MarkEntryProgressRow[];
  summary: {
    totalExpected: number;
    totalMarked: number;
    overallProgressPercent: number;
    completeSubjects: number;
    totalSubjects: number;
  };
}

function roundPercent(marked: number, total: number): number {
  if (!total) return 0;
  return Math.round((marked / total) * 1000) / 10;
}

export async function buildMarkEntryProgress(
  params: MarkEntryProgressParams,
): Promise<MarkEntryProgressData> {
  const { examTypeId, termId, classId, formId, staffId } = params;

  const examType = await AppDataSource.getRepository(ExamType).findOne({ where: { id: examTypeId } });
  if (!examType) throw new Error('Exam type not found');

  const term = await AppDataSource.getRepository(Term).findOne({ where: { id: termId } });
  if (!term) throw new Error('Term not found');

  const settings = await AppDataSource.getRepository(SchoolSettings).findOne({ where: { id: 'default' } });
  const schoolName = settings?.schoolName || 'School Pro Academy';

  const sqlParams: unknown[] = [termId, examTypeId];
  const conditions: string[] = [];

  if (classId) {
    sqlParams.push(classId);
    conditions.push(`c.id = $${sqlParams.length}`);
  }
  if (formId) {
    sqlParams.push(formId);
    conditions.push(`c."formId" = $${sqlParams.length}`);
  }
  if (staffId) {
    sqlParams.push(staffId);
    const idx = sqlParams.length;
    conditions.push(`(cs."teacherId" = $${idx} OR c."classTeacherId" = $${idx})`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const rawRows: {
    classId: string;
    className: string;
    formName: string | null;
    subjectId: string;
    subjectCode: string;
    subjectName: string;
    teacherName: string | null;
    totalStudents: number;
    markedStudents: number;
  }[] = await AppDataSource.query(
    `
    SELECT
      c.id AS "classId",
      c.name AS "className",
      f.name AS "formName",
      s.id AS "subjectId",
      s.code AS "subjectCode",
      s.name AS "subjectName",
      NULLIF(TRIM(COALESCE(u."firstName", '') || ' ' || COALESCE(u."lastName", '')), '') AS "teacherName",
      COALESCE(sc.cnt, 0)::int AS "totalStudents",
      COALESCE(mc.cnt, 0)::int AS "markedStudents"
    FROM class_subjects cs
    INNER JOIN classes c ON c.id = cs."classId"
    LEFT JOIN forms f ON f.id = c."formId"
    INNER JOIN subjects s ON s.id = cs."subjectId"
    LEFT JOIN staff st ON st.id = cs."teacherId"
    LEFT JOIN users u ON u.id = st."userId"
    LEFT JOIN (
      SELECT "classId", COUNT(*)::int AS cnt
      FROM students
      WHERE "isActive" = true AND "classId" IS NOT NULL
      GROUP BY "classId"
    ) sc ON sc."classId" = c.id
    LEFT JOIN (
      SELECT "classId", "subjectId", COUNT(DISTINCT "studentId")::int AS cnt
      FROM exam_marks
      WHERE "termId" = $1 AND "examTypeId" = $2
      GROUP BY "classId", "subjectId"
    ) mc ON mc."classId" = cs."classId" AND mc."subjectId" = cs."subjectId"
    ${whereClause}
    ORDER BY f.name NULLS LAST, c.name, s.name
    `,
    sqlParams,
  );

  const rows: MarkEntryProgressRow[] = rawRows.map((row) => ({
    classId: row.classId,
    className: formatStudentClassLabel(row.className),
    formName: row.formName || undefined,
    subjectId: row.subjectId,
    subjectCode: row.subjectCode,
    subjectName: row.subjectName,
    teacherName: row.teacherName || undefined,
    totalStudents: row.totalStudents,
    markedStudents: row.markedStudents,
    progressPercent: roundPercent(row.markedStudents, row.totalStudents),
  }));

  let totalExpected = 0;
  let totalMarked = 0;
  let completeSubjects = 0;

  for (const row of rows) {
    totalExpected += row.totalStudents;
    totalMarked += row.markedStudents;
    if (row.totalStudents > 0 && row.markedStudents >= row.totalStudents) {
      completeSubjects += 1;
    }
  }

  return {
    schoolName,
    tagline: settings?.tagline || undefined,
    examType: { id: examType.id, name: examType.name, maxMarks: Number(examType.maxMarks) || 100 },
    term: { id: term.id, name: term.name },
    rows,
    summary: {
      totalExpected,
      totalMarked,
      overallProgressPercent: roundPercent(totalMarked, totalExpected),
      completeSubjects,
      totalSubjects: rows.length,
    },
  };
}
