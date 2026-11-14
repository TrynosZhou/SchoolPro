// @ts-nocheck
import { AppDataSource } from '../config/data-source';
import { ExamMark, HonourRoll, Student, SchoolClass } from '../entities';
import { relations } from '../utils/typeorm-helpers';

export async function calculateHonoursRoll(termId: string, classId?: string) {
  const markRepo = AppDataSource.getRepository(ExamMark);
  const honourRepo = AppDataSource.getRepository(HonourRoll);
  const studentRepo = AppDataSource.getRepository(Student);

  const qb = markRepo
    .createQueryBuilder('m')
    .select('m.studentId', 'studentId')
    .addSelect('m.classId', 'classId')
    .addSelect('AVG(m.marks)', 'avgMark')
    .where('m.termId = :termId', { termId })
    .groupBy('m.studentId')
    .addGroupBy('m.classId');

  if (classId) qb.andWhere('m.classId = :classId', { classId });

  const averages = await qb.getRawMany<{ studentId: string; classId: string; avgMark: string }>();

  const classGroups = new Map<string, typeof averages>();
  for (const row of averages) {
    const list = classGroups.get(row.classId) || [];
    list.push(row);
    classGroups.set(row.classId, list);
  }

  await honourRepo.delete({ termId, ...(classId ? { classId } : {}) });

  const allRanked: { studentId: string; classId: string; avgMark: number; classPosition: number; formId?: string }[] = [];

  for (const [, students] of classGroups) {
    const sorted = students
      .map((s) => ({ ...s, avgMark: parseFloat(s.avgMark) }))
      .sort((a, b) => b.avgMark - a.avgMark);

    sorted.forEach((s, idx) => {
      allRanked.push({
        studentId: s.studentId,
        classId: s.classId,
        avgMark: s.avgMark,
        classPosition: idx + 1,
      });
    });
  }

  const classRepo = AppDataSource.getRepository(SchoolClass);
  const classes = await classRepo.find({ relations: relations('form') });
  const classFormMap = new Map(classes.map((c) => [c.id, c.formId]));

  const formGroups = new Map<string, typeof allRanked>();
  for (const r of allRanked) {
    const formId = classFormMap.get(r.classId);
    if (!formId) continue;
    const list = formGroups.get(formId) || [];
    list.push({ ...r, formId });
    formGroups.set(formId, list);
  }

  const formPositionMap = new Map<string, number>();
  for (const [, formStudents] of formGroups) {
    const sorted = [...formStudents].sort((a, b) => b.avgMark - a.avgMark);
    sorted.forEach((s, idx) => formPositionMap.set(s.studentId, idx + 1));
  }

  const overallSorted = [...allRanked].sort((a, b) => b.avgMark - a.avgMark);

  const honours = overallSorted.map((r, idx) => {
    const honour = honourRepo.create({
      studentId: r.studentId,
      termId,
      classId: r.classId,
      averageMark: r.avgMark,
      classPosition: r.classPosition,
      formPosition: formPositionMap.get(r.studentId) || 0,
      overallRank: idx + 1,
      award: idx < 3 ? ['Gold', 'Silver', 'Bronze'][idx] : undefined,
    });
    return honour;
  });

  await honourRepo.save(honours);
  return honours;
}

export async function getPositionsForStudent(studentId: string, termId: string) {
  const honourRepo = AppDataSource.getRepository(HonourRoll);
  return honourRepo.findOne({ where: { studentId, termId } });
}

