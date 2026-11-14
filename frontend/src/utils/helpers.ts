import { randomInt } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { AppDataSource } from '../config/data-source';
import { SchoolSettings } from '../entities';
import { DEFAULT_GRADE_BOUNDARIES, calculateGradeFromBoundaries } from '../types/grade-boundaries';

const DEFAULT_STUDENT_ID_PREFIX = 'SP';

/**
 * Student ID format: {prefix}{RRRR}{MM}{YYYY}
 * - prefix from Admin → Settings (default SP)
 * - RRRR = 4 random digits (0000–9999)
 * - MM = month of student's date of birth (01–12)
 * - YYYY = year the student is registered
 * Example: SP1742072026 (prefix SP, random 1742, DOB month July, registered 2026)
 * Numeric part is 10 digits; last 4 = year, next 2 from the right = DOB month.
 */
export async function generateStudentId(dateOfBirth?: string | Date | null): Promise<string> {
  const prefix = await resolveStudentIdPrefix();
  const month = extractDobMonth(dateOfBirth);
  const year = String(new Date().getFullYear());

  for (let attempt = 0; attempt < 50; attempt++) {
    const randomDigits = String(randomInt(0, 10000)).padStart(4, '0');
    const candidate = `${prefix}${randomDigits}${month}${year}`;
    const [row] = await AppDataSource.query(
      `SELECT 1 AS found FROM students WHERE "admissionNumber" = $1 LIMIT 1`,
      [candidate],
    );
    if (!row) return candidate;
  }

  throw new Error(
    `Could not allocate a unique Student ID for DOB month ${month} in ${year} (prefix ${prefix}). ` +
      `All random variants may already be in use.`,
  );
}

/** Preview helper — same structure, may collide until save retries. */
export async function previewStudentId(dateOfBirth?: string | Date | null): Promise<string> {
  const prefix = await resolveStudentIdPrefix();
  const month = extractDobMonth(dateOfBirth);
  const year = String(new Date().getFullYear());
  const randomDigits = String(randomInt(0, 10000)).padStart(4, '0');
  return `${prefix}${randomDigits}${month}${year}`;
}

async function resolveStudentIdPrefix(): Promise<string> {
  const settings = await AppDataSource.getRepository(SchoolSettings).findOne({
    where: { id: 'default' },
  });
  const raw = String(settings?.studentIdPrefix || DEFAULT_STUDENT_ID_PREFIX).trim().toUpperCase();
  const cleaned = raw.replace(/[^A-Z0-9]/g, '').slice(0, 8);
  return cleaned || DEFAULT_STUDENT_ID_PREFIX;
}

function extractDobMonth(dateOfBirth?: string | Date | null): string {
  if (!dateOfBirth) return '01';
  if (typeof dateOfBirth === 'string') {
    const match = dateOfBirth.trim().match(/^(\d{4})-(\d{2})/);
    if (match) {
      const month = Number(match[2]);
      if (month >= 1 && month <= 12) return String(month).padStart(2, '0');
    }
    const parsed = new Date(dateOfBirth);
    if (!Number.isNaN(parsed.getTime())) {
      return String(parsed.getUTCMonth() + 1).padStart(2, '0');
    }
    return '01';
  }
  if (dateOfBirth instanceof Date && !Number.isNaN(dateOfBirth.getTime())) {
    return String(dateOfBirth.getUTCMonth() + 1).padStart(2, '0');
  }
  return '01';
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

/** Monday–Friday are school days; Saturday and Sunday are not. */
export function isSchoolDay(dateStr: string): boolean {
  const d = new Date(`${dateStr}T12:00:00`);
  const day = d.getDay();
  return day >= 1 && day <= 5;
}

/** Append the billing term name when missing, e.g. "Term fees" -> "Term fees (Term 3)". */
export function invoiceDescriptionWithTerm(description: string, termName?: string | null): string {
  const base = (description || '').trim();
  const term = (termName || '').trim();
  if (!base || !term) return description;
  const suffix = ` (${term})`;
  if (base.endsWith(suffix)) return base;
  return `${base}${suffix}`;
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

/** Safe PDF filename from a student's full name (e.g. Jane-Smith.pdf). */
export function reportCardPdfFilename(firstName?: string, lastName?: string, fallback = 'report-card'): string {
  const raw = `${firstName ?? ''} ${lastName ?? ''}`.trim();
  const base = raw || fallback;
  const safe = base
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/ /g, '-');
  return `${safe || fallback}.pdf`;
}

