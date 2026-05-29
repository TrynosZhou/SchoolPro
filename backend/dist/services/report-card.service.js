"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getClassTermAttendanceMap = getClassTermAttendanceMap;
exports.getStudentTermAttendance = getStudentTermAttendance;
exports.attachAttendanceToReports = attachAttendanceToReports;
exports.buildClassMeanMap = buildClassMeanMap;
exports.buildFormSubjectPositionMap = buildFormSubjectPositionMap;
exports.computeFormPositionMap = computeFormPositionMap;
exports.countSubjectsPassed = countSubjectsPassed;
exports.getEnrollmentTotals = getEnrollmentTotals;
exports.getReportCardPdfMetrics = getReportCardPdfMetrics;
exports.enrichReportCardSubjectResults = enrichReportCardSubjectResults;
exports.syncReportCardForStudent = syncReportCardForStudent;
exports.generateClassReportCards = generateClassReportCards;
const data_source_1 = require("../config/data-source");
const entities_1 = require("../entities");
const grade_service_1 = require("./grade.service");
const typeorm_helpers_1 = require("../utils/typeorm-helpers");
const helpers_1 = require("../utils/helpers");
const typeorm_1 = require("typeorm");
function parseAttendanceRow(r) {
    const daysMarked = Number(r.daysMarked) || 0;
    const present = Number(r.present) || 0;
    const absent = Number(r.absent) || 0;
    const late = Number(r.late) || 0;
    const excused = Number(r.excused) || 0;
    const attendancePercent = daysMarked
        ? Math.round(((present + late) / daysMarked) * 1000) / 10
        : null;
    return { daysMarked, present, absent, late, excused, attendancePercent };
}
/** Class attendance totals for a term (same logic as attendance report). */
async function getClassTermAttendanceMap(classId, termId) {
    const map = new Map();
    const term = await data_source_1.AppDataSource.getRepository(entities_1.Term).findOne({ where: { id: termId } });
    if (!term)
        return map;
    const { startDate, endDate } = (0, helpers_1.termReportDateRange)(term);
    const rows = await data_source_1.AppDataSource.query(`
    SELECT
      s.id AS "studentId",
      COUNT(a.id)::int AS "daysMarked",
      COUNT(*) FILTER (WHERE a.status::text = 'present')::int AS present,
      COUNT(*) FILTER (WHERE a.status::text = 'absent')::int AS absent,
      COUNT(*) FILTER (WHERE a.status::text = 'late')::int AS late,
      COUNT(*) FILTER (WHERE a.status::text = 'excused')::int AS excused
    FROM students s
    LEFT JOIN student_attendance a
      ON a."studentId" = s.id
      AND a.date::date >= $2::date
      AND a.date::date <= $3::date
    WHERE s."classId" = $1 AND s."isActive" = true
    GROUP BY s.id
    `, [classId, startDate, endDate]);
    for (const row of rows) {
        map.set(String(row.studentId), parseAttendanceRow(row));
    }
    return map;
}
async function getStudentTermAttendance(studentId, termId, classId) {
    let resolvedClassId = classId;
    if (!resolvedClassId) {
        const student = await data_source_1.AppDataSource.getRepository(entities_1.Student).findOne({
            where: { id: studentId },
        });
        resolvedClassId = student?.classId;
    }
    if (!resolvedClassId) {
        return parseAttendanceRow({});
    }
    const map = await getClassTermAttendanceMap(resolvedClassId, termId);
    return map.get(studentId) ?? parseAttendanceRow({});
}
function attachAttendanceToReports(reports, attendanceMap) {
    return reports.map((r) => ({
        ...r,
        attendance: attendanceMap.get(r.studentId) ?? parseAttendanceRow({}),
    }));
}
function groupKey(subjectId, examTypeId) {
    return `${subjectId}|${examTypeId}`;
}
function studentSubjectKey(studentId, subjectId, examTypeId) {
    return `${studentId}|${subjectId}|${examTypeId}`;
}
/** Class average mark per subject (within the learner's class only). */
function buildClassMeanMap(classMarks) {
    const meanMap = new Map();
    const byGroup = new Map();
    for (const m of classMarks) {
        const gk = groupKey(m.subjectId, m.examTypeId);
        const list = byGroup.get(gk) || [];
        list.push(m);
        byGroup.set(gk, list);
    }
    for (const [gk, marks] of byGroup) {
        const mean = marks.reduce((s, m) => s + Number(m.marks), 0) / marks.length;
        meanMap.set(gk, Math.round(mean * 100) / 100);
    }
    return meanMap;
}
/** Subject rank across the whole form/stream (all classes in the grade). */
function buildFormSubjectPositionMap(formMarks) {
    const byGroup = new Map();
    for (const m of formMarks) {
        const gk = groupKey(m.subjectId, m.examTypeId);
        const list = byGroup.get(gk) || [];
        list.push(m);
        byGroup.set(gk, list);
    }
    const positionMap = new Map();
    for (const marks of byGroup.values()) {
        const sorted = [...marks].sort((a, b) => {
            const diff = Number(b.marks) - Number(a.marks);
            if (diff !== 0)
                return diff;
            return a.studentId.localeCompare(b.studentId);
        });
        let position = 0;
        let lastScore = null;
        sorted.forEach((m, index) => {
            const score = Number(m.marks);
            if (index === 0 || score !== lastScore) {
                position = index + 1;
                lastScore = score;
            }
            positionMap.set(studentSubjectKey(m.studentId, m.subjectId, m.examTypeId), position);
        });
    }
    return positionMap;
}
function resolveFormId(student) {
    return student.formId ?? student.schoolClass?.formId;
}
async function getFormClassIds(formId) {
    const classes = await data_source_1.AppDataSource.getRepository(entities_1.SchoolClass).find({
        where: { formId },
        select: { id: true },
    });
    return classes.map((c) => c.id);
}
/** All exam marks for every class in a form/stream (used for subject ranking). */
async function loadFormMarksForRanking(formId, termId, examTypeId) {
    const classIds = await getFormClassIds(formId);
    if (!classIds.length)
        return [];
    const markRepo = data_source_1.AppDataSource.getRepository(entities_1.ExamMark);
    const where = {
        termId,
        classId: (0, typeorm_1.In)(classIds),
    };
    if (examTypeId)
        where.examTypeId = examTypeId;
    return markRepo.find({ where, relations: (0, typeorm_helpers_1.relations)('subject') });
}
function codesMatch(a, b) {
    if (!a || !b)
        return false;
    return a.trim().toUpperCase() === b.trim().toUpperCase();
}
function findMarkForRow(marks, studentId, row, subjectId) {
    return marks.find((m) => {
        if (m.studentId !== studentId)
            return false;
        if (subjectId)
            return m.subjectId === subjectId;
        if (row.subjectId)
            return m.subjectId === row.subjectId;
        if (row.subjectCode)
            return codesMatch(m.subject?.code, row.subjectCode);
        const rowName = (row.subjectName || row.subject || '').split(' — ')[0].trim().toLowerCase();
        return rowName && m.subject?.name?.trim().toLowerCase() === rowName;
    });
}
/** Rank students in a form by overall average for an exam session. */
async function computeFormPositionMap(examTypeId, termId, formId) {
    const formMarks = await loadFormMarksForRanking(formId, termId, examTypeId);
    const marksByStudent = new Map();
    for (const m of formMarks) {
        const list = marksByStudent.get(m.studentId) || [];
        list.push(Number(m.marks));
        marksByStudent.set(m.studentId, list);
    }
    const averages = [];
    marksByStudent.forEach((markList, studentId) => {
        if (!markList.length)
            return;
        averages.push({
            studentId,
            average: markList.reduce((s, v) => s + v, 0) / markList.length,
        });
    });
    averages.sort((a, b) => b.average - a.average);
    const positionMap = new Map();
    let rank = 0;
    let lastAvg = null;
    averages.forEach((row, idx) => {
        if (idx === 0 || row.average !== lastAvg) {
            rank = idx + 1;
            lastAvg = row.average;
        }
        positionMap.set(row.studentId, rank);
    });
    return positionMap;
}
function attachRankingToRow(row, studentId, subjectId, examTypeId, positionMap, meanMap, formTotal) {
    const gk = groupKey(subjectId, examTypeId);
    return {
        ...row,
        subjectId,
        examTypeId,
        mean: meanMap.get(gk),
        subjectPosition: positionMap.get(studentSubjectKey(studentId, subjectId, examTypeId)),
        subjectPositionTotal: formTotal > 0 ? formTotal : undefined,
    };
}
const PASS_PERCENT = 50;
/** Count subjects at or above the pass percentage (default 50% of max marks). */
function countSubjectsPassed(rows, maxMarks, minPercent = PASS_PERCENT) {
    return rows.filter((r) => {
        const pct = maxMarks > 0 ? (Number(r.marks) / maxMarks) * 100 : Number(r.marks);
        return pct >= minPercent;
    }).length;
}
async function getEnrollmentTotals(classId, formId) {
    const studentRepo = data_source_1.AppDataSource.getRepository(entities_1.Student);
    const classTotal = classId
        ? await studentRepo.count({ where: { classId, isActive: true } })
        : 0;
    let formTotal = 0;
    if (formId) {
        const classIds = await getFormClassIds(formId);
        if (classIds.length) {
            formTotal = await studentRepo.count({
                where: { classId: (0, typeorm_1.In)(classIds), isActive: true },
            });
        }
        else {
            formTotal = await studentRepo.count({ where: { formId, isActive: true } });
        }
    }
    return { classTotal, formTotal };
}
/** Metrics and enriched rows for PDF / API display. */
async function getReportCardPdfMetrics(report, maxMarks = 100) {
    const subjectResults = await enrichReportCardSubjectResults(report);
    const student = report.student;
    const classId = student?.classId;
    const formId = student ? resolveFormId(student) : undefined;
    const { classTotal, formTotal } = await getEnrollmentTotals(classId, formId);
    const totalSubjects = subjectResults.length;
    const subjectsPassed = countSubjectsPassed(subjectResults, maxMarks);
    let formPosition = report.formPosition ?? undefined;
    let classPosition = report.classPosition ?? undefined;
    if (report.examTypeId && formId && !formPosition) {
        const formPosMap = await computeFormPositionMap(report.examTypeId, report.termId, formId);
        formPosition = formPosMap.get(report.studentId);
    }
    const attendance = await getStudentTermAttendance(report.studentId, report.termId, student?.classId);
    return {
        subjectResults,
        classTotal: report.classTotal ?? classTotal,
        formTotal: report.formTotal ?? formTotal,
        classPosition: classPosition ?? undefined,
        formPosition: formPosition ?? undefined,
        subjectsPassed: report.subjectsPassed ?? subjectsPassed,
        totalSubjects: report.totalSubjects ?? totalSubjects,
        attendance,
    };
}
/** Recompute subject means/positions from class marks (e.g. before PDF export). */
async function enrichReportCardSubjectResults(report) {
    const raw = (report.subjectResults || []);
    if (!raw.length)
        return raw;
    const student = report.student ||
        (await data_source_1.AppDataSource.getRepository(entities_1.Student).findOne({
            where: { id: report.studentId },
            relations: (0, typeorm_helpers_1.relations)('schoolClass', 'schoolClass.form'),
        }));
    if (!student)
        return raw;
    const formId = resolveFormId(student);
    const { formTotal } = await getEnrollmentTotals(student.classId, formId);
    const markRepo = data_source_1.AppDataSource.getRepository(entities_1.ExamMark);
    const classMarks = student.classId
        ? await markRepo.find({
            where: {
                termId: report.termId,
                classId: student.classId,
                ...(report.examTypeId ? { examTypeId: report.examTypeId } : {}),
            },
            relations: (0, typeorm_helpers_1.relations)('subject'),
        })
        : [];
    const formMarks = formId
        ? await loadFormMarksForRanking(formId, report.termId, report.examTypeId)
        : [];
    const meanMap = buildClassMeanMap(classMarks);
    const positionMap = buildFormSubjectPositionMap(formMarks);
    return raw.map((row) => {
        let subjectId = row.subjectId;
        let examTypeId = row.examTypeId || report.examTypeId;
        if (!subjectId || !examTypeId) {
            const mark = findMarkForRow([...classMarks, ...formMarks], report.studentId, row, subjectId);
            if (mark) {
                subjectId = mark.subjectId;
                examTypeId = mark.examTypeId;
            }
        }
        if (!subjectId || !examTypeId) {
            return { ...row, subjectPositionTotal: formTotal > 0 ? formTotal : row.subjectPositionTotal };
        }
        const enriched = attachRankingToRow(row, report.studentId, subjectId, examTypeId, positionMap, meanMap, formTotal);
        if (enriched.subjectPosition == null && row.subjectPosition != null) {
            enriched.subjectPosition = row.subjectPosition;
        }
        return enriched;
    });
}
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
    const formId = resolveFormId(student);
    const { classTotal, formTotal } = await getEnrollmentTotals(student.classId, formId);
    const classMarks = student.classId
        ? await markRepo.find({ where: { termId, classId: student.classId } })
        : [];
    const formMarks = formId ? await loadFormMarksForRanking(formId, termId) : [];
    const meanMap = buildClassMeanMap(classMarks);
    const positionMap = buildFormSubjectPositionMap(formMarks);
    const sortedMarks = marks.sort((a, b) => a.subject.name.localeCompare(b.subject.name));
    const subjectResults = await Promise.all(sortedMarks.map(async (m) => {
        const base = {
            subject: `${m.subject.name} — ${m.examType.name}`,
            subjectName: m.subject.name,
            subjectCode: m.subject.code,
            subjectId: m.subjectId,
            examTypeId: m.examTypeId,
            examType: m.examType.name,
            marks: Number(m.marks),
            grade: m.grade ||
                (await (0, grade_service_1.gradeForMarks)(Number(m.marks), Number(m.examType.maxMarks))),
            remarks: m.remarks || '',
        };
        return attachRankingToRow(base, studentId, m.subjectId, m.examTypeId, positionMap, meanMap, formTotal);
    }));
    const avg = subjectResults.reduce((s, r) => s + r.marks, 0) / subjectResults.length;
    const maxMarksByType = new Map();
    for (const m of marks) {
        maxMarksByType.set(m.examTypeId, Number(m.examType.maxMarks) || 100);
    }
    const subjectsPassed = subjectResults.filter((r) => {
        const max = r.examTypeId ? maxMarksByType.get(r.examTypeId) || 100 : 100;
        return countSubjectsPassed([r], max) === 1;
    }).length;
    let report = await reportRepo.findOne({ where: { studentId, termId } });
    if (!report) {
        report = reportRepo.create({ studentId, termId, isPublished: true });
    }
    report.subjectResults = subjectResults;
    report.averageMark = Math.round(avg * 100) / 100;
    report.overallGrade = await (0, grade_service_1.gradeForMarks)(avg);
    report.classTotal = classTotal;
    report.formTotal = formTotal;
    report.subjectsPassed = subjectsPassed;
    report.totalSubjects = subjectResults.length;
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
    const classTotal = students.length;
    const formId = students[0] ? resolveFormId(students[0]) : undefined;
    const { formTotal } = await getEnrollmentTotals(classId, formId);
    const classMarks = await markRepo.find({
        where: { examTypeId, termId, classId },
        relations: (0, typeorm_helpers_1.relations)('subject'),
    });
    const formMarks = formId
        ? await loadFormMarksForRanking(formId, termId, examTypeId)
        : [];
    const meanMap = buildClassMeanMap(classMarks);
    const positionMap = buildFormSubjectPositionMap(formMarks);
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
            .map(async (m) => {
            const base = {
                subject: m.subject.name,
                subjectName: m.subject.name,
                subjectCode: m.subject.code,
                subjectId: m.subjectId,
                examTypeId: m.examTypeId,
                examType: examType.name,
                marks: Number(m.marks),
                grade: m.grade ||
                    (await (0, grade_service_1.gradeForMarks)(Number(m.marks), Number(examType.maxMarks))),
                remarks: m.remarks || '',
            };
            return attachRankingToRow(base, student.id, m.subjectId, m.examTypeId, positionMap, meanMap, formTotal);
        }));
        const average = subjectResults.reduce((s, r) => s + Number(r.marks), 0) / subjectResults.length;
        scoreRows.push({ studentId: student.id, average, subjectResults });
    }
    scoreRows.sort((a, b) => b.average - a.average);
    const classPositionMap = new Map();
    let classRank = 0;
    let lastAvg = null;
    scoreRows.forEach((row, idx) => {
        if (idx === 0 || row.average !== lastAvg) {
            classRank = idx + 1;
            lastAvg = row.average;
        }
        classPositionMap.set(row.studentId, classRank);
    });
    const formPositionMap = formId
        ? await computeFormPositionMap(examTypeId, termId, formId)
        : new Map();
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
        report.formPosition = formPositionMap.get(row.studentId);
        report.classTotal = classTotal;
        report.formTotal = formTotal;
        report.subjectsPassed = countSubjectsPassed(row.subjectResults, Number(examType.maxMarks));
        report.totalSubjects = row.subjectResults.length;
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
    const attendanceMap = await getClassTermAttendanceMap(classId, termId);
    return {
        examType: { id: examType.id, name: examType.name },
        count: saved.length,
        reports: attachAttendanceToReports(saved, attendanceMap),
    };
}
