import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { formatSubjectAbbrev } from './subject-abbrev';
import { shortClassName, compactClassName } from './teacher-load.pdf';

const COLORS = {
  border: '#000000',
  ink: '#000000',
  muted: '#333333',
  breakFill: '#f5f5f5',
};

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

export interface ClassicGridPeriod {
  startTime: string;
  endTime: string;
  name?: string;
  slotType?: 'lesson' | 'break';
}

export interface ClassicTeacherSlot {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  className: string;
  subjectName: string;
  subjectCode?: string | null;
  subjectShort?: string | null;
  room?: string;
}

export interface ClassicClassSlot {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  subjectName: string;
  subjectCode?: string | null;
  subjectShort?: string | null;
  teacherName: string;
  room?: string;
}

export interface TimetablePdfMeta {
  schoolName: string;
  logoUrl?: string;
  titleLine: string;
  subtitleLine: string;
  headerRight?: string;
  generatedAt: Date;
  footerBrand?: string;
}

export interface ClassicTeacherPdfData extends TimetablePdfMeta {
  teacherName: string;
  periods: ClassicGridPeriod[];
  slots: ClassicTeacherSlot[];
}

export interface ClassicClassPdfData extends TimetablePdfMeta {
  className: string;
  periods: ClassicGridPeriod[];
  slots: ClassicClassSlot[];
}

function resolveUploadPath(publicUrl?: string): string | null {
  const value = publicUrl?.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return null;
  const rel = value.startsWith('/') ? value.slice(1) : value;
  const full = path.join(process.cwd(), rel.replace(/^uploads\//, 'uploads/'));
  return fs.existsSync(full) ? full : null;
}

function compactTime(time: string): string {
  const [h, m] = String(time || '0:00').split(':');
  return `${Number(h)}:${(m || '00').padStart(2, '0')}`;
}

export function formatPeriodRangeLabel(period: ClassicGridPeriod): string {
  return `${compactTime(period.startTime)} - ${compactTime(period.endTime)}`;
}

function isBreakPeriod(period: ClassicGridPeriod): boolean {
  return period.slotType === 'break';
}

function lessonPeriodNumber(periods: ClassicGridPeriod[], index: number): number {
  return periods.slice(0, index + 1).filter((p) => !isBreakPeriod(p)).length;
}

function breakDurationMinutes(period: { startTime?: string; endTime?: string }): number {
  const [sh, sm] = String(period.startTime || '0:0').split(':').map(Number);
  const [eh, em] = String(period.endTime || '0:0').split(':').map(Number);
  return eh * 60 + em - (sh * 60 + sm);
}

function breakStartMinutes(period: { startTime?: string }): number {
  const [h, m] = String(period.startTime || '0:0').split(':').map(Number);
  return h * 60 + m;
}

function isLunchBreakPeriod(period: ClassicGridPeriod): boolean {
  const name = String(period.name || '').trim();
  if (/lunch/i.test(name)) return true;
  const start = breakStartMinutes(period);
  const duration = breakDurationMinutes(period);
  return start >= 11 * 60 + 30 && duration >= 35;
}

function breakColumnTitle(period: ClassicGridPeriod): string {
  return isLunchBreakPeriod(period) ? 'LUNCH TIME' : 'BREAK TIME';
}

function pdfSubjectLabel(
  short: string | null | undefined,
  code: string | null | undefined,
  name: string,
): string {
  const custom = String(short || '').trim();
  if (custom) return custom;

  const raw = formatSubjectAbbrev(code ?? undefined, name);
  if (raw.length <= 4) {
    return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  }
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return words
      .map((w) => w.charAt(0))
      .join('')
      .slice(0, 4);
  }
  return name.slice(0, 4);
}

function formatTeacherClassLine(name: string): string {
  return String(name || '').trim() || '—';
}

function classStreamLabel(className: string): string {
  const code = shortClassName(className).replace(/\s+/g, '').toUpperCase();
  if (!code) return '';
  if (/GIRLS?$/.test(code) || /[0-9]G$/.test(code)) return 'Girls';
  if (/BOYS?$/.test(code) || /[0-9]B$/.test(code)) return 'Boys';
  return '';
}

function formatGeneratedDate(date: Date): string {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'numeric', year: 'numeric' });
}

type AnySlot = ClassicTeacherSlot | ClassicClassSlot;

function slotAt(slots: AnySlot[], day: number, period: ClassicGridPeriod): AnySlot | undefined {
  return slots.find(
    (s) => s.dayOfWeek === day && s.startTime === period.startTime && s.endTime === period.endTime,
  );
}

