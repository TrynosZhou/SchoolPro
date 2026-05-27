import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { formatSubjectAbbrev } from './subject-abbrev';

const receiptsDir = path.join(process.cwd(), 'uploads', 'receipts');
const invoicesDir = path.join(process.cwd(), 'uploads', 'invoices');
const logosDir = path.join(process.cwd(), 'uploads', 'logos');

export function ensureUploadDirs() {
  fs.mkdirSync(receiptsDir, { recursive: true });
  fs.mkdirSync(invoicesDir, { recursive: true });
  fs.mkdirSync(logosDir, { recursive: true });
}

export interface SchoolBranding {
  schoolName?: string;
  tagline?: string;
  logoUrl?: string;
  address?: string;
  phone?: string;
  email?: string;
  currency?: string;
}

const BILL = {
  primary: '#4f46e5',
  accent: '#818cf8',
  ink: '#0f172a',
  muted: '#64748b',
  border: '#e2e8f0',
  rowAlt: '#f8fafc',
  white: '#ffffff',
};

function formatMoney(amount: number, currency = 'USD'): string {
  if (currency === 'USD') return `$${amount.toFixed(2)}`;
  return `${currency} ${amount.toFixed(2)}`;
}

function drawBillingDocHeader(
  doc: InstanceType<typeof PDFDocument>,
  branding: SchoolBranding,
  pageW: number,
  margin: number,
  docTitle: string,
): number {
  const school = branding.schoolName || 'School Pro Academy';
  const logoPath = resolveUploadPath(branding.logoUrl);
  const headerH = logoPath ? 88 : 72;

  doc.save();
  doc.rect(0, 0, pageW, headerH).fill(BILL.primary);
  doc.rect(0, headerH - 3, pageW, 3).fill(BILL.accent);

  const textX = logoPath ? margin + 70 : margin;
  const textW = pageW - margin - textX - margin;

  if (logoPath) {
    try {
      doc.save();
      doc.circle(margin + 34, headerH / 2, 28).fill(BILL.white);
      doc.restore();
      doc.image(logoPath, margin + 10, headerH / 2 - 24, { fit: [48, 48] });
    } catch {
      /* skip invalid image */
    }
  }

  doc.fillColor(BILL.white).font('Helvetica-Bold').fontSize(16);
  doc.text(school, textX, logoPath ? 18 : 16, { width: textW, lineBreak: false });

  let ty = logoPath ? 36 : 34;
  if (branding.tagline) {
    doc.font('Helvetica').fontSize(9).fillColor('#dbeafe');
    doc.text(branding.tagline, textX, ty, { width: textW, lineBreak: false });
    ty += 12;
  }

  doc.font('Helvetica-Bold').fontSize(11).fillColor('#bfdbfe');
  doc.text(docTitle, textX, ty, { width: textW, lineBreak: false });
  doc.restore();

  return headerH + 14;
}

function drawBillingContactFooter(
  doc: InstanceType<typeof PDFDocument>,
  branding: SchoolBranding,
  margin: number,
  contentW: number,
  y: number,
) {
  const parts: string[] = [];
  if (branding.address) parts.push(branding.address);
  if (branding.phone) parts.push(`Tel: ${branding.phone}`);
  if (branding.email) parts.push(branding.email);
  if (!parts.length) return;
  doc.fillColor(BILL.muted).font('Helvetica').fontSize(8);
  doc.text(parts.join('  ·  '), margin, y, { width: contentW, align: 'center', lineBreak: false });
}

function resolveUploadPath(publicUrl?: string): string | null {
  if (!publicUrl) return null;
  const relative = publicUrl.replace(/^\/+/, '');
  const full = path.join(process.cwd(), relative);
  return fs.existsSync(full) ? full : null;
}

function formatSubjectLabel(r: {
  subject: string;
  subjectCode?: string;
  subjectName?: string;
}): string {
  const name = (r.subjectName || r.subject.split(' — ')[0] || r.subject).trim();
  const code = r.subjectCode?.trim();
  return code ? `${name} (${code})` : name;
}

export async function generateReceiptPdf(
  data: {
    receiptNumber: string;
    studentName: string;
    admissionNumber: string;
    className: string;
    amount: number;
    method: string;
    label: string;
    paidAt: Date;
  } & SchoolBranding,
): Promise<string> {
  ensureUploadDirs();
  const filename = `${data.receiptNumber}.pdf`;
  const filepath = path.join(receiptsDir, filename);
  const currency = data.currency || 'USD';

  return new Promise((resolve, reject) => {
    const margin = 50;
    const doc = new PDFDocument({ margin, size: 'A4' });
    const stream = fs.createWriteStream(filepath);
    doc.pipe(stream);

    const pageW = doc.page.width;
    const contentW = pageW - margin * 2;
    let y = drawBillingDocHeader(doc, data, pageW, margin, 'OFFICIAL PAYMENT RECEIPT');

    doc.fillColor(BILL.ink).font('Helvetica').fontSize(10);
    doc.text(`Receipt No: ${data.receiptNumber}`, margin, y);
    doc.text(`Date: ${data.paidAt.toLocaleString()}`, margin, y + 14);
    y += 36;

    doc.font('Helvetica-Bold').fontSize(11).text('Student Details', margin, y);
    y += 18;
    doc.font('Helvetica').fontSize(10);
    doc.text(`Name: ${data.studentName}`, margin, y);
    doc.text(`Student ID: ${data.admissionNumber}`, margin, y + 14);
    doc.text(`Class: ${data.className}`, margin, y + 28);
    y += 52;

    doc.save();
    doc.roundedRect(margin, y, contentW, 72, 6).fill(BILL.rowAlt);
    doc.strokeColor(BILL.border).lineWidth(0.5);
    doc.roundedRect(margin, y, contentW, 72, 6).stroke();
    doc.restore();

    const boxY = y + 14;
    doc.fillColor(BILL.muted).font('Helvetica').fontSize(9);
    doc.text('Payment For', margin + 16, boxY);
    doc.text('Method', margin + contentW / 2, boxY);
    doc.fillColor(BILL.ink).font('Helvetica-Bold').fontSize(10);
    doc.text(data.label, margin + 16, boxY + 14, { width: contentW / 2 - 24, lineBreak: false });
    doc.text(String(data.method).toUpperCase(), margin + contentW / 2, boxY + 14);
    y += 88;

    doc.fillColor(BILL.primary).font('Helvetica-Bold').fontSize(16);
    doc.text(`Amount Paid: ${formatMoney(data.amount, currency)}`, margin, y, {
      width: contentW,
      align: 'center',
    });
    y += 36;

    drawBillingContactFooter(doc, data, margin, contentW, y);
    y += 20;

    doc.fillColor(BILL.muted).font('Helvetica').fontSize(8);
    doc.text('This is a computer-generated receipt.', margin, y, { width: contentW, align: 'center' });

    doc.end();
    stream.on('finish', () => resolve(filepath));
    stream.on('error', reject);
  });
}

