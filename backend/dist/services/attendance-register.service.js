"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUnmarkedClassesForDate = getUnmarkedClassesForDate;
const data_source_1 = require("../config/data-source");
const helpers_1 = require("../utils/helpers");
const DEFAULT_PERIOD_ONE_START = '08:00';
function timeToMinutes(time) {
    const [h, m] = time.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
}
function hasLessonsStarted(periodOneStart, dateStr) {
    if (dateStr !== (0, helpers_1.today)())
        return true;
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes() >= timeToMinutes(periodOneStart);
}
/** Earliest lesson start from generated timetables, or default Period 1 time. */
async function resolvePeriodOneStartTime() {
    const rows = await data_source_1.AppDataSource.query(`SELECT MIN("startTime") AS "startTime" FROM timetables`);
    const start = rows[0]?.startTime;
    if (start && /^\d{1,2}:\d{2}$/.test(String(start))) {
        return String(start);
    }
    return DEFAULT_PERIOD_ONE_START;
}
/** Classes with active students whose register is missing or incomplete for the given date. */
async function getUnmarkedClassesForDate(dateStr = (0, helpers_1.today)(), options = {}) {
    const periodOneStart = await resolvePeriodOneStartTime();
    if (!(0, helpers_1.isSchoolDay)(dateStr)) {
        return {
            date: dateStr,
            isSchoolDay: false,
            lessonsStarted: false,
            periodOneStart,
            unmarkedClasses: [],
        };
    }
    const lessonsStarted = hasLessonsStarted(periodOneStart, dateStr);
    if (!lessonsStarted) {
        return {
            date: dateStr,
            isSchoolDay: true,
            lessonsStarted: false,
            periodOneStart,
            unmarkedClasses: [],
        };
    }
    const { staffId } = options;
    const sqlParams = [dateStr];
    const filters = [];
    if (staffId) {
        sqlParams.push(staffId);
        filters.push(`c."classTeacherId" = $${sqlParams.length}`);
    }
    const whereExtra = filters.length ? `AND ${filters.join(' AND ')}` : '';
    const rows = await data_source_1.AppDataSource.query(`
    SELECT
      c.id AS "classId",
      c.name AS "className",
      f.name AS "formName",
      NULLIF(TRIM(COALESCE(u."firstName", '') || ' ' || COALESCE(u."lastName", '')), '') AS "classTeacherName",
      NULLIF(TRIM(u.phone), '') AS "classTeacherPhone",
      COUNT(DISTINCT s.id)::int AS "studentCount",
      COUNT(DISTINCT a."studentId")::int AS "markedCount"
    FROM classes c
    LEFT JOIN forms f ON f.id = c."formId"
    LEFT JOIN staff ct ON ct.id = c."classTeacherId"
    LEFT JOIN users u ON u.id = ct."userId"
    INNER JOIN students s ON s."classId" = c.id AND s."isActive" = true
    LEFT JOIN student_attendance a
      ON a."studentId" = s.id
      AND a.date::date = $1::date
    WHERE 1=1 ${whereExtra}
    GROUP BY c.id, c.name, f.name, u."firstName", u."lastName", u.phone
    HAVING COUNT(DISTINCT s.id) > 0
      AND COUNT(DISTINCT a."studentId") < COUNT(DISTINCT s.id)
    ORDER BY f.name NULLS LAST, c.name ASC
    `, sqlParams);
    return {
        date: dateStr,
        isSchoolDay: true,
        lessonsStarted: true,
        periodOneStart,
        unmarkedClasses: rows.map((r) => ({
            classId: String(r.classId),
            className: String(r.className),
            formName: r.formName != null ? String(r.formName) : null,
            classTeacherName: r.classTeacherName != null ? String(r.classTeacherName) : null,
            classTeacherPhone: r.classTeacherPhone != null ? String(r.classTeacherPhone) : null,
            studentCount: Number(r.studentCount) || 0,
            markedCount: Number(r.markedCount) || 0,
        })),
    };
}
