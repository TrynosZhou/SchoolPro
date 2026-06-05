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
  topPerformers: ResultsAnalysisPerformer[];
  bottomPerformers: ResultsAnalysisPerformer[];
}

export interface ResultsAnalysisParams extends MarkSheetParams {
  topN?: number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
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
    topPerformers,
    bottomPerformers,
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

function isPassingMark(marks: number): boolean {
  return marks > 49;
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

  const sheet = await buildMarkSheet(params);
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