export async function generateInvoicePdf(
  data: {
    invoiceNumber: string;
    studentName: string;
    admissionNumber: string;
    className: string;
    description: string;
    feeType: string;
    issuedDate: string;
    dueDate: string;
    status: string;
    totalAmount: number;
    amountPaid: number;
    termName?: string;
    lines: { description: string; quantity: number; unitPrice: number; amount: number }[];
  } & SchoolBranding,
): Promise<string> {
  ensureUploadDirs();
  const filename = `${data.invoiceNumber}.pdf`;
  const filepath = path.join(invoicesDir, filename);
  const currency = data.currency || 'USD';
  const balance = Math.max(0, data.totalAmount - data.amountPaid);

  return new Promise((resolve, reject) => {
    const margin = 50;
    const doc = new PDFDocument({ margin, size: 'A4' });
    const stream = fs.createWriteStream(filepath);
    doc.pipe(stream);

    const pageW = doc.page.width;
    const contentW = pageW - margin * 2;
    let y = drawBillingDocHeader(doc, data, pageW, margin, 'STUDENT FEE INVOICE');

    doc.fillColor(BILL.ink).font('Helvetica').fontSize(10);
    doc.text(`Invoice No: ${data.invoiceNumber}`, margin, y);
    doc.text(`Issued: ${data.issuedDate}`, margin + contentW / 2, y);
    doc.text(`Due: ${data.dueDate}`, margin + contentW / 2, y + 14);
    doc.text(`Status: ${String(data.status).toUpperCase()}`, margin, y + 14);
    if (data.termName) {
      doc.text(`Term: ${data.termName}`, margin, y + 28);
      y += 14;
    }
    y += 44;

    doc.font('Helvetica-Bold').fontSize(11).text('Bill To', margin, y);
    y += 18;
    doc.font('Helvetica').fontSize(10);
    doc.text(data.studentName, margin, y);
    doc.text(`Student ID: ${data.admissionNumber}`, margin, y + 14);
    doc.text(`Class: ${data.className}`, margin, y + 28);
    doc.text(`Fee type: ${data.feeType}`, margin, y + 42);
    y += 64;

    const colDesc = contentW * 0.5;
    const colQty = 48;
    const colUnit = 72;
    const colAmt = contentW - colDesc - colQty - colUnit;
    const rowH = 20;
    const headerH = 22;

    doc.save();
    doc.rect(margin, y, contentW, headerH).fill(BILL.primary);
    doc.fillColor(BILL.white).font('Helvetica-Bold').fontSize(9);
    doc.text('Description', margin + 8, y + 6, { width: colDesc - 8 });
    doc.text('Qty', margin + colDesc, y + 6, { width: colQty, align: 'center' });
    doc.text('Unit', margin + colDesc + colQty, y + 6, { width: colUnit, align: 'right' });
    doc.text('Amount', margin + colDesc + colQty + colUnit, y + 6, { width: colAmt - 8, align: 'right' });
    doc.restore();
    y += headerH;

    const lines =
      data.lines?.length > 0
        ? data.lines
        : [{ description: data.description, quantity: 1, unitPrice: data.totalAmount, amount: data.totalAmount }];

    lines.forEach((line, idx) => {
      if (idx % 2 === 1) {
        doc.save();
        doc.rect(margin, y, contentW, rowH).fill(BILL.rowAlt);
        doc.restore();
      }
      doc.strokeColor(BILL.border).lineWidth(0.5);
      doc.moveTo(margin, y + rowH).lineTo(margin + contentW, y + rowH).stroke();

      doc.fillColor(BILL.ink).font('Helvetica').fontSize(9);
      doc.text(line.description, margin + 8, y + 5, { width: colDesc - 12, lineBreak: false, ellipsis: true });
      doc.text(String(line.quantity), margin + colDesc, y + 5, { width: colQty, align: 'center' });
      doc.text(formatMoney(Number(line.unitPrice), currency), margin + colDesc + colQty, y + 5, {
        width: colUnit,
        align: 'right',
      });
      doc.text(formatMoney(Number(line.amount), currency), margin + colDesc + colQty + colUnit, y + 5, {
        width: colAmt - 8,
        align: 'right',
      });
      y += rowH;
    });

    doc.strokeColor(BILL.border).lineWidth(0.5);
    doc.rect(margin, y - lines.length * rowH - headerH, contentW, headerH + lines.length * rowH).stroke();
    y += 12;

    const summaryX = margin + contentW - 180;
    doc.font('Helvetica').fontSize(10).fillColor(BILL.ink);
    doc.text('Subtotal:', summaryX, y, { width: 90, align: 'right' });
    doc.text(formatMoney(data.totalAmount, currency), summaryX + 95, y, { width: 85, align: 'right' });
    y += 16;
    doc.text('Paid:', summaryX, y, { width: 90, align: 'right' });
    doc.text(formatMoney(data.amountPaid, currency), summaryX + 95, y, { width: 85, align: 'right' });
    y += 18;
    doc.font('Helvetica-Bold').fontSize(11).fillColor(BILL.primary);
    doc.text('Balance Due:', summaryX, y, { width: 90, align: 'right' });
    doc.text(formatMoney(balance, currency), summaryX + 95, y, { width: 85, align: 'right' });
    y += 36;

    drawBillingContactFooter(doc, data, margin, contentW, y);
    y += 20;
    doc.fillColor(BILL.muted).font('Helvetica').fontSize(8);
    doc.text('Please settle this invoice by the due date shown above.', margin, y, {
      width: contentW,
      align: 'center',
    });

    doc.end();
    stream.on('finish', () => resolve(filepath));
    stream.on('error', reject);
  });
}

const RC = {
  primary: '#4f46e5',
  primaryDark: '#312e81',
  accent: '#818cf8',
  ink: '#0f172a',
  muted: '#64748b',
  border: '#e2e8f0',
  rowAlt: '#f8fafc',
  white: '#ffffff',
  gold: '#f59e0b',
  success: '#059669',
};

function positionSuffix(n: number): string {
  if (n === 1) return '1st';
  if (n === 2) return '2nd';
  if (n === 3) return '3rd';
  return `${n}th`;
}

