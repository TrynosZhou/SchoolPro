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
