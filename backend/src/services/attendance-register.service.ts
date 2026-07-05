import { AppDataSource } from '../config/data-source';
import { isSchoolDay, today } from '../utils/helpers';

export interface UnmarkedClassRow {
  classId: string;
  className: string;
  formName?: string | null;
  studentCount: number;
  markedCount: number;
}

/** Classes with active students whose register is missing or incomplete for the given date. */
export async function getUnmarkedClassesForDate(dateStr = today()): Promise<{
  date: string;
  isSchoolDay: boolean;
  unmarkedClasses: UnmarkedClassRow[];
}> {
  if (!isSchoolDay(dateStr)) {
    return { date: dateStr, isSchoolDay: false, unmarkedClasses: [] };
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
    unmarkedClasses: rows.map((r: Record<string, unknown>) => ({
      classId: String(r.classId),
      className: String(r.className),
      formName: r.formName != null ? String(r.formName) : null,
      studentCount: Number(r.studentCount) || 0,
      markedCount: Number(r.markedCount) || 0,
    })),
  };
}