export async function generateReportCardPdf(data: {
  schoolName?: string;
  tagline?: string;
  logoUrl?: string;
  studentName: string;
  admissionNumber: string;
  className: string;
  formName: string;
  termName: string;
  examTypeName?: string;
  subjectResults: {
    subject: string;
    subjectName?: string;
    subjectCode?: string;
    marks: number;
    grade: string;
    remarks?: string;
  }[];
  averageMark?: number;
  overallGrade?: string;
  classPosition?: number;
  formPosition?: number;
  classTeacherRemarks?: string;
  principalRemarks?: string;
  generatedAt?: Date;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const margin = 36;
    const pageW = 595.28;
    const contentW = pageW - margin * 2;
    const doc = new PDFDocument({ margin, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const school = data.schoolName || 'School Pro Academy';
    const generated = data.generatedAt || new Date();
    const pageBottom = () => doc.page.height - margin - 28;
    const logoPath = resolveUploadPath(data.logoUrl);

    // —— Header band ——
    const headerH = 96;
    doc.save();
    doc.rect(0, 0, pageW, headerH).fill(RC.primary);
    doc.rect(0, headerH - 4, pageW, 4).fill(RC.accent);

    const textX = logoPath ? margin + 78 : margin;
    const textW = logoPath ? contentW - 78 : contentW;

    if (logoPath) {
      try {
        doc.image(logoPath, margin + 14, 14, { fit: [52, 52], align: 'center', valign: 'center' });
      } catch {
        /* skip invalid image */
      }
    }

    doc.fillColor(RC.white).font('Helvetica-Bold').fontSize(logoPath ? 18 : 20);
    doc.text(school, textX, 20, { width: textW, align: logoPath ? 'left' : 'center' });
    if (data.tagline) {
      doc.font('Helvetica').fontSize(9).fillColor('#e0e7ff');
      doc.text(data.tagline, textX, 42, { width: textW, align: logoPath ? 'left' : 'center' });
    }
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#c7d2fe');
    doc.text('STUDENT REPORT CARD', textX, data.tagline ? 58 : 48, { width: textW, align: logoPath ? 'left' : 'center' });
    doc.restore();

    let y = headerH + 18;

    // —— Meta chips row ——
    const chips = [
      data.termName ? `Term: ${data.termName}` : '',
      data.examTypeName ? `Exam: ${data.examTypeName}` : '',
      data.formName ? `Form: ${data.formName}` : '',
      data.className ? `Class: ${data.className}` : '',
    ].filter(Boolean);

    doc.font('Helvetica').fontSize(8).fillColor(RC.muted);
    doc.text(chips.join('   ·   '), margin, y, { width: contentW, align: 'center' });
    y += 22;

    // —— Student identity card ——
    const cardH = 72;
    doc.roundedRect(margin, y, contentW, cardH, 8).fillAndStroke(RC.rowAlt, RC.border);
    doc.fillColor(RC.ink).font('Helvetica-Bold').fontSize(14);
    doc.text(data.studentName, margin + 16, y + 14);
    doc.font('Helvetica').fontSize(9).fillColor(RC.muted);
    doc.text(`Student ID: ${data.admissionNumber}`, margin + 16, y + 36);
    doc.text(`Class: ${data.className || '—'}`, margin + 16, y + 50);

    // Position badge (right)
    if (data.classPosition) {
      const badgeW = 72;
      const badgeX = margin + contentW - badgeW - 14;
      const isTop = data.classPosition <= 3;
      doc.roundedRect(badgeX, y + 12, badgeW, 48, 6)
        .fillAndStroke(isTop ? '#fef3c7' : '#e0e7ff', isTop ? RC.gold : RC.accent);
      doc.fillColor(isTop ? '#92400e' : RC.primaryDark).font('Helvetica').fontSize(7);
      doc.text('CLASS POSITION', badgeX, y + 20, { width: badgeW, align: 'center' });
      doc.font('Helvetica-Bold').fontSize(18);
      doc.text(positionSuffix(data.classPosition), badgeX, y + 32, { width: badgeW, align: 'center' });
    }

    y += cardH + 14;

    // —— Summary stat boxes ——
    const boxW = (contentW - 16) / 3;
    const summaries = [
      { label: 'Average', value: data.averageMark != null ? `${Number(data.averageMark).toFixed(1)}%` : '—' },
      { label: 'Overall grade', value: data.overallGrade || '—' },
      {
        label: 'Form position',
        value: data.formPosition ? positionSuffix(data.formPosition) : '—',
      },
    ];
    summaries.forEach((s, i) => {
      const bx = margin + i * (boxW + 8);
      doc.roundedRect(bx, y, boxW, 44, 6).fillAndStroke(RC.white, RC.border);
      doc.fillColor(RC.muted).font('Helvetica').fontSize(7);
      doc.text(s.label.toUpperCase(), bx + 10, y + 10, { width: boxW - 20 });
      doc.fillColor(RC.primaryDark).font('Helvetica-Bold').fontSize(13);
      doc.text(s.value, bx + 10, y + 24, { width: boxW - 20 });
    });
    y += 56;

    // —— Results table ——
    doc.fillColor(RC.ink).font('Helvetica-Bold').fontSize(10);
    doc.text('Academic performance', margin, y);
    y += 16;

    const col = {
      subject: margin + 8,
      marks: margin + 248,
      grade: margin + 292,
      remarks: margin + 332,
    };
    const subjectW = col.marks - col.subject - 10;
    const remarksW = contentW - (col.remarks - margin) - 8;
    const baseRowH = 24;

    const drawTableHeader = (headerY: number, headerRowH: number) => {
      doc.roundedRect(margin, headerY, contentW, headerRowH, 4).fill(RC.primary);
      doc.fillColor(RC.white).font('Helvetica-Bold').fontSize(8);
      doc.text('SUBJECT', col.subject, headerY + 8);
      doc.text('MARKS', col.marks, headerY + 8, { width: 36, align: 'right' });
      doc.text('GRADE', col.grade, headerY + 8, { width: 32, align: 'center' });
      doc.text('REMARKS', col.remarks, headerY + 8, { width: remarksW });
    };

    const drawTableHeaderRow = () => {
      drawTableHeader(y, baseRowH);
      y += baseRowH + 2;
    };

    drawTableHeaderRow();

    data.subjectResults.forEach((r, idx) => {
      const subjectLabel = formatSubjectLabel(r);
      const remarksText = (r.remarks || '—').trim() || '—';
      doc.font('Helvetica').fontSize(9);
      const remarksBlockH = doc.heightOfString(remarksText, { width: remarksW });
      const rowH = Math.max(baseRowH, remarksBlockH + 14);

      if (y + rowH > pageBottom()) {
        doc.addPage();
        y = margin;
        drawTableHeaderRow();
      }
      const bg = idx % 2 === 0 ? RC.white : RC.rowAlt;
      doc.rect(margin, y, contentW, rowH).fill(bg);
      doc.fillColor(RC.ink).font('Helvetica').fontSize(9);
      doc.text(subjectLabel, col.subject, y + 7, { width: subjectW });
      doc.text(String(r.marks), col.marks, y + 7, { width: 36, align: 'right' });
      doc.font('Helvetica-Bold').fillColor(RC.primary);
      doc.text(r.grade || '—', col.grade, y + 7, { width: 32, align: 'center' });
      doc.font('Helvetica').fillColor(RC.muted);
      doc.text(remarksText, col.remarks, y + 7, { width: remarksW, lineGap: 2 });
      y += rowH;
    });

    y += 12;

    // —— Comments ——
    if (data.classTeacherRemarks || data.principalRemarks) {
      if (y + 80 > pageBottom()) {
        doc.addPage();
        y = margin;
      }
      doc.fillColor(RC.ink).font('Helvetica-Bold').fontSize(10);
      doc.text('Comments', margin, y);
      y += 14;

      const drawComment = (title: string, body: string) => {
        doc.font('Helvetica').fontSize(9);
        const bodyH = doc.heightOfString(body, { width: contentW - 24, lineGap: 2 });
        const h = Math.max(44, bodyH + 28);
        doc.roundedRect(margin, y, contentW, h, 6).stroke(RC.border);
        doc.fillColor(RC.muted).font('Helvetica-Bold').fontSize(7);
        doc.text(title.toUpperCase(), margin + 12, y + 8);
        doc.fillColor(RC.ink).font('Helvetica').fontSize(9);
        doc.text(body, margin + 12, y + 20, { width: contentW - 24, lineGap: 2 });
        y += h + 8;
      };

      if (data.classTeacherRemarks) drawComment('Class teacher', data.classTeacherRemarks);
      if (data.principalRemarks) drawComment('Principal', data.principalRemarks);
    }

    // —— Footer ——
    const footerY = doc.page.height - margin - 14;
    doc.font('Helvetica').fontSize(7).fillColor(RC.muted);
    doc.text(
      `Generated by School Pro · ${generated.toLocaleDateString()} ${generated.toLocaleTimeString()}`,
      margin,
      footerY,
      { width: contentW, align: 'center' },
    );

    doc.end();
  });
}

export async function generateClassListPdf(data: {
  schoolName: string;
  classLabel: string;
  generatedAt: Date;
  students: { admissionNumber: string; lastName: string; firstName: string; gender: string }[];
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageBottom = () => doc.page.height - 50;

    doc.fontSize(16).text(data.schoolName, { align: 'center' });
    doc.fontSize(13).text('CLASS LIST REPORT', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10);
    doc.text(`Class: ${data.classLabel}`, { align: 'center' });
    doc.text(`Generated: ${data.generatedAt.toLocaleString()}`, { align: 'center' });
    doc.text(`Total students: ${data.students.length}`, { align: 'center' });
    doc.moveDown();

    const colX = { num: 40, id: 70, last: 165, first: 295, gender: 430 };
    const drawHeader = () => {
      const y = doc.y;
      doc.fontSize(9).font('Helvetica-Bold');
      doc.text('#', colX.num, y);
      doc.text('Student ID', colX.id, y);
      doc.text('Last Name', colX.last, y);
      doc.text('First Name', colX.first, y);
      doc.text('Gender', colX.gender, y);
      doc.moveDown(0.6);
      doc.font('Helvetica');
    };

    drawHeader();

    data.students.forEach((s, index) => {
      if (doc.y > pageBottom()) {
        doc.addPage();
        drawHeader();
      }
      const y = doc.y;
      doc.fontSize(9);
      doc.text(String(index + 1), colX.num, y);
      doc.text(s.admissionNumber, colX.id, y);
      doc.text(s.lastName, colX.last, y, { width: 120 });
      doc.text(s.firstName, colX.first, y, { width: 120 });
      doc.text(s.gender || '—', colX.gender, y);
      doc.moveDown(0.55);
    });

    doc.end();
  });
}

