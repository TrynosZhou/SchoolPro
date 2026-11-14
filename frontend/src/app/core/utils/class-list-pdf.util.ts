/**
 * Class list PDF — classical letterhead, modern roster.
 *
 * Rendered in the browser with jsPDF (already used by the timetable and help-manual
 * exports), so the preview and download no longer depend on the backend template.
 *
 *  - Letterhead: crest, school name in serif, italic motto, contact block,
 *    closed by a double rule (heavy navy + fine gold).
 *  - Title block: class name as the headline, term and generated date beside it.
 *  - Summary strip: total, gender split and boarder / day-scholar split.
 *  - Roster: navy header that repeats on every page, zebra rows, status dots.
 *  - Footer on every page: school, class, "Page x of y".
 */

export interface ClassListPdfStudent {
  admissionNumber: string;
  lastName: string;
  firstName: string;
  gender?: string | null;
  dateOfBirth?: string | null;
  studentType?: string | null;
}

export interface ClassListPdfBranding {
  schoolName?: string;
  tagline?: string;
  /** Absolute URL or data: URI. A missing or unreadable logo falls back to a monogram crest. */
  logoUrl?: string | null;
  address?: string;
  phone?: string;
  email?: string;
}

export interface ClassListPdfOptions {
  className: string;
  termName?: string;
  generatedAt?: Date;
  students: ClassListPdfStudent[];
  branding?: ClassListPdfBranding;
}

type Rgb = readonly [number, number, number];

const NAVY: Rgb = [22, 52, 107];
const NAVY_DEEP: Rgb = [15, 37, 82];
const GOLD: Rgb = [169, 134, 63];
const INK: Rgb = [26, 34, 50];
const MUTED: Rgb = [95, 107, 124];
const HAIR: Rgb = [217, 222, 231];
const TINT: Rgb = [245, 247, 251];
const ZEBRA: Rgb = [249, 250, 252];
const WHITE: Rgb = [255, 255, 255];

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 16;
const CONTENT_W = PAGE_W - MARGIN * 2;
const FOOTER_TOP = PAGE_H - 16;
const ROW_H = 9;
const HEAD_H = 9;

/** Column widths sum to CONTENT_W (178 mm). */
const COLS = [
  { key: 'no', label: 'No.', w: 11, align: 'center' as const },
  { key: 'id', label: 'Student ID', w: 33, align: 'left' as const },
  { key: 'last', label: 'Last name', w: 30, align: 'left' as const },
  { key: 'first', label: 'First name', w: 32, align: 'left' as const },
  { key: 'gender', label: 'Gender', w: 20, align: 'left' as const },
  { key: 'dob', label: 'Date of birth', w: 26, align: 'left' as const },
  { key: 'type', label: 'Type', w: 26, align: 'left' as const },
];

const PAD = 3;

type Doc = import('jspdf').jsPDF;

const fill = (d: Doc, c: Rgb) => d.setFillColor(c[0], c[1], c[2]);
const stroke = (d: Doc, c: Rgb) => d.setDrawColor(c[0], c[1], c[2]);
const ink = (d: Doc, c: Rgb) => d.setTextColor(c[0], c[1], c[2]);

