"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.teacherInitials = teacherInitials;
exports.summaryGridCell = summaryGridCell;
exports.generateTimetableSummaryPdf = generateTimetableSummaryPdf;
exports.generateTimetableClassesGridPdf = generateTimetableClassesGridPdf;
const pdfkit_1 = __importDefault(require("pdfkit"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const teacher_load_pdf_1 = require("./teacher-load.pdf");
const teacher_display_1 = require("./teacher-display");
const COLORS = {
    border: '#000000',
    header: '#f1f5f9',
    ink: '#0f172a',
    muted: '#64748b',
};
const DAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
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
function teacherInitials(name) {
    return (0, teacher_display_1.teacherInitialsFromDisplayName)(name) || '?';
}
function summaryGridCell(teacher, dayOfWeek, period) {
    if (period.slotType === 'break')
        return '';
    const matches = teacher.slots.filter((s) => s.dayOfWeek === dayOfWeek && s.startTime === period.startTime && s.endTime === period.endTime);
    if (!matches.length)
        return '';
    return [...new Set(matches.map((s) => (0, teacher_load_pdf_1.shortClassName)(s.className)).filter(Boolean))].join('/');
}
function isBreakPeriod(period) {
    return period.slotType === 'break';
}
function lessonPeriodNumber(periods, index) {
    if (isBreakPeriod(periods[index]))
        return null;
    return periods.slice(0, index + 1).filter((p) => !isBreakPeriod(p)).length - 1;
}
function breakPeriodLabel(period) {
    const name = String(period.name || 'Break');
    if (/lunch/i.test(name))
        return 'Ln';
    if (/mid/i.test(name))
        return 'MM';
    if (/morning/i.test(name))
        return 'MB';
    return 'Br';
}
function periodHeaderLabel(periods, index) {
    if (isBreakPeriod(periods[index]))
        return breakPeriodLabel(periods[index]);
    return String(lessonPeriodNumber(periods, index));
}
function formatPeriodRangeCompact(period) {
    const compact = (time) => {
        const [h, m] = String(time || '0:00').split(':');
        return `${Number(h)}:${m || '00'}`;
    };
    return `${compact(period.startTime)} - ${compact(period.endTime)}`;
}
function buildPeriodLegend(periods) {
    if (!periods.length)
        return '';
    return periods
        .map((p, i) => `${periodHeaderLabel(periods, i)}: ${formatPeriodRangeCompact(p)}`)
        .join('   ·   ');
}
async function generateTimetableSummaryPdf(data) {
    return new Promise((resolve, reject) => {
        const margin = 28;
        const doc = new pdfkit_1.default({ margin, size: 'A4', layout: 'landscape' });
        const chunks = [];
        doc.on('data', (c) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
        const pageW = doc.page.width;
        const contentW = pageW - margin * 2;
        const logoPath = resolveUploadPath(data.logoUrl);
        const periods = data.periods;
        const dayCount = 5;
        const periodCount = periods.length;
        const teacherColW = 42;
        const gridW = contentW - teacherColW;
        const dayColW = periodCount > 0 ? gridW / dayCount : gridW;
        const periodColW = periodCount > 0 ? dayColW / periodCount : dayColW;
        const headerH = 14;
        const subHeaderH = 12;
        const rowH = 13;
        const headerTotalH = headerH + subHeaderH;
        let y = margin;
        if (logoPath) {
            try {
                doc.image(logoPath, margin, y, { fit: [28, 28] });
            }
            catch {
                /* skip */
            }
        }
        doc.font('Helvetica-Bold').fontSize(11).fillColor(COLORS.ink);
        doc.text(data.schoolName || 'School', margin + (logoPath ? 34 : 0), y + 4, {
            width: contentW - (logoPath ? 34 : 0),
            align: 'center',
        });
        y += logoPath ? 30 : 16;
        doc.font('Helvetica-Bold').fontSize(10);
        doc.text('Summary timetable of teachers', margin, y, { width: contentW, align: 'center' });
        y += 14;
        const legend = buildPeriodLegend(periods);
        if (legend) {
            doc.font('Helvetica').fontSize(6.5).fillColor(COLORS.muted);
            doc.text(legend, margin, y, { width: contentW, align: 'center' });
            y += 12;
        }
        const drawHeader = (startY) => {
            let x = margin;
            doc.save();
            doc.rect(x, startY, teacherColW, headerTotalH).fill(COLORS.header);
            doc.strokeColor(COLORS.border).lineWidth(0.5);
            doc.rect(x, startY, teacherColW, headerTotalH).stroke();
            doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(6.5);
            doc.text('Teacher', x + 2, startY + headerH + 2, { width: teacherColW - 4, align: 'center' });
            x += teacherColW;
            for (let d = 0; d < dayCount; d += 1) {
                doc.rect(x, startY, dayColW, headerH).fill(COLORS.header);
                doc.rect(x, startY, dayColW, headerH).stroke();
                doc.text(DAY_LABELS[d], x + 2, startY + 3, { width: dayColW - 4, align: 'center' });
                for (let p = 0; p < periodCount; p += 1) {
                    const px = x + p * periodColW;
                    const isBreak = isBreakPeriod(periods[p]);
                    if (isBreak) {
                        doc.rect(px, startY + headerH, periodColW, subHeaderH).fill('#f3f4f6');
                    }
                    else {
                        doc.rect(px, startY + headerH, periodColW, subHeaderH).fill('#ffffff');
                    }
                    doc.rect(px, startY + headerH, periodColW, subHeaderH).stroke();
                    doc.font('Helvetica-Bold').fontSize(5.5).fillColor(isBreak ? COLORS.muted : COLORS.ink);
                    doc.text(periodHeaderLabel(periods, p), px + 1, startY + headerH + 2, {
                        width: periodColW - 2,
                        align: 'center',
                    });
                }
                x += dayColW;
            }
            doc.restore();
            return startY + headerTotalH;
        };
        y = drawHeader(y);
        for (const teacher of data.teachers) {
            if (y + rowH > doc.page.height - margin - 20) {
                doc.addPage({ layout: 'landscape', size: 'A4', margin });
                y = margin;
                y = drawHeader(y);
            }
            let x = margin;
            doc.save();
            doc.strokeColor(COLORS.border).lineWidth(0.35);
            doc.rect(x, y, teacherColW, rowH).stroke();
            doc.font('Helvetica-Bold').fontSize(6).fillColor(COLORS.ink);
            doc.text(teacher.teacherLabel, x + 2, y + 3, { width: teacherColW - 4, align: 'center' });
            x += teacherColW;
            for (let day = 1; day <= dayCount; day += 1) {
                for (let p = 0; p < periodCount; p += 1) {
                    const period = periods[p];
                    const isBreak = isBreakPeriod(period);
                    if (isBreak) {
                        doc.rect(x, y, periodColW, rowH).fill('#f3f4f6');
                    }
                    doc.rect(x, y, periodColW, rowH).stroke();
                    if (isBreak) {
                        doc.font('Helvetica-Bold').fontSize(4.8).fillColor(COLORS.muted);
                        doc.text(breakPeriodLabel(period), x + 1, y + 3, { width: periodColW - 2, align: 'center', lineBreak: false });
                    }
                    else {
                        const value = summaryGridCell(teacher, day, period);
                        if (value) {
                            doc.font('Helvetica').fontSize(5.2).fillColor(COLORS.ink);
                            doc.text(value, x + 1, y + 3, { width: periodColW - 2, align: 'center', lineBreak: false });
                        }
                    }
                    x += periodColW;
                }
            }
            doc.restore();
            y += rowH;
        }
        doc.font('Helvetica').fontSize(6.5).fillColor(COLORS.muted);
        doc.text(`Generated: ${formatGeneratedTimestamp(data.generatedAt)}`, margin, doc.page.height - margin - 8, {
            width: contentW,
            align: 'right',
        });
        doc.end();
    });
}
function classesGridCell(cls, dayOfWeek, period) {
    if (period.slotType === 'break')
        return '';
    const matches = cls.slots.filter((s) => s.dayOfWeek === dayOfWeek && s.startTime === period.startTime && s.endTime === period.endTime);
    if (!matches.length)
        return '';
    return [...new Set(matches.map((s) => {
            const custom = String(s.subjectShort || '').trim();
            if (custom)
                return custom;
            const code = String(s.subjectCode || '').trim();
            if (code)
                return code.slice(0, 4);
            return String(s.subjectName || '').trim().slice(0, 4);
        }).filter(Boolean))].join('/');
}
async function generateTimetableClassesGridPdf(data) {
    return new Promise((resolve, reject) => {
        const margin = 28;
        const doc = new pdfkit_1.default({ margin, size: 'A4', layout: 'landscape' });
        const chunks = [];
        doc.on('data', (c) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
        const pageW = doc.page.width;
        const contentW = pageW - margin * 2;
        const logoPath = resolveUploadPath(data.logoUrl);
        const periods = data.periods;
        const dayCount = 5;
        const periodCount = periods.length;
        const classColW = 42;
        const gridW = contentW - classColW;
        const dayColW = periodCount > 0 ? gridW / dayCount : gridW;
        const periodColW = periodCount > 0 ? dayColW / periodCount : dayColW;
        const headerH = 14;
        const subHeaderH = 12;
        const rowH = 13;
        const headerTotalH = headerH + subHeaderH;
        let y = margin;
        if (logoPath) {
            try {
                doc.image(logoPath, margin, y, { fit: [28, 28] });
            }
            catch {
                /* skip */
            }
        }
        doc.font('Helvetica-Bold').fontSize(11).fillColor(COLORS.ink);
        doc.text(data.schoolName || 'School', margin + (logoPath ? 34 : 0), y + 4, {
            width: contentW - (logoPath ? 34 : 0),
            align: 'center',
        });
        y += logoPath ? 30 : 16;
        doc.font('Helvetica-Bold').fontSize(10);
        doc.text('Class timetables', margin, y, { width: contentW, align: 'center' });
        y += 14;
        const legend = buildPeriodLegend(periods);
        if (legend) {
            doc.font('Helvetica').fontSize(6.5).fillColor(COLORS.muted);
            doc.text(legend, margin, y, { width: contentW, align: 'center' });
            y += 12;
        }
        const drawHeader = (startY) => {
            let x = margin;
            doc.save();
            doc.rect(x, startY, classColW, headerTotalH).fill(COLORS.header);
            doc.strokeColor(COLORS.border).lineWidth(0.5);
            doc.rect(x, startY, classColW, headerTotalH).stroke();
            doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(6.5);
            doc.text('Class', x + 2, startY + headerH + 2, { width: classColW - 4, align: 'center' });
            x += classColW;
            for (let d = 0; d < dayCount; d += 1) {
                doc.rect(x, startY, dayColW, headerH).fill(COLORS.header);
                doc.rect(x, startY, dayColW, headerH).stroke();
                doc.text(DAY_LABELS[d], x + 2, startY + 3, { width: dayColW - 4, align: 'center' });
                for (let p = 0; p < periodCount; p += 1) {
                    const px = x + p * periodColW;
                    const isBreak = isBreakPeriod(periods[p]);
                    if (isBreak) {
                        doc.rect(px, startY + headerH, periodColW, subHeaderH).fill('#f3f4f6');
                    }
                    else {
                        doc.rect(px, startY + headerH, periodColW, subHeaderH).fill('#ffffff');
                    }
                    doc.rect(px, startY + headerH, periodColW, subHeaderH).stroke();
                    doc.font('Helvetica-Bold').fontSize(5.5).fillColor(isBreak ? COLORS.muted : COLORS.ink);
                    doc.text(periodHeaderLabel(periods, p), px + 1, startY + headerH + 2, {
                        width: periodColW - 2,
                        align: 'center',
                    });
                }
                x += dayColW;
            }
            doc.restore();
            return startY + headerTotalH;
        };
        y = drawHeader(y);
        for (const cls of data.classes) {
            if (y + rowH > doc.page.height - margin - 20) {
                doc.addPage({ layout: 'landscape', size: 'A4', margin });
                y = margin;
                y = drawHeader(y);
            }
            let x = margin;
            doc.save();
            doc.strokeColor(COLORS.border).lineWidth(0.35);
            doc.rect(x, y, classColW, rowH).stroke();
            doc.font('Helvetica-Bold').fontSize(6).fillColor(COLORS.ink);
            doc.text(cls.classLabel, x + 2, y + 3, { width: classColW - 4, align: 'center' });
            x += classColW;
            for (let day = 1; day <= dayCount; day += 1) {
                for (let p = 0; p < periodCount; p += 1) {
                    const period = periods[p];
                    const isBreak = isBreakPeriod(period);
                    if (isBreak) {
                        doc.rect(x, y, periodColW, rowH).fill('#f3f4f6');
                    }
                    doc.rect(x, y, periodColW, rowH).stroke();
                    if (isBreak) {
                        doc.font('Helvetica-Bold').fontSize(4.8).fillColor(COLORS.muted);
                        doc.text(breakPeriodLabel(period), x + 1, y + 3, { width: periodColW - 2, align: 'center', lineBreak: false });
                    }
                    else {
                        const value = classesGridCell(cls, day, period);
                        if (value) {
                            doc.font('Helvetica').fontSize(5.2).fillColor(COLORS.ink);
                            doc.text(value, x + 1, y + 3, { width: periodColW - 2, align: 'center', lineBreak: false });
                        }
                    }
                    x += periodColW;
                }
            }
            doc.restore();
            y += rowH;
        }
        doc.font('Helvetica').fontSize(6.5).fillColor(COLORS.muted);
        doc.text(`Generated: ${formatGeneratedTimestamp(data.generatedAt)}`, margin, doc.page.height - margin - 8, {
            width: contentW,
            align: 'right',
        });
        doc.end();
    });
}
