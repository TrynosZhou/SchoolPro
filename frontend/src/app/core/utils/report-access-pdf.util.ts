/**
 * Report access PDF — parents who have not yet opened their child's report card.
 *
 * Rendered in the browser with jsPDF and shares the letterhead used by the class list PDF.
 *
 *  - Letterhead, then a title block (exam type headline, term and generated date).
 *  - Summary strip: parents yet to view, children not yet viewed, fully viewed, with published results.
 *  - Table grouped by parent: one row per linked child with a viewed / not viewed status.
 *    The header repeats on every page and a parent's children are kept together when they fit.
 *  - Footer on every page: school, term and exam, "Page x of y".
 */
import { ClassListPdfBranding, drawLetterhead, loadImage } from './class-list-pdf.util';

export interface ReportAccessPdfChild {
  firstName: string;
  lastName: string;
  admissionNumber?: string;
  className?: string;
  formName?: string;
  viewed: boolean;
  viewedAt?: string | null;
}

export interface ReportAccessPdfParent {
  name: string;
  email?: string;
  phone?: string;
  children: ReportAccessPdfChild[];
}

export interface ReportAccessPdfOptions {
  termName: string;
  examTypeName: string;
  generatedAt?: Date;
  /** Parents who still have at least one unviewed child. */
  pendingParents: ReportAccessPdfParent[];
  /** Parents who have viewed every linked child's report card. */
  parentsCompleted: number;
  /** Parents with published results for this term and exam type. */
  totalParents: number;
  branding?: ClassListPdfBranding;
}

type Rgb = readonly [number, number, number];
type Doc = import('jspdf').jsPDF;

const NAVY: Rgb = [22, 52, 107];
const NAVY_DEEP: Rgb = [15, 37, 82];
const GOLD: Rgb = [169, 134, 63];
const INK: Rgb = [26, 34, 50];
const MUTED: Rgb = [95, 107, 124];
const HAIR: Rgb = [217, 222, 231];
const TINT: Rgb = [245, 247, 251];
const ZEBRA: Rgb = [249, 250, 252];
const WHITE: Rgb = [255, 255, 255];
const ALERT: Rgb = [190, 52, 52];
const OK: Rgb = [30, 130, 80];

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 16;
const CONTENT_W = PAGE_W - MARGIN * 2;
const FOOTER_TOP = PAGE_H - 16;
const ROW_H = 11;
const HEAD_H = 9;
const PAD = 3;

/** Column widths sum to CONTENT_W (178 mm). */
const COLS = [
  { key: 'no', label: 'No.', w: 10, align: 'center' as const },
  { key: 'parent', label: 'Parent / guardian', w: 36, align: 'left' as const },
  { key: 'contact', label: 'Contact', w: 40, align: 'left' as const },
  { key: 'child', label: 'Child', w: 36, align: 'left' as const },
  { key: 'class', label: 'Adm. no. / Class', w: 30, align: 'left' as const },
  { key: 'status', label: 'Status', w: 26, align: 'left' as const },
];

const fill = (d: Doc, c: Rgb) => d.setFillColor(c[0], c[1], c[2]);
const stroke = (d: Doc, c: Rgb) => d.setDrawColor(c[0], c[1], c[2]);
const ink = (d: Doc, c: Rgb) => d.setTextColor(c[0], c[1], c[2]);

