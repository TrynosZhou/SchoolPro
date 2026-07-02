"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateStudentId = generateStudentId;
exports.generateEmployeeNumber = generateEmployeeNumber;
exports.generateNumber = generateNumber;
exports.calculateGrade = calculateGrade;
exports.today = today;
exports.invoiceDescriptionWithTerm = invoiceDescriptionWithTerm;
exports.toDateOnly = toDateOnly;
exports.termReportDateRange = termReportDateRange;
exports.reportCardPdfFilename = reportCardPdfFilename;
const uuid_1 = require("uuid");
const data_source_1 = require("../config/data-source");
const grade_boundaries_1 = require("../types/grade-boundaries");
const STUDENT_ID_PREFIX = 'SP';
const STUDENT_ID_DIGITS = 6;
/** Next sequential Student ID: SP + 6 digits (e.g. SP000001). */
async function generateStudentId() {
    const [row] = await data_source_1.AppDataSource.query(`
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
async function generateEmployeeNumber() {
    const [row] = await data_source_1.AppDataSource.query(`
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
function generateNumber(prefix) {
    const date = new Date();
    const ymd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
    return `${prefix}-${ymd}-${(0, uuid_1.v4)().slice(0, 8).toUpperCase()}`;
}
/** @deprecated Prefer gradeForMarks() from grade.service for configurable boundaries. */
function calculateGrade(marks, max = 100) {
    return (0, grade_boundaries_1.calculateGradeFromBoundaries)(marks, max, grade_boundaries_1.DEFAULT_GRADE_BOUNDARIES);
}
function today() {
    return new Date().toISOString().split('T')[0];
}
/** Append the billing term name when missing, e.g. "Term fees" -> "Term fees (Term 3)". */
function invoiceDescriptionWithTerm(description, termName) {
    const base = (description || '').trim();
    const term = (termName || '').trim();
    if (!base || !term)
        return description;
    const suffix = ` (${term})`;
    if (base.endsWith(suffix))
        return base;
    return `${base}${suffix}`;
}
/** Normalize DB/entity dates to YYYY-MM-DD for SQL date comparisons. */
function toDateOnly(value) {
    if (typeof value === 'string')
        return value.slice(0, 10);
    return value.toISOString().slice(0, 10);
}
/**
 * Date range for attendance reports. Current terms extend through today so
 * marks saved after the configured term end still appear in reports.
 */
function termReportDateRange(term) {
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
function reportCardPdfFilename(firstName, lastName, fallback = 'report-card') {
    const raw = `${firstName ?? ''} ${lastName ?? ''}`.trim();
    const base = raw || fallback;
    const safe = base
        .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/ /g, '-');
    return `${safe || fallback}.pdf`;
}
