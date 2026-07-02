"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateReportCardPortalPdf = generateReportCardPortalPdf;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const pdfkit_1 = __importDefault(require("pdfkit"));
const class_display_1 = require("./class-display");
const grade_boundaries_1 = require("../types/grade-boundaries");
/** Report card body text scale (+20%). */
const RC_TEXT = 1.2;
const rcPt = (pt) => Math.round(pt * RC_TEXT * 10) / 10;
const rcSp = (px) => Math.round(px * RC_TEXT * 10) / 10;
/** Open the PDF at 100% zoom in viewers that honour the catalog OpenAction. */
function setPdfDefaultZoom100(doc) {
    const root = doc._root;
    if (!root?.data)
        return;
    root.data.OpenAction = [0, 'XYZ', null, null, 1];
}
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
function strokeColumnDividers(doc, tableX, y, height, cols, skipDividerAfterIndex) {
    let gx = tableX;
    cols.forEach((w, i) => {
        gx += w;
        if (i >= cols.length - 1)
            return;
        if (skipDividerAfterIndex === i)
            return;
        doc.moveTo(gx, y).lineTo(gx, y + height).stroke();
    });
}
function drawLabelValueLine(doc, x, y, width, align, label, value, fontSize = rcPt(9)) {
    const labelText = `${label} `;
    doc.font('Helvetica-Bold').fontSize(fontSize).fillColor('#0f172a');
    const labelW = doc.widthOfString(labelText);
    doc.font('Helvetica-Bold').fontSize(fontSize).fillColor('#2563eb');
    const valueW = doc.widthOfString(value);
    const totalW = labelW + valueW;
    let startX = x;
    if (align === 'center')
        startX = x + Math.max(0, (width - totalW) / 2);
    if (align === 'right')
        startX = x + Math.max(0, width - totalW);
    doc.font('Helvetica-Bold').fontSize(fontSize).fillColor('#0f172a').text(labelText, startX, y, {
        lineBreak: false,
    });
    doc.fillColor('#2563eb').text(value, startX + labelW, y, { lineBreak: false });
}
function formatWebsiteDisplay(url) {
    if (!url?.trim())
        return '';
    return url.trim().replace(/^https?:\/\//i, '').replace(/\/$/, '');
}
function drawReportCardSchoolBanner(doc, x, y, w, data) {
    const bannerH = rcSp(80);
    const bodyY = y + 3;
    const bodyH = bannerH - 3;
    const navy = '#041428';
    const navyRight = '#020d1f';
    const topSplit = x + w * 0.7;
    const bottomSplit = x + w * 0.62;
    const leftTextW = bottomSplit - x - 16;
    doc.rect(x, y, w, 3).fill('#5eb3ff');
    doc.rect(x, bodyY, w, bodyH).fill(navy);
    doc.save();
    doc
        .moveTo(topSplit, bodyY)
        .lineTo(x + w, bodyY)
        .lineTo(x + w, bodyY + bodyH)
        .lineTo(bottomSplit, bodyY + bodyH)
        .closePath()
        .fill(navyRight);
    doc.restore();
    doc.save();
    doc.moveTo(x, bodyY).lineTo(topSplit, bodyY).lineTo(bottomSplit, bodyY + bodyH).lineTo(x, bodyY + bodyH).closePath().clip();
    for (let i = 0; i < 10; i++) {
        const sx = x - 50 + i * 58;
        doc
            .moveTo(sx, bodyY - 24)
            .lineTo(sx + 28, bodyY - 24)
            .lineTo(sx + 95, bodyY + bodyH + 24)
            .lineTo(sx + 67, bodyY + bodyH + 24)
            .closePath()
            .fill(i % 3 === 0 ? '#1e5a9e' : '#0c2d5c');
    }
    doc.restore();
    doc.lineWidth(0.75).strokeColor('#2d6cb5').moveTo(topSplit, bodyY).lineTo(bottomSplit, bodyY + bodyH).stroke();
    let ty = bodyY + rcSp(11);
    doc.fillColor('#ffffff').font('Times-Bold').fontSize(rcPt(15));
    doc.text((data.schoolName || 'School').toUpperCase(), x + 14, ty, { width: leftTextW, lineBreak: false });
    ty += rcSp(17);
    doc.font('Helvetica').fontSize(rcPt(8.5)).fillColor('#e2e8f0');
    if (data.address?.trim()) {
        doc.text(data.address.trim(), x + 14, ty, { width: leftTextW, lineBreak: false });
        ty += rcSp(11);
    }
    if (data.tagline?.trim()) {
        doc.text(data.tagline.trim(), x + 14, ty, { width: leftTextW, lineBreak: false });
        ty += rcSp(11);
    }
    if (data.email?.trim()) {
        doc.font('Helvetica').fillColor('#ffffff').text('Email. ', x + 14, ty, { lineBreak: false });
        const emailLabelW = doc.widthOfString('Email. ');
        doc.font('Helvetica-Bold').fillColor('#ffffff').text(data.email.trim(), x + 14 + emailLabelW, ty, {
            width: leftTextW - emailLabelW,
            lineBreak: false,
        });
    }
    const logoPath = resolveUploadPath(data.logoUrl);
    const logoCx = x + w - w * 0.145;
    const logoCy = bodyY + bodyH * 0.4;
    const logoR = rcSp(23);
    doc.circle(logoCx, logoCy, logoR).fill('#ffffff');
    if (logoPath) {
        try {
            doc.save();
            doc.circle(logoCx, logoCy, logoR - 1.5).clip();
            doc.image(logoPath, logoCx - logoR + 2, logoCy - logoR + 2, { fit: [(logoR - 2) * 2, (logoR - 2) * 2] });
            doc.restore();
        }
        catch {
            /* skip invalid logo */
        }
    }
    doc.lineWidth(0.75).strokeColor('#cbd5e1').circle(logoCx, logoCy, logoR).stroke();
    const website = formatWebsiteDisplay(data.website);
    if (website) {
        doc.font('Helvetica').fontSize(rcPt(7)).fillColor('#ffffff').text(website, bottomSplit + 6, bodyY + bodyH - rcSp(15), {
            width: x + w - bottomSplit - 10,
            align: 'center',
            lineBreak: false,
        });
    }
    return y + bannerH;
}
function drawClassicStudentInfoBlock(doc, innerX, startY, innerW, data) {
    let y = startY;
    const colW = innerW / 3;
    doc.lineWidth(1).strokeColor('#93c5fd').moveTo(innerX, y).lineTo(innerX + innerW, y).stroke();
    y += rcSp(7);
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(rcPt(12)).text(data.reportTitle, innerX, y, {
        width: innerW,
        align: 'center',
        lineBreak: false,
    });
    y += rcSp(16);
    doc.strokeColor('#d946ef').moveTo(innerX, y).lineTo(innerX + innerW, y).stroke();
    y += rcSp(10);
    const posText = data.classPosition && data.classTotal ? `${data.classPosition} / ${data.classTotal}` : '—';
    const formPosText = data.formPosition && data.formTotal ? `${data.formPosition} / ${data.formTotal}` : '—';
    const classLabel = (0, class_display_1.reportCardClassValue)(data.className);
    const passedText = data.subjectsPassed != null && data.totalSubjects
        ? formatSubjectsPassed(data.subjectsPassed, data.totalSubjects)
        : '';
    drawLabelValueLine(doc, innerX, y, colW, 'left', 'Student Number:', data.studentId, rcPt(9));
    drawLabelValueLine(doc, innerX + colW, y, colW, 'center', 'Name:', data.studentName, rcPt(9));
    drawLabelValueLine(doc, innerX + colW * 2, y, colW, 'right', 'Class:', classLabel, rcPt(9));
    y += rcSp(14);
    drawLabelValueLine(doc, innerX, y, colW, 'left', 'Position in Class:', posText, rcPt(9));
    drawLabelValueLine(doc, innerX + colW, y, colW, 'center', 'Form Position:', formPosText, rcPt(9));
    if (passedText) {
        drawLabelValueLine(doc, innerX + colW * 2, y, colW, 'right', 'Subjects Passed:', passedText, rcPt(9));
    }
    return y + rcSp(14);
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
        const showPoints = (0, class_display_1.isALevelForm)({ name: data.formName, level: data.formLevel });
        const boundaries = data.gradeBoundaries?.length ? data.gradeBoundaries : grade_boundaries_1.DEFAULT_GRADE_BOUNDARIES;
        const rows = data.subjectResults?.length
            ? data.subjectResults.map((r) => ({
                subject: (r.subjectName || r.subject || '').split(' — ')[0] || 'Subject',
                code: r.subjectCode || '—',
                marks: `${r.marks ?? '—'}`,
                grade: r.grade || '—',
                points: showPoints
                    ? (() => {
                        const pts = (0, grade_boundaries_1.pointsForGrade)(r.grade, boundaries);
                        return pts != null ? String(pts) : '—';
                    })()
                    : undefined,
                rank: formatSubjectPosition(r.subjectPosition, r.subjectPositionTotal),
                mean: r.mean != null && r.mean !== '' ? Number(r.mean).toFixed(1) : '—',
                remarks: r.remarks?.trim() ? r.remarks.trim() : '—',
            }))
            : [];
        doc.rect(0, 0, pageW, pageH).fill('#ffffff');
        let y = pad;
        y = drawReportCardSchoolBanner(doc, innerX, y, innerW, {
            schoolName,
            address: data.address,
            tagline: data.tagline,
            email: data.email,
            website: data.website,
            logoUrl: data.logoUrl,
        });
        y += 8;
        const reportTitle = [data.examTypeName, data.termName].filter(Boolean).join(', ') + ' Report Card';
        const totalSubjects = data.totalSubjects ?? rows.length;
        y = drawClassicStudentInfoBlock(doc, innerX, y, innerW, {
            reportTitle,
            studentId,
            studentName,
            className,
            classPosition: data.classPosition,
            classTotal: data.classTotal,
            formPosition: data.formPosition,
            formTotal: data.formTotal,
            subjectsPassed: data.subjectsPassed,
            totalSubjects,
        });
        const headerEndY = y;
        doc.lineWidth(1).strokeColor('#e2e8f0').moveTo(innerX, headerEndY).lineTo(innerX + innerW, headerEndY).stroke();
        y = headerEndY + 10;
        const estimateCommentH = (text, boxW) => {
            if (!text)
                return rcSp(36);
            doc.font('Helvetica').fontSize(rcPt(9));
            return Math.max(rcSp(36), doc.heightOfString(text, { width: boxW - 20, lineGap: 2 }) + rcSp(22));
        };
        const commentGap = rcSp(10);
        const commentW = innerW;
        const tableToRemarksGap = rcSp(22);
        const teacherBoxH = estimateCommentH(teacherRemarks, commentW);
        const principalBoxH = estimateCommentH(principalRemarks, commentW);
        const remarksBlockH = tableToRemarksGap + teacherBoxH + commentGap + principalBoxH;
        const attendance = data.attendance;
        let attendanceH = 0;
        if (attendance) {
            attendanceH = attendance.daysMarked > 0 ? rcSp(58) : rcSp(28);
        }
        const tableHeaderH = rcSp(20);
        const footerH = rcSp(20);
        const tableStartY = y + attendanceH + (attendance ? rcSp(8) : 0);
        const availableForRows = pageBottom - tableStartY - tableHeaderH - footerH - remarksBlockH - rcSp(8);
        const rowH = rows.length > 0
            ? Math.min(rcSp(22), Math.max(rcSp(14), Math.floor(availableForRows / rows.length)))
            : rcSp(18);
        const rowFontSize = rowH < rcSp(18) ? rcPt(8) : rcPt(9);
        const gradePillH = rcSp(12);
        if (attendance) {
            doc.roundedRect(innerX, y, innerW, attendanceH, 8).fill('#f8fafc');
            doc.lineWidth(0.75).strokeColor('#e2e8f0').roundedRect(innerX, y, innerW, attendanceH, 8).stroke();
            doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(rcPt(10)).text('Attendance (term)', innerX + 10, y + rcSp(8));
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
                const sy = y + rcSp(24);
                stats.forEach((s) => {
                    doc.roundedRect(sx, sy, statW, rcSp(28), 6).fill(s.highlight ? '#eef2ff' : '#ffffff');
                    doc.lineWidth(0.5).strokeColor(s.highlight ? '#c7d2fe' : '#e2e8f0').roundedRect(sx, sy, statW, rcSp(28), 6).stroke();
                    doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(rcPt(6)).text(s.label.toUpperCase(), sx + 4, sy + 4, {
                        width: statW - 8,
                        align: 'center',
                        lineBreak: false,
                    });
                    doc.fillColor(s.highlight ? '#4338ca' : '#0f172a').font('Helvetica-Bold').fontSize(rcPt(10)).text(s.value, sx + 4, sy + rcSp(14), {
                        width: statW - 8,
                        align: 'center',
                        lineBreak: false,
                    });
                    sx += statW + 6;
                });
            }
            else {
                doc.fillColor('#64748b').font('Helvetica').fontSize(rcPt(9)).text('No attendance records for this term.', innerX + 10, y + rcSp(24), { width: innerW - 20, lineBreak: false });
            }
            y += attendanceH + 8;
        }
        const tableX = innerX;
        const tableW = innerW;
        const colWeights = showPoints
            ? [0.20, 0.065, 0.065, 0.075, 0.08, 0.065, 0.075, 0.355]
            : [0.23, 0.065, 0.075, 0.08, 0.065, 0.075, 0.39];
        const cols = colWeights.map((w) => tableW * w);
        const colSpanUsed = cols.reduce((sum, w) => sum + w, 0);
        cols[cols.length - 1] += tableW - colSpanUsed;
        const headers = showPoints
            ? ['SUBJECT', 'CODE', 'MARK', 'GRADE', 'POINTS', 'RANK', 'MEAN', 'REMARKS']
            : ['SUBJECT', 'CODE', 'MARK', 'GRADE', 'RANK', 'MEAN', 'REMARKS'];
        const gradeColIndex = 3;
        const markColIndex = 2;
        const remarksColIndex = headers.length - 1;
        const drawTableHeader = (atY) => {
            doc.rect(tableX, atY, tableW, tableHeaderH).fill('#f1f5f9');
            let hx = tableX;
            doc.fillColor('#000000').font('Helvetica-Bold').fontSize(rcPt(7));
            headers.forEach((h, i) => {
                const align = i === 0 || i === remarksColIndex ? 'left' : 'center';
                const px = i === 0 || i === remarksColIndex ? 5 : 2;
                doc.text(h, hx + px, atY + rcSp(6), { width: cols[i] - px * 2, align, lineBreak: false });
                hx += cols[i];
            });
            doc.lineWidth(0.75).strokeColor(grid).rect(tableX, atY, tableW, tableHeaderH).stroke();
            strokeColumnDividers(doc, tableX, atY, tableHeaderH, cols);
        };
        y = tableStartY;
        drawTableHeader(y);
        y += tableHeaderH;
        rows.forEach((row, i) => {
            doc.rect(tableX, y, tableW, rowH).fill('#ffffff');
            const cells = showPoints
                ? [row.subject, row.code, row.marks, row.grade, row.points ?? '—', row.rank, row.mean, row.remarks]
                : [row.subject, row.code, row.marks, row.grade, row.rank, row.mean, row.remarks];
            let cx = tableX;
            cells.forEach((cell, j) => {
                const px = j === 0 || j === remarksColIndex ? 5 : 2;
                const align = j === 0 || j === remarksColIndex ? 'left' : 'center';
                if (j === gradeColIndex) {
                    const gc = gradeChipColors(cell);
                    const pillW = Math.max(rcSp(14), doc.widthOfString(cell) + rcSp(10));
                    const pillX = cx + (cols[j] - pillW) / 2;
                    doc.roundedRect(pillX, y + (rowH - gradePillH) / 2, pillW, gradePillH, 3).fill(gc.bg);
                    doc.fillColor(gc.fg).font('Helvetica-Bold').fontSize(rowFontSize).text(cell, pillX, y + (rowH - gradePillH) / 2 + 2, {
                        width: pillW,
                        align: 'center',
                        lineBreak: false,
                    });
                }
                else {
                    doc.fillColor(j === remarksColIndex ? '#64748b' : j === 0 || j === 2 ? '#000000' : '#0f172a')
                        .font(j === 0 || j === 2 ? 'Helvetica-Bold' : 'Helvetica')
                        .fontSize(rowFontSize)
                        .text(cell, cx + px, y + (rowH - rowFontSize) / 2, { width: cols[j] - px * 2, align, lineBreak: false });
                }
                cx += cols[j];
            });
            doc.lineWidth(0.75).strokeColor(grid).rect(tableX, y, tableW, rowH).stroke();
            strokeColumnDividers(doc, tableX, y, rowH, cols);
            y += rowH;
        });
        doc.rect(tableX, y, tableW, footerH).fill('#eff6ff');
        doc.lineWidth(1).strokeColor('#93c5fd').moveTo(tableX, y).lineTo(tableX + tableW, y).stroke();
        const pointsColIndex = showPoints ? 4 : -1;
        const avgText = data.averageMark != null ? `${Number(data.averageMark).toFixed(1)}` : '—';
        const totalPoints = showPoints
            ? rows.reduce((sum, row) => {
                const pts = row.points;
                if (pts == null || pts === '—')
                    return sum;
                const n = Number(pts);
                return Number.isFinite(n) ? sum + n : sum;
            }, 0)
            : 0;
        const totalPointsText = showPoints && totalPoints > 0 ? String(totalPoints) : showPoints ? '—' : '';
        let fx = tableX;
        headers.forEach((_, i) => {
            if (i === 0) {
                const labelSpanW = cols[0] + cols[1];
                doc.fillColor('#1d4ed8').font('Helvetica-Bold').fontSize(rcPt(9)).text('Average Mark', tableX + 6, y + rcSp(6), {
                    width: labelSpanW - 12,
                    align: 'right',
                    lineBreak: false,
                });
                fx += cols[0];
                return;
            }
            if (i === 1) {
                fx += cols[1];
                return;
            }
            let cellText = '';
            if (i === markColIndex)
                cellText = avgText;
            else if (i === gradeColIndex && showPoints)
                cellText = 'Total';
            else if (i === pointsColIndex)
                cellText = totalPointsText;
            if (cellText) {
                const isPointsFooter = i === pointsColIndex;
                const isTotalLabel = i === gradeColIndex && showPoints;
                const color = isPointsFooter ? '#0f766e' : '#1d4ed8';
                doc.fillColor(color).font('Helvetica-Bold').fontSize(rcPt(9)).text(cellText, fx + 2, y + rcSp(6), {
                    width: cols[i] - 4,
                    align: isTotalLabel ? 'right' : 'center',
                    lineBreak: false,
                });
            }
            fx += cols[i];
        });
        doc.lineWidth(0.75).strokeColor(grid).rect(tableX, y, tableW, footerH).stroke();
        strokeColumnDividers(doc, tableX, y, footerH, cols, 0);
        y += footerH + tableToRemarksGap;
        doc.font('Helvetica').fontSize(rcPt(9));
        const drawCommentBox = (x, boxY, title, text) => {
            const innerTextH = Math.max(rcSp(18), doc.heightOfString(text || '—', { width: commentW - 20, lineGap: 2 }));
            const commentBoxH = innerTextH + rcSp(22);
            doc.roundedRect(x, boxY, commentW, commentBoxH, 8).fill('#fafafa');
            doc.lineWidth(0.75).strokeColor('#e2e8f0').roundedRect(x, boxY, commentW, commentBoxH, 8).stroke();
            doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(rcPt(6.5)).text(title.toUpperCase(), x + 10, boxY + rcSp(8), {
                width: commentW - 20,
                lineBreak: false,
            });
            doc.fillColor('#0f172a').font('Helvetica').fontSize(rcPt(9)).text(text || '—', x + 10, boxY + rcSp(18), {
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
        setPdfDefaultZoom100(doc);
        doc.end();
    });
}