export interface MarkSheetPdfData {
  schoolName: string;
  tagline?: string;
  logoUrl?: string;
  examTypeName: string;
  termName: string;
  className: string;
  maxMarks: number;
  generatedAt: Date;
  subjects: { code: string; name: string }[];
  students: {
    position: number | null;
    admissionNumber: string;
    lastName: string;
    firstName: string;
    gender: string;
    subjectCount: number;
    subjectsPassed: number;
    averagePercent: number | null;
    gradeCounts: { A: number; B: number; C: number; D: number; E: number; U: number };
    cells: (number | null)[];
  }[];
}

const MS = {
  blue: '#2563eb',
  blueDark: '#1e40af',
  header: '#1e3a8a',
  badge: '#3b82f6',
  meta: '#2563eb',
  border: '#bfdbfe',
  pass: '#16a34a',
  male: '#2563eb',
  female: '#db2777',
  pillGreenBg: '#dcfce7',
  pillGreenText: '#166534',
  muted: '#94a3b8',
  white: '#ffffff',
  ink: '#0f172a',
};

const MS_FONT = 8;
const MS_HDR = 7.5;
const MS_PAD = 3;
const MS_PASS_MARK = 49;
const GRADE_COLS = ['A', 'B', 'C', 'D', 'E', 'U'] as const;

type PdfKitDoc = InstanceType<typeof PDFDocument>;

function msTextWidth(doc: PdfKitDoc, text: string, size: number, bold = false): number {
  doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size);
  return doc.widthOfString(text || '—');
}

function msFitWidths(widths: number[], target: number, mins: number[]): number[] {
  let total = widths.reduce((a, b) => a + b, 0);
  if (total > target) {
    const scale = target / total;
    widths = widths.map((w, i) => Math.max(mins[i] ?? 14, Math.floor(w * scale)));
    total = widths.reduce((a, b) => a + b, 0);
    if (total > target) {
      const fix = target / total;
      widths = widths.map((w, i) => Math.max(mins[i] ?? 12, Math.floor(w * fix)));
    }
  } else if (total < target) {
    const scale = target / total;
    widths = widths.map((w, i) => Math.max(mins[i] ?? 14, Math.floor(w * scale)));
    let rem = target - widths.reduce((a, b) => a + b, 0);
    let i = 0;
    while (rem > 0) {
      widths[i % widths.length]++;
      rem--;
      i++;
    }
  }
  return widths;
}

function msColX(startX: number, widths: number[], index: number): number {
  let x = startX;
  for (let i = 0; i < index; i++) x += widths[i];
  return x;
}

function msSpanWidth(widths: number[], from: number, count: number): number {
  let w = 0;
  for (let i = from; i < from + count; i++) w += widths[i];
  return w;
}

function msHeaderText(
  doc: PdfKitDoc,
  text: string,
  x: number,
  y: number,
  w: number,
  h: number,
  align: 'left' | 'center' | 'right' = 'center',
) {
  doc.fillColor(MS.white).font('Helvetica-Bold').fontSize(MS_HDR);
  const pad = 2;
  doc.text(text, x + pad, y + (h - MS_HDR) / 2 - 1, {
    width: Math.max(0, w - pad * 2),
    align,
    lineBreak: false,
  });
}