function formatDob(value?: string | null): string {
  if (!value) return '-';
  const iso = value.length === 10 ? `${value}T12:00:00` : value;
  const date = new Date(iso);
  if (isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatGenerated(d: Date): string {
  const day = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${day}, ${time}`;
}

function typeInfo(t?: string | null): { text: string; color: Rgb | null } {
  if (t === 'boarder') return { text: 'Boarder', color: NAVY };
  if (t === 'day_scholar') return { text: 'Day scholar', color: GOLD };
  return { text: '-', color: null };
}

export async function loadImage(url?: string | null): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith('data:image/')) return url;
  try {
    const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith('image/')) return null;
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function imageFormat(dataUrl: string): 'PNG' | 'JPEG' | 'WEBP' | null {
  const m = /^data:image\/(png|jpe?g|webp)/i.exec(dataUrl);
  if (!m) return null;
  const t = m[1].toLowerCase();
  return t === 'png' ? 'PNG' : t === 'webp' ? 'WEBP' : 'JPEG';
}

/** Fits the image inside a square box, centred, keeping its aspect ratio. */
function drawCrest(doc: Doc, dataUrl: string | null, schoolName: string, x: number, y: number, box: number): void {
  const format = dataUrl ? imageFormat(dataUrl) : null;
  if (dataUrl && format) {
    try {
      const props = doc.getImageProperties(dataUrl);
      const ratio = props.width / props.height;
      const w = ratio >= 1 ? box : box * ratio;
      const h = ratio >= 1 ? box / ratio : box;
      doc.addImage(dataUrl, format, x + (box - w) / 2, y + (box - h) / 2, w, h);
      return;
    } catch {
      /* fall through to the monogram */
    }
  }
  const r = box / 2;
  stroke(doc, NAVY);
  doc.setLineWidth(0.5);
  doc.circle(x + r, y + r, r - 0.3, 'S');
  stroke(doc, GOLD);
  doc.setLineWidth(0.2);
  doc.circle(x + r, y + r, r - 1.6, 'S');
  doc.setFont('times', 'bold');
  doc.setFontSize(18);
  ink(doc, NAVY);
  doc.text((schoolName.trim().charAt(0) || 'S').toUpperCase(), x + r, y + r + 0.5, {
    align: 'center',
    baseline: 'middle',
  });
}

export function drawLetterhead(doc: Doc, b: ClassListPdfBranding, logo: string | null): number {
  const top = 14;
  const crest = 20;
  const schoolName = b.schoolName?.trim() || 'School Pro Academy';

  drawCrest(doc, logo, schoolName, MARGIN, top, crest);

  const textX = MARGIN + crest + 5;
  const contact = [b.address, b.phone, b.email].map((v) => (v || '').trim()).filter(Boolean);
  const metaW = contact.length ? 58 : 0;
  const nameW = CONTENT_W - crest - 5 - (metaW ? metaW + 6 : 0);

  // Shrink long school names so they stay on one line.
  let size = 21;
  doc.setFont('times', 'bold');
  doc.setFontSize(size);
  while (size > 14 && doc.getTextWidth(schoolName) > nameW) {
    size -= 1;
    doc.setFontSize(size);
  }
  ink(doc, NAVY_DEEP);
  doc.text(schoolName, textX, top + 9.5);

  if (b.tagline?.trim()) {
    doc.setFont('times', 'italic');
    doc.setFontSize(10);
    ink(doc, GOLD);
    doc.text(b.tagline.trim(), textX, top + 16, { maxWidth: nameW });
  }

  if (contact.length) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    ink(doc, MUTED);
    const lines = contact.flatMap((c) => doc.splitTextToSize(c, metaW) as string[]).slice(0, 4);
    const startY = top + 10 - ((lines.length - 1) * 4) / 2 + 0.5;
    lines.forEach((line, i) => doc.text(line, PAGE_W - MARGIN, startY + i * 4, { align: 'right' }));
  }

  // Double rule: heavy navy over a fine gold line.
  const ruleY = top + crest + 4.5;
  stroke(doc, NAVY);
  doc.setLineWidth(0.8);
  doc.line(MARGIN, ruleY, PAGE_W - MARGIN, ruleY);
  stroke(doc, GOLD);
  doc.setLineWidth(0.25);
  doc.line(MARGIN, ruleY + 1.5, PAGE_W - MARGIN, ruleY + 1.5);

  return ruleY + 1.5;
}

function drawTitleBlock(doc: Doc, className: string, termName: string | undefined, generated: Date, y: number): number {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  ink(doc, MUTED);
  doc.text('Class list report', MARGIN, y + 3);

  doc.setFont('times', 'bold');
  doc.setFontSize(24);
  ink(doc, NAVY_DEEP);
  doc.text(className, MARGIN, y + 12.5, { maxWidth: CONTENT_W - 60 });

  if (termName) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    ink(doc, MUTED);
    doc.text(termName, MARGIN, y + 18.5);
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  ink(doc, MUTED);
  doc.text('Generated', PAGE_W - MARGIN, y + 9.5, { align: 'right' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  ink(doc, INK);
  doc.text(formatGenerated(generated), PAGE_W - MARGIN, y + 14.5, { align: 'right' });

  return y + 24;
}

function drawSummary(doc: Doc, students: ClassListPdfStudent[], y: number): number {
  const count = (fn: (s: ClassListPdfStudent) => boolean) => students.filter(fn).length;
  const stats = [
    { n: students.length, l: 'Total students', w: 1.25 },
    { n: count((s) => s.gender === 'Male'), l: 'Male', w: 1 },
    { n: count((s) => s.gender === 'Female'), l: 'Female', w: 1 },
    { n: count((s) => s.studentType === 'boarder'), l: 'Boarders', w: 1 },
    { n: count((s) => s.studentType === 'day_scholar'), l: 'Day scholars', w: 1 },
  ];
  const h = 17;
  fill(doc, TINT);
  stroke(doc, HAIR);
  doc.setLineWidth(0.2);
  doc.rect(MARGIN, y, CONTENT_W, h, 'FD');
  fill(doc, NAVY);
  doc.rect(MARGIN, y, 1.2, h, 'F');

  const totalW = stats.reduce((a, s) => a + s.w, 0);
  const inner = CONTENT_W - 1.2;
  let x = MARGIN + 1.2;
  stats.forEach((s, i) => {
    const w = (inner * s.w) / totalW;
    if (i > 0) {
      stroke(doc, HAIR);
      doc.setLineWidth(0.2);
      doc.line(x, y + 3, x, y + h - 3);
    }
    doc.setFont('times', 'bold');
    doc.setFontSize(16);
    ink(doc, NAVY_DEEP);
    doc.text(String(s.n), x + 5, y + 8);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    ink(doc, MUTED);
    doc.text(s.l, x + 5, y + 13);
    x += w;
  });
  return y + h + 7;
}

function drawTableHeader(doc: Doc, y: number): number {
  fill(doc, NAVY);
  doc.rect(MARGIN, y, CONTENT_W, HEAD_H, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  ink(doc, WHITE);
  let x = MARGIN;
  COLS.forEach((c, i) => {
    if (i > 0) {
      stroke(doc, [58, 86, 140]);
      doc.setLineWidth(0.15);
      doc.line(x, y + 2, x, y + HEAD_H - 2);
    }
    const tx = c.align === 'center' ? x + c.w / 2 : x + PAD;
    doc.text(c.label, tx, y + HEAD_H / 2, { align: c.align, baseline: 'middle' });
    x += c.w;
  });
  return y + HEAD_H;
}

function drawRow(doc: Doc, s: ClassListPdfStudent, index: number, y: number): void {
  if (index % 2 === 1) {
    fill(doc, ZEBRA);
    doc.rect(MARGIN, y, CONTENT_W, ROW_H, 'F');
  }
  stroke(doc, HAIR);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, y + ROW_H, MARGIN + CONTENT_W, y + ROW_H);

  const mid = y + ROW_H / 2;
  const t = typeInfo(s.studentType);
  const cells: Record<string, { text: string; font: 'normal' | 'bold'; color: Rgb }> = {
    no: { text: String(index + 1), font: 'normal', color: MUTED },
    id: { text: s.admissionNumber || '-', font: 'bold', color: NAVY },
    last: { text: s.lastName || '-', font: 'bold', color: INK },
    first: { text: s.firstName || '-', font: 'normal', color: INK },
    gender: { text: s.gender || '-', font: 'normal', color: INK },
    dob: { text: formatDob(s.dateOfBirth), font: 'normal', color: INK },
    type: { text: t.text, font: 'normal', color: INK },
  };

  doc.setFontSize(9.5);
  let x = MARGIN;
  COLS.forEach((c) => {
    const cell = cells[c.key];
    doc.setFont('helvetica', cell.font);
    ink(doc, cell.color);
    let tx = c.align === 'center' ? x + c.w / 2 : x + PAD;
    if (c.key === 'type' && t.color) {
      fill(doc, t.color);
      doc.circle(x + PAD + 1, mid, 1, 'F');
      tx += 3.6;
    }
    const clipped = doc.splitTextToSize(cell.text, c.w - PAD * 2 - (c.key === 'type' ? 3.6 : 0))[0] ?? '';
    doc.text(clipped, tx, mid, { align: c.align, baseline: 'middle' });
    x += c.w;
  });
}

function drawEnd(doc: Doc, count: number, y: number): void {
  stroke(doc, NAVY);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, y, MARGIN + CONTENT_W, y);

  const label = `End of class list · ${count} student${count === 1 ? '' : 's'}`;
  doc.setFont('times', 'italic');
  doc.setFontSize(9);
  ink(doc, MUTED);
  const labelW = doc.getTextWidth(label);
  const cy = y + 8;
  const cx = PAGE_W / 2;
  stroke(doc, HAIR);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, cy - 1, cx - labelW / 2 - 4, cy - 1);
  doc.line(cx + labelW / 2 + 4, cy - 1, MARGIN + CONTENT_W, cy - 1);
  doc.text(label, cx, cy, { align: 'center' });
}

function drawFooters(doc: Doc, schoolName: string, className: string): void {
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    stroke(doc, HAIR);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, FOOTER_TOP, PAGE_W - MARGIN, FOOTER_TOP);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    ink(doc, MUTED);
    doc.text(schoolName, MARGIN, FOOTER_TOP + 5);
    doc.text(`${className} · Class list`, PAGE_W / 2, FOOTER_TOP + 5, { align: 'center' });
    doc.text(`Page ${p} of ${total}`, PAGE_W - MARGIN, FOOTER_TOP + 5, { align: 'right' });
  }
}

export async function buildClassListPdfBlob(options: ClassListPdfOptions): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const branding = options.branding ?? {};
  const schoolName = branding.schoolName?.trim() || 'School Pro Academy';
  const generated = options.generatedAt ?? new Date();
  const logo = await loadImage(branding.logoUrl);

  const students = [...options.students].sort((a, b) =>
    `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'en', { sensitivity: 'base' }),
  );

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  doc.setProperties({ title: `Class list - ${options.className}`, author: schoolName, creator: schoolName });

  let y = drawLetterhead(doc, branding, logo) + 9;
  y = drawTitleBlock(doc, options.className, options.termName, generated, y);
  y = drawSummary(doc, students, y);
  y = drawTableHeader(doc, y);

  const bottomLimit = FOOTER_TOP - 6;
  students.forEach((s, i) => {
    if (y + ROW_H > bottomLimit) {
      doc.addPage();
      y = MARGIN;
      doc.setFont('times', 'italic');
      doc.setFontSize(9);
      ink(doc, MUTED);
      doc.text(`${options.className} - continued`, MARGIN, y + 2);
      y = drawTableHeader(doc, y + 5);
    }
    drawRow(doc, s, i, y);
    y += ROW_H;
  });

  if (y + 14 > bottomLimit) {
    doc.addPage();
    y = MARGIN;
  }
  drawEnd(doc, students.length, y);
  drawFooters(doc, schoolName, options.className);

  return doc.output('blob');
}
