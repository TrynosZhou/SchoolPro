"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildMarkEntryProgress = buildMarkEntryProgress;
const data_source_1 = require("../config/data-source");
const entities_1 = require("../entities");
const class_display_1 = require("../utils/class-display");
function roundPercent(marked, total) {
    if (!total)
        return 0;
    return Math.round((marked / total) * 1000) / 10;
}
async function buildMarkEntryProgress(params) {
    const { examTypeId, termId, classId, formId, staffId } = params;
    const examType = await data_source_1.AppDataSource.getRepository(entities_1.ExamType).findOne({ where: { id: examTypeId } });
    if (!examType)
        throw new Error('Exam type not found');
    const term = await data_source_1.AppDataSource.getRepository(entities_1.Term).findOne({ where: { id: termId } });
    if (!term)
        throw new Error('Term not found');
    const settings = await data_source_1.AppDataSource.getRepository(entities_1.SchoolSettings).findOne({ where: { id: 'default' } });
    const schoolName = settings?.schoolName || 'School Pro Academy';
    const sqlParams = [termId, examTypeId];
    const conditions = [];
    if (classId) {
        sqlParams.push(classId);
        conditions.push(`c.id = $${sqlParams.length}`);
    }
    if (formId) {
        sqlParams.push(formId);
        conditions.push(`c."formId" = $${sqlParams.length}`);
    }
    if (staffId) {
        sqlParams.push(staffId);
        const idx = sqlParams.length;
        conditions.push(`(cs."teacherId" = $${idx} OR c."classTeacherId" = $${idx})`);
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rawRows = await data_source_1.AppDataSource.query(`
    SELECT
      c.id AS "classId",
      c.name AS "className",
      f.name AS "formName",
      s.id AS "subjectId",
      s.code AS "subjectCode",
      s.name AS "subjectName",
      NULLIF(TRIM(COALESCE(u."firstName", '') || ' ' || COALESCE(u."lastName", '')), '') AS "teacherName",
      COALESCE(sc.cnt, 0)::int AS "totalStudents",
      COALESCE(mc.cnt, 0)::int AS "markedStudents"
    FROM class_subjects cs
    INNER JOIN classes c ON c.id = cs."classId"
    LEFT JOIN forms f ON f.id = c."formId"
    INNER JOIN subjects s ON s.id = cs."subjectId"
    LEFT JOIN staff st ON st.id = cs."teacherId"
    LEFT JOIN users u ON u.id = st."userId"
    LEFT JOIN (
      SELECT "classId", COUNT(*)::int AS cnt
      FROM students
      WHERE "isActive" = true AND "classId" IS NOT NULL
      GROUP BY "classId"
    ) sc ON sc."classId" = c.id
    LEFT JOIN (
      SELECT "classId", "subjectId", COUNT(DISTINCT "studentId")::int AS cnt
      FROM exam_marks
      WHERE "termId" = $1 AND "examTypeId" = $2
      GROUP BY "classId", "subjectId"
    ) mc ON mc."classId" = cs."classId" AND mc."subjectId" = cs."subjectId"
    ${whereClause}
    ORDER BY f.name NULLS LAST, c.name, s.name
    `, sqlParams);
    const rows = rawRows.map((row) => ({
        classId: row.classId,
        className: (0, class_display_1.formatStudentClassLabel)(row.className),
        formName: row.formName || undefined,
        subjectId: row.subjectId,
        subjectCode: row.subjectCode,
        subjectName: row.subjectName,
        teacherName: row.teacherName || undefined,
        totalStudents: row.totalStudents,
        markedStudents: row.markedStudents,
        progressPercent: roundPercent(row.markedStudents, row.totalStudents),
    }));
    let totalExpected = 0;
    let totalMarked = 0;
    let completeSubjects = 0;
    for (const row of rows) {
        totalExpected += row.totalStudents;
        totalMarked += row.markedStudents;
        if (row.totalStudents > 0 && row.markedStudents >= row.totalStudents) {
            completeSubjects += 1;
        }
    }
    return {
        schoolName,
        tagline: settings?.tagline || undefined,
        examType: { id: examType.id, name: examType.name, maxMarks: Number(examType.maxMarks) || 100 },
        term: { id: term.id, name: term.name },
        rows,
        summary: {
            totalExpected,
            totalMarked,
            overallProgressPercent: roundPercent(totalMarked, totalExpected),
            completeSubjects,
            totalSubjects: rows.length,
        },
    };
}