function msDrawPill(
  doc: PdfKitDoc,
  cx: number,
  cy: number,
  text: string,
  bg: string,
  fg: string,
  fontSize = 7.5,
) {
  doc.font('Helvetica-Bold').fontSize(fontSize);
  const tw = doc.widthOfString(text);
  const pw = tw + 10;
  const ph = fontSize + 5;
  const px = cx - pw / 2;
  const py = cy - ph / 2;
  doc.roundedRect(px, py, pw, ph, ph / 2).fill(bg);
  doc.fillColor(fg).text(text, px, py + 2, { width: pw, align: 'center', lineBreak: false });
}

export async function generateMarkSheetPdf(data: MarkSheetPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const margin = 18;
    const doc = new PDFDocument({ margin, size: 'A4', layout: 'landscape' });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const contentW = pageW - margin * 2;
    const logoPath = resolveUploadPath(data.logoUrl);
    const school = data.schoolName || 'School Pro Academy';
    const subjectCount = data.subjects.length;
    const fixedCols = 5;
    const summaryCols = 2;
    const gradeCount = GRADE_COLS.length;
    const totalCols = fixedCols + subjectCount + summaryCols + 1 + gradeCount;

    const colLabels = [
      'POS',
      'STUDENT ID',
      'LAST NAME',
      'FIRST NAME',
      'GENDER',
      ...data.subjects.map((s) => formatSubjectAbbrev(s.code, s.name)),
      'COUNT',
      'SUBJ PASSED',
      'AVERAGE %',
      ...GRADE_COLS,
    ];

    const mins: number[] = [
      22, 52, 58, 58, 38,
      ...Array(subjectCount).fill(26),
      30, 44, 52,
      ...Array(gradeCount).fill(22),
    ];

    const widths: number[] = colLabels.map((label, i) => {
      let w = msTextWidth(doc, label, MS_HDR, true) + MS_PAD * 2 + 4;
      if (i === 1) w = Math.max(w, 52);
      if (i === 2 || i === 3) w = Math.max(w, 58);
      for (const row of data.students) {
        let sample = '';
        if (i === 0) sample = row.position != null ? String(row.position) : '—';
        else if (i === 1) sample = row.admissionNumber;
        else if (i === 2) sample = row.lastName;
        else if (i === 3) sample = row.firstName;
        else if (i === 4) sample = row.gender || '—';
        else if (i < fixedCols + subjectCount) {
          const m = row.cells[i - fixedCols];
          sample = m != null ? String(m) : '—';
        } else if (i === fixedCols + subjectCount) sample = String(row.subjectCount);
        else if (i === fixedCols + subjectCount + 1) sample = String(row.subjectsPassed);
        else if (i === fixedCols + subjectCount + 2) {
          sample = row.averagePercent != null ? row.averagePercent.toFixed(2) : '—';
        } else {
          const g = GRADE_COLS[i - fixedCols - subjectCount - summaryCols - 1];
          sample = String(row.gradeCounts[g]);
        }
        w = Math.max(w, msTextWidth(doc, sample, MS_FONT) + MS_PAD * 2 + 6);
      }
      return Math.ceil(Math.max(mins[i] ?? 20, w));
    });

    const colW = msFitWidths(widths, contentW, mins);
    const tableW = colW.reduce((a, b) => a + b, 0);
    const groupH = 16;
    const headerH = 20;
    const rowH = 22;
    const tableBottom = () => pageH - margin - 22;

    const drawBanner = () => {
      const bannerH = 76;
      doc.save();
      doc.rect(0, 0, pageW, bannerH).fill(MS.blue);

      if (logoPath) {
        try {
          doc.save();
          doc.circle(margin + 28, 38, 26).fill(MS.white);
          doc.restore();
          doc.image(logoPath, margin + 8, 18, { fit: [40, 40] });
        } catch {
          /* skip */
        }
      }

      const tx = logoPath ? margin + 62 : margin;
      const badgeW = msTextWidth(doc, `${data.examTypeName} • ${data.termName}`, 9, true) + 28;
      const titleW = contentW - badgeW - (logoPath ? 50 : 0);

      doc.fillColor(MS.white).font('Helvetica-Bold').fontSize(17);
      doc.text(school, tx, 16, { width: titleW, lineBreak: false });
      if (data.tagline) {
        doc.font('Helvetica').fontSize(9).fillColor('#dbeafe');
        doc.text(data.tagline, tx, 36, { width: titleW, lineBreak: false });
      }
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#bfdbfe');
      doc.text('CLASS MARK SHEET', tx, data.tagline ? 50 : 38, { width: titleW, lineBreak: false });

      const badgeText = `${data.examTypeName} • ${data.termName}`;
      const bx = pageW - margin - badgeW;
      const by = 24;
      doc.roundedRect(bx, by, badgeW, 26, 13).fill(MS.badge);
      doc.fillColor(MS.white).font('Helvetica-Bold').fontSize(9);
      doc.text(badgeText, bx + 10, by + 8, { width: badgeW - 20, align: 'center', lineBreak: false });

      doc.restore();
      return bannerH;
    };

    const drawMeta = (y: number) => {
      const gen = data.generatedAt.toLocaleString();
      const line =
        `Exam: ${data.examTypeName}    Term: ${data.termName}    Class: ${data.className}    ` +
        `Max Marks: ${data.maxMarks}    Students: ${data.students.length}    Generated: ${gen}`;
      doc.fillColor(MS.meta).font('Helvetica').fontSize(8.5);
      doc.text(line, margin, y + 4, { width: contentW, lineBreak: false });
      return y + 18;
    };

    const drawGroupHeader = (y: number) => {
      doc.save();
      doc.rect(margin, y, tableW, groupH).fill(MS.header);
      const subStart = fixedCols;
      const sumStart = fixedCols + subjectCount;
      const avgIdx = sumStart + summaryCols;
      const gradeStart = avgIdx + 1;

      msHeaderText(doc, '', margin, y, msSpanWidth(colW, 0, fixedCols), groupH);
      msHeaderText(
        doc,
        'SUBJECT SCORES',
        msColX(margin, colW, subStart),
        y,
        msSpanWidth(colW, subStart, subjectCount),
        groupH,
      );
      msHeaderText(
        doc,
        'SUMMARY',
        msColX(margin, colW, sumStart),
        y,
        msSpanWidth(colW, sumStart, summaryCols),
        groupH,
      );
      if (gradeCount > 0) {
        msHeaderText(
          doc,
          'GRADES',
          msColX(margin, colW, gradeStart),
          y,
          msSpanWidth(colW, gradeStart, gradeCount),
          groupH,
        );
      }
      doc.restore();
      return y + groupH;
    };

    const drawColumnHeader = (y: number) => {
      doc.save();
      doc.rect(margin, y, tableW, headerH).fill(MS.header);
      let cx = margin;
      for (let i = 0; i < totalCols; i++) {
        msHeaderText(doc, colLabels[i], cx, y, colW[i], headerH, i <= 4 ? (i === 0 ? 'center' : 'left') : 'center');
        cx += colW[i];
      }
      doc.restore();
      return y + headerH;
    };

    const drawRowBorder = (y: number) => {
      doc.save();
      doc.strokeColor(MS.border).lineWidth(0.8);
      doc.moveTo(margin, y + rowH).lineTo(margin + tableW, y + rowH).stroke();
      doc.restore();
    };

    const drawStudentRow = (row: MarkSheetPdfData['students'][0], y: number) => {
      const cy = y + rowH / 2;
      let cx = margin;

      // Position circle
      const posW = colW[0];
      if (row.position != null) {
        const r = 8;
        doc.circle(margin + posW / 2, cy, r).fill(MS.blue);
        doc.fillColor(MS.white).font('Helvetica-Bold').fontSize(8);
        doc.text(String(row.position), margin + posW / 2 - r, cy - 4, { width: r * 2, align: 'center' });
      } else {
        doc.fillColor(MS.muted).font('Helvetica').fontSize(MS_FONT);
        doc.text('—', margin, cy - 4, { width: posW, align: 'center' });
      }
      cx += posW;

      // Student ID
      doc.fillColor(MS.blue).font('Helvetica').fontSize(MS_FONT);
      doc.text(row.admissionNumber, cx + MS_PAD, cy - 4, {
        width: colW[1] - MS_PAD * 2,
        lineBreak: false,
        ellipsis: true,
      });
      cx += colW[1];

      // Names
      doc.fillColor(MS.ink).font('Helvetica-Bold').fontSize(MS_FONT);
      doc.text(row.lastName, cx + MS_PAD, cy - 4, { width: colW[2] - MS_PAD * 2, lineBreak: false, ellipsis: true });
      cx += colW[2];
      doc.text(row.firstName, cx + MS_PAD, cy - 4, { width: colW[3] - MS_PAD * 2, lineBreak: false, ellipsis: true });
      cx += colW[3];

      // Gender
      const g = (row.gender || '').toLowerCase();
      const gColor = g.startsWith('f') ? MS.female : g.startsWith('m') ? MS.male : MS.muted;
      doc.fillColor(gColor).font('Helvetica').fontSize(MS_FONT);
      doc.text(row.gender || '—', cx + MS_PAD, cy - 4, { width: colW[4] - MS_PAD * 2, align: 'center' });
      cx += colW[4];

      // Subject marks
      for (let i = 0; i < subjectCount; i++) {
        const mark = row.cells[i];
        const cw = colW[fixedCols + i];
        if (mark != null) {
          const passed = mark > MS_PASS_MARK;
          doc.fillColor(passed ? MS.pass : MS.ink).font(passed ? 'Helvetica-Bold' : 'Helvetica').fontSize(MS_FONT);
          doc.text(String(mark), cx, cy - 4, { width: cw, align: 'center' });
        } else {
          doc.fillColor(MS.muted).font('Helvetica').fontSize(MS_FONT);
          doc.text('—', cx, cy - 4, { width: cw, align: 'center' });
        }
        cx += cw;
      }

      // Count & subjects passed
      doc.fillColor(MS.ink).font('Helvetica-Bold').fontSize(MS_FONT);
      doc.text(String(row.subjectCount), cx, cy - 4, { width: colW[fixedCols + subjectCount], align: 'center' });
      cx += colW[fixedCols + subjectCount];
      doc.text(String(row.subjectsPassed), cx, cy - 4, {
        width: colW[fixedCols + subjectCount + 1],
        align: 'center',
      });
      cx += colW[fixedCols + subjectCount + 1];

      // Average pill
      const avgW = colW[fixedCols + subjectCount + 2];
      if (row.averagePercent != null) {
        msDrawPill(doc, cx + avgW / 2, cy, row.averagePercent.toFixed(2), MS.blue, MS.white);
      } else {
        doc.fillColor(MS.muted).font('Helvetica').fontSize(MS_FONT);
        doc.text('—', cx, cy - 4, { width: avgW, align: 'center' });
      }
      cx += avgW;

      // Grade counts
      for (let gi = 0; gi < gradeCount; gi++) {
        const gLetter = GRADE_COLS[gi];
        const count = row.gradeCounts[gLetter];
        const gw = colW[fixedCols + subjectCount + summaryCols + 1 + gi];
        if (count > 0) {
          msDrawPill(doc, cx + gw / 2, cy, String(count), MS.pillGreenBg, MS.pillGreenText, 7);
        } else {
          doc.fillColor(MS.muted).font('Helvetica').fontSize(MS_FONT);
          doc.text('0', cx, cy - 4, { width: gw, align: 'center' });
        }
        cx += gw;
      }

      drawRowBorder(y);
    };

    const drawTableBlock = (startY: number) => {
      let y = drawGroupHeader(startY);
      y = drawColumnHeader(y);
      for (const row of data.students) {
        if (y + rowH > tableBottom()) return { y, needsPage: true };
        drawStudentRow(row, y);
        y += rowH;
      }
      return { y, needsPage: false };
    };

    const drawFooter = () => {
      const fy = pageH - margin - 10;
      doc.save();
      doc.strokeColor(MS.border).lineWidth(1);
      doc.moveTo(margin, fy - 8).lineTo(margin + contentW, fy - 8).stroke();
      doc.fillColor(MS.blue).font('Helvetica').fontSize(8);
      doc.text(`Official Academic Record — ${school}`, margin, fy, { lineBreak: false });
      doc.restore();
    };

    let y = drawBanner() + 6;
    y = drawMeta(y);
    y += 4;

    let studentIdx = 0;
    const allStudents = data.students;

    const renderPage = (continued: boolean) => {
      if (continued) {
        y = drawBanner() + 6;
        y = drawMeta(y) + 2;
        doc.fillColor(MS.meta).font('Helvetica-Oblique').fontSize(8);
        doc.text('(continued)', margin, y, { width: contentW, align: 'center' });
        y += 12;
      }

      y = drawGroupHeader(y);
      y = drawColumnHeader(y);

      while (studentIdx < allStudents.length) {
        if (y + rowH > tableBottom()) break;
        drawStudentRow(allStudents[studentIdx], y);
        y += rowH;
        studentIdx++;
      }
    };

    renderPage(false);
    while (studentIdx < allStudents.length) {
      doc.addPage({ size: 'A4', layout: 'landscape', margin });
      renderPage(true);
    }

    drawFooter();
    doc.end();
  });
}

