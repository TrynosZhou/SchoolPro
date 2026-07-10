"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DATASETS = exports.FILTERS = void 0;
exports.getReportMeta = getReportMeta;
exports.runReport = runReport;
exports.reportToCsv = reportToCsv;
exports.reportToXlsx = reportToXlsx;
exports.reportToPdf = reportToPdf;
const pdfkit_1 = __importDefault(require("pdfkit"));
const exceljs_1 = __importDefault(require("exceljs"));
const data_source_1 = require("../config/data-source");
const Term_1 = require("../entities/Term");
const school_branding_service_1 = require("./school-branding.service");
const analytics_service_1 = require("./analytics.service");
exports.FILTERS = [
    { id: 'classId', label: 'Class', type: 'class' },
    { id: 'formId', label: 'Grade / Form', type: 'form' },
    { id: 'status', label: 'Student status', type: 'status' },
    { id: 'schoolYearId', label: 'Academic year', type: 'schoolYear' },
    { id: 'termId', label: 'Term', type: 'term' },
    { id: 'dateFrom', label: 'Date from', type: 'date' },
    { id: 'dateTo', label: 'Date to', type: 'date' },
];
exports.DATASETS = [
    {
        key: 'students',
        label: 'Students & demographics',
        description: 'Student roll with demographic, enrolment and outstanding-fee fields.',
        filters: ['classId', 'formId', 'status'],
        defaultFields: ['admissionNumber', 'name', 'gender', 'formName', 'className', 'status'],
        groupable: ['formName', 'className', 'genderLabel', 'studentTypeLabel', 'status'],
        fields: [
            { key: 'admissionNumber', label: 'Student ID', type: 'string' },
            { key: 'name', label: 'Name', type: 'string' },
            { key: 'genderLabel', label: 'Gender', type: 'string' },
            { key: 'studentTypeLabel', label: 'Type', type: 'string' },
            { key: 'formName', label: 'Grade / Form', type: 'string' },
            { key: 'className', label: 'Class', type: 'string' },
            { key: 'status', label: 'Status', type: 'string' },
            { key: 'age', label: 'Age', type: 'number' },
            { key: 'dateOfBirth', label: 'Date of birth', type: 'date' },
            { key: 'enrollmentDate', label: 'Enrolled on', type: 'date' },
            { key: 'exitDate', label: 'Exit date', type: 'date' },
            { key: 'exitReason', label: 'Exit reason', type: 'string' },
            { key: 'outstanding', label: 'Outstanding fees', type: 'money' },
        ],
    },
    {
        key: 'attendance',
        label: 'Attendance summary',
        description: 'Per-student attendance totals and rate over a date range or term.',
        filters: ['classId', 'formId', 'termId', 'dateFrom', 'dateTo'],
        defaultFields: ['admissionNumber', 'name', 'className', 'daysMarked', 'present', 'absent', 'attendanceRate'],
        groupable: ['formName', 'className'],
        fields: [
            { key: 'admissionNumber', label: 'Student ID', type: 'string' },
            { key: 'name', label: 'Name', type: 'string' },
            { key: 'formName', label: 'Grade / Form', type: 'string' },
            { key: 'className', label: 'Class', type: 'string' },
            { key: 'daysMarked', label: 'Days marked', type: 'number' },
            { key: 'present', label: 'Present', type: 'number' },
            { key: 'absent', label: 'Absent', type: 'number' },
            { key: 'late', label: 'Late', type: 'number' },
            { key: 'excused', label: 'Excused', type: 'number' },
            { key: 'attendanceRate', label: 'Attendance %', type: 'percent' },
        ],
    },
    {
        key: 'grades',
        label: 'Grades & performance',
        description: 'Published report-card results per student for a term (or their latest).',
        filters: ['classId', 'formId', 'termId'],
        defaultFields: ['admissionNumber', 'name', 'className', 'termName', 'averageMark', 'overallGrade', 'classPosition'],
        groupable: ['formName', 'className', 'overallGrade'],
        fields: [
            { key: 'admissionNumber', label: 'Student ID', type: 'string' },
            { key: 'name', label: 'Name', type: 'string' },
            { key: 'formName', label: 'Grade / Form', type: 'string' },
            { key: 'className', label: 'Class', type: 'string' },
            { key: 'termName', label: 'Term', type: 'string' },
            { key: 'averageMark', label: 'Average %', type: 'percent' },
            { key: 'overallGrade', label: 'Grade', type: 'string' },
            { key: 'classPosition', label: 'Class position', type: 'number' },
            { key: 'subjectsPassed', label: 'Subjects passed', type: 'number' },
            { key: 'totalSubjects', label: 'Total subjects', type: 'number' },
        ],
    },
    {
        key: 'fees',
        label: 'Fees & balances',
        description: 'Per-student invoiced, paid and outstanding amounts.',
        filters: ['classId', 'formId', 'termId'],
        defaultFields: ['admissionNumber', 'name', 'className', 'totalInvoiced', 'totalPaid', 'balance'],
        groupable: ['formName', 'className'],
        fields: [
            { key: 'admissionNumber', label: 'Student ID', type: 'string' },
            { key: 'name', label: 'Name', type: 'string' },
            { key: 'formName', label: 'Grade / Form', type: 'string' },
            { key: 'className', label: 'Class', type: 'string' },
            { key: 'totalInvoiced', label: 'Invoiced', type: 'money' },
            { key: 'totalPaid', label: 'Paid', type: 'money' },
            { key: 'balance', label: 'Balance', type: 'money' },
        ],
    },
];
function getReportMeta() {
    return { datasets: exports.DATASETS, filters: exports.FILTERS };
}
function datasetByKey(key) {
    return exports.DATASETS.find((d) => d.key === key);
}
const clean = (v) => {
    const s = typeof v === 'string' ? v.trim() : v != null ? String(v) : '';
    return s ? s : undefined;
};
async function fetchStudents(filters) {
    const params = [];
    let where = '';
    const status = clean(filters.status);
    if (status && status !== 'all') {
        params.push(status);
        where += ` AND s.status = $${params.length}`;
    }
    else if (!status) {
        where += ` AND s."isActive" = true`;
    }
    if (clean(filters.classId)) {
        params.push(clean(filters.classId));
        where += ` AND s."classId" = $${params.length}`;
    }
    if (clean(filters.formId)) {
        params.push(clean(filters.formId));
        where += ` AND s."formId" = $${params.length}`;
    }
    const rows = await data_source_1.AppDataSource.query(`
    SELECT s."admissionNumber",
           s."firstName" || ' ' || s."lastName" AS "name",
           s.gender, s."studentType", s.status,
           s."enrollmentDate", s."dateOfBirth", s."exitDate", s."exitReason",
           f.name AS "formName", c.name AS "className",
           COALESCE(fee.owed, 0) AS "outstanding"
    FROM students s
    LEFT JOIN forms f ON f.id = s."formId"
    LEFT JOIN classes c ON c.id = s."classId"
    LEFT JOIN (
      SELECT "studentId", SUM("totalAmount" - "amountPaid") AS owed
      FROM invoices
      WHERE ("totalAmount" - "amountPaid") > 0.005 AND status NOT IN ('cancelled', 'draft', 'paid')
      GROUP BY "studentId"
    ) fee ON fee."studentId" = s.id
    WHERE 1 = 1 ${where}
    ORDER BY f.level NULLS LAST, c.name, s."lastName"
    `, params);
    const todayIso = new Date();
    return rows.map((r) => {
        const dob = r.dateOfBirth ? new Date(String(r.dateOfBirth)) : null;
        let age = null;
        if (dob && !Number.isNaN(dob.getTime())) {
            age = todayIso.getFullYear() - dob.getFullYear();
            const m = todayIso.getMonth() - dob.getMonth();
            if (m < 0 || (m === 0 && todayIso.getDate() < dob.getDate()))
                age--;
        }
        return {
            ...r,
            genderLabel: (0, analytics_service_1.normalizeGender)(r.gender),
            studentTypeLabel: String(r.studentType).toLowerCase() === 'boarder' ? 'Boarder' : 'Day Scholar',
            outstanding: Math.round(Number(r.outstanding || 0) * 100) / 100,
            age,
        };
    });
}
async function resolveDateRange(filters) {
    const from = clean(filters.dateFrom);
    const to = clean(filters.dateTo);
    if (from && to)
        return { start: from, end: to };
    let term = null;
    if (clean(filters.termId)) {
        term = await data_source_1.AppDataSource.getRepository(Term_1.Term).findOne({ where: { id: clean(filters.termId) } });
    }
    if (!term)
        term = await data_source_1.AppDataSource.getRepository(Term_1.Term).findOne({ where: { isCurrent: true } });
    const today = new Date().toISOString().slice(0, 10);
    return {
        start: from || term?.startDate || new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10),
        end: to || (term && term.endDate < today ? term.endDate : today),
    };
}
async function fetchAttendance(filters) {
    const { start, end } = await resolveDateRange(filters);
    const params = [start, end];
    let where = `s."isActive" = true`;
    if (clean(filters.classId)) {
        params.push(clean(filters.classId));
        where += ` AND s."classId" = $${params.length}`;
    }
    if (clean(filters.formId)) {
        params.push(clean(filters.formId));
        where += ` AND s."formId" = $${params.length}`;
    }
    const rows = await data_source_1.AppDataSource.query(`
    SELECT s."admissionNumber", s."firstName" || ' ' || s."lastName" AS "name",
           f.name AS "formName", c.name AS "className",
           COUNT(a.id)::int AS "daysMarked",
           COUNT(*) FILTER (WHERE a.status::text = 'present')::int AS present,
           COUNT(*) FILTER (WHERE a.status::text = 'absent')::int AS absent,
           COUNT(*) FILTER (WHERE a.status::text = 'late')::int AS late,
           COUNT(*) FILTER (WHERE a.status::text = 'excused')::int AS excused
    FROM students s
    LEFT JOIN forms f ON f.id = s."formId"
    LEFT JOIN classes c ON c.id = s."classId"
    LEFT JOIN student_attendance a
      ON a."studentId" = s.id AND a.date >= $1 AND a.date <= $2
    WHERE ${where}
    GROUP BY s."admissionNumber", s."firstName", s."lastName", f.name, c.name, f.level
    ORDER BY f.level NULLS LAST, c.name, s."lastName"
    `, params);
    return rows.map((r) => {
        const marked = Number(r.daysMarked || 0);
        const rate = marked
            ? Math.round(((Number(r.present) + Number(r.late)) / marked) * 1000) / 10
            : null;
        return { ...r, attendanceRate: rate };
    });
}
async function fetchGrades(filters) {
    const params = [];
    let where = `rc."isPublished" = true`;
    let distinctOn = '';
    const termId = clean(filters.termId);
    if (termId) {
        params.push(termId);
        where += ` AND rc."termId" = $${params.length}`;
    }
    else {
        // latest published card per student
        distinctOn = 'DISTINCT ON (rc."studentId")';
    }
    if (clean(filters.classId)) {
        params.push(clean(filters.classId));
        where += ` AND s."classId" = $${params.length}`;
    }
    if (clean(filters.formId)) {
        params.push(clean(filters.formId));
        where += ` AND s."formId" = $${params.length}`;
    }
    const order = termId
        ? `ORDER BY f.level NULLS LAST, c.name, s."lastName"`
        : `ORDER BY rc."studentId", t."startDate" DESC`;
    const rows = await data_source_1.AppDataSource.query(`
    SELECT ${distinctOn} s."admissionNumber", s."firstName" || ' ' || s."lastName" AS "name",
           f.name AS "formName", c.name AS "className", t.name AS "termName",
           rc."averageMark", rc."overallGrade", rc."classPosition",
           rc."subjectsPassed", rc."totalSubjects"
    FROM report_cards rc
    JOIN students s ON s.id = rc."studentId"
    JOIN terms t ON t.id = rc."termId"
    LEFT JOIN forms f ON f.id = s."formId"
    LEFT JOIN classes c ON c.id = s."classId"
    WHERE ${where}
    ${order}
    `, params);
    return rows.map((r) => ({
        ...r,
        averageMark: r.averageMark != null ? Math.round(Number(r.averageMark) * 10) / 10 : null,
    }));
}
async function fetchFees(filters) {
    const params = [];
    let where = `i.status NOT IN ('cancelled', 'draft')`;
    if (clean(filters.termId)) {
        params.push(clean(filters.termId));
        where += ` AND i."termId" = $${params.length}`;
    }
    if (clean(filters.classId)) {
        params.push(clean(filters.classId));
        where += ` AND s."classId" = $${params.length}`;
    }
    if (clean(filters.formId)) {
        params.push(clean(filters.formId));
        where += ` AND s."formId" = $${params.length}`;
    }
    const rows = await data_source_1.AppDataSource.query(`
    SELECT s."admissionNumber", s."firstName" || ' ' || s."lastName" AS "name",
           f.name AS "formName", c.name AS "className",
           COALESCE(SUM(i."totalAmount"), 0) AS "totalInvoiced",
           COALESCE(SUM(i."amountPaid"), 0) AS "totalPaid",
           COALESCE(SUM(GREATEST(i."totalAmount" - i."amountPaid", 0)), 0) AS "balance"
    FROM students s
    JOIN invoices i ON i."studentId" = s.id AND ${where}
    LEFT JOIN forms f ON f.id = s."formId"
    LEFT JOIN classes c ON c.id = s."classId"
    GROUP BY s."admissionNumber", s."firstName", s."lastName", f.name, c.name, f.level
    ORDER BY f.level NULLS LAST, c.name, s."lastName"
    `, params);
    return rows.map((r) => ({
        ...r,
        totalInvoiced: Math.round(Number(r.totalInvoiced || 0) * 100) / 100,
        totalPaid: Math.round(Number(r.totalPaid || 0) * 100) / 100,
        balance: Math.round(Number(r.balance || 0) * 100) / 100,
    }));
}
async function fetchRows(datasetKey, filters) {
    switch (datasetKey) {
        case 'students':
            return fetchStudents(filters);
        case 'attendance':
            return fetchAttendance(filters);
        case 'grades':
            return fetchGrades(filters);
        case 'fees':
            return fetchFees(filters);
        default:
            return [];
    }
}
async function runReport(config) {
    const ds = datasetByKey(config.dataset);
    if (!ds)
        throw new Error(`Unknown dataset: ${config.dataset}`);
    const validFieldKeys = new Set(ds.fields.map((f) => f.key));
    let selectedKeys = (config.fields || []).filter((k) => validFieldKeys.has(k));
    if (!selectedKeys.length)
        selectedKeys = ds.defaultFields.slice();
    const rows = await fetchRows(ds.key, config.filters || {});
    const groupBy = config.groupBy && ds.groupable.includes(config.groupBy) ? config.groupBy : null;
    let outRows;
    let columns;
    if (groupBy) {
        const groupDef = ds.fields.find((f) => f.key === groupBy) ||
            { key: groupBy, label: groupBy, type: 'string' };
        const numericSelected = selectedKeys
            .map((k) => ds.fields.find((f) => f.key === k))
            .filter((f) => !!f && f.key !== groupBy && (f.type === 'number' || f.type === 'money' || f.type === 'percent'));
        const groups = new Map();
        for (const r of rows) {
            const gv = r[groupBy] != null && r[groupBy] !== '' ? String(r[groupBy]) : 'Unassigned';
            if (!groups.has(gv))
                groups.set(gv, { rows: [] });
            groups.get(gv).rows.push(r);
        }
        outRows = [...groups.entries()].map(([gv, g]) => {
            const row = { [groupBy]: gv, __count: g.rows.length };
            for (const f of numericSelected) {
                const vals = g.rows.map((r) => Number(r[f.key] || 0));
                if (f.type === 'percent') {
                    const valid = vals.filter((v) => !Number.isNaN(v));
                    row[f.key] = valid.length
                        ? Math.round((valid.reduce((s, v) => s + v, 0) / valid.length) * 10) / 10
                        : null;
                }
                else {
                    row[f.key] = Math.round(vals.reduce((s, v) => s + v, 0) * 100) / 100;
                }
            }
            return row;
        });
        outRows.sort((a, b) => String(a[groupBy]).localeCompare(String(b[groupBy])));
        columns = [
            groupDef,
            { key: '__count', label: 'Count', type: 'number' },
            ...numericSelected,
        ];
    }
    else {
        columns = selectedKeys
            .map((k) => ds.fields.find((f) => f.key === k))
            .filter((f) => !!f);
        outRows = rows;
        if (config.sortBy && validFieldKeys.has(config.sortBy)) {
            const dir = config.sortDir === 'desc' ? -1 : 1;
            const sortDef = ds.fields.find((f) => f.key === config.sortBy);
            outRows = [...rows].sort((a, b) => {
                const av = a[config.sortBy];
                const bv = b[config.sortBy];
                if (sortDef && sortDef.type !== 'string' && sortDef.type !== 'date') {
                    return (Number(av || 0) - Number(bv || 0)) * dir;
                }
                return String(av ?? '').localeCompare(String(bv ?? '')) * dir;
            });
        }
    }
    return {
        dataset: ds.key,
        datasetLabel: ds.label,
        columns,
        rows: outRows,
        groupBy,
        totalRows: outRows.length,
        generatedAt: new Date().toISOString(),
    };
}
// ---------------------------------------------------------------------------
// Formatting + exporters
// ---------------------------------------------------------------------------
function formatCell(value, type) {
    if (value == null || value === '')
        return '';
    switch (type) {
        case 'money':
            return Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        case 'percent':
            return `${Number(value)}%`;
        case 'date':
            return String(value).slice(0, 10);
        default:
            return String(value);
    }
}
function reportToCsv(result, title) {
    const esc = (v) => v.includes(',') || v.includes('"') || v.includes('\n') ? `"${v.replace(/"/g, '""')}"` : v;
    const lines = [];
    if (title)
        lines.push(esc(title));
    lines.push(result.columns.map((c) => esc(c.label)).join(','));
    for (const row of result.rows) {
        lines.push(result.columns.map((c) => esc(formatCell(row[c.key], c.type))).join(','));
    }
    return '\uFEFF' + lines.join('\n');
}
async function reportToXlsx(result, title) {
    const wb = new exceljs_1.default.Workbook();
    wb.creator = 'School Pro';
    wb.created = new Date();
    const ws = wb.addWorksheet(result.datasetLabel.slice(0, 28) || 'Report');
    let headerRowIdx = 1;
    if (title) {
        ws.mergeCells(1, 1, 1, Math.max(result.columns.length, 1));
        const titleCell = ws.getCell(1, 1);
        titleCell.value = title;
        titleCell.font = { bold: true, size: 14 };
        headerRowIdx = 2;
    }
    const header = ws.getRow(headerRowIdx);
    result.columns.forEach((c, i) => {
        const cell = header.getCell(i + 1);
        cell.value = c.label;
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
        cell.alignment = { vertical: 'middle' };
    });
    header.commit();
    result.rows.forEach((row) => {
        const values = result.columns.map((c) => {
            const v = row[c.key];
            if (v == null || v === '')
                return '';
            if (c.type === 'money' || c.type === 'number' || c.type === 'percent') {
                const n = Number(v);
                return Number.isNaN(n) ? String(v) : n;
            }
            if (c.type === 'date')
                return String(v).slice(0, 10);
            return String(v);
        });
        const added = ws.addRow(values);
        result.columns.forEach((c, i) => {
            if (c.type === 'money')
                added.getCell(i + 1).numFmt = '#,##0.00';
            if (c.type === 'percent')
                added.getCell(i + 1).numFmt = '0.0"%"';
        });
    });
    result.columns.forEach((c, i) => {
        const col = ws.getColumn(i + 1);
        let max = c.label.length;
        result.rows.forEach((r) => {
            const len = String(r[c.key] ?? '').length;
            if (len > max)
                max = len;
        });
        col.width = Math.min(Math.max(max + 2, 10), 40);
    });
    const arrayBuffer = await wb.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
}
async function reportToPdf(result, title) {
    const branding = await (0, school_branding_service_1.loadSchoolBranding)();
    return new Promise((resolve, reject) => {
        const doc = new pdfkit_1.default({ margin: 36, size: 'A4', layout: 'landscape' });
        const chunks = [];
        doc.on('data', (c) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
        const pageLeft = doc.page.margins.left;
        const pageRight = doc.page.width - doc.page.margins.right;
        const usableWidth = pageRight - pageLeft;
        // Header
        doc.fillColor('#0f172a').fontSize(16).font('Helvetica-Bold');
        doc.text(branding.schoolName || 'School Pro Academy', pageLeft, doc.y);
        doc.moveDown(0.1);
        doc.fontSize(12).fillColor('#1e3a8a').text(title);
        doc.moveDown(0.1);
        doc.fontSize(8).fillColor('#64748b').font('Helvetica');
        doc.text(`Generated ${new Date(result.generatedAt).toLocaleString()}  •  ${result.totalRows} row(s)` +
            (result.groupBy ? `  •  grouped by ${result.groupBy}` : ''));
        doc.moveDown(0.5);
        const cols = result.columns;
        const colWidth = usableWidth / Math.max(cols.length, 1);
        const rowHeight = 16;
        const drawHeader = () => {
            const y = doc.y;
            doc.rect(pageLeft, y, usableWidth, rowHeight).fill('#1e3a8a');
            doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold');
            cols.forEach((c, i) => {
                doc.text(c.label, pageLeft + i * colWidth + 3, y + 4, {
                    width: colWidth - 6,
                    ellipsis: true,
                });
            });
            doc.y = y + rowHeight;
        };
        drawHeader();
        doc.font('Helvetica').fontSize(8);
        result.rows.forEach((row, idx) => {
            if (doc.y + rowHeight > doc.page.height - doc.page.margins.bottom) {
                doc.addPage();
                drawHeader();
                doc.font('Helvetica').fontSize(8);
            }
            const y = doc.y;
            if (idx % 2 === 0) {
                doc.rect(pageLeft, y, usableWidth, rowHeight).fill('#f1f5f9');
            }
            doc.fillColor('#0f172a');
            cols.forEach((c, i) => {
                const align = c.type === 'money' || c.type === 'number' || c.type === 'percent' ? 'right' : 'left';
                doc.text(formatCell(row[c.key], c.type), pageLeft + i * colWidth + 3, y + 4, {
                    width: colWidth - 6,
                    align,
                    ellipsis: true,
                });
            });
            doc.y = y + rowHeight;
        });
        doc.end();
    });
}
