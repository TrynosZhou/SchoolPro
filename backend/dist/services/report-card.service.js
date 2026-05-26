"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncReportCardForStudent = syncReportCardForStudent;
exports.generateClassReportCards = generateClassReportCards;
const data_source_1 = require("../config/data-source");
const entities_1 = require("../entities");
const grade_service_1 = require("./grade.service");
const typeorm_helpers_1 = require("../utils/typeorm-helpers");
/** Rebuild a student's report card from all exam marks for the term. */
async function syncReportCardForStudent(studentId, termId) {
    const markRepo = data_source_1.AppDataSource.getRepository(entities_1.ExamMark);
    const reportRepo = data_source_1.AppDataSource.getRepository(entities_1.ReportCard);
    const studentRepo = data_source_1.AppDataSource.getRepository(entities_1.Student);
    const student = await studentRepo.findOne({
        where: { id: studentId },
        relations: (0, typeorm_helpers_1.relations)('schoolClass', 'schoolClass.form'),
    });
    if (!student)
        return null;
    const marks = await markRepo.find({
        where: { studentId, termId },
        relations: (0, typeorm_helpers_1.relations)('subject', 'examType'),
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
    const subjectResults = await Promise.all(sortedMarks.map(async (m) => ({
        subject: `${m.subject.name} — ${m.examType.name}`,
        subjectName: m.subject.name,
        subjectCode: m.subject.code,
        examType: m.examType.name,
        marks: Number(m.marks),
        grade: m.grade ||
            (await (0, grade_service_1.gradeForMarks)(Number(m.marks), Number(m.examType.maxMarks))),
        remarks: m.remarks || '',
    })));
    const avg = subjectResults.reduce((s, r) => s + r.marks, 0) / subjectResults.length;
    let report = await reportRepo.findOne({ where: { studentId, termId } });
    if (!report) {
        report = reportRepo.create({ studentId, termId, isPublished: true });
    }
    report.subjectResults = subjectResults;
    report.averageMark = Math.round(avg * 100) / 100;
    report.overallGrade = await (0, grade_service_1.gradeForMarks)(avg);
    report.isPublished = true;
    await reportRepo.save(report);
    return report;
}
/** Generate report cards for all students in a class (filtered by exam type + term), ranked by class position. */
async function generateClassReportCards(params) {
    const { examTypeId, termId, classId } = params;
    const markRepo = data_source_1.AppDataSource.getRepository(entities_1.ExamMark);
    const reportRepo = data_source_1.AppDataSource.getRepository(entities_1.ReportCard);
    const studentRepo = data_source_1.AppDataSource.getRepository(entities_1.Student);
    const examTypeRepo = data_source_1.AppDataSource.getRepository(entities_1.ExamType);
    const examType = await examTypeRepo.findOne({ where: { id: examTypeId } });
    if (!examType) {
        throw new Error('Exam type not found');
    }
    const students = await studentRepo.find({
        where: { classId, isActive: true },
        relations: (0, typeorm_helpers_1.relations)('schoolClass', 'schoolClass.form'),
        order: { lastName: 'ASC', firstName: 'ASC' },
    });
    const classMarks = await markRepo.find({
        where: { examTypeId, termId, classId },
        relations: (0, typeorm_helpers_1.relations)('subject'),
    });
    const marksByStudent = new Map();
    for (const m of classMarks) {
        const list = marksByStudent.get(m.studentId) || [];
        list.push(m);
        marksByStudent.set(m.studentId, list);
    }
    const scoreRows = [];
    for (const student of students) {
        const marks = marksByStudent.get(student.id) || [];
        if (!marks.length)
            continue;
        const subjectResults = await Promise.all([...marks]
            .sort((a, b) => a.subject.name.localeCompare(b.subject.name))
            .map(async (m) => ({
            subject: m.subject.name,
            subjectName: m.subject.name,
            subjectCode: m.subject.code,
            examType: examType.name,
            marks: Number(m.marks),
            grade: m.grade ||
                (await (0, grade_service_1.gradeForMarks)(Number(m.marks), Number(examType.maxMarks))),
            remarks: m.remarks || '',
        })));
        const average = subjectResults.reduce((s, r) => s + Number(r.marks), 0) / subjectResults.length;
        scoreRows.push({ studentId: student.id, average, subjectResults });
    }
    scoreRows.sort((a, b) => b.average - a.average);
    const classPositionMap = new Map();
    scoreRows.forEach((row, idx) => classPositionMap.set(row.studentId, idx + 1));
    const saved = [];
    for (const row of scoreRows) {
        let report = await reportRepo.findOne({
            where: { studentId: row.studentId, termId, examTypeId },
        });
        if (!report) {
            report = reportRepo.create({ studentId: row.studentId, termId, examTypeId });
        }
        report.subjectResults = row.subjectResults;
        report.averageMark = Math.round(row.average * 100) / 100;
        report.overallGrade = await (0, grade_service_1.gradeForMarks)(row.average, Number(examType.maxMarks));
        report.classPosition = classPositionMap.get(row.studentId);
        report.isPublished = true;
        await reportRepo.save(report);
        const full = await reportRepo.findOne({
            where: { id: report.id },
            relations: (0, typeorm_helpers_1.relations)('student', 'student.schoolClass', 'student.schoolClass.form', 'term', 'examType'),
        });
        if (full)
            saved.push(full);
    }
    saved.sort((a, b) => (a.classPosition ?? 999) - (b.classPosition ?? 999));
    return {
        examType: { id: examType.id, name: examType.name },
        count: saved.length,
        reports: saved,
    };
}
