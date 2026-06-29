"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateReportCardPortalPdf = generateReportCardPortalPdf;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const pdfkit_1 = __importDefault(require("pdfkit"));
function resolveUploadPath(publicUrl) {
    if (!publicUrl)
        return null;
    const relative = publicUrl.replace(/^\/+/, '');
    const full = path_1.default.join(process.cwd(), relative);
    return fs_1.default.existsSync(full) ? full : null;
}
function formatPositionOutOf(position, total) {
    if (!position || !total)
        return '—';
    return `${position} Out Of ${total}`;
}
function formatSubjectPosition(pos, total) {
    if (pos == null || pos === '')
        return '—';
    const p = Number(pos);
    if (!Number.isFinite(p) || p < 1)
        return '—';
    const t = total != null && total !== '' ? Number(total) : 0;
    if (Number.isFinite(t) && t > 0)
        return `${p}/${t}`;
    return String(p);
}
function formatSubjectsPassed(passed, total) {
    if (passed == null || !total)
        return '—';
    return `${passed}/${total}`;
}
function averageTier(avg) {
    if (avg == null)
        return 'none';
    if (avg >= 80)
        return 'excellent';
    if (avg >= 50)
        return 'good';
    return 'atRisk';
}
function gradeChipColors(grade) {
    const g = (grade || '').trim().toUpperCase().charAt(0);
    if (g === 'A')
        return { bg: '#d1fae5', fg: '#047857' };
    if (g === 'B')
        return { bg: '#dbeafe', fg: '#1d4ed8' };
    if (g === 'C')
        return { bg: '#fef3c7', fg: '#b45309' };
    if (g === 'D')
        return { bg: '#ffedd5', fg: '#c2410c' };
    if (g === 'E' || g === 'F')
        return { bg: '#fee2e2', fg: '#b91c1c' };
    return { bg: '#eef2ff', fg: '#4338ca' };
}
function avgChipColors(tier) {
    if (tier === 'excellent')
        return { bg: '#d1fae5', fg: '#047857' };
    if (tier === 'good')
        return { bg: '#dbeafe', fg: '#1d4ed8' };
    if (tier === 'atRisk')
        return { bg: '#fef3c7', fg: '#b45309' };
    return { bg: '#f1f5f9', fg: '#475569' };
}
function drawChipRow(doc, startX, startY, maxW, chips, chipH = 16) {
    let x = startX;
    let y = startY;
    const gap = 4;
    doc.font('Helvetica-Bold').fontSize(7.5);
    for (const chip of chips) {
        const textW = doc.widthOfString(chip.text);
        const chipW = textW + 12;
        if (x + chipW > startX + maxW && x > startX) {
            x = startX;
            y += chipH + gap;
        }
        doc.roundedRect(x, y, chipW, chipH, 4).fill(chip.bg);
        doc.fillColor(chip.fg).text(chip.text, x + 6, y + 4, { width: chipW - 12, lineBreak: false });
        x += chipW + gap;
    }
    return y + chipH;
}
async function generateReportCardPortalPdf(data) {
    return new Promise((resolve, reject) => {
        const pageW = 595.28;
        const pageH = 841.89;
        const borderW = 12;
        const borderColor = '#4f46e5';
        const pad = borderW + 14;
        const innerX = pad;
        const innerW = pageW - pad * 2;
        const pageBottom = pageH - pad;
        const grid = '#94a3b8';
        const doc = new pdfkit_1.default({ margin: 0, size: 'A4' });
        const chunks = [];
        doc.on('data', (c) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
        const schoolName = data.schoolName || 'School Pro Academy';
        const studentName = data.studentName || 'Student';
        const className = data.className || '—';
        const studentId = data.admissionNumber || '—';
        const teacherRemarks = (data.classTeacherRemarks || '').trim();
        const principalRemarks = (data.principalRemarks || '').trim();
        const rows = data.subjectResults?.length
            ? data.subjectResults.map((r) => ({
                subject: (r.subjectName || r.subject || '').split(' — ')[0] || 'Subject',
                code: r.subjectCode || '—',
                marks: `${r.marks ?? '—'}`,
                grade: r.grade || '—',
                rank: formatSubjectPosition(r.subjectPosition, r.subjectPositionTotal),
                mean: r.mean != null && r.mean !== '' ? Number(r.mean).toFixed(1) : '—',
                remarks: r.remarks?.trim() ? r.remarks.trim() : '—',
            }))
            : [];
        doc.rect(0, 0, pageW, pageH).fill('#ffffff');
        let y = pad;
        const headerStartY = y;
        const logoSize = 40;
        const logoPath = resolveUploadPath(data.logoUrl);
        doc.rect(innerX, headerStartY, innerW, 110).fill('#f8fafc');
        doc.roundedRect(innerX, y, logoSize, logoSize, 6).fill('#ffffff');
        doc.lineWidth(0.75).strokeColor('#e2e8f0').roundedRect(innerX, y, logoSize, logoSize, 6).stroke();
        if (logoPath) {
            try {
                doc.image(logoPath, innerX + 4, y + 4, { fit: [logoSize - 8, logoSize - 8] });
            }
            catch {
                doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(16).text('S', innerX, y + 12, {
                    width: logoSize,
                    align: 'center',
                    lineBreak: false,
                });
            }
        }
        else {
            doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(16).text('S', innerX, y + 12, {
                width: logoSize,
                align: 'center',
                lineBreak: false,
            });
        }
        doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(11).text(schoolName, innerX + logoSize + 10, y + 14, {
            width: innerW - logoSize - 50,
            lineBreak: false,
        });
        if (data.classPosition) {
            const pillText = `#${data.classPosition}`;
            doc.font('Helvetica-Bold').fontSize(9);
            const pillW = Math.max(28, doc.widthOfString(pillText) + 14);
            const pillX = innerX + innerW - pillW;
            const isTop = data.classPosition <= 3;
            doc.roundedRect(pillX, y + 11, pillW, 18, 9).fill(isTop ? '#fef3c7' : '#e2e8f0');
            doc.fillColor(isTop ? '#b45309' : '#475569').text(pillText, pillX, y + 16, {
                width: pillW,
                align: 'center',
                lineBreak: false,
            });
        }
        y += logoSize + 10;
        doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(14).text(studentName, innerX, y, {
            width: innerW,
            lineBreak: false,
        });
        y += 18;
        const chips = [
            { text: `Student ID: ${studentId}`, bg: '#f1f5f9', fg: '#000000' },
            { text: `Class: ${className}`, bg: '#f1f5f9', fg: '#1d4ed8' },
        ];
        if (data.averageMark != null) {
            const tier = averageTier(Number(data.averageMark));
            const colors = avgChipColors(tier);
            chips.push({ text: `Avg: ${Number(data.averageMark).toFixed(1)}%`, bg: colors.bg, fg: colors.fg });
        }
        if (data.overallGrade) {
            const gc = gradeChipColors(data.overallGrade);
            chips.push({ text: data.overallGrade, bg: gc.bg, fg: gc.fg });
        }
        if (data.classPosition) {
            chips.push({
                text: `Class Position: ${formatPositionOutOf(data.classPosition, data.classTotal)}`,
                bg: '#eef2ff',
                fg: '#4338ca',
            });
        }
        if (data.formPosition) {
            chips.push({
                text: `Form Position: ${formatPositionOutOf(data.formPosition, data.formTotal)}`,
                bg: '#e0e7ff',
                fg: '#312e81',
            });
        }
        const totalSubjects = data.totalSubjects ?? rows.length;
        const subjectsPassed = data.subjectsPassed;
        if (subjectsPassed != null && totalSubjects) {
            chips.push({
                text: `Subjects Passed ${formatSubjectsPassed(subjectsPassed, totalSubjects)}`,
                bg: '#d1fae5',
                fg: '#065f46',
            });
        }
        y = drawChipRow(doc, innerX, y, innerW, chips) + 8;
        const headerEndY = y;
        if (headerEndY > headerStartY + 110) {
            doc.rect(innerX, headerStartY + 110, innerW, headerEndY - headerStartY - 110).fill('#f8fafc');
        }
        doc.lineWidth(1).strokeColor('#e2e8f0').moveTo(innerX, headerEndY).lineTo(innerX + innerW, headerEndY).stroke();
        y = headerEndY + 10;
        const estimateCommentH = (text, boxW) => {
            if (!text)
                return 36;
            doc.font('Helvetica').fontSize(9);
            return Math.max(36, doc.heightOfString(text, { width: boxW - 20, lineGap: 2 }) + 22);
        };
        const commentGap = 10;
        const commentW = innerW;
        const tableToRemarksGap = 22; // two blank lines (9pt font, lineGap 2)
        const teacherBoxH = estimateCommentH(teacherRemarks, commentW);
        const principalBoxH = estimateCommentH(principalRemarks, commentW);
        const remarksBlockH = tableToRemarksGap + teacherBoxH + commentGap + principalBoxH;
        const attendance = data.attendance;
        let attendanceH = 0;
        if (attendance) {
            attendanceH = attendance.daysMarked > 0 ? 58 : 28;
        }
        const tableHeaderH = 20;
        const footerH = 20;
        const tableStartY = y + attendanceH + (attendance ? 8 : 0);
        const availableForRows = pageBottom - tableStartY - tableHeaderH - footerH - remarksBlockH - 8;
        const rowH = rows.length > 0
            ? Math.min(22, Math.max(14, Math.floor(availableForRows / rows.length)))
            : 18;
        const rowFontSize = rowH < 18 ? 8 : 9;
        if (attendance) {
            doc.roundedRect(innerX, y, innerW, attendanceH, 8).fill('#f8fafc');
            doc.lineWidth(0.75).strokeColor('#e2e8f0').roundedRect(innerX, y, innerW, attendanceH, 8).stroke();
            doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(10).text('Attendance (term)', innerX + 10, y + 8);
            if (attendance.daysMarked > 0) {
                const stats = [
                    { label: 'Days marked', value: String(attendance.daysMarked) },
                    { label: 'Present', value: String(attendance.present) },
                    { label: 'Late', value: String(attendance.late) },
                    { label: 'Absent', value: String(attendance.absent) },
                    { label: 'Excused', value: String(attendance.excused) },
                    {
                        label: 'Attendance %',
                        value: attendance.attendancePercent != null ? `${Number(attendance.attendancePercent).toFixed(1)}%` : '—',
                        highlight: true,
                    },
                ];
                const statW = (innerW - 20 - 5 * 6) / 6;
                let sx = innerX + 10;
                const sy = y + 24;
                stats.forEach((s) => {
                    doc.roundedRect(sx, sy, statW, 28, 6).fill(s.highlight ? '#eef2ff' : '#ffffff');
                    doc.lineWidth(0.5).strokeColor(s.highlight ? '#c7d2fe' : '#e2e8f0').roundedRect(sx, sy, statW, 28, 6).stroke();
                    doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(6).text(s.label.toUpperCase(), sx + 4, sy + 4, {
                        width: statW - 8,
                        align: 'center',
                        lineBreak: false,
                    });
                    doc.fillColor(s.highlight ? '#4338ca' : '#0f172a').font('Helvetica-Bold').fontSize(10).text(s.value, sx + 4, sy + 14, {
                        width: statW - 8,
                        align: 'center',
                        lineBreak: false,
                    });
                    sx += statW + 6;
                });
            }
            else {
                doc.fillColor('#64748b').font('Helvetica').fontSize(9).text('No attendance records for this term.', innerX + 10, y + 24, { width: innerW - 20, lineBreak: false });
            }
            y += attendanceH + 8;
        }
        const tableX = innerX;
        const tableW = innerW;
        const cols = [tableW * 0.24, tableW * 0.07, tableW * 0.08, tableW * 0.08, tableW * 0.07, tableW * 0.08, tableW * 0.38];
        const headers = ['SUBJECT', 'CODE', 'MARK', 'GRADE', 'RANK', 'MEAN', 'REMARKS'];
        const drawTableHeader = (atY) => {
            doc.rect(tableX, atY, tableW, tableHeaderH).fill('#f1f5f9');
            let hx = tableX;
            doc.fillColor('#000000').font('Helvetica-Bold').fontSize(7);
            headers.forEach((h, i) => {
                const align = i === 0 || i === 6 ? 'left' : 'center';
                const px = i === 0 || i === 6 ? 6 : 2;
                doc.text(h, hx + px, atY + 6, { width: cols[i] - px * 2, align, lineBreak: false });
                hx += cols[i];
            });
            doc.lineWidth(0.75).strokeColor(grid).rect(tableX, atY, tableW, tableHeaderH).stroke();
            let gx = tableX;
            cols.forEach((w) => {
                gx += w;
                doc.moveTo(gx, atY).lineTo(gx, atY + tableHeaderH).stroke();
            });
        };
        y = tableStartY;
        drawTableHeader(y);
        y += tableHeaderH;
        rows.forEach((row, i) => {
            doc.rect(tableX, y, tableW, rowH).fill('#ffffff');
            const cells = [row.subject, row.code, row.marks, row.grade, row.rank, row.mean, row.remarks];
            let cx = tableX;
            cells.forEach((cell, j) => {
                const px = j === 0 || j === 6 ? 6 : 2;
                const align = j === 0 || j === 6 ? 'left' : 'center';
                if (j === 3) {
                    const gc = gradeChipColors(cell);
                    const pillW = Math.max(14, doc.widthOfString(cell) + 10);
                    const pillX = cx + (cols[j] - pillW) / 2;
                    doc.roundedRect(pillX, y + (rowH - 12) / 2, pillW, 12, 3).fill(gc.bg);
                    doc.fillColor(gc.fg).font('Helvetica-Bold').fontSize(rowFontSize).text(cell, pillX, y + (rowH - 12) / 2 + 2, {
                        width: pillW,
                        align: 'center',
                        lineBreak: false,
                    });
                }
                else {
                    doc.fillColor(j === 6 ? '#64748b' : j === 0 || j === 2 ? '#000000' : '#0f172a')
                        .font(j === 0 || j === 2 ? 'Helvetica-Bold' : 'Helvetica')
                        .fontSize(rowFontSize)
                        .text(cell, cx + px, y + (rowH - rowFontSize) / 2, { width: cols[j] - px * 2, align, lineBreak: false });
                }
                cx += cols[j];
            });
            doc.lineWidth(0.75).strokeColor(grid).rect(tableX, y, tableW, rowH).stroke();
            let gx = tableX;
            cols.forEach((w) => {
                gx += w;
                doc.moveTo(gx, y).lineTo(gx, y + rowH).stroke();
            });
            y += rowH;
        });
        doc.rect(tableX, y, tableW, footerH).fill('#eff6ff');
        doc.lineWidth(1).strokeColor('#93c5fd').moveTo(tableX, y).lineTo(tableX + tableW, y).stroke();
        const labelW = cols.slice(0, 5).reduce((a, b) => a + b, 0);
        doc.fillColor('#1d4ed8').font('Helvetica-Bold').fontSize(9).text('Average Mark', tableX + 6, y + 6, { width: labelW - 12, align: 'right', lineBreak: false });
        const avgText = data.averageMark != null ? `${Number(data.averageMark).toFixed(1)}%` : '—';
        doc.text(avgText, tableX + labelW + 6, y + 6, {
            width: cols.slice(5).reduce((a, b) => a + b, 0) - 12,
            align: 'center',
            lineBreak: false,
        });
        doc.lineWidth(0.75).strokeColor(grid).rect(tableX, y, tableW, footerH).stroke();
        y += footerH + tableToRemarksGap;
        doc.font('Helvetica').fontSize(9);
        const drawCommentBox = (x, boxY, title, text) => {
            const innerTextH = Math.max(18, doc.heightOfString(text || '—', { width: commentW - 20, lineGap: 2 }));
            const commentBoxH = innerTextH + 22;
            doc.roundedRect(x, boxY, commentW, commentBoxH, 8).fill('#fafafa');
            doc.lineWidth(0.75).strokeColor('#e2e8f0').roundedRect(x, boxY, commentW, commentBoxH, 8).stroke();
            doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(6.5).text(title.toUpperCase(), x + 10, boxY + 8, {
                width: commentW - 20,
                lineBreak: false,
            });
            doc.fillColor('#0f172a').font('Helvetica').fontSize(9).text(text || '—', x + 10, boxY + 18, {
                width: commentW - 20,
                lineGap: 2,
            });
            return commentBoxH;
        };
        y += drawCommentBox(innerX, y, 'Class teacher — performance & behaviour', teacherRemarks);
        y += commentGap;
        y += drawCommentBox(innerX, y, 'Principal / head — performance & behaviour', principalRemarks);
        doc.save();
        doc.lineWidth(borderW).strokeColor(borderColor);
        doc.rect(borderW / 2, borderW / 2, pageW - borderW, pageH - borderW).stroke();
        doc.restore();
        doc.end();
    });
}
