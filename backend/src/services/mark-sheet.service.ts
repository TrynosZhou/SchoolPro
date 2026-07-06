import { AppDataSource } from '../config/data-source';
import {
  ClassSubject, ExamMark, ExamType, SchoolClass, SchoolSettings, Student, Term,
} from '../entities';
import { gradeForMarks } from './grade.service';
import { relations } from '../utils/typeorm-helpers';

export interface MarkSheetParams {
  examTypeId: string;
  termId: string;
  classId: string;
  /** Skip per-cell grade lookups when only averages/ranks are needed. */
  skipGradeCounts?: boolean;
}

export interface MarkSheetSubject {
  id: string;
  code: string;
  name: string;
}

export interface MarkSheetCell {
  marks: number | null;
}

export interface MarkSheetGradeCounts {
  A: number;
  B: number;
  C: number;
  D: number;
  E: number;
  U: number;
}

export interface MarkSheetStudentRow {
  studentId: string;
  admissionNumber: string;
  lastName: string;
  firstName: string;
  gender: string;
  position: number | null;
  subjectCount: number;
  subjectsPassed: number;
  averagePercent: number | null;
  gradeCounts: MarkSheetGradeCounts;
  marksBySubject: Record<string, MarkSheetCell>;
}

export interface MarkSheetData {
  schoolName: string;
  tagline?: string;
  logoUrl?: string;
  examType: { id: string; name: string; maxMarks: number };
  term: { id: string; name: string };
  class: { id: string; name: string; classTeacherName?: string | null };
  subjects: MarkSheetSubject[];
  students: MarkSheetStudentRow[];
}

const GRADE_LETTERS = ['A', 'B', 'C', 'D', 'E', 'U'] as const;