function sameLesson(a: AnySlot, b: AnySlot, mode: 'teacher' | 'class'): boolean {
  if (a.subjectName !== b.subjectName) return false;
  if (mode === 'teacher') {
    return (a as ClassicTeacherSlot).className === (b as ClassicTeacherSlot).className;
  }
  return (
    (a as ClassicClassSlot).teacherName === (b as ClassicClassSlot).teacherName
  );
}

function computeColSpans(
  day: number,
  periods: ClassicGridPeriod[],
  slots: AnySlot[],
  mode: 'teacher' | 'class',
): number[] {
  const spans = periods.map(() => 1);
  let i = 0;
  while (i < periods.length) {
    if (isBreakPeriod(periods[i])) {
      i += 1;
      continue;
    }
    const slot = slotAt(slots, day, periods[i]);
    if (!slot) {
      i += 1;
      continue;
    }
    let span = 1;
    while (i + span < periods.length) {
      const next = periods[i + span];
      if (isBreakPeriod(next)) break;
      const nextSlot = slotAt(slots, day, next);
      if (!nextSlot || !sameLesson(slot, nextSlot, mode)) break;
      span += 1;
    }
    spans[i] = span;
    for (let k = 1; k < span; k += 1) spans[i + k] = 0;
    i += span;
  }
  return spans;
}

function drawVerticalLabel(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  doc.save();
  doc.font('Helvetica-Bold').fontSize(7).fillColor(COLORS.ink);
  const cx = x + w / 2;
  const cy = y + h / 2;
  doc.translate(cx, cy);
  doc.rotate(-90);
  doc.text(text, -h / 2 + 4, -3, { width: h - 8, align: 'center' });
  doc.restore();
}

function fitSingleLine(doc: PDFKit.PDFDocument, text: string, maxWidth: number): string {
  let value = String(text || '').trim();
  if (!value) return '—';
  while (value.length > 1 && doc.widthOfString(value) > maxWidth) {
    value = value.slice(0, -1);
  }
  if (value.length < String(text).trim().length) {
    value = value.length > 1 ? `${value.slice(0, -1)}…` : '…';
  }
  return value;
}

function distributeColumnWidths(totalWidth: number, count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(totalWidth / count);
  let remainder = Math.round(totalWidth - base * count);
  return Array.from({ length: count }, () => {
    if (remainder > 0) {
      remainder -= 1;
      return base + 1;
    }
    return base;
  });
}

function spanColumnWidth(widths: number[], start: number, span: number): number {
  let total = 0;
  for (let i = 0; i < span; i += 1) total += widths[start + i] || 0;
  return total;
}

function drawTeacherCell(
  doc: PDFKit.PDFDocument,
  slot: ClassicTeacherSlot,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  doc.save();
  doc.rect(x, y, w, h).clip();
  const subject = String(slot.subjectName || '').trim() || '—';
  const cls = compactClassName(slot.className);
  const stream = classStreamLabel(slot.className);
  doc.font('Helvetica').fontSize(5.5).fillColor(COLORS.ink);
  doc.text(fitSingleLine(doc, subject, w - 4), x + 2, y + 3, { width: w - 4, align: 'left', lineBreak: false });
  let classFont = Math.min(10, Math.max(6, w * 0.38));
  doc.font('Helvetica-Bold').fontSize(classFont).fillColor(COLORS.ink);
  let classLabel = cls;
  while (classFont > 5.5 && doc.widthOfString(classLabel) > w - 2) {
    classFont -= 0.5;
    doc.fontSize(classFont);
  }
  if (doc.widthOfString(classLabel) > w - 2) {
    classLabel = fitSingleLine(doc, classLabel, w - 2);
  }
  doc.text(classLabel, x + 1, y + h / 2 - classFont / 2, { width: w - 2, align: 'center', lineBreak: false });
  const bottom = stream || slot.room || '';
  if (bottom) {
    doc.font('Helvetica').fontSize(5.5).fillColor(COLORS.muted);
    doc.text(fitSingleLine(doc, bottom, w - 2), x + 1, y + h - 9, { width: w - 2, align: 'center', lineBreak: false });
  }
  doc.restore();
}

