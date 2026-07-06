import { AppDataSource } from '../config/data-source';
import { isSchoolDay, today } from '../utils/helpers';

export interface UnmarkedClassRow {
  classId: string;
  className: string;
  formName?: string | null;
  studentCount: number;
  markedCount: number;
}

const DEFAULT_PERIOD_ONE_START = '08:00';

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function hasLessonsStarted(periodOneStart: string, dateStr: string): boolean {
  if (dateStr !== today()) return true;
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes() >= timeToMinutes(periodOneStart);
}

/** Earliest lesson start from generated timetables, or default Period 1 time. */
async function resolvePeriodOneStartTime(): Promise<string> {
  const rows: { startTime?: string }[] = await AppDataSource.query(
    `SELECT MIN("startTime") AS "startTime" FROM timetables`,
  );
  const start = rows[0]?.startTime;
  if (start && /^\d{1,2}:\d{2}$/.test(String(start))) {
    return String(start);
  }
  return DEFAULT_PERIOD_ONE_START;
}

/** Classes with active students whose register is missing or incomplete for the given date. */
export async function getUnmarkedClassesForDate(dateStr = today()): Promise<{
  date: string;
  isSchoolDay: boolean;
  lessonsStarted: boolean;
  periodOneStart: string;
  unmarkedClasses: UnmarkedClassRow[];
}> {
  const periodOneStart = await resolvePeriodOneStartTime();

  if (!isSchoolDay(dateStr)) {
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

  const rows = await AppDataSource.query(
    `
    SELECT
      c.id AS "classId",
      c.name AS "className",
      f.name AS "formName",
      COUNT(DISTINCT s.id)::int AS "studentCount",
      COUNT(DISTINCT a."studentId")::int AS "markedCount"
    FROM classes c
    LEFT JOIN forms f ON f.id = c."formId"
    INNER JOIN students s ON s."classId" = c.id AND s."isActive" = true
    LEFT JOIN student_attendance a
      ON a."studentId" = s.id
      AND a.date::date = $1::date
    GROUP BY c.id, c.name, f.name
    HAVING COUNT(DISTINCT s.id) > 0
      AND COUNT(DISTINCT a."studentId") < COUNT(DISTINCT s.id)
    ORDER BY f.name NULLS LAST, c.name ASC
    `,
    [dateStr],
  );

  return {
    date: dateStr,
    isSchoolDay: true,
    lessonsStarted: true,
    periodOneStart,
    unmarkedClasses: rows.map((r: Record<string, unknown>) => ({
      classId: String(r.classId),
      className: String(r.className),
      formName: r.formName != null ? String(r.formName) : null,
      studentCount: Number(r.studentCount) || 0,
      markedCount: Number(r.markedCount) || 0,
    })),
  };
}