export interface RankingsPdfData {
  schoolName: string;
  tagline?: string;
  logoUrl?: string;
  rankingType: 'class' | 'form' | 'subject';
  rankingLabel: string;
  examTypeName: string;
  termName: string;
  scopeLabel: string;
  maxMarks: number;
  generatedAt: Date;
  students: {
    position: number;
    admissionNumber: string;
    lastName: string;
    firstName: string;
    className: string;
    formName: string;
    averagePercent: number | null;
    mark: number | null;
    subjectCount: number;
  }[];
}

function msDrawRankingsGrid(
  doc: PdfKitDoc,
  x: number,
  y: number,
  widths: number[],
  height: number,
  fill?: string,
) {
  const totalW = widths.reduce((a, b) => a + b, 0);
  if (fill) {
    doc.save();
    doc.rect(x, y, totalW, height).fill(fill);
    doc.restore();
  }
  doc.save();
  doc.strokeColor(MS.border).lineWidth(0.5);
  doc.rect(x, y, totalW, height).stroke();
  let vx = x;
  for (let i = 0; i < widths.length - 1; i++) {
    vx += widths[i];
    doc.moveTo(vx, y).lineTo(vx, y + height).stroke();
  }
  doc.restore();
}

function msDrawRankingsCell(
  doc: PdfKitDoc,
  text: string,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: {
    header?: boolean;
    align?: 'left' | 'center' | 'right';
    posBadge?: boolean;
    bold?: boolean;
  },
) {
  const fontSize = opts.header ? MS_HDR : MS_FONT;
  const padH = MS_PAD;
  const align = opts.align ?? 'left';
  const padV = Math.max(1, (h - fontSize) / 2 - 1);
  const textX = align === 'left' ? x + padH : x;
  const textW = align === 'left' ? Math.max(0, w - padH * 2) : w;

  if (opts.posBadge) {
    const cy = y + h / 2;
    doc.circle(x + w / 2, cy, 7).fill(MS.blue);
    doc.fillColor(MS.white).font('Helvetica-Bold').fontSize(8);
    doc.text(text, x, y + padV, { width: w, align: 'center', lineBreak: false });
    return;
  }

  doc
    .fillColor(opts.header ? MS.white : MS.ink)
    .font(opts.header || opts.bold ? 'Helvetica-Bold' : 'Helvetica')
    .fontSize(fontSize);
  doc.text(text, textX, y + padV, {
    width: textW,
    align,
    lineBreak: false,
    ellipsis: true,
  });
}

