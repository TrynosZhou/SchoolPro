import { In } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import {
  ExamMark, ExamType, Form, SchoolClass, SchoolSettings, Student, Subject, Term,
} from '../entities';
import { relations } from '../utils/typeorm-helpers';

export type RankingType = 'class' | 'form' | 'subject';

export interface RankingParams {
  examTypeId: string;
  termId: string;
  rankingType: RankingType;
  classId?: string;
  formId?: string;
  subjectId?: string;
}

export interface RankingStudentRow {
  position: number;
  studentId: string;
  admissionNumber: string;
  lastName: string;
  firstName: string;
  gender: string;
  className: string;
  formName: string;
  averagePercent: number | null;
  mark: number | null;
  subjectCount: number;
}

export interface RankingsData {
  schoolName: string;
  tagline?: string;
  logoUrl?: string;
  rankingType: RankingType;
  rankingLabel: string;
  examType: { id: string; name: string; maxMarks: number };
  term: { id: string; name: string };
  class?: { id: string; name: string };
  form?: { id: string; name: string };
  subject?: { id: string; name: string; code: string };
  students: RankingStudentRow[];
}

async function loadSchoolBranding(): Promise<{
  schoolName: string;
  tagline?: string;
  logoUrl?: string;
}> {
  const settings = await AppDataSource.getRepository(SchoolSettings).findOne({
    where: { id: 'default' },
  });
  return {
    schoolName: settings?.schoolName || 'School Pro Academy',
    tagline: settings?.tagline || undefined,
    logoUrl: settings?.logoUrl || undefined,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

type ScoredStudent = {
  student: Student;
  className: string;
  formName: string;
  score: number;
  averagePercent: number | null;
  mark: number | null;
  subjectCount: number;
};

function assignPositions(rows: ScoredStudent[]): RankingStudentRow[] {
  const sorted = [...rows].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.student.lastName.localeCompare(b.student.lastName);
  });

  let position = 0;
  let lastScore: number | null = null;

  return sorted.map((row, index) => {
    if (index === 0 || row.score !== lastScore) {
      position = index + 1;
      lastScore = row.score;
    }
    return {
      position,
      studentId: row.student.id,
      admissionNumber: row.student.admissionNumber,
      lastName: row.student.lastName,
      firstName: row.student.firstName,
      gender: row.student.gender || '—',
      className: row.className,
      formName: row.formName,
      averagePercent: row.averagePercent,
      mark: row.mark,
      subjectCount: row.subjectCount,
    };
  });
}

