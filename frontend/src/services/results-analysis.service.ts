import { AppDataSource } from '../config/data-source';
import { Student } from '../entities';
import { gradeForMarks } from './grade.service';
import { buildMarkSheet, MarkSheetParams } from './mark-sheet.service';

/** Minimum passed subjects (mark &gt; 49) for a student to count toward class pass rate. */
export const MIN_SUBJECTS_FOR_CLASS_PASS = 5;

export interface ResultsAnalysisPerformer {
  rank: number;
  studentId: string;
  admissionNumber: string;
  lastName: string;
  firstName: string;
  subjectsPassed: number;
  subjectCount: number;
  averagePercent: number;
}

export interface SubjectPassRate {
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  passRatePercent: number;
  studentsWithMarks: number;
  studentsPassed: number;
}

export interface ResultsAnalysisSubject {
  id: string;
  code: string;
  name: string;
}

export interface ResultsAnalysisData {
  examType: { id: string; name: string; maxMarks: number };
  term: { id: string; name: string };
  class: { id: string; name: string };
  minSubjectsForPass: number;
  summary: {
    totalStudents: number;
    studentsWithExamMarks: number;
    studentsPassedOverall: number;
    overallPassRatePercent: number;
  };
  subjects: ResultsAnalysisSubject[];
  subjectPassRates: SubjectPassRate[];
  topPerformers: ResultsAnalysisPerformer[];
  bottomPerformers: ResultsAnalysisPerformer[];
}

export interface SubjectAnalysisPerformer {
  rank: number;
  studentId: string;
  firstName: string;
  lastName: string;
  marks: number;
  percent: number;
}

export interface SubjectAnalysisData {
  subject: ResultsAnalysisSubject;
  examType: { id: string; name: string; maxMarks: number };
  term: { id: string; name: string };
  class: { id: string; name: string };
  topStudents: SubjectAnalysisPerformer[];
  bottomStudents: SubjectAnalysisPerformer[];
}

export interface SubjectAnalysisParams extends MarkSheetParams {
  subjectId: string;
  topN?: number;
}

export interface ResultsAnalysisParams extends MarkSheetParams {
  topN?: number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function isPassingMark(marks: number): boolean {
  return marks > 49;
}

function toPerformer(
  row: {
    studentId: string;
    admissionNumber: string;
    lastName: string;
    firstName: string;
    subjectsPassed: number;
    subjectCount: number;
    averagePercent: number | null;
  },
  rank: number,
): ResultsAnalysisPerformer {
  return {
    rank,
    studentId: row.studentId,
    admissionNumber: row.admissionNumber,
    lastName: row.lastName,
    firstName: row.firstName,
    subjectsPassed: row.subjectsPassed,
    subjectCount: row.subjectCount,
    averagePercent: row.averagePercent ?? 0,
  };
}

export async function buildResultsAnalysis(
  params: ResultsAnalysisParams,
): Promise<ResultsAnalysisData> {
  const sheet = await buildMarkSheet(params);
  const topN = Math.max(1, Math.min(50, params.topN ?? 5));

  const totalStudents = sheet.students.length;
  const studentsWithMarks = sheet.students.filter((s) => s.subjectCount > 0);
  const studentsPassedOverall = sheet.students.filter(
    (s) => s.subjectsPassed >= MIN_SUBJECTS_FOR_CLASS_PASS,
  ).length;

  const overallPassRatePercent =
    totalStudents > 0 ? round2((studentsPassedOverall / totalStudents) * 100) : 0;

  const ranked = [...studentsWithMarks]
    .filter((s) => s.averagePercent != null)
    .sort((a, b) => {
      if (b.averagePercent! !== a.averagePercent!) return b.averagePercent! - a.averagePercent!;
      if (b.subjectsPassed !== a.subjectsPassed) return b.subjectsPassed - a.subjectsPassed;
      return (
        a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)
      );
    });

  const topPerformers = ranked.slice(0, topN).map((row, i) => toPerformer(row, i + 1));

  const bottomSlice = ranked.slice(-topN);
  const bottomPerformers = bottomSlice
    .reverse()
    .map((row, i) => toPerformer(row, ranked.length - bottomSlice.length + i + 1));

  const subjectPassRates: SubjectPassRate[] = sheet.subjects.map((sub) => {
    let studentsWithMarks = 0;
    let studentsPassed = 0;
    for (const student of sheet.students) {
      const marks = student.marksBySubject[sub.id]?.marks;
      if (marks == null) continue;
      studentsWithMarks++;
      if (isPassingMark(marks)) studentsPassed++;
    }
    const passRatePercent =
      studentsWithMarks > 0 ? round2((studentsPassed / studentsWithMarks) * 100) : 0;
    return {
      subjectId: sub.id,
      subjectCode: sub.code,
      subjectName: sub.name,
      passRatePercent,
      studentsWithMarks,
      studentsPassed,
    };
  });

  const subjects: ResultsAnalysisSubject[] = sheet.subjects.map((sub) => ({
    id: sub.id,
    code: sub.code,
    name: sub.name,
  }));

