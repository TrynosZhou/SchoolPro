import { AppDataSource } from '../config/data-source';
import { ExamMark, ExamType, ReportCard, Student } from '../entities';
import { gradeForMarks } from './grade.service';
import { relations } from '../utils/typeorm-helpers';

export interface ClassReportCardParams {
  examTypeId: string;
  termId: string;
  classId: string;
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

  const sortedMarks = marks.sort((a, b) => a.subject.name.localeCompare(b.subject.name));
  const subjectResults = await Promise.all(
    sortedMarks.map(async (m) => ({
      subject: `${m.subject.name} — ${m.examType.name}`,
      subjectName: m.subject.name,
      subjectCode: m.subject.code,
      examType: m.examType.name,
      marks: Number(m.marks),
      grade:
        m.grade ||
        (await gradeForMarks(Number(m.marks), Number(m.examType.maxMarks))),
      remarks: m.remarks || '',
    }))
  );

  const avg = subjectResults.reduce((s, r) => s + r.marks, 0) / subjectResults.length;

  let report = await reportRepo.findOne({ where: { studentId, termId } });
  if (!report) {
    report = reportRepo.create({ studentId, termId, isPublished: true });
  }
  report.subjectResults = subjectResults;
  report.averageMark = Math.round(avg * 100) / 100;
  report.overallGrade = await gradeForMarks(avg);
  report.isPublished = true;
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

  const students = await studentRepo.find({
    where: { classId, isActive: true },
    relations: relations('schoolClass', 'schoolClass.form'),
    order: { lastName: 'ASC', firstName: 'ASC' },
  });

  const classMarks = await markRepo.find({
    where: { examTypeId, termId, classId },
    relations: relations('subject'),
  });

  const marksByStudent = new Map<string, ExamMark[]>();
  for (const m of classMarks) {
    const list = marksByStudent.get(m.studentId) || [];
    list.push(m);
    marksByStudent.set(m.studentId, list);
  }

  const scoreRows: { studentId: string; average: number; subjectResults: Record<string, unknown>[] }[] = [];

  for (const student of students) {
    const marks = marksByStudent.get(student.id) || [];
    if (!marks.length) continue;

    const subjectResults = await Promise.all(
      [...marks]
        .sort((a, b) => a.subject.name.localeCompare(b.subject.name))
        .map(async (m) => ({
          subject: m.subject.name,
          subjectName: m.subject.name,
          subjectCode: m.subject.code,
          examType: examType.name,
          marks: Number(m.marks),
          grade:
            m.grade ||
            (await gradeForMarks(Number(m.marks), Number(examType.maxMarks))),
          remarks: m.remarks || '',
        })),
    );

    const average = subjectResults.reduce((s, r) => s + Number(r.marks), 0) / subjectResults.length;
    scoreRows.push({ studentId: student.id, average, subjectResults });
  }

  scoreRows.sort((a, b) => b.average - a.average);
  const classPositionMap = new Map<string, number>();
  scoreRows.forEach((row, idx) => classPositionMap.set(row.studentId, idx + 1));

  const saved: ReportCard[] = [];
  for (const row of scoreRows) {
    let report = await reportRepo.findOne({
      where: { studentId: row.studentId, termId, examTypeId },
    });
    if (!report) {
      report = reportRepo.create({ studentId: row.studentId, termId, examTypeId });
    }
    report.subjectResults = row.subjectResults;
    report.averageMark = Math.round(row.average * 100) / 100;
    report.overallGrade = await gradeForMarks(row.average, Number(examType.maxMarks));
    report.classPosition = classPositionMap.get(row.studentId);
    report.isPublished = true;
    await reportRepo.save(report);

    const full = await reportRepo.findOne({
      where: { id: report.id },
      relations: relations('student', 'student.schoolClass', 'student.schoolClass.form', 'term', 'examType'),
    });
    if (full) saved.push(full);
  }

  saved.sort((a, b) => (a.classPosition ?? 999) - (b.classPosition ?? 999));
  return {
    examType: { id: examType.id, name: examType.name },
    count: saved.length,
    reports: saved,
  };
}
