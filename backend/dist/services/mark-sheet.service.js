"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildMarkSheet = buildMarkSheet;
const data_source_1 = require("../config/data-source");
const entities_1 = require("../entities");
const grade_service_1 = require("./grade.service");
const typeorm_helpers_1 = require("../utils/typeorm-helpers");
const GRADE_LETTERS = ['A', 'B', 'C', 'D', 'E', 'U'];
function emptyGradeCounts() {
    return { A: 0, B: 0, C: 0, D: 0, E: 0, U: 0 };
}
function round2(value) {
    return Math.round(value * 100) / 100;
}
function normalizeGradeLetter(grade) {
    if (!grade)
        return null;
    const letter = grade.trim().toUpperCase().charAt(0);
    if (GRADE_LETTERS.includes(letter)) {
        return letter;
    }
    return null;
}
/** Passed when mark scored is greater than 49. */
function isPassingMark(marks) {
    return marks > 49;
}
async function buildMarkSheet(params) {
    const { examTypeId, termId, classId } = params;
    const examType = await data_source_1.AppDataSource.getRepository(entities_1.ExamType).findOne({ where: { id: examTypeId } });
    if (!examType)
        throw new Error('Exam type not found');
    const term = await data_source_1.AppDataSource.getRepository(entities_1.Term).findOne({ where: { id: termId } });
    if (!term)
        throw new Error('Term not found');
    const schoolClass = await data_source_1.AppDataSource.getRepository(entities_1.SchoolClass).findOne({
        where: { id: classId },
        relations: (0, typeorm_helpers_1.relations)('form'),
    });
    if (!schoolClass)
        throw new Error('Class not found');
    const settings = await data_source_1.AppDataSource.getRepository(entities_1.SchoolSettings).findOne({ where: { id: 'default' } });
    const schoolName = settings?.schoolName || 'School Pro Academy';
    const students = await data_source_1.AppDataSource.getRepository(entities_1.Student).find({
        where: { classId, isActive: true },
        order: { lastName: 'ASC', firstName: 'ASC' },
    });
    const classSubjectRows = await data_source_1.AppDataSource.getRepository(entities_1.ClassSubject).find({
        where: { classId },
        relations: (0, typeorm_helpers_1.relations)('subject'),
    });
    const classMarks = await data_source_1.AppDataSource.getRepository(entities_1.ExamMark).find({
        where: { examTypeId, termId, classId },
        relations: (0, typeorm_helpers_1.relations)('subject'),
    });
    const subjectMap = new Map();
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
    const subjects = [...subjectMap.values()].sort((a, b) => a.name.localeCompare(b.name) || a.code.localeCompare(b.code));
    const markLookup = new Map();
    for (const m of classMarks) {
        markLookup.set(`${m.studentId}:${m.subjectId}`, m);
    }
    const maxMarks = Number(examType.maxMarks) || 100;
    const built = [];
    for (const student of students) {
        const marksBySubject = {};
        const gradeCounts = emptyGradeCounts();
        const markValues = [];
        let subjectsPassed = 0;
        for (const sub of subjects) {
            const m = markLookup.get(`${student.id}:${sub.id}`);
            if (m != null) {
                const marks = Number(m.marks);
                marksBySubject[sub.id] = { marks };
                markValues.push(marks);
                const gradeLetter = normalizeGradeLetter(m.grade || (await (0, grade_service_1.gradeForMarks)(marks, maxMarks)));
                if (gradeLetter)
                    gradeCounts[gradeLetter] += 1;
                if (isPassingMark(marks))
                    subjectsPassed += 1;
            }
            else {
                marksBySubject[sub.id] = { marks: null };
            }
        }
        const subjectCount = markValues.length;
        const averagePercent = subjectCount > 0 ? round2(markValues.reduce((a, b) => a + b, 0) / subjectCount) : null;
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
        if (b.averagePercent !== a.averagePercent)
            return b.averagePercent - a.averagePercent;
        return a.student.lastName.localeCompare(b.student.lastName);
    });
    const positionByStudentId = new Map();
    let position = 0;
    let lastAverage = null;
    ranked.forEach((row, index) => {
        if (index === 0 || row.averagePercent !== lastAverage) {
            position = index + 1;
            lastAverage = row.averagePercent;
        }
        positionByStudentId.set(row.student.id, position);
    });
    const studentsOut = built.map((row) => ({
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
        if (a.position != null && b.position != null)
            return a.position - b.position;
        if (a.position != null)
            return -1;
        if (b.position != null)
            return 1;
        return a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName);
    });
    return {
        schoolName,
        tagline: settings?.tagline || undefined,
        logoUrl: settings?.logoUrl || undefined,
        examType: { id: examType.id, name: examType.name, maxMarks },
        term: { id: term.id, name: term.name },
        class: { id: schoolClass.id, name: schoolClass.name },
        subjects,
        students: studentsOut,
    };
}
