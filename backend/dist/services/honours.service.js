"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateHonoursRoll = calculateHonoursRoll;
exports.getPositionsForStudent = getPositionsForStudent;
// @ts-nocheck
const data_source_1 = require("../config/data-source");
const entities_1 = require("../entities");
const typeorm_helpers_1 = require("../utils/typeorm-helpers");
async function calculateHonoursRoll(termId, classId) {
    const markRepo = data_source_1.AppDataSource.getRepository(entities_1.ExamMark);
    const honourRepo = data_source_1.AppDataSource.getRepository(entities_1.HonourRoll);
    const studentRepo = data_source_1.AppDataSource.getRepository(entities_1.Student);
    const qb = markRepo
        .createQueryBuilder('m')
        .select('m.studentId', 'studentId')
        .addSelect('m.classId', 'classId')
        .addSelect('AVG(m.marks)', 'avgMark')
        .where('m.termId = :termId', { termId })
        .groupBy('m.studentId')
        .addGroupBy('m.classId');
    if (classId)
        qb.andWhere('m.classId = :classId', { classId });
    const averages = await qb.getRawMany();
    const classGroups = new Map();
    for (const row of averages) {
        const list = classGroups.get(row.classId) || [];
        list.push(row);
        classGroups.set(row.classId, list);
    }
    await honourRepo.delete({ termId, ...(classId ? { classId } : {}) });
    const allRanked = [];
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
    const classRepo = data_source_1.AppDataSource.getRepository(entities_1.SchoolClass);
    const classes = await classRepo.find({ relations: (0, typeorm_helpers_1.relations)('form') });
    const classFormMap = new Map(classes.map((c) => [c.id, c.formId]));
    const formGroups = new Map();
    for (const r of allRanked) {
        const formId = classFormMap.get(r.classId);
        if (!formId)
            continue;
        const list = formGroups.get(formId) || [];
        list.push({ ...r, formId });
        formGroups.set(formId, list);
    }
    const formPositionMap = new Map();
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
async function getPositionsForStudent(studentId, termId) {
    const honourRepo = data_source_1.AppDataSource.getRepository(entities_1.HonourRoll);
    return honourRepo.findOne({ where: { studentId, termId } });
}