  return {
    examType: sheet.examType,
    term: sheet.term,
    class: sheet.class,
    minSubjectsForPass: MIN_SUBJECTS_FOR_CLASS_PASS,
    summary: {
      totalStudents,
      studentsWithExamMarks: studentsWithMarks.length,
      studentsPassedOverall,
      overallPassRatePercent,
    },
    subjects,
    subjectPassRates,
    topPerformers,
    bottomPerformers,
  };
}

function toSubjectPerformer(
  row: {
    studentId: string;
    firstName: string;
    lastName: string;
    marks: number;
  },
  rank: number,
  maxMarks: number,
): SubjectAnalysisPerformer {
  const percent = maxMarks > 0 ? round2((row.marks / maxMarks) * 100) : 0;
  return {
    rank,
    studentId: row.studentId,
    firstName: row.firstName,
    lastName: row.lastName,
    marks: row.marks,
    percent,
  };
}

export async function buildSubjectAnalysis(
  params: SubjectAnalysisParams,
): Promise<SubjectAnalysisData> {
  const sheet = await buildMarkSheet(params);
  const topN = Math.max(1, Math.min(50, params.topN ?? 5));
  const subject = sheet.subjects.find((s) => s.id === params.subjectId);
  if (!subject) throw new Error('Subject not found for this class');

  const maxMarks = sheet.examType.maxMarks;
  const ranked = sheet.students
    .map((student) => {
      const marks = student.marksBySubject[subject.id]?.marks;
      if (marks == null) return null;
      return {
        studentId: student.studentId,
        firstName: student.firstName,
        lastName: student.lastName,
        marks,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row != null)
    .sort((a, b) => {
      if (b.marks !== a.marks) return b.marks - a.marks;
      return a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName);
    });

  const topStudents = ranked.slice(0, topN).map((row, i) => toSubjectPerformer(row, i + 1, maxMarks));

  const bottomSlice = ranked.slice(-topN);
  const bottomStudents = bottomSlice
    .reverse()
    .map((row, i) => toSubjectPerformer(row, ranked.length - bottomSlice.length + i + 1, maxMarks));

  return {
    subject: { id: subject.id, code: subject.code, name: subject.name },
    examType: sheet.examType,
    term: sheet.term,
    class: sheet.class,
    topStudents,
    bottomStudents,
  };
}

export interface StudentSubjectMark {
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  marks: number | null;
  grade: string | null;
  passed: boolean;
  percentOfMax: number | null;
}

export interface StudentSubjectAnalysis {
  student: {
    id: string;
    admissionNumber: string;
    firstName: string;
    lastName: string;
    gender: string;
  };
  examType: { id: string; name: string; maxMarks: number };
  term: { id: string; name: string };
  class: { id: string; name: string };
  summary: {
    subjectCount: number;
    subjectsWithMarks: number;
    subjectsPassed: number;
    averagePercent: number | null;
    classPosition: number | null;
  };
  subjects: StudentSubjectMark[];
}

export interface StudentSubjectAnalysisParams extends MarkSheetParams {
  studentId: string;
}

export async function buildStudentSubjectAnalysis(
  params: StudentSubjectAnalysisParams,
): Promise<StudentSubjectAnalysis> {
  const { studentId, classId } = params;

  const student = await AppDataSource.getRepository(Student).findOne({
    where: { id: studentId, isActive: true },
  });
  if (!student) throw new Error('Student not found');
  if (student.classId !== classId) {
    throw new Error('Student is not enrolled in the selected class');
  }

  const sheet = await buildMarkSheet({ ...params, skipGradeCounts: true });
  const row = sheet.students.find((s) => s.studentId === studentId);
  const maxMarks = sheet.examType.maxMarks;

  const subjects: StudentSubjectMark[] = await Promise.all(
    sheet.subjects.map(async (sub) => {
      const cell = row?.marksBySubject[sub.id];
      const marks = cell?.marks ?? null;
      let grade: string | null = null;
      let passed = false;
      let percentOfMax: number | null = null;

      if (marks != null) {
        grade = await gradeForMarks(marks, maxMarks);
        passed = isPassingMark(marks);
        percentOfMax = maxMarks > 0 ? round2((marks / maxMarks) * 100) : null;
      }

      return {
        subjectId: sub.id,
        subjectCode: sub.code,
        subjectName: sub.name,
        marks,
        grade,
        passed,
        percentOfMax,
      };
    }),
  );

  const withMarks = subjects.filter((s) => s.marks != null);

  return {
    student: {
      id: student.id,
      admissionNumber: student.admissionNumber,
      firstName: student.firstName,
      lastName: student.lastName,
      gender: student.gender || '—',
    },
    examType: sheet.examType,
    term: sheet.term,
    class: sheet.class,
    summary: {
      subjectCount: sheet.subjects.length,
      subjectsWithMarks: withMarks.length,
      subjectsPassed: row?.subjectsPassed ?? 0,
      averagePercent: row?.averagePercent ?? null,
      classPosition: row?.position ?? null,
    },
    subjects,
  };
}