function drawClassCell(
  doc: PDFKit.PDFDocument,
  slot: ClassicClassSlot,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  doc.save();
  doc.rect(x, y, w, h).clip();
  const subject = pdfSubjectLabel(slot.subjectShort, slot.subjectCode, slot.subjectName);
  const teacher = formatTeacherClassLine(slot.teacherName);
  const centerY = y + h / 2;
  const subjectY = centerY - 6;

  let subjectFont = Math.min(10, Math.max(6, w * 0.34));
  doc.font('Helvetica-Bold').fontSize(subjectFont).fillColor(COLORS.ink);
  let subjectText = subject;
  while (subjectFont > 5.5 && doc.widthOfString(subjectText) > w - 2) {
    subjectFont -= 0.5;
    doc.fontSize(subjectFont);
  }
  if (doc.widthOfString(subjectText) > w - 2) {
    subjectText = fitSingleLine(doc, subjectText, w - 2);
  }
  doc.text(subjectText, x + 1, subjectY, { width: w - 2, align: 'center', lineBreak: false });

  doc.font('Helvetica').fontSize(5.5).fillColor(COLORS.muted);
  doc.text(fitSingleLine(doc, teacher, w - 2), x + 1, centerY + 2, { width: w - 2, align: 'center', lineBreak: false });

  if (slot.room) {
    doc.font('Helvetica').fontSize(5).fillColor(COLORS.muted);
    doc.text(fitSingleLine(doc, slot.room, w - 2), x + 1, y + h - 8, { width: w - 2, align: 'center', lineBreak: false });
  }
  doc.restore();
}

async function generateAscStylePdf(
  data: ClassicTeacherPdfData | ClassicClassPdfData,
  mode: 'teacher' | 'class',
): Promise<Buffer> {
  return generateCombinedAscStylePdf([{ data, mode }]);
}

function renderClassicTimetablePage(
  doc: InstanceType<typeof PDFDocument>,
  data: ClassicTeacherPdfData | ClassicClassPdfData,
  mode: 'teacher' | 'class',
): void {
  const periods = data.periods;
  const periodCount = periods.length;
  const margin = periodCount > 13 ? 12 : periodCount > 11 ? 14 : 18;
  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const contentW = pageW - margin * 2;
  const dayColW = periodCount > 13 ? 26 : periodCount > 11 ? 30 : 34;
  const gridW = contentW - dayColW;
  const colWidths = distributeColumnWidths(gridW, periodCount);
  const periodNumH = 16;
  const periodTimeH = 14;
  const headerH = periodNumH + periodTimeH;
  const titleBlockH = data.headerRight ? 54 : 46;
  const footerH = 16;
  const rowH = Math.max(34, Math.floor((pageH - margin * 2 - titleBlockH - footerH - headerH) / 5));
  const bodyH = rowH * 5;
  const logoPath = resolveUploadPath(data.logoUrl);
  let y = margin;

  if (logoPath) {
    try {
      doc.image(logoPath, margin, y, { fit: [38, 38] });
    } catch {
      /* skip */
    }
  }

  doc.font('Helvetica-Bold').fontSize(15).fillColor(COLORS.ink);
  doc.text(data.titleLine, margin, y + 2, { width: contentW, align: 'center' });
  y += 20;

  doc.font('Helvetica-Bold').fontSize(11).fillColor(COLORS.ink);
  doc.text(data.subtitleLine, margin, y, { width: contentW, align: 'center' });
  y += 18;

  if (data.headerRight) {
    doc.font('Helvetica').fontSize(9).fillColor(COLORS.ink);
    doc.text(data.headerRight, margin, margin + 4, { width: contentW, align: 'right' });
  }

  const gridX = margin;
  const gridY = y;
  const gridH = headerH + bodyH;
  const slots = mode === 'teacher'
    ? (data as ClassicTeacherPdfData).slots
    : (data as ClassicClassPdfData).slots;

  doc.save();
  doc.strokeColor(COLORS.border).lineWidth(0.6);

  doc.rect(gridX, gridY, dayColW, headerH).stroke();
  let hx = gridX + dayColW;
  for (let pi = 0; pi < periods.length; pi += 1) {
    const period = periods[pi];
    const colW = colWidths[pi];
    const isBreak = isBreakPeriod(period);
    if (isBreak) {
      doc.fillColor(COLORS.breakFill).strokeColor(COLORS.border);
      doc.rect(hx, gridY, colW, headerH).fillAndStroke();
      doc.font('Helvetica').fontSize(6).fillColor(COLORS.ink);
      doc.text(formatPeriodRangeLabel(period), hx + 1, gridY + headerH / 2 - 3, {
        width: colW - 2,
        align: 'center',
        lineBreak: false,
      });
    } else {
      doc.rect(hx, gridY, colW, periodNumH).stroke();
      doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.ink);
      doc.text(String(lessonPeriodNumber(periods, pi)), hx + 1, gridY + 3, {
        width: colW - 2,
        align: 'center',
      });
      doc.rect(hx, gridY + periodNumH, colW, periodTimeH).stroke();
      doc.font('Helvetica').fontSize(6).fillColor(COLORS.ink);
      doc.text(formatPeriodRangeLabel(period), hx + 1, gridY + periodNumH + 3, {
        width: colW - 2,
        align: 'center',
        lineBreak: false,
      });
    }
    hx += colW;
  }

  const bodyY = gridY + headerH;
  for (let di = 0; di < 5; di += 1) {
    const day = di + 1;
    const rowY = bodyY + di * rowH;
    doc.rect(gridX, rowY, dayColW, rowH).stroke();
    doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.ink);
    doc.text(DAY_LABELS[di], gridX + 1, rowY + rowH / 2 - 5, { width: dayColW - 2, align: 'center' });

    const spans = computeColSpans(day, periods, slots, mode);
    let cx = gridX + dayColW;
    for (let pi = 0; pi < periods.length; pi += 1) {
      const period = periods[pi];
      const colW = colWidths[pi];
      const span = spans[pi];

      if (isBreakPeriod(period)) {
        doc.fillColor(COLORS.breakFill).strokeColor(COLORS.border);
        doc.rect(cx, rowY, colW, rowH).fillAndStroke();
        if (di === 2) {
          drawVerticalLabel(doc, breakColumnTitle(period), cx, rowY, colW, rowH);
        }
        cx += colW;
        continue;
      }

      if (span === 0) {
        cx += colW;
        continue;
      }
      const cellW = spanColumnWidth(colWidths, pi, span);
      doc.fillColor('#ffffff').strokeColor(COLORS.border);
      doc.rect(cx, rowY, cellW, rowH).stroke();
      const slot = slotAt(slots, day, period);
      if (slot) {
        if (mode === 'teacher') {
          drawTeacherCell(doc, slot as ClassicTeacherSlot, cx, rowY, cellW, rowH);
        } else {
          drawClassCell(doc, slot as ClassicClassSlot, cx, rowY, cellW, rowH);
        }
      }
      cx += cellW;
    }
  }

  doc.lineWidth(1.4);
  doc.rect(gridX, gridY, dayColW + gridW, gridH).stroke();
  doc.restore();

  const footerY = pageH - margin - 10;
  doc.font('Helvetica').fontSize(7).fillColor(COLORS.muted);
  doc.text(`Timetable generated: ${formatGeneratedDate(data.generatedAt)}`, margin, footerY, {
    width: contentW / 2,
    align: 'left',
  });
  doc.text(data.footerBrand || data.schoolName || 'School Pro', margin, footerY, {
    width: contentW,
    align: 'right',
  });
}

