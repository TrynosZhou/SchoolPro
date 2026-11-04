"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MIN_SUBJECTS_FOR_CLASS_PASS = void 0;
exports.buildResultsAnalysis = buildResultsAnalysis;
exports.buildSubjectAnalysis = buildSubjectAnalysis;
exports.buildStudentSubjectAnalysis = buildStudentSubjectAnalysis;
const data_source_1 = require("../config/data-source");
const entities_1 = require("../entities");
const grade_service_1 = require("./grade.service");
const mark_sheet_service_1 = require("./mark-sheet.service");
/** Minimum passed subjects (mark &gt; 49) for a student to count toward class pass rate. */
exports.MIN_SUBJECTS_FOR_CLASS_PASS = 5;
function round2(value) {
    return Math.round(value * 100) / 100;
}
function isPassingMark(marks) {
    return marks > 49;
}
function toPerformer(row, rank) {
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
async function buildResultsAnalysis(params) {
    const sheet = await (0, mark_sheet_service_1.buildMarkSheet)(params);
    const topN = Math.max(1, Math.min(50, params.topN ?? 5));
    const totalStudents = sheet.students.length;
    const studentsWithMarks = sheet.students.filter((s) => s.subjectCount > 0);
    const studentsPassedOverall = sheet.students.filter((s) => s.subjectsPassed >= exports.MIN_SUBJECTS_FOR_CLASS_PASS).length;
    const overallPassRatePercent = totalStudents > 0 ? round2((studentsPassedOverall / totalStudents) * 100) : 0;
    const ranked = [...studentsWithMarks]
        .filter((s) => s.averagePercent != null)
        .sort((a, b) => {
        if (b.averagePercent !== a.averagePercent)
            return b.averagePercent - a.averagePercent;
        if (b.subjectsPassed !== a.subjectsPassed)
            return b.subjectsPassed - a.subjectsPassed;
        return (a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
    });
    const topPerformers = ranked.slice(0, topN).map((row, i) => toPerformer(row, i + 1));
    const bottomSlice = ranked.slice(-topN);
    const bottomPerformers = bottomSlice
        .reverse()
        .map((row, i) => toPerformer(row, ranked.length - bottomSlice.length + i + 1));
    const subjectPassRates = sheet.subjects.map((sub) => {
        let studentsWithMarks = 0;
        let studentsPassed = 0;
        for (const student of sheet.students) {
            const marks = student.marksBySubject[sub.id]?.marks;
            if (marks == null)
                continue;
            studentsWithMarks++;
            if (isPassingMark(marks))
                studentsPassed++;
        }
        const passRatePercent = studentsWithMarks > 0 ? round2((studentsPassed / studentsWithMarks) * 100) : 0;
        return {
            subjectId: sub.id,
            subjectCode: sub.code,
            subjectName: sub.name,
            passRatePercent,
            studentsWithMarks,
            studentsPassed,
        };
    });
    const subjects = sheet.subjects.map((sub) => ({
        id: sub.id,
        code: sub.code,
        name: sub.name,
    }));
    return {
        examType: sheet.examType,
        term: sheet.term,
        class: sheet.class,
        minSubjectsForPass: exports.MIN_SUBJECTS_FOR_CLASS_PASS,
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
function toSubjectPerformer(row, rank, maxMarks) {
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
async function buildSubjectAnalysis(params) {
    const sheet = await (0, mark_sheet_service_1.buildMarkSheet)(params);
    const topN = Math.max(1, Math.min(50, params.topN ?? 5));
    const subject = sheet.subjects.find((s) => s.id === params.subjectId);
    if (!subject)
        throw new Error('Subject not found for this class');
    const maxMarks = sheet.examType.maxMarks;
    const ranked = sheet.students
        .map((student) => {
        const marks = student.marksBySubject[subject.id]?.marks;
        if (marks == null)
            return null;
        return {
            studentId: student.studentId,
            firstName: student.firstName,
            lastName: student.lastName,
            marks,
        };
    })
        .filter((row) => row != null)
        .sort((a, b) => {
        if (b.marks !== a.marks)
            return b.marks - a.marks;
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
async function buildStudentSubjectAnalysis(params) {
    const { studentId, classId } = params;
    const student = await data_source_1.AppDataSource.getRepository(entities_1.Student).findOne({
        where: { id: studentId, isActive: true },
    });
    if (!student)
        throw new Error('Student not found');
    if (student.classId !== classId) {
        throw new Error('Student is not enrolled in the selected class');
    }
    const sheet = await (0, mark_sheet_service_1.buildMarkSheet)({ ...params, skipGradeCounts: true });
    const row = sheet.students.find((s) => s.studentId === studentId);
    const maxMarks = sheet.examType.maxMarks;
    const subjects = await Promise.all(sheet.subjects.map(async (sub) => {
        const cell = row?.marksBySubject[sub.id];
        const marks = cell?.marks ?? null;
        let grade = null;
        let passed = false;
        let percentOfMax = null;
        if (marks != null) {
            grade = await (0, grade_service_1.gradeForMarks)(marks, maxMarks);
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
    }));
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
