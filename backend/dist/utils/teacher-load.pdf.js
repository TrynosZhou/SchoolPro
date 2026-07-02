"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.shortClassName = shortClassName;
exports.buildPeriodsFormula = buildPeriodsFormula;
exports.buildTeacherPeriodsFormula = buildTeacherPeriodsFormula;
exports.mapTeacherLoadReportToPdfRows = mapTeacherLoadReportToPdfRows;
exports.generateTeacherLoadPdf = generateTeacherLoadPdf;
const pdfkit_1 = __importDefault(require("pdfkit"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const COLORS = {
    blue: '#2563eb',
    header: '#1e3a8a',
    border: '#cbd5e1',
    rowAlt: '#f8fafc',
    muted: '#64748b',
    ink: '#0f172a',
    white: '#ffffff',
};
function formatGeneratedTimestamp(date) {
    return date.toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}
function resolveUploadPath(publicUrl) {
    const value = publicUrl?.trim();
    if (!value)
        return null;
    if (/^https?:\/\//i.test(value))
        return null;
    const rel = value.startsWith('/') ? value.slice(1) : value;
    const full = path_1.default.join(process.cwd(), rel.replace(/^uploads\//, 'uploads/'));
    return fs_1.default.existsSync(full) ? full : null;
}
/** Short class label for reports — e.g. 1A, 4B (no "Class " prefix). */
function shortClassName(className) {
    const name = String(className || '').trim();
    if (!name)
        return '';
    return name.replace(/^class\s+/i, '');
}
function buildPeriodsFormula(classLoads) {
    if (!classLoads.length)
        return '—';
    const classCount = classLoads.length;
    const first = classLoads[0];
    if (classLoads.every((n) => n === first)) {
        return `${first}*${classCount}`;
    }
    return classLoads.join('+');
}
function lessonLengthFactor(lessonLength) {
    if (lessonLength === 'double')
        return 2;
    if (lessonLength === 'triple')
        return 3;
    return 1;
}
/** Build formula like 5*3 (single) or 5*2*3 (double lessons across 3 classes). */
function buildTeacherPeriodsFormula(classes) {
    if (!classes.length)
        return '—';
    const singleSubjectClasses = classes.filter((cg) => cg.subjects?.length === 1);
    if (singleSubjectClasses.length !== classes.length) {
        return buildPeriodsFormula(classes.map((cg) => cg.classLoad));
    }
    const patterns = singleSubjectClasses.map((cg) => {
        const sub = cg.subjects[0];
        return {
            weeklyPeriods: sub.weeklyPeriods,
            factor: lessonLengthFactor(sub.lessonLength),
            classLoad: cg.classLoad,
        };
    });
    const first = patterns[0];
    if (patterns.every((p) => p.weeklyPeriods === first.weeklyPeriods &&
        p.factor === first.factor &&
        p.classLoad === first.classLoad)) {
        const classCount = patterns.length;
        if (first.factor === 1) {
            return `${first.weeklyPeriods}*${classCount}`;
        }
        return `${first.weeklyPeriods}*${first.factor}*${classCount}`;
    }
    return buildPeriodsFormula(classes.map((cg) => cg.classLoad));
}
function mapTeacherLoadReportToPdfRows(teachers) {
    return teachers.map((teacher) => {
        const teacherName = `${teacher.firstName} ${teacher.lastName}`.trim();
        if (!teacher.classes.length) {
            return {
                teacherName,
                employeeNumber: teacher.employeeNumber,
                classesLabel: '—',
                periodsFormula: '—',
                totalPeriods: teacher.totalLoad,
            };
        }
        const classesLabel = teacher.classes
            .map((cg) => shortClassName(cg.className))
            .filter(Boolean)
            .join(',');
        return {
            teacherName,
            employeeNumber: teacher.employeeNumber,
            classesLabel: classesLabel || '—',
            periodsFormula: buildTeacherPeriodsFormula(teacher.classes),
            totalPeriods: teacher.totalLoad,
        };
    });
}
async function generateTeacherLoadPdf(data) {
    return new Promise((resolve, reject) => {
        const margin = 40;
        const doc = new pdfkit_1.default({ margin, size: 'A4', layout: 'landscape' });
        const chunks = [];
        doc.on('data', (c) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
        const pageW = doc.page.width;
        const pageH = doc.page.height;
        const contentW = pageW - margin * 2;
        const logoPath = resolveUploadPath(data.logoUrl);
        const school = data.schoolName || 'School Pro Academy';
        const pageBottom = () => pageH - margin - 24;
        const drawBanner = () => {
            const bannerH = 68;
            doc.save();
            doc.rect(0, 0, pageW, bannerH).fill(COLORS.blue);
            if (logoPath) {
                try {
                    doc.save();
                    doc.circle(margin + 26, 34, 22).fill(COLORS.white);
                    doc.restore();
                    doc.image(logoPath, margin + 10, 16, { fit: [32, 32] });
                }
                catch {
                    /* skip */
                }
            }
            const tx = logoPath ? margin + 54 : margin;
            doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(14);
            doc.text(school, tx, 14, { width: contentW - 120, lineBreak: false });
            if (data.tagline) {
                doc.font('Helvetica').fontSize(8).fillColor('#dbeafe');
                doc.text(data.tagline, tx, 32, { width: contentW - 120, lineBreak: false });
            }
            doc.font('Helvetica-Bold').fontSize(10).fillColor('#bfdbfe');
            doc.text('TEACHER LOAD REPORT', tx, data.tagline ? 46 : 36, { width: contentW - 120, lineBreak: false });
            doc.restore();
            return bannerH;
        };
        let y = drawBanner() + 12;
        doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.muted);
        doc.text(`${data.summary.teacherCount} teachers · ${data.summary.teachersWithAssignments} with assignments · ${data.summary.totalPeriods} total periods / week`, margin, y, { width: contentW });
        y += 18;
        const cols = [
            { label: 'TEACHER', w: 140, align: 'left' },
            { label: 'EMP ID', w: 72, align: 'left' },
            { label: 'CLASSES', w: 200, align: 'left' },
            { label: 'PERIODS', w: 80, align: 'center' },
            { label: 'TOTAL PERIODS', w: contentW - 140 - 72 - 200 - 80, align: 'center' },
        ];
        const tableW = cols.reduce((s, c) => s + c.w, 0);
        const headerH = 20;
        const rowH = 20;
        const cellPad = 5;
        const drawTableHeader = () => {
            doc.save();
            doc.rect(margin, y, tableW, headerH).fill(COLORS.header);
            let x = margin;
            doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.white);
            for (const col of cols) {
                doc.text(col.label, x + cellPad, y + 6, {
                    width: col.w - cellPad * 2,
                    align: col.align,
                    lineBreak: false,
                });
                x += col.w;
            }
            doc.restore();
            y += headerH;
        };
        drawTableHeader();
        let rowIndex = 0;
        for (const row of data.rows) {
            if (y + rowH > pageBottom()) {
                doc.addPage({ layout: 'landscape', size: 'A4', margin });
                y = margin;
                drawTableHeader();
            }
            if (rowIndex % 2 === 1) {
                doc.save();
                doc.rect(margin, y, tableW, rowH).fill(COLORS.rowAlt);
                doc.restore();
            }
            const values = [
                row.teacherName,
                row.employeeNumber,
                row.classesLabel,
                row.periodsFormula,
                String(row.totalPeriods),
            ];
            let x = margin;
            doc.font('Helvetica').fontSize(8).fillColor(COLORS.ink);
            for (let i = 0; i < cols.length; i++) {
                const isTotal = i === cols.length - 1;
                if (isTotal)
                    doc.font('Helvetica-Bold');
                doc.text(values[i], x + cellPad, y + 5, {
                    width: cols[i].w - cellPad * 2,
                    align: cols[i].align,
                    lineBreak: false,
                });
                if (isTotal)
                    doc.font('Helvetica');
                x += cols[i].w;
            }
            doc.strokeColor(COLORS.border).lineWidth(0.35);
            doc.moveTo(margin, y + rowH).lineTo(margin + tableW, y + rowH).stroke();
            y += rowH;
            rowIndex += 1;
        }
        if (!data.rows.length) {
            doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted);
            doc.text('No teacher load assignments recorded.', margin, y + 8);
        }
        doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.muted);
        doc.text(`Generated: ${formatGeneratedTimestamp(data.generatedAt)}`, margin, pageH - margin - 10, {
            width: contentW,
            align: 'right',
        });
        doc.end();
    });
}