function emptyGradeCounts(): MarkSheetGradeCounts {
  return { A: 0, B: 0, C: 0, D: 0, E: 0, U: 0 };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeGradeLetter(grade: string | null | undefined): keyof MarkSheetGradeCounts | null {
  if (!grade) return null;
  const letter = grade.trim().toUpperCase().charAt(0);
  if (GRADE_LETTERS.includes(letter as (typeof GRADE_LETTERS)[number])) {
    return letter as keyof MarkSheetGradeCounts;
  }
  return null;
}

/** Passed when mark scored is greater than 49. */
function isPassingMark(marks: number): boolean {
  return marks > 49;
}

function formatClassTeacherFullName(user?: { firstName?: string; lastName?: string } | null): string | null {
  if (!user) return null;
  const name = `${(user.firstName || '').trim()} ${(user.lastName || '').trim()}`.trim();
  return name || null;
}

export async function buildMarkSheet(params: MarkSheetParams): Promise<MarkSheetData> {
  const { examTypeId, termId, classId, skipGradeCounts = false } = params;

  const examType = await AppDataSource.getRepository(ExamType).findOne({ where: { id: examTypeId } });
  if (!examType) throw new Error('Exam type not found');

  const term = await AppDataSource.getRepository(Term).findOne({ where: { id: termId } });
  if (!term) throw new Error('Term not found');

  const schoolClass = await AppDataSource.getRepository(SchoolClass).findOne({
    where: { id: classId },
    relations: relations('form', 'classTeacher', 'classTeacher.user'),
  });
  if (!schoolClass) throw new Error('Class not found');

  const settings = await AppDataSource.getRepository(SchoolSettings).findOne({ where: { id: 'default' } });
  const schoolName = settings?.schoolName || 'School Pro Academy';

  const students = await AppDataSource.getRepository(Student).find({
    where: { classId, isActive: true },
    order: { lastName: 'ASC', firstName: 'ASC' },
  });

  const classSubjectRows = await AppDataSource.getRepository(ClassSubject).find({
    where: { classId },
    relations: relations('subject'),
  });

  const classMarks = await AppDataSource.getRepository(ExamMark).find({
    where: { examTypeId, termId, classId },
    relations: relations('subject'),
  });

  const subjectMap = new Map<string, MarkSheetSubject>();
  for (const cs of classSubjectRows) {
    if (cs.subject) {
      subjectMap.set(cs.subject.id, {
        id: cs.subject.id,
        code: cs.subject.code,
        name: cs.subject.name,
      });
    }
  }
  for (const m of classMarks) {
    if (m.subject && !subjectMap.has(m.subject.id)) {
      subjectMap.set(m.subject.id, {
        id: m.subject.id,
        code: m.subject.code,
        name: m.subject.name,
      });
    }
  }

  const subjects = [...subjectMap.values()].sort(
    (a, b) => a.name.localeCompare(b.name) || a.code.localeCompare(b.code),
  );

  const markLookup = new Map<string, ExamMark>();
  for (const m of classMarks) {
    markLookup.set(`${m.studentId}:${m.subjectId}`, m);
  }

  const maxMarks = Number(examType.maxMarks) || 100;

  type BuiltRow = {
    student: Student;
    marksBySubject: Record<string, MarkSheetCell>;
    subjectCount: number;
    subjectsPassed: number;
    averagePercent: number | null;
    gradeCounts: MarkSheetGradeCounts;
  };

  const built: BuiltRow[] = [];

  for (const student of students) {
    const marksBySubject: Record<string, MarkSheetCell> = {};
    const gradeCounts = emptyGradeCounts();
    const markValues: number[] = [];
    let subjectsPassed = 0;

    for (const sub of subjects) {
      const m = markLookup.get(`${student.id}:${sub.id}`);
      if (m != null) {
        const marks = Number(m.marks);
        marksBySubject[sub.id] = { marks };
        markValues.push(marks);
        if (!skipGradeCounts) {
          const gradeLetter = normalizeGradeLetter(
            m.grade || (await gradeForMarks(marks, maxMarks)),
          );
          if (gradeLetter) gradeCounts[gradeLetter] += 1;
        }
        if (isPassingMark(marks)) subjectsPassed += 1;
      } else {
        marksBySubject[sub.id] = { marks: null };
      }
    }

    const subjectCount = markValues.length;
    const averagePercent =
      subjectCount > 0 ? round2(markValues.reduce((a, b) => a + b, 0) / subjectCount) : null;

    built.push({
      student,
      marksBySubject,
      subjectCount,
      subjectsPassed,
      averagePercent,
      gradeCounts,
    });
  }

  const ranked = built
    .filter((r) => r.subjectCount > 0 && r.averagePercent != null)
    .sort((a, b) => {
      if (b.averagePercent! !== a.averagePercent!) return b.averagePercent! - a.averagePercent!;
      return a.student.lastName.localeCompare(b.student.lastName);
    });

  const positionByStudentId = new Map<string, number>();
  let position = 0;
  let lastAverage: number | null = null;
  ranked.forEach((row, index) => {
    if (index === 0 || row.averagePercent !== lastAverage) {
      position = index + 1;
      lastAverage = row.averagePercent;
    }
    positionByStudentId.set(row.student.id, position);
  });

  const studentsOut: MarkSheetStudentRow[] = built.map((row) => ({
    studentId: row.student.id,
    admissionNumber: row.student.admissionNumber,
    lastName: row.student.lastName,
    firstName: row.student.firstName,
    gender: row.student.gender || '—',
    position: positionByStudentId.get(row.student.id) ?? null,
    subjectCount: row.subjectCount,
    subjectsPassed: row.subjectsPassed,
    averagePercent: row.averagePercent,
    gradeCounts: row.gradeCounts,
    marksBySubject: row.marksBySubject,
  }));

  studentsOut.sort((a, b) => {
    if (a.position != null && b.position != null) return a.position - b.position;
    if (a.position != null) return -1;
    if (b.position != null) return 1;
    return a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName);
  });

  return {
    schoolName,
    tagline: settings?.tagline || undefined,
    logoUrl: settings?.logoUrl || undefined,
    examType: { id: examType.id, name: examType.name, maxMarks },
    term: { id: term.id, name: term.name },
    class: {
      id: schoolClass.id,
      name: schoolClass.name,
      classTeacherName: formatClassTeacherFullName(schoolClass.classTeacher?.user),
    },
    subjects,
    students: studentsOut,
  };
}