export async function generateRankingsPdf(data: RankingsPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const margin = 24;
    const doc = new PDFDocument({ margin, size: 'A4', layout: 'landscape' });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const contentW = pageW - margin * 2;
    const logoPath = resolveUploadPath(data.logoUrl);
    const school = data.schoolName || 'School Pro Academy';
    const isSubject = data.rankingType === 'subject';
    const showForm = data.rankingType === 'form' || isSubject;

    const drawBanner = () => {
      const bannerH = 78;
      doc.save();
      doc.rect(0, 0, pageW, bannerH).fill(MS.blue);

      if (logoPath) {
        try {
          doc.save();
          doc.circle(margin + 28, 40, 26).fill(MS.white);
          doc.restore();
          doc.image(logoPath, margin + 8, 20, { fit: [40, 40] });
        } catch {
          /* skip */
        }
      }

      const tx = logoPath ? margin + 62 : margin;
      const badgeText = data.rankingLabel;
      const badgeW = msTextWidth(doc, badgeText, 9, true) + 28;
      const textW = contentW - badgeW - (logoPath ? 50 : 0);

      doc.fillColor(MS.white).font('Helvetica-Bold').fontSize(16);
      doc.text(school, tx, 18, { width: textW, lineBreak: false });
      if (data.tagline) {
        doc.font('Helvetica').fontSize(9).fillColor('#dbeafe');
        doc.text(data.tagline, tx, 36, { width: textW, lineBreak: false });
      }
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#bfdbfe');
      doc.text('STUDENT RANKINGS', tx, data.tagline ? 50 : 38, { width: textW, lineBreak: false });

      const bx = pageW - margin - badgeW;
      doc.roundedRect(bx, 26, badgeW, 26, 13).fill(MS.badge);
      doc.fillColor(MS.white).font('Helvetica-Bold').fontSize(8.5);
      doc.text(badgeText, bx + 10, 34, { width: badgeW - 20, align: 'center', lineBreak: false });

      doc.restore();
      return bannerH;
    };

    const headers = [
      'POS',
      'STUDENT ID',
      'LAST NAME',
      'FIRST NAME',
      'CLASS',
      ...(showForm ? ['FORM'] : []),
      ...(isSubject ? ['MARK', '%'] : ['SUBJ', 'AVG %']),
    ];

    const buildRow = (s: RankingsPdfData['students'][0]): string[] => [
      String(s.position),
      s.admissionNumber,
      s.lastName,
      s.firstName,
      s.className,
      ...(showForm ? [s.formName] : []),
      ...(isSubject
        ? [s.mark != null ? String(s.mark) : '—', s.averagePercent != null ? s.averagePercent.toFixed(2) : '—']
        : [
            String(s.subjectCount),
            s.averagePercent != null ? s.averagePercent.toFixed(2) : '—',
          ]),
    ];

    const mins = headers.map((h, i) => (i === 0 ? 28 : i === 1 ? 58 : 52));
    const widths = headers.map((label, i) => {
      let w = msTextWidth(doc, label, MS_HDR, true) + MS_PAD * 2 + 4;
      for (const row of data.students) {
        const cell = buildRow(row)[i];
        w = Math.max(w, msTextWidth(doc, cell, MS_FONT) + MS_PAD * 2 + 6);
      }
      return Math.ceil(Math.max(mins[i] ?? 40, w));
    });

    const colW = msFitWidths(widths, contentW, mins);
    const tableW = colW.reduce((a, b) => a + b, 0);
    const headerH = 22;
    const rowH = 20;
    const tableBottom = () => pageH - margin - 24;
    const numericStart = headers.length - 2;
    const colAligns: ('left' | 'center' | 'right')[] = headers.map((_, i) => {
      if (i === 0) return 'center';
      if (i === headers.length - 1) return 'right';
      if (i >= numericStart) return 'center';
      return 'left';
    });

    let y = drawBanner() + 10;

    doc.fillColor(MS.meta).font('Helvetica').fontSize(8.5);
    const meta =
      `Exam: ${data.examTypeName}    Term: ${data.termName}    ${data.scopeLabel}    ` +
      `Max Marks: ${data.maxMarks}    Students: ${data.students.length}    ` +
      `Generated: ${data.generatedAt.toLocaleString()}`;
    doc.text(meta, margin, y, { width: contentW, lineBreak: false });
    y += 16;

    const drawTableHeader = () => {
      msDrawRankingsGrid(doc, margin, y, colW, headerH, MS.header);
      for (let i = 0; i < headers.length; i++) {
        const cx = msColX(margin, colW, i);
        msDrawRankingsCell(doc, headers[i], cx, y, colW[i], headerH, {
          header: true,
          align: colAligns[i],
        });
      }
      y += headerH;
    };

    const drawRow = (row: RankingsPdfData['students'][0], idx: number) => {
      const cells = buildRow(row);
      const fill = idx % 2 === 1 ? '#f8fafc' : MS.white;
      msDrawRankingsGrid(doc, margin, y, colW, rowH, fill);

      for (let i = 0; i < headers.length; i++) {
        const cx = msColX(margin, colW, i);
        const text = cells[i] ?? '—';
        msDrawRankingsCell(doc, text, cx, y, colW[i], rowH, {
          align: colAligns[i],
          posBadge: i === 0,
          bold: isSubject && i === headers.length - 2,
        });
      }
      y += rowH;
    };

    drawTableHeader();
    data.students.forEach((row, idx) => {
      if (y + rowH > tableBottom()) {
        doc.addPage({ size: 'A4', layout: 'landscape', margin });
        y = margin;
        drawTableHeader();
      }
      drawRow(row, idx);
    });

    const footerY = pageH - margin - 6;
    doc.save();
    doc.strokeColor(MS.border).lineWidth(1);
    doc.moveTo(margin, footerY - 10).lineTo(margin + contentW, footerY - 10).stroke();
    doc.fillColor(MS.blue).font('Helvetica').fontSize(8);
    doc.text(`Official Academic Record — ${school}`, margin, footerY - 4, { lineBreak: false });
    doc.restore();

    doc.end();
  });
}