async function generateCombinedAscStylePdf(
  pages: Array<{ data: ClassicTeacherPdfData | ClassicClassPdfData; mode: 'teacher' | 'class' }>,
): Promise<Buffer> {
  if (!pages.length) {
    throw new Error('No timetable pages to export.');
  }

  return new Promise((resolve, reject) => {
    const margin = 18;
    const doc = new PDFDocument({ margin, size: 'A4', layout: 'landscape' });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    pages.forEach((page, index) => {
      if (index > 0) {
        doc.addPage({ layout: 'landscape', size: 'A4', margin });
      }
      renderClassicTimetablePage(doc, page.data, page.mode);
    });

    doc.end();
  });
}

export function generateAllTeacherTimetablesPdf(pages: ClassicTeacherPdfData[]): Promise<Buffer> {
  return generateCombinedAscStylePdf(pages.map((data) => ({ data, mode: 'teacher' as const })));
}

export function generateAllClassTimetablesPdf(pages: ClassicClassPdfData[]): Promise<Buffer> {
  return generateCombinedAscStylePdf(pages.map((data) => ({ data, mode: 'class' as const })));
}

export function generateTeacherTimetablePdf(data: ClassicTeacherPdfData): Promise<Buffer> {
  return generateAscStylePdf(data, 'teacher');
}

export function generateClassTimetablePdf(data: ClassicClassPdfData): Promise<Buffer> {
  return generateAscStylePdf(data, 'class');
}

export function buildTimetableTermVersionLabel(
  termName?: string | null,
  yearName?: string | null,
  version: string | number = 1,
): string {
  const term = String(termName || '').trim();
  const year = String(yearName || '').trim();
  if (term && year) return `${term} (${year}) Version ${version}`;
  if (term) return `${term} Version ${version}`;
  if (year) return `${year} Version ${version}`;
  return `Version ${version}`;
}

export function buildTimetableTitleLine(
  schoolName: string,
  termName?: string,
  yearName?: string,
  version: string | number = 1,
): string {
  const school = schoolName || 'School';
  const termVersion = buildTimetableTermVersionLabel(termName, yearName, version);
  return `${school}: ${termVersion}`;
}

export function formatClassTeacherHeader(name: string): string {
  const short = String(name || '').trim();
  return short ? `Class teacher : ${short}` : '';
}
