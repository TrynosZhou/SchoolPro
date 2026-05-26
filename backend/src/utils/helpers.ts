import { v4 as uuidv4 } from 'uuid';
import { AppDataSource } from '../config/data-source';
import { DEFAULT_GRADE_BOUNDARIES, calculateGradeFromBoundaries } from '../types/grade-boundaries';

const STUDENT_ID_PREFIX = 'SP';
const STUDENT_ID_DIGITS = 6;

/** Next sequential Student ID: SP + 6 digits (e.g. SP000001). */
export async function generateStudentId(): Promise<string> {
  const [row] = await AppDataSource.query(`
    SELECT COALESCE(MAX(CAST(SUBSTRING("admissionNumber" FROM 3) AS INTEGER)), 0) AS max_num
    FROM students
    WHERE "admissionNumber" ~ '^SP[0-9]{6}$'
  `);
  const next = Number(row?.max_num ?? 0) + 1;
  if (next > 10 ** STUDENT_ID_DIGITS - 1) {
    throw new Error('Student ID sequence exhausted (SP999999)');
  }
  return `${STUDENT_ID_PREFIX}${String(next).padStart(STUDENT_ID_DIGITS, '0')}`;
}

const EMPLOYEE_ID_PREFIX = 'EMP';
const EMPLOYEE_ID_DIGITS = 6;

/** Next sequential Employee ID: EMP + 6 digits (e.g. EMP000001). */
export async function generateEmployeeNumber(): Promise<string> {
  const [row] = await AppDataSource.query(`
    SELECT COALESCE(MAX(CAST(SUBSTRING("employeeNumber" FROM 4) AS INTEGER)), 0) AS max_num
    FROM staff
    WHERE "employeeNumber" ~ '^EMP[0-9]{6}$'
  `);
  const next = Number(row?.max_num ?? 0) + 1;
  if (next > 10 ** EMPLOYEE_ID_DIGITS - 1) {
    throw new Error('Employee ID sequence exhausted (EMP999999)');
  }
  return `${EMPLOYEE_ID_PREFIX}${String(next).padStart(EMPLOYEE_ID_DIGITS, '0')}`;
}

export function generateNumber(prefix: string): string {
  const date = new Date();
  const ymd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  return `${prefix}-${ymd}-${uuidv4().slice(0, 8).toUpperCase()}`;
}

/** @deprecated Prefer gradeForMarks() from grade.service for configurable boundaries. */
export function calculateGrade(marks: number, max = 100): string {
  return calculateGradeFromBoundaries(marks, max, DEFAULT_GRADE_BOUNDARIES);
}

export function today(): string {
  return new Date().toISOString().split('T')[0];
}

/** Normalize DB/entity dates to YYYY-MM-DD for SQL date comparisons. */
export function toDateOnly(value: string | Date): string {
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

/**
 * Date range for attendance reports. Current terms extend through today so
 * marks saved after the configured term end still appear in reports.
 */
export function termReportDateRange(term: {
  startDate: string | Date;
  endDate: string | Date;
  isCurrent?: boolean;
}): { startDate: string; endDate: string; extendedEnd: boolean } {
  const startDate = toDateOnly(term.startDate);
  let endDate = toDateOnly(term.endDate);
  const todayStr = today();
  let extendedEnd = false;
  if (term.isCurrent && todayStr > endDate) {
    endDate = todayStr;
    extendedEnd = true;
  }
  return { startDate, endDate, extendedEnd };
}