export async function buildRankings(params: RankingParams): Promise<RankingsData> {
  const { examTypeId, termId, rankingType, classId, formId, subjectId } = params;

  const examType = await AppDataSource.getRepository(ExamType).findOne({ where: { id: examTypeId } });
  if (!examType) throw new Error('Exam type not found');

  const term = await AppDataSource.getRepository(Term).findOne({ where: { id: termId } });
  if (!term) throw new Error('Term not found');

  const maxMarks = Number(examType.maxMarks) || 100;
  const branding = await loadSchoolBranding();

  if (rankingType === 'class') {
    if (!classId) throw new Error('classId is required for class position ranking');

    const schoolClass = await AppDataSource.getRepository(SchoolClass).findOne({
      where: { id: classId },
      relations: relations('form'),
    });
    if (!schoolClass) throw new Error('Class not found');

    const students = await AppDataSource.getRepository(Student).find({
      where: { classId, isActive: true },
      relations: relations('schoolClass', 'schoolClass.form'),
    });

    const marks = await AppDataSource.getRepository(ExamMark).find({
      where: { examTypeId, termId, classId },
    });

    const marksByStudent = new Map<string, number[]>();
    for (const m of marks) {
      const list = marksByStudent.get(m.studentId) || [];
      list.push(Number(m.marks));
      marksByStudent.set(m.studentId, list);
    }

    const scored: ScoredStudent[] = [];
    for (const student of students) {
      const values = marksByStudent.get(student.id);
      if (!values?.length) continue;
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      scored.push({
        student,
        className: schoolClass.name,
        formName: schoolClass.form?.name || '—',
        score: avg,
        averagePercent: round2(avg),
        mark: null,
        subjectCount: values.length,
      });
    }

    return {
      ...branding,
      rankingType,
      rankingLabel: 'By Class Position',
      examType: { id: examType.id, name: examType.name, maxMarks },
      term: { id: term.id, name: term.name },
      class: { id: schoolClass.id, name: schoolClass.name },
      students: assignPositions(scored),
    };
  }

  if (rankingType === 'form') {
    if (!formId) throw new Error('formId is required for form position ranking');

    const form = await AppDataSource.getRepository(Form).findOne({ where: { id: formId } });
    if (!form) throw new Error('Form not found');

    const classes = await AppDataSource.getRepository(SchoolClass).find({
      where: { formId },
    });
    const classIds = classes.map((c) => c.id);
    if (!classIds.length) {
      return {
        ...branding,
        rankingType,
        rankingLabel: 'By Form Position',
        examType: { id: examType.id, name: examType.name, maxMarks },
        term: { id: term.id, name: term.name },
        form: { id: form.id, name: form.name },
        students: [],
      };
    }

    const classNameMap = new Map(classes.map((c) => [c.id, c.name]));

    const students = await AppDataSource.getRepository(Student).find({
      where: { classId: In(classIds), isActive: true },
      relations: relations('schoolClass', 'schoolClass.form'),
    });

    const marks = await AppDataSource.getRepository(ExamMark).find({
      where: { examTypeId, termId, classId: In(classIds) },
    });

    const marksByStudent = new Map<string, number[]>();
    for (const m of marks) {
      const list = marksByStudent.get(m.studentId) || [];
      list.push(Number(m.marks));
      marksByStudent.set(m.studentId, list);
    }

    const scored: ScoredStudent[] = [];
    for (const student of students) {
      const values = marksByStudent.get(student.id);
      if (!values?.length) continue;
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      scored.push({
        student,
        className: classNameMap.get(student.classId || '') || student.schoolClass?.name || '—',
        formName: form.name,
        score: avg,
        averagePercent: round2(avg),
        mark: null,
        subjectCount: values.length,
      });
    }

    return {
      ...branding,
      rankingType,
      rankingLabel: 'By Form Position',
      examType: { id: examType.id, name: examType.name, maxMarks },
      term: { id: term.id, name: term.name },
      form: { id: form.id, name: form.name },
      students: assignPositions(scored),
    };
  }

  if (rankingType === 'subject') {
    if (!subjectId) throw new Error('subjectId is required for subject position ranking');

    const subject = await AppDataSource.getRepository(Subject).findOne({ where: { id: subjectId } });
    if (!subject) throw new Error('Subject not found');

    const marks = await AppDataSource.getRepository(ExamMark).find({
      where: { examTypeId, termId, subjectId },
      relations: relations('student', 'student.schoolClass', 'student.schoolClass.form'),
    });

    const scored: ScoredStudent[] = [];
    const seenStudentIds = new Set<string>();

    for (const m of marks) {
      const student = m.student;
      if (!student?.isActive || seenStudentIds.has(student.id)) continue;
      seenStudentIds.add(student.id);
      const mark = Number(m.marks);
      scored.push({
        student,
        className: student.schoolClass?.name || '—',
        formName: student.schoolClass?.form?.name || '—',
        score: mark,
        averagePercent: round2((mark / maxMarks) * 100),
        mark,
        subjectCount: 1,
      });
    }

    return {
      ...branding,
      rankingType,
      rankingLabel: 'By Subject Position',
      examType: { id: examType.id, name: examType.name, maxMarks },
      term: { id: term.id, name: term.name },
      subject: { id: subject.id, name: subject.name, code: subject.code },
      students: assignPositions(scored),
    };
  }

  throw new Error('Invalid ranking type');
}