function formatGenerated(d: Date): string {
  const day = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${day}, ${time}`;
}

/** Shortens text with an ellipsis so it fits one line of the given width. */
function clip(doc: Doc, text: string, width: number): string {
  if (doc.getTextWidth(text) <= width) return text;
  let out = text;
  while (out.length > 1 && doc.getTextWidth(`${out}…`) > width) out = out.slice(0, -1);
  return `${out.trimEnd()}...`;
}

function drawTitleBlock(doc: Doc, o: ReportAccessPdfOptions, generated: Date, y: number): number {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  ink(doc, MUTED);
  doc.text('Report card access report', MARGIN, y + 3);

  doc.setFont('times', 'bold');
  doc.setFontSize(22);
  ink(doc, NAVY_DEEP);
  doc.text(o.examTypeName || 'Report cards', MARGIN, y + 12, { maxWidth: CONTENT_W - 60 });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  ink(doc, MUTED);
  doc.text(`${o.termName} · Parents who have not yet viewed the report card`, MARGIN, y + 18.5, {
    maxWidth: CONTENT_W - 50,
  });

  doc.setFontSize(8.5);
  doc.text('Generated', PAGE_W - MARGIN, y + 9.5, { align: 'right' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  ink(doc, INK);
  doc.text(formatGenerated(generated), PAGE_W - MARGIN, y + 14.5, { align: 'right' });

  return y + 24;
}

function drawSummary(doc: Doc, o: ReportAccessPdfOptions, y: number): number {
  const childrenPending = o.pendingParents.reduce((a, p) => a + p.children.filter((c) => !c.viewed).length, 0);
  const stats = [
    { n: o.pendingParents.length, l: 'Parents yet to view', w: 1.2 },
    { n: childrenPending, l: 'Children not viewed', w: 1.2 },
    { n: o.parentsCompleted, l: 'Parents fully viewed', w: 1.1 },
    { n: o.totalParents, l: 'Parents with results', w: 1.1 },
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

function colX(key: string): number {
  let x = MARGIN;
  for (const c of COLS) {
    if (c.key === key) return x;
    x += c.w;
  }
  return x;
}

function colW(key: string): number {
  return COLS.find((c) => c.key === key)?.w ?? 0;
}

function drawRow(
  doc: Doc,
  parent: ReportAccessPdfParent,
  parentIndex: number,
  child: ReportAccessPdfChild,
  showParent: boolean,
  lastInGroup: boolean,
  y: number,
): void {
  if (parentIndex % 2 === 1) {
    fill(doc, ZEBRA);
    doc.rect(MARGIN, y, CONTENT_W, ROW_H, 'F');
  }
  stroke(doc, lastInGroup ? [190, 198, 212] : HAIR);
  doc.setLineWidth(lastInGroup ? 0.3 : 0.15);
  doc.line(MARGIN, y + ROW_H, MARGIN + CONTENT_W, y + ROW_H);

  const mid = y + ROW_H / 2;

  if (showParent) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    ink(doc, MUTED);
    doc.text(String(parentIndex + 1), colX('no') + colW('no') / 2, mid, { align: 'center', baseline: 'middle' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    ink(doc, INK);
    const nameLines = (doc.splitTextToSize(parent.name || '-', colW('parent') - PAD * 2) as string[]).slice(0, 2);
    const nameStart = mid - ((nameLines.length - 1) * 4.2) / 2;
    nameLines.forEach((l, i) => doc.text(l, colX('parent') + PAD, nameStart + i * 4.2, { baseline: 'middle' }));

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    ink(doc, INK);
    const contact = [parent.phone, parent.email].map((v) => (v || '').trim()).filter(Boolean);
    if (!contact.length) {
      ink(doc, MUTED);
      doc.text('-', colX('contact') + PAD, mid, { baseline: 'middle' });
    } else {
      const start = mid - ((contact.length - 1) * 4) / 2;
      contact.forEach((l, i) =>
        doc.text(clip(doc, l, colW('contact') - PAD * 2), colX('contact') + PAD, start + i * 4, { baseline: 'middle' }),
      );
    }
  }

  // Child name
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  ink(doc, INK);
  const childName = `${child.firstName} ${child.lastName}`.trim() || '-';
  doc.text(clip(doc, childName, colW('child') - PAD * 2), colX('child') + PAD, mid, { baseline: 'middle' });

  // Admission number and class on two lines
  const klass = [child.formName, child.className].filter(Boolean).join(' ');
  const info = [child.admissionNumber || '', klass].filter(Boolean);
  const infoStart = mid - ((Math.max(info.length, 1) - 1) * 4) / 2;
  if (!info.length) {
    ink(doc, MUTED);
    doc.text('-', colX('class') + PAD, mid, { baseline: 'middle' });
  }
  info.forEach((l, i) => {
    doc.setFont('helvetica', i === 0 && child.admissionNumber ? 'bold' : 'normal');
    doc.setFontSize(8.5);
    ink(doc, i === 0 && child.admissionNumber ? NAVY : MUTED);
    doc.text(clip(doc, l, colW('class') - PAD * 2), colX('class') + PAD, infoStart + i * 4, { baseline: 'middle' });
  });

  // Status
  const sx = colX('status') + PAD;
  fill(doc, child.viewed ? OK : ALERT);
  doc.circle(sx + 1, mid, 1, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  ink(doc, child.viewed ? OK : ALERT);
  doc.text(child.viewed ? 'Viewed' : 'Not viewed', sx + 3.6, mid, { baseline: 'middle' });
}

function drawEnd(doc: Doc, count: number, y: number): void {
  stroke(doc, NAVY);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, y, MARGIN + CONTENT_W, y);

  const label = `End of report · ${count} parent${count === 1 ? '' : 's'} yet to view`;
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

function drawFooters(doc: Doc, schoolName: string, label: string): void {
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
    doc.text(label, PAGE_W / 2, FOOTER_TOP + 5, { align: 'center' });
    doc.text(`Page ${p} of ${total}`, PAGE_W - MARGIN, FOOTER_TOP + 5, { align: 'right' });
  }
}

export async function buildReportAccessPdfBlob(options: ReportAccessPdfOptions): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const branding = options.branding ?? {};
  const schoolName = branding.schoolName?.trim() || 'School Pro Academy';
  const generated = options.generatedAt ?? new Date();
  const logo = await loadImage(branding.logoUrl);
  const label = `${options.termName} · ${options.examTypeName} · Report access`;

  const parents = [...options.pendingParents].sort((a, b) =>
    (a.name || '').localeCompare(b.name || '', 'en', { sensitivity: 'base' }),
  );

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  doc.setProperties({
    title: `Report access - ${options.termName} ${options.examTypeName}`,
    author: schoolName,
    creator: schoolName,
  });

  let y = drawLetterhead(doc, branding, logo) + 9;
  y = drawTitleBlock(doc, options, generated, y);
  y = drawSummary(doc, options, y);
  y = drawTableHeader(doc, y);

  const bottomLimit = FOOTER_TOP - 6;
  const usable = bottomLimit - (MARGIN + 5 + HEAD_H);

  const newPage = () => {
    doc.addPage();
    y = MARGIN;
    doc.setFont('times', 'italic');
    doc.setFontSize(9);
    ink(doc, MUTED);
    doc.text(`${options.examTypeName} · ${options.termName} - continued`, MARGIN, y + 2);
    y = drawTableHeader(doc, y + 5);
  };

  parents.forEach((p, pi) => {
    const kids = p.children.length ? p.children : [];
    const blockH = kids.length * ROW_H;
    // Keep a parent's children together when they fit on one page.
    if (blockH <= usable && y + blockH > bottomLimit) newPage();
    kids.forEach((c, ci) => {
      if (y + ROW_H > bottomLimit) newPage();
      drawRow(doc, p, pi, c, ci === 0 || y === MARGIN + 5 + HEAD_H, ci === kids.length - 1, y);
      y += ROW_H;
    });
  });

  if (y + 14 > bottomLimit) {
    doc.addPage();
    y = MARGIN;
  }
  drawEnd(doc, parents.length, y);
  drawFooters(doc, schoolName, label);

  return doc.output('blob');
}