export interface ReconciliationPdfRow {
  admissionNumber: string;
  name: string;
  classLabel: string;
  status: string;
  totalBilled: number;
  totalCollected: number;
  closingBalance: number;
  outstandingBalance: number;
  variance: number;
  discrepancies: string[];
}

export interface ReconciliationPdfData {
  schoolName?: string;
  tagline?: string;
  logoUrl?: string;
  dateFrom: string;
  dateTo: string;
  termName?: string;
  generatedAt: string;
  summary: {
    studentCount: number;
    reconciled: number;
    unreconciled: number;
    pending: number;
    totalExpectedRevenue: number;
    totalCollected: number;
    totalVariance: number;
    totalOutstanding: number;
  };
  rows: ReconciliationPdfRow[];
  detailed: boolean;
}

export async function generateReconciliationPdf(data: ReconciliationPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36 });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageW = doc.page.width;
    const margin = 36;
    const contentW = pageW - margin * 2;
    const branding: SchoolBranding = {
      schoolName: data.schoolName,
      tagline: data.tagline,
      logoUrl: data.logoUrl,
    };

    let y = drawBillingDocHeader(doc, branding, pageW, margin, 'Student Reconciliation Report');
    doc.fillColor(BILL.muted).font('Helvetica').fontSize(9);
    doc.text(
      `Period: ${data.dateFrom} → ${data.dateTo}${data.termName ? `  ·  Term: ${data.termName}` : ''}`,
      margin,
      y,
      { width: contentW },
    );
    y += 14;
    doc.text(`Generated: ${new Date(data.generatedAt).toLocaleString()}  ·  Mode: ${data.detailed ? 'Detailed' : 'Summary'}`, margin, y);
    y += 18;

    const summaryItems = [
      ['Students', String(data.summary.studentCount)],
      ['Reconciled', String(data.summary.reconciled)],
      ['Unreconciled', String(data.summary.unreconciled)],
      ['Pending', String(data.summary.pending)],
      ['Expected', formatMoney(data.summary.totalExpectedRevenue)],
      ['Collected', formatMoney(data.summary.totalCollected)],
      ['Variance', formatMoney(data.summary.totalVariance)],
      ['Outstanding', formatMoney(data.summary.totalOutstanding)],
    ];
    const boxW = contentW / 4 - 6;
    summaryItems.forEach(([label, val], i) => {
      const col = i % 4;
      const row = Math.floor(i / 4);
      const x = margin + col * (boxW + 8);
      const by = y + row * 36;
      doc.save();
      doc.roundedRect(x, by, boxW, 28, 4).fill(BILL.rowAlt);
      doc.fillColor(BILL.muted).font('Helvetica').fontSize(7).text(label, x + 6, by + 5, { width: boxW - 12 });
      doc.fillColor(BILL.ink).font('Helvetica-Bold').fontSize(9).text(val, x + 6, by + 15, { width: boxW - 12 });
      doc.restore();
    });
    y += 78;

    const cols = data.detailed
      ? [
          { label: 'ID', w: 58 },
          { label: 'Student', w: 100 },
          { label: 'Class', w: 52 },
          { label: 'Status', w: 58 },
          { label: 'Billed', w: 52, align: 'right' as const },
          { label: 'Collected', w: 52, align: 'right' as const },
          { label: 'Closing', w: 52, align: 'right' as const },
          { label: 'Outstanding', w: 58, align: 'right' as const },
          { label: 'Variance', w: 52, align: 'right' as const },
        ]
      : [
          { label: 'ID', w: 70 },
          { label: 'Student', w: 130 },
          { label: 'Class', w: 70 },
          { label: 'Status', w: 70 },
          { label: 'Billed', w: 70, align: 'right' as const },
          { label: 'Collected', w: 70, align: 'right' as const },
          { label: 'Closing', w: 70, align: 'right' as const },
          { label: 'Outstanding', w: 80, align: 'right' as const },
        ];

    const drawHeader = () => {
      let x = margin;
      doc.save();
      doc.rect(margin, y, contentW, 16).fill(BILL.primary);
      doc.fillColor(BILL.white).font('Helvetica-Bold').fontSize(8);
      for (const c of cols) {
        doc.text(c.label, x + 4, y + 4, { width: c.w - 8, align: c.align || 'left', lineBreak: false });
        x += c.w;
      }
      doc.restore();
      y += 18;
    };

    drawHeader();
    for (const row of data.rows) {
      if (y > doc.page.height - 60) {
        doc.addPage({ size: 'A4', layout: 'landscape', margin });
        y = margin;
        drawHeader();
      }
      let x = margin;
      const values = data.detailed
        ? [
            row.admissionNumber,
            row.name,
            row.classLabel,
            row.status,
            formatMoney(row.totalBilled),
            formatMoney(row.totalCollected),
            formatMoney(row.closingBalance),
            formatMoney(row.outstandingBalance),
            formatMoney(row.variance),
          ]
        : [
            row.admissionNumber,
            row.name,
            row.classLabel,
            row.status,
            formatMoney(row.totalBilled),
            formatMoney(row.totalCollected),
            formatMoney(row.closingBalance),
            formatMoney(row.outstandingBalance),
          ];
      doc.fillColor(BILL.ink).font('Helvetica').fontSize(8);
      for (let i = 0; i < cols.length; i++) {
        doc.text(String(values[i]), x + 4, y, { width: cols[i].w - 8, align: cols[i].align || 'left', lineBreak: false });
        x += cols[i].w;
      }
      y += 14;
      if (data.detailed && row.discrepancies.length) {
        doc.fillColor('#b45309').font('Helvetica').fontSize(7);
        doc.text(`Note: ${row.discrepancies.join(' · ')}`, margin + 4, y, { width: contentW - 8 });
        y += 12;
      }
    }

    doc.end();
  });
}

