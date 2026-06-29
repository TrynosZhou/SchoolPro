import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import QRCode from 'qrcode';
import { formatSubjectAbbrev } from './subject-abbrev';
import type { GradeBoundary } from '../types/grade-boundaries';
import { generateReportCardPortalPdf } from './report-card-portal.pdf';

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
  bankAccountName?: string;
  bankName?: string;
  bankBranch?: string;
  bankAccountNumber?: string;
  bankPaymentReferenceNote?: string;
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

function drawGeneratedFooter(
  doc: InstanceType<typeof PDFDocument>,
  generatedAt: Date,
  margin: number,
  contentW?: number,
) {
  const width = contentW ?? doc.page.width - margin * 2;
  const y = doc.page.height - margin - 10;
  doc.font('Helvetica').fontSize(7.5).fillColor('#64748b');
  doc.text(`Generated: ${formatGeneratedTimestamp(generatedAt)}`, margin, y, { width, align: 'center' });
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatGeneratedTimestamp(date: Date): string {
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}, ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
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

function formatReceiptClassLabel(raw: string): string {
  const cls = String(raw || '').trim();
  if (!cls || cls === 'N/A') return '—';
  if (/^class\s+/i.test(cls)) return cls.replace(/\s+/g, ' ').trim();
  return `Class ${cls.replace(/\s+/g, '')}`;
}

function formatPaymentMethod(method: string): string {
  const map: Record<string, string> = {
    cash: 'Cash',
    bank: 'Bank Transfer',
    ecocash: 'EcoCash',
    onemoney: 'OneMoney',
    innbucks: 'InnBucks',
    other: 'Other',
  };
  const key = String(method || '').toLowerCase();
  return map[key] || method || '—';
}

function drawPaidWatermark(
  doc: InstanceType<typeof PDFDocument>,
  pageW: number,
  pageH: number,
) {
  const cx = pageW / 2;
  const cy = pageH / 2 + 40;
  doc.save();
  doc.translate(cx, cy);
  doc.rotate(-28);
  doc.fillColor('#4f46e5', 0.06);
  doc.font('Helvetica-Bold').fontSize(72);
  doc.text('PAID', -120, -30, { width: 240, align: 'center' });
  doc.restore();
}

const RECEIPT_LABEL = {
  gap: 14,
  labelSize: 7.5,
  valueSize: 10.5,
  valueSizeSm: 9.5,
  tracking: 0.4,
};

function drawReceiptLabelValue(
  doc: InstanceType<typeof PDFDocument>,
  label: string,
  value: string,
  x: number,
  y: number,
  opts?: { width?: number; valueBold?: boolean; valueSize?: number; gap?: number },
): number {
  const gap = opts?.gap ?? RECEIPT_LABEL.gap;
  const labelSize = RECEIPT_LABEL.labelSize;
  const valueSize = opts?.valueSize ?? RECEIPT_LABEL.valueSize;
  const width = opts?.width ?? 220;

  doc.fillColor(BILL.muted).font('Helvetica').fontSize(labelSize);
  doc.text(label, x, y, { width, lineBreak: false, characterSpacing: RECEIPT_LABEL.tracking });
  const labelH = doc.heightOfString(label, { width });
  const valueY = y + labelH + gap;

  if (opts?.valueBold !== false) {
    doc.font('Helvetica-Bold');
  } else {
    doc.font('Helvetica');
  }
  doc.fillColor(BILL.ink).fontSize(valueSize);
  doc.text(value, x, valueY, { width, lineBreak: false });
  return valueY + doc.heightOfString(value, { width });
}

function drawStatusPill(
  doc: InstanceType<typeof PDFDocument>,
  x: number,
  y: number,
  label: string,
  tone: 'paid' | 'pending' | 'partial' | 'sent' | 'overdue' = 'paid',
) {
  const styles: Record<string, { bg: string; border: string; fg: string }> = {
    paid: { bg: '#dcfce7', border: '#86efac', fg: '#166534' },
    pending: { bg: '#fef3c7', border: '#fcd34d', fg: '#92400e' },
    partial: { bg: '#fff7ed', border: '#fdba74', fg: '#9a3412' },
    sent: { bg: '#eff6ff', border: '#93c5fd', fg: '#1d4ed8' },
    overdue: { bg: '#fef2f2', border: '#fecaca', fg: '#991b1b' },
  };
  const style = styles[tone] || styles.sent;
  doc.font('Helvetica-Bold').fontSize(9);
  const w = doc.widthOfString(label) + 18;
  doc.save();
  doc.roundedRect(x, y, w, 20, 10).fillAndStroke(style.bg, style.border);
  doc.restore();
  doc.font('Helvetica-Bold').fontSize(9).fillColor(style.fg).text(label, x + 9, y + 5, { lineBreak: false });
  return w;
}

function invoiceStatusTone(status: string): 'paid' | 'partial' | 'sent' | 'overdue' | 'pending' {
  const s = String(status || '').toLowerCase();
  if (s === 'paid') return 'paid';
  if (s === 'partial') return 'partial';
  if (s === 'overdue') return 'overdue';
  if (s === 'sent') return 'sent';
  return 'pending';
}

function formatFeeTypeLabel(feeType: string): string {
  const raw = String(feeType || '').trim();
  if (!raw) return '—';
  return raw
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatInvoiceDate(d: string): string {
  if (!d) return '—';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return d;
  return `${pad2(dt.getDate())}/${pad2(dt.getMonth() + 1)}/${dt.getFullYear()}`;
}

function drawInvoiceWatermark(
  doc: InstanceType<typeof PDFDocument>,
  pageW: number,
  pageH: number,
  status: string,
) {
  const s = String(status || '').toLowerCase();
  let label = '';
  let color = '#4f46e5';
  if (s === 'paid') {
    label = 'PAID';
    color = '#059669';
  } else if (s === 'overdue') {
    label = 'OVERDUE';
    color = '#dc2626';
  } else if (s === 'partial') {
    label = 'PARTIAL';
    color = '#d97706';
  } else {
    return;
  }
  const cx = pageW / 2;
  const cy = pageH / 2 + 20;
  doc.save();
  doc.translate(cx, cy);
  doc.rotate(-28);
  doc.fillColor(color, 0.06);
  doc.font('Helvetica-Bold').fontSize(68);
  doc.text(label, -140, -28, { width: 280, align: 'center' });
  doc.restore();
}

type BillingPdfDoc = InstanceType<typeof PDFDocument>;

const BILLING_PDF_COLORS = {
  blueDark: '#1e3a8a',
  ink: '#1a1a2e',
  muted: '#64748b',
  border: '#d1d5db',
  white: '#ffffff',
};

function drawPdfBankingDetails(
  doc: BillingPdfDoc,
  branding: Pick<SchoolBranding, 'bankAccountName' | 'bankName' | 'bankBranch' | 'bankAccountNumber'>,
  margin: number,
  contentW: number,
  y: number,
  pageBottom: number,
  onNewPage?: () => number,
): number {
  const hasBankDetails =
    branding.bankAccountName || branding.bankName || branding.bankBranch || branding.bankAccountNumber;
  if (!hasBankDetails) return y;

  const C = BILLING_PDF_COLORS;
  if (y + 90 > pageBottom && onNewPage) {
    y = onNewPage();
  }

  doc.save().rect(margin, y, contentW, 18).fill(C.blueDark).restore();
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.white)
    .text('PAYMENT / BANKING DETAILS', margin + 10, y + 5, { lineBreak: false, characterSpacing: 0.5 });
  y += 18;

  const bankRows: { label: string; value: string }[] = [];
  if (branding.bankAccountName) bankRows.push({ label: 'Account name', value: branding.bankAccountName });
  if (branding.bankName) bankRows.push({ label: 'Bank', value: branding.bankName });
  if (branding.bankBranch) bankRows.push({ label: 'Branch', value: branding.bankBranch });
  if (branding.bankAccountNumber) bankRows.push({ label: 'Account number', value: branding.bankAccountNumber });

  const bankRowH = 20;
  const bankTableH = bankRows.length * bankRowH;
  doc.save().rect(margin, y, contentW, bankTableH).fill(C.white)
    .strokeColor(C.border).lineWidth(0.5).rect(margin, y, contentW, bankTableH).stroke().restore();

  const labelColW = 100;
  bankRows.forEach((row, idx) => {
    if (idx > 0) {
      doc.save().strokeColor(C.border).lineWidth(0.3)
        .moveTo(margin, y).lineTo(margin + contentW, y).stroke().restore();
    }
    doc.font('Helvetica').fontSize(8.5).fillColor(C.muted)
      .text(`${row.label}:`, margin + 10, y + 5, { width: labelColW, lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.ink)
      .text(row.value, margin + 10 + labelColW, y + 5, { width: contentW - labelColW - 20, lineBreak: false });
    y += bankRowH;
  });

  return y + 10;
}

function drawPdfPaymentReferenceNote(
  doc: BillingPdfDoc,
  note: string | undefined,
  margin: number,
  contentW: number,
  y: number,
  pageBottom: number,
): number {
  const paymentNote = note?.trim() || 'Please use the account number as your payment reference.';
  if (y + 20 >= pageBottom || !paymentNote) return y;

  doc.font('Helvetica').fontSize(7.5).fillColor(BILLING_PDF_COLORS.muted)
    .text(paymentNote, margin, y, { width: contentW, align: 'center', lineBreak: false });
  return y + 14;
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
    paymentReference?: string;
    notes?: string;
    invoiceNumber?: string;
    invoiceBalance?: number;
  } & SchoolBranding,
): Promise<string> {
  ensureUploadDirs();
  const filename = `${data.receiptNumber}.pdf`;
  const filepath = path.join(receiptsDir, filename);
  const currency = data.currency || 'USD';
  const school = data.schoolName || 'School Pro Academy';

  const verifyPayload = JSON.stringify({
    receipt: data.receiptNumber,
    student: data.admissionNumber,
    amount: Number(data.amount.toFixed(2)),
    date: data.paidAt.toISOString(),
    school,
  });
  const qrBuffer = await QRCode.toBuffer(verifyPayload, { margin: 1, width: 200, errorCorrectionLevel: 'M' });

  return new Promise((resolve, reject) => {
    const margin = 40;
    const doc = new PDFDocument({ margin, size: 'A4' });
    const stream = fs.createWriteStream(filepath);
    doc.pipe(stream);

    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const contentW = pageW - margin * 2;

    // ── Colours (same as invoice) ──
    const C = {
      blue: '#1a56db',
      blueDark: '#1e3a8a',
      ink: '#1a1a2e',
      muted: '#64748b',
      border: '#d1d5db',
      rowAlt: '#f9fafb',
      white: '#ffffff',
      gold: '#b8860b',
      headerBg: '#f0f4ff',
      green: '#16a34a',
      greenBg: '#dcfce7',
    };

    // ── Helpers ──
    const hline = (yy: number, col = C.border, lw = 0.5) => {
      doc.save().strokeColor(col).lineWidth(lw)
        .moveTo(margin, yy).lineTo(margin + contentW, yy).stroke().restore();
    };

    const labelColW = 82;
    const infoRow = (label: string, value: string, x: number, yy: number, w: number): number => {
      doc.font('Helvetica').fontSize(8.5).fillColor(C.muted)
        .text(label, x, yy, { width: labelColW, lineBreak: false });
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.ink)
        .text(value || '—', x + labelColW, yy, { width: Math.max(10, w - labelColW), lineBreak: false });
      return yy + 16;
    };

    // ══════════════════════════════════════
    // HEADER
    // ══════════════════════════════════════
    const headerTop = margin;
    const logoPath = resolveUploadPath(data.logoUrl);
    let logoRight = margin;

    if (logoPath) {
      const logoSize = 52;
      try {
        doc.save().circle(margin + logoSize / 2, headerTop + logoSize / 2, logoSize / 2 + 2).fill(C.border).restore();
        doc.save().circle(margin + logoSize / 2, headerTop + logoSize / 2, logoSize / 2).fill(C.white).restore();
        doc.image(logoPath, margin + 4, headerTop + 4, { fit: [logoSize - 8, logoSize - 8] });
        logoRight = margin + logoSize + 12;
      } catch { logoRight = margin; }
    }

    const schoolInfoW = contentW * 0.55;
    doc.font('Helvetica-Bold').fontSize(14).fillColor(C.blueDark)
      .text(school, logoRight, headerTop + 4, { width: schoolInfoW, lineBreak: false });
    let schoolY = headerTop + 21;
    const contactParts: string[] = [];
    if (data.address) contactParts.push(data.address);
    if (data.phone) contactParts.push(`Tel: ${data.phone}`);
    if (data.email) contactParts.push(data.email);
    if (contactParts.length) {
      doc.font('Helvetica').fontSize(7.5).fillColor(C.muted)
        .text(contactParts.join('  ·  '), logoRight, schoolY, { width: schoolInfoW });
      schoolY += 14;
    }

    const docTypeX = margin + contentW * 0.62;
    const docTypeW = contentW * 0.38;
    doc.font('Helvetica').fontSize(8).fillColor(C.muted)
      .text('OFFICIAL RECEIPT', docTypeX, headerTop + 6, { width: docTypeW, align: 'right', lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(26).fillColor(C.blue)
      .text('Receipt', docTypeX, headerTop + 18, { width: docTypeW, align: 'right', lineBreak: false });

    const headerBottom = Math.max(headerTop + 56, schoolY + 8);
    let y = headerBottom + 4;

    doc.save().strokeColor(C.gold).lineWidth(2)
      .moveTo(margin, y).lineTo(margin + contentW, y).stroke().restore();
    y += 8;

    // ══════════════════════════════════════
    // TWO-COLUMN INFO SECTION
    // ══════════════════════════════════════
    const colGap = 16;
    const halfW = (contentW - colGap) / 2;
    const col2X = margin + halfW + colGap;
    const infoTop = y;

    // Left box row count: Receipt Number, Date & Time, Invoice No. (optional)
    const leftRowCount = data.invoiceNumber ? 3 : 2;
    const leftBoxH = 24 + leftRowCount * 16 + 8;
    // Right box: Student Name, Student No., Class — always 3 rows
    const rightBoxH = 24 + 3 * 16 + 8;
    const infoBoxH = Math.max(leftBoxH, rightBoxH);

    // Left box — Receipt Details
    doc.save().rect(margin, infoTop, halfW, infoBoxH).fill(C.headerBg)
      .strokeColor(C.border).lineWidth(0.5).rect(margin, infoTop, halfW, infoBoxH).stroke().restore();
    doc.font('Helvetica-Bold').fontSize(8).fillColor(C.blueDark)
      .text('RECEIPT DETAILS', margin + 10, infoTop + 8, { characterSpacing: 0.5, lineBreak: false });
    hline(infoTop + 20, C.border);

    let leftY = infoTop + 26;
    leftY = infoRow('Receipt Number', data.receiptNumber, margin + 10, leftY, halfW - 20);
    leftY = infoRow('Date & Time', formatGeneratedTimestamp(data.paidAt), margin + 10, leftY, halfW - 20);
    if (data.invoiceNumber) {
      infoRow('Invoice No.', data.invoiceNumber, margin + 10, leftY, halfW - 20);
    }

    // Right box — Received From
    doc.save().rect(col2X, infoTop, halfW, infoBoxH).fill(C.headerBg)
      .strokeColor(C.border).lineWidth(0.5).rect(col2X, infoTop, halfW, infoBoxH).stroke().restore();
    doc.font('Helvetica-Bold').fontSize(8).fillColor(C.blueDark)
      .text('RECEIVED FROM', col2X + 10, infoTop + 8, { characterSpacing: 0.5, lineBreak: false });
    hline(infoTop + 20, C.border);

    let rightY = infoTop + 26;
    rightY = infoRow('Student Name', data.studentName, col2X + 10, rightY, halfW - 20);
    rightY = infoRow('Student No.', data.admissionNumber, col2X + 10, rightY, halfW - 20);
    infoRow('Class', formatReceiptClassLabel(data.className), col2X + 10, rightY, halfW - 20);

    y = infoTop + infoBoxH + 12;

    // ══════════════════════════════════════
    // PAYMENT TABLE — 2 columns
    // ══════════════════════════════════════
    const descW = contentW * 0.72;
    const amtW = contentW - descW;
    const tableRowH = 22;

    doc.save().rect(margin, y, contentW, 20).fill(C.blueDark).restore();
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.white);
    doc.text('DESCRIPTION', margin + 8, y + 6, { width: descW - 16, lineBreak: false });
    doc.text('AMOUNT', margin + descW + 4, y + 6, { width: amtW - 8, align: 'right', lineBreak: false });
    y += 20;

    // Payment row
    doc.save().rect(margin, y, contentW, tableRowH).fill(C.rowAlt).restore();
    doc.save().strokeColor(C.border).lineWidth(0.3)
      .moveTo(margin, y + tableRowH).lineTo(margin + contentW, y + tableRowH).stroke().restore();
    doc.font('Helvetica').fontSize(9).fillColor(C.ink)
      .text(data.label || 'School Fees Payment', margin + 8, y + 6, { width: descW - 16, lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(9).fillColor(C.ink)
      .text(formatMoney(data.amount, currency), margin + descW + 4, y + 6, {
        width: amtW - 8, align: 'right', lineBreak: false,
      });
    y += tableRowH;

    // Payment method row
    doc.save().strokeColor(C.border).lineWidth(0.3)
      .moveTo(margin, y + tableRowH).lineTo(margin + contentW, y + tableRowH).stroke().restore();
    doc.font('Helvetica').fontSize(9).fillColor(C.muted)
      .text('Payment Method', margin + 8, y + 6, { width: descW - 16, lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(9).fillColor(C.ink)
      .text(formatPaymentMethod(data.method), margin + descW + 4, y + 6, {
        width: amtW - 8, align: 'right', lineBreak: false,
      });
    y += tableRowH;

    if (data.paymentReference) {
      doc.save().strokeColor(C.border).lineWidth(0.3)
        .moveTo(margin, y + tableRowH).lineTo(margin + contentW, y + tableRowH).stroke().restore();
      doc.font('Helvetica').fontSize(9).fillColor(C.muted)
        .text('Payment Reference', margin + 8, y + 6, { width: descW - 16, lineBreak: false });
      doc.font('Helvetica').fontSize(9).fillColor(C.ink)
        .text(data.paymentReference, margin + descW + 4, y + 6, {
          width: amtW - 8, align: 'right', lineBreak: false,
        });
      y += tableRowH;
    }

    doc.save().strokeColor(C.border).lineWidth(0.3)
      .moveTo(margin, y + tableRowH).lineTo(margin + contentW, y + tableRowH).stroke().restore();
    doc.font('Helvetica').fontSize(9).fillColor(C.muted)
      .text('Invoice Balance', margin + 8, y + 6, { width: descW - 16, lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(9).fillColor(C.ink)
      .text(formatMoney(Number(data.invoiceBalance ?? 0), currency), margin + descW + 4, y + 6, {
        width: amtW - 8, align: 'right', lineBreak: false,
      });
    y += tableRowH;

    // Table border
    let bodyRows = 3;
    if (data.paymentReference) bodyRows += 1;
    const tableTop = y - tableRowH * bodyRows - 20;
    doc.save().strokeColor(C.border).lineWidth(0.5)
      .rect(margin, tableTop, contentW, y - tableTop).stroke().restore();

    y += 4;

    // ══════════════════════════════════════
    // TOTAL AMOUNT PAID (highlighted)
    // ══════════════════════════════════════
    const summaryW = 240;
    const summaryX = margin + contentW - summaryW;

    doc.save().rect(summaryX, y, summaryW, 26).fill(C.blueDark).restore();
    doc.font('Helvetica-Bold').fontSize(9).fillColor(C.white)
      .text('TOTAL AMOUNT PAID', summaryX + 10, y + 8, { width: summaryW * 0.55, lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(9).fillColor(C.white)
      .text(formatMoney(data.amount, currency), summaryX + summaryW * 0.55, y + 8, {
        width: summaryW * 0.42, align: 'right', lineBreak: false,
      });
    y += 34;

    // ══════════════════════════════════════
    // PAID STATUS INDICATOR
    // ══════════════════════════════════════
    doc.save()
      .circle(margin + 12, y + 12, 9).fill(C.greenBg)
      .circle(margin + 12, y + 12, 9).strokeColor(C.green).lineWidth(1).stroke()
      .restore();
    doc.save().strokeColor(C.green).lineWidth(1.5)
      .moveTo(margin + 7, y + 12).lineTo(margin + 11, y + 16).lineTo(margin + 17, y + 8).stroke().restore();
    doc.font('Helvetica-Bold').fontSize(9).fillColor(C.green)
      .text('Payment received and recorded.', margin + 28, y + 7, { lineBreak: false });
    y += 30;

    const pageBottom = pageH - margin - 30;
    y = drawPdfBankingDetails(doc, data, margin, contentW, y, pageBottom, () => {
      doc.addPage({ size: 'A4', margin });
      return margin;
    });
    y = drawPdfPaymentReferenceNote(doc, data.bankPaymentReferenceNote, margin, contentW, y, pageBottom);

    // ══════════════════════════════════════
    // QR CODE + NOTES
    // ══════════════════════════════════════
    const qrSize = 68;
    const qrTop = y;
    try {
      doc.save().rect(margin, qrTop, qrSize, qrSize).fill(C.white)
        .strokeColor(C.border).lineWidth(0.5).rect(margin, qrTop, qrSize, qrSize).stroke().restore();
      doc.image(qrBuffer, margin + 4, qrTop + 4, { fit: [qrSize - 8, qrSize - 8] });
    } catch { /* skip */ }
    doc.font('Helvetica').fontSize(7).fillColor(C.muted)
      .text('Scan to verify', margin, qrTop + qrSize + 3, { width: qrSize, align: 'center', lineBreak: false });

    const noteX = margin + qrSize + 14;
    const noteW = contentW - qrSize - 14;
    let noteY = qrTop + 4;
    doc.font('Helvetica').fontSize(8).fillColor(C.muted)
      .text('Thank you for your payment. Please retain this receipt for your records.', noteX, noteY, { width: noteW });
    noteY += 22;
    if (data.notes?.trim()) {
      doc.font('Helvetica-Bold').fontSize(8).fillColor(C.ink).text('Note:', noteX, noteY, { lineBreak: false });
      doc.font('Helvetica').fontSize(8).fillColor(C.ink)
        .text(data.notes.trim(), noteX + 28, noteY, { width: noteW - 28 });
      noteY += 18;
    }

    // ══════════════════════════════════════
    // FOOTER
    // ══════════════════════════════════════
    const genY = pageH - margin - 12;
    doc.font('Helvetica').fontSize(7.5).fillColor(C.muted)
      .text(`Generated on: ${formatGeneratedTimestamp(data.paidAt)}`, margin, genY, {
        width: contentW, align: 'center', lineBreak: false,
      });

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
  const school = data.schoolName || 'School Pro Academy';
  const isPaid = String(data.status).toLowerCase() === 'paid';

  return new Promise((resolve, reject) => {
    const margin = 40;
    const doc = new PDFDocument({ margin, size: 'A4' });
    const stream = fs.createWriteStream(filepath);
    doc.pipe(stream);

    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const contentW = pageW - margin * 2;
    const pageBottom = pageH - margin - 30;

    // ── Colours ──
    const C = {
      blue: '#1a56db',
      blueDark: '#1e3a8a',
      ink: '#1a1a2e',
      muted: '#64748b',
      border: '#d1d5db',
      rowAlt: '#f9fafb',
      white: '#ffffff',
      gold: '#b8860b',
      headerBg: '#f0f4ff',
    };

    // ── Helpers ──
    const hline = (yy: number, col = C.border, lw = 0.5) => {
      doc.save().strokeColor(col).lineWidth(lw)
        .moveTo(margin, yy).lineTo(margin + contentW, yy).stroke().restore();
    };

    const labelColW = 82;
    const infoRow = (label: string, value: string, x: number, yy: number, w: number): number => {
      doc.font('Helvetica').fontSize(8.5).fillColor(C.muted)
        .text(label, x, yy, { width: labelColW, lineBreak: false });
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.ink)
        .text(value || '—', x + labelColW, yy, { width: Math.max(10, w - labelColW), lineBreak: false });
      return yy + 16;
    };

    // ══════════════════════════════════════
    // HEADER — white background
    // ══════════════════════════════════════
    const headerTop = margin;
    const logoPath = resolveUploadPath(data.logoUrl);
    let logoRight = margin;

    if (logoPath) {
      const logoSize = 52;
      try {
        doc.save().circle(margin + logoSize / 2, headerTop + logoSize / 2, logoSize / 2 + 2)
          .fill(C.border).restore();
        doc.save().circle(margin + logoSize / 2, headerTop + logoSize / 2, logoSize / 2)
          .fill(C.white).restore();
        doc.image(logoPath, margin + 4, headerTop + 4, { fit: [logoSize - 8, logoSize - 8] });
        logoRight = margin + logoSize + 12;
      } catch { logoRight = margin; }
    }

    // School name + contact (left/center)
    const schoolInfoW = contentW * 0.55;
    doc.font('Helvetica-Bold').fontSize(14).fillColor(C.blueDark)
      .text(school, logoRight, headerTop + 4, { width: schoolInfoW, lineBreak: false });
    let schoolY = headerTop + 21;
    const contactParts: string[] = [];
    if (data.address) contactParts.push(data.address);
    if (data.phone) contactParts.push(`Tel: ${data.phone}`);
    if (data.email) contactParts.push(data.email);
    if (contactParts.length) {
      doc.font('Helvetica').fontSize(7.5).fillColor(C.muted)
        .text(contactParts.join('  ·  '), logoRight, schoolY, { width: schoolInfoW });
      schoolY += 14;
    }

    // Doc type (right side)
    const docTypeX = margin + contentW * 0.62;
    const docTypeW = contentW * 0.38;
    doc.font('Helvetica').fontSize(8).fillColor(C.muted)
      .text('STATEMENT OF ACCOUNT', docTypeX, headerTop + 6, { width: docTypeW, align: 'right', lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(26).fillColor(C.blue)
      .text('Invoice', docTypeX, headerTop + 18, { width: docTypeW, align: 'right', lineBreak: false });

    const headerBottom = Math.max(headerTop + 56, schoolY + 8);
    let y = headerBottom + 4;

    // Gold/blue accent line
    doc.save().strokeColor(C.gold).lineWidth(2)
      .moveTo(margin, y).lineTo(margin + contentW, y).stroke().restore();
    y += 8;

    // ══════════════════════════════════════
    // TWO-COLUMN INFO SECTION
    // ══════════════════════════════════════
    const colGap = 16;
    const halfW = (contentW - colGap) / 2;
    const col2X = margin + halfW + colGap;
    const infoTop = y;

    // Calculate box height dynamically based on number of rows
    const leftRowCount = data.termName ? 4 : 3;
    const infoBoxH = 24 + leftRowCount * 16 + 8;

    // Left box — Invoice Details
    doc.save().rect(margin, infoTop, halfW, infoBoxH).fill(C.headerBg)
      .strokeColor(C.border).lineWidth(0.5).rect(margin, infoTop, halfW, infoBoxH).stroke().restore();
    doc.font('Helvetica-Bold').fontSize(8).fillColor(C.blueDark)
      .text('INVOICE DETAILS', margin + 10, infoTop + 8, { characterSpacing: 0.5, lineBreak: false });
    hline(infoTop + 20, C.border);

    let leftY = infoTop + 26;
    leftY = infoRow('Invoice Number', data.invoiceNumber, margin + 10, leftY, halfW - 20);
    leftY = infoRow('Invoice Date', formatInvoiceDate(data.issuedDate), margin + 10, leftY, halfW - 20);
    leftY = infoRow('Due Date', formatInvoiceDate(data.dueDate), margin + 10, leftY, halfW - 20);
    if (data.termName) {
      infoRow('Term', data.termName, margin + 10, leftY, halfW - 20);
    }

    // Right box — Billed To (always 3 rows)
    const rightBoxH = 24 + 3 * 16 + 8;
    doc.save().rect(col2X, infoTop, halfW, rightBoxH).fill(C.headerBg)
      .strokeColor(C.border).lineWidth(0.5).rect(col2X, infoTop, halfW, rightBoxH).stroke().restore();
    doc.font('Helvetica-Bold').fontSize(8).fillColor(C.blueDark)
      .text('BILLED TO', col2X + 10, infoTop + 8, { characterSpacing: 0.5, lineBreak: false });
    hline(infoTop + 20, C.border);

    let rightY = infoTop + 26;
    rightY = infoRow('Student Name', data.studentName, col2X + 10, rightY, halfW - 20);
    rightY = infoRow('Student No.', data.admissionNumber, col2X + 10, rightY, halfW - 20);
    infoRow('Class', formatReceiptClassLabel(data.className), col2X + 10, rightY, halfW - 20);

    y = infoTop + Math.max(infoBoxH, rightBoxH) + 10;

    // ══════════════════════════════════════
    // LINE ITEMS TABLE — 2 columns only
    // ══════════════════════════════════════
    const descW = contentW * 0.72;
    const amtW = contentW - descW;
    const tableRowH = 22;

    // Table header
    doc.save().rect(margin, y, contentW, 20).fill(C.blueDark).restore();
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.white);
    doc.text('DESCRIPTION', margin + 8, y + 6, { width: descW - 16, lineBreak: false });
    doc.text('AMOUNT', margin + descW + 4, y + 6, { width: amtW - 8, align: 'right', lineBreak: false });
    y += 20;

    const lineItems = data.lines?.length > 0
      ? data.lines
      : [{ description: data.description, quantity: 1, unitPrice: data.totalAmount, amount: data.totalAmount }];

    lineItems.forEach((line, idx) => {
      if (y + tableRowH > pageBottom) {
        doc.addPage({ size: 'A4', margin });
        y = margin;
        doc.save().rect(margin, y, contentW, 20).fill(C.blueDark).restore();
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.white);
        doc.text('DESCRIPTION', margin + 8, y + 6, { width: descW - 16, lineBreak: false });
        doc.text('AMOUNT', margin + descW + 4, y + 6, { width: amtW - 8, align: 'right', lineBreak: false });
        y += 20;
      }
      if (idx % 2 === 1) {
        doc.save().rect(margin, y, contentW, tableRowH).fill(C.rowAlt).restore();
      }
      doc.save().strokeColor(C.border).lineWidth(0.3)
        .moveTo(margin, y + tableRowH).lineTo(margin + contentW, y + tableRowH).stroke().restore();
      doc.font('Helvetica').fontSize(9).fillColor(C.ink);
      doc.text(line.description || '—', margin + 8, y + 6, { width: descW - 16, lineBreak: false });
      doc.font('Helvetica-Bold').fontSize(9).fillColor(C.ink);
      doc.text(formatMoney(Number(line.amount), currency), margin + descW + 4, y + 6, {
        width: amtW - 8, align: 'right', lineBreak: false,
      });
      y += tableRowH;
    });

    // Outer table border
    doc.save().strokeColor(C.border).lineWidth(0.5)
      .rect(margin, y - tableRowH * lineItems.length - 20, contentW, tableRowH * lineItems.length + 20).stroke().restore();

    y += 4;

    // ══════════════════════════════════════
    // SUMMARY TOTALS (right-aligned)
    // ══════════════════════════════════════
    const summaryW = 240;
    const summaryX = margin + contentW - summaryW;

    const drawSummaryRow = (label: string, value: string, highlight = false, isTotal = false) => {
      const rowH = isTotal ? 24 : 20;
      if (highlight) {
        doc.save().rect(summaryX, y, summaryW, rowH).fill(C.blueDark).restore();
        doc.font('Helvetica-Bold').fontSize(isTotal ? 10 : 9).fillColor(C.white);
      } else {
        doc.save().strokeColor(C.border).lineWidth(0.3)
          .moveTo(summaryX, y + rowH).lineTo(summaryX + summaryW, y + rowH).stroke().restore();
        doc.font(isTotal ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor(C.ink);
      }
      doc.text(label, summaryX + 10, y + (rowH - 9) / 2, { width: summaryW * 0.55, lineBreak: false });
      doc.font('Helvetica-Bold').fontSize(9).fillColor(highlight ? C.white : C.ink);
      doc.text(value, summaryX + summaryW * 0.55, y + (rowH - 9) / 2, {
        width: summaryW * 0.42, align: 'right', lineBreak: false,
      });
      y += rowH;
    };

    doc.save().rect(summaryX, y, summaryW, 20 + 20 + 24).fill('#f8fafc')
      .strokeColor(C.border).lineWidth(0.5).rect(summaryX, y, summaryW, 20 + 20 + 24).stroke().restore();

    drawSummaryRow('Amount Paid', formatMoney(data.amountPaid, currency));
    drawSummaryRow('Remaining Balance', formatMoney(balance, currency));
    drawSummaryRow('Total Amount Due', formatMoney(data.totalAmount, currency), true, true);

    y += 14;

    // ══════════════════════════════════════
    // ACCOUNT STATUS
    // ══════════════════════════════════════
    const statusText = isPaid ? 'Account Status: Paid in Full' : `Account Status: ${String(data.status).charAt(0).toUpperCase() + String(data.status).slice(1)}`;
    const statusColor = isPaid ? '#16a34a' : balance > 0 ? '#dc2626' : '#1d4ed8';
    const statusBg = isPaid ? '#dcfce7' : balance > 0 ? '#fee2e2' : '#dbeafe';

    doc.save()
      .circle(margin + 12, y + 12, 9).fill(statusBg)
      .circle(margin + 12, y + 12, 9).strokeColor(statusColor).lineWidth(1).stroke()
      .restore();
    if (isPaid) {
      doc.save().strokeColor(statusColor).lineWidth(1.5)
        .moveTo(margin + 7, y + 12).lineTo(margin + 11, y + 16).lineTo(margin + 17, y + 8).stroke().restore();
    }
    doc.font('Helvetica-Bold').fontSize(9).fillColor(statusColor)
      .text(statusText, margin + 28, y + 7, { lineBreak: false });
    y += 30;

    // ══════════════════════════════════════
    // PAYMENT / BANKING DETAILS
    // ══════════════════════════════════════
    y = drawPdfBankingDetails(doc, data, margin, contentW, y, pageBottom, () => {
      doc.addPage({ size: 'A4', margin });
      return margin;
    });

    // ══════════════════════════════════════
    // NOTE & FOOTER
    // ══════════════════════════════════════
    y = drawPdfPaymentReferenceNote(doc, data.bankPaymentReferenceNote, margin, contentW, y, pageBottom);

    const genY = pageH - margin - 12;
    doc.font('Helvetica').fontSize(7.5).fillColor(C.muted)
      .text(`Generated on: ${formatGeneratedTimestamp(new Date())}`, margin, genY, {
        width: contentW, align: 'center', lineBreak: false,
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
  tableHeaderBg: '#f1f5f9',
  gradePillBg: '#eef2ff',
};

function positionSuffix(n: number): string {
  if (n === 1) return '1st';
  if (n === 2) return '2nd';
  if (n === 3) return '3rd';
  return `${n}th`;
}

function formatSubjectPosition(pos?: number | string, total?: number | string): string {
  if (pos == null || pos === '') return '—';
  const p = Number(pos);
  if (!Number.isFinite(p) || p < 1) return '—';
  const t = total != null && total !== '' ? Number(total) : 0;
  if (Number.isFinite(t) && t > 0) return `${p}/${t}`;
  return String(p);
}

function formatClassMean(mean?: number | string): string {
  if (mean == null || String(mean).trim() === '') return '—';
  const n = Number(mean);
  return Number.isFinite(n) ? n.toFixed(1) : String(mean);
}

function formatPositionOutOf(position?: number, total?: number): string {
  if (!position || !total) return '—';
  return `${position} Out Of ${total}`;
}

function formatSubjectsPassed(passed?: number, total?: number): string {
  if (passed == null || !total) return '—';
  return `${passed}/${total}`;
}

export async function generateReportCardPdf(data: {
  schoolName?: string;
  tagline?: string;
  logoUrl?: string;
  address?: string;
  phone?: string;
  website?: string;
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
    mean?: number | string;
    subjectPosition?: number | string;
    subjectPositionTotal?: number | string;
    remarks?: string;
  }[];
  averageMark?: number;
  overallGrade?: string;
  classPosition?: number;
  formPosition?: number;
  classTotal?: number;
  formTotal?: number;
  subjectsPassed?: number;
  totalSubjects?: number;
  attendance?: {
    daysMarked: number;
    present: number;
    absent: number;
    late: number;
    excused: number;
    attendancePercent: number | null;
  };
  classTeacherRemarks?: string;
  principalRemarks?: string;
  generatedAt?: Date;
  gradeBoundaries?: GradeBoundary[];
  reportCardId?: string;
}): Promise<Buffer> {
  return generateReportCardPortalPdf(data);
}

export async function generateClassListPdf(data: {
  schoolName: string;
  tagline?: string;
  logoUrl?: string;
  classLabel: string;
  generatedAt: Date;
  students: { admissionNumber: string; lastName: string; firstName: string; gender: string; dateOfBirth?: string; studentType?: string }[];
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const CL = {
      primary: '#1e40af',
      primaryLight: '#2563eb',
      headerBg: '#1e3a8a',
      headerText: '#ffffff',
      rowBlue: '#eff6ff',
      rowGrey: '#f1f5f9',
      grid: '#94a3b8',
      gridLight: '#cbd5e1',
      ink: '#0f172a',
      muted: '#64748b',
      white: '#ffffff',
      metaBg: '#dbeafe',
    };

    const margin = 40;
    const pageW = doc.page.width;
    const contentW = pageW - margin * 2;
    const rowH = 22;
    const headerRowH = 24;
    // #, Student ID, Last Name, First Name, Gender, DOB, Type
    const colWidths = [28, 80, 110, 110, 60, 72, 75];
    const tableW = colWidths.reduce((a, b) => a + b, 0);
    const tableX = margin + (contentW - tableW) / 2;
    const pageBottom = () => doc.page.height - 58;

    const formatDob = (dob?: string): string => {
      if (!dob) return '—';
      const d = new Date(dob);
      if (Number.isNaN(d.getTime())) return '—';
      const p = (n: number) => String(n).padStart(2, '0');
      return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
    };

    const typeLabel = (t?: string): string => {
      if (t === 'boarder') return 'Boarder';
      if (t === 'day_scholar') return 'Day Scholar';
      return '—';
    };

    const colX = (index: number) => {
      let x = tableX;
      for (let i = 0; i < index; i++) x += colWidths[i];
      return x;
    };

    const drawPageHeader = () => {
      const bannerH = 56;
      doc.rect(0, 0, pageW, bannerH).fill(CL.headerBg);
      doc.rect(0, bannerH - 3, pageW, 3).fill(CL.primaryLight);

      const logoPath = resolveUploadPath(data.logoUrl);
      let textX = margin;
      if (logoPath) {
        try {
          doc.image(logoPath, margin, 10, { fit: [36, 36], align: 'center', valign: 'center' });
          textX = margin + 46;
        } catch {
          /* skip invalid logo */
        }
      }

      doc.fillColor(CL.white).font('Helvetica-Bold').fontSize(15);
      doc.text(data.schoolName, textX, 14, { width: contentW - (textX - margin), lineBreak: false });
      if (data.tagline) {
        doc.font('Helvetica').fontSize(8.5).fillColor('#bfdbfe');
        doc.text(data.tagline, textX, 32, { width: contentW - (textX - margin), lineBreak: false });
      }

      doc.font('Helvetica-Bold').fontSize(10).fillColor('#dbeafe');
      doc.text('CLASS LIST REPORT', margin, bannerH + 14, { width: contentW, align: 'center' });

      const metaY = bannerH + 32;
      doc.roundedRect(margin, metaY, contentW, 34, 6).fill(CL.metaBg);
      doc.roundedRect(margin, metaY, contentW, 34, 6).strokeColor(CL.gridLight).lineWidth(0.75).stroke();

      doc.fillColor(CL.muted).font('Helvetica').fontSize(7.5);
      doc.text('CLASS', margin + 12, metaY + 7, { lineBreak: false });
      doc.text('TOTAL STUDENTS', margin + contentW / 2 + 6, metaY + 7, { lineBreak: false });
      doc.text('GENERATED', margin + contentW - 120, metaY + 7, { width: 108, align: 'right', lineBreak: false });

      doc.fillColor(CL.ink).font('Helvetica-Bold').fontSize(10);
      doc.text(data.classLabel, margin + 12, metaY + 18, { width: contentW / 2 - 18, lineBreak: false });
      doc.text(String(data.students.length), margin + contentW / 2 + 6, metaY + 18, { lineBreak: false });
      doc.font('Helvetica').fontSize(8.5).fillColor(CL.muted);
      doc.text(formatGeneratedTimestamp(data.generatedAt), margin + contentW - 120, metaY + 18, {
        width: 108,
        align: 'right',
        lineBreak: false,
      });

      doc.y = metaY + 44;
    };

    const drawTableHeader = () => {
      const y = doc.y;
      const headers = ['#', 'Student ID', 'Last Name', 'First Name', 'Gender', 'DOB', 'Type'];

      doc.rect(tableX, y, tableW, headerRowH).fill(CL.primary);
      doc.fillColor(CL.headerText).font('Helvetica-Bold').fontSize(8.5);

      headers.forEach((label, i) => {
        const x = colX(i);
        const w = colWidths[i];
        doc.text(label, x + 5, y + 7, { width: w - 10, lineBreak: false });
        if (i > 0) {
          doc.moveTo(x, y).lineTo(x, y + headerRowH).strokeColor(CL.grid).lineWidth(0.75).stroke();
        }
      });

      doc.rect(tableX, y, tableW, headerRowH).strokeColor(CL.grid).lineWidth(0.85).stroke();
      doc.y = y + headerRowH;
    };

    const drawStudentRow = (index: number, student: (typeof data.students)[0]) => {
      const y = doc.y;
      const bg = index % 2 === 0 ? CL.rowBlue : CL.rowGrey;
      const values = [
        String(index + 1),
        student.admissionNumber,
        student.lastName,
        student.firstName,
        student.gender || '—',
        formatDob(student.dateOfBirth),
        typeLabel(student.studentType),
      ];

      doc.rect(tableX, y, tableW, rowH).fill(bg);
      doc.fillColor(CL.ink).font('Helvetica').fontSize(8.5);

      values.forEach((value, i) => {
        const x = colX(i);
        const w = colWidths[i];
        const isId = i === 1;
        if (isId) doc.font('Helvetica-Bold').fillColor(CL.primaryLight);
        else doc.font('Helvetica').fillColor(CL.ink);
        doc.text(value, x + 5, y + 6, { width: w - 10, lineBreak: false, ellipsis: true });
        if (i > 0) {
          doc.moveTo(x, y).lineTo(x, y + rowH).strokeColor(CL.gridLight).lineWidth(0.6).stroke();
        }
      });

      doc.rect(tableX, y, tableW, rowH).strokeColor(CL.grid).lineWidth(0.75).stroke();
      doc.y = y + rowH;
    };

    drawPageHeader();
    drawTableHeader();

    data.students.forEach((student, index) => {
      if (doc.y + rowH > pageBottom()) {
        doc.addPage();
        drawPageHeader();
        drawTableHeader();
      }
      drawStudentRow(index, student);
    });

    doc.moveDown(0.6);
    doc.fillColor(CL.muted).font('Helvetica').fontSize(7.5);
    doc.text(
      `End of class list · ${data.students.length} student${data.students.length === 1 ? '' : 's'}`,
      margin,
      doc.y,
      { width: contentW, align: 'center' },
    );

    drawGeneratedFooter(doc, data.generatedAt, margin, contentW);
    doc.end();
  });
}

function formatDobDisplay(dob?: string | Date): string {
  if (!dob) return '—';
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function drawHorizontalGradient(
  doc: InstanceType<typeof PDFDocument>,
  x: number,
  y: number,
  w: number,
  h: number,
  leftHex: string,
  rightHex: string,
) {
  const left = hexToRgb(leftHex);
  const right = hexToRgb(rightHex);
  const steps = 48;
  const stepW = w / steps;
  for (let i = 0; i < steps; i++) {
    const t = i / Math.max(steps - 1, 1);
    const r = Math.round(left.r + (right.r - left.r) * t);
    const g = Math.round(left.g + (right.g - left.g) * t);
    const b = Math.round(left.b + (right.b - left.b) * t);
    doc.rect(x + i * stepW, y, stepW + 0.5, h).fill([r, g, b]);
  }
}

function drawBarcodeStrip(
  doc: InstanceType<typeof PDFDocument>,
  x: number,
  y: number,
  w: number,
  h: number,
  payload: string,
) {
  doc.rect(x, y, w, h).fill('#ffffff');
  const seed = payload.split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  const bars = 72;
  const padX = 6;
  const unitW = (w - padX * 2) / bars;
  let bx = x + padX;
  for (let i = 0; i < bars; i++) {
    const wide = ((seed + i * 11) % 7) === 0;
    const on = ((seed * (i + 4) + i * 13) % 5) !== 0;
    if (on) {
      doc.rect(bx, y + 4, unitW * (wide ? 0.92 : 0.48), h - 8).fill('#111827');
    }
    bx += unitW;
  }
}

export async function generateStudentIdCardPdf(data: {
  schoolName: string;
  tagline?: string;
  logoUrl?: string;
  address?: string;
  phone?: string;
  admissionNumber: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: string | Date;
  studentAddress?: string;
  gender?: string;
  studentType?: string;
  className?: string;
  formName?: string;
  generatedAt: Date;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // CR80 standard ID card: 3.375" × 2.125" at 72 pt/in
    const cardW = 243;
    const cardH = 153;
    const radius = 10;
    const barcodeH = 28;
    const mainH = cardH - barcodeH;
    const leftW = Math.round(cardW * 0.35);
    const rightW = cardW - leftW;
    const rightX = leftW;

    const doc = new PDFDocument({ size: [cardW, cardH], margin: 0 });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const schoolName = data.schoolName || 'School Pro Academy';
    const fullName = `${data.firstName} ${data.lastName}`.trim();
    const initials = `${data.firstName.charAt(0) || ''}${data.lastName.charAt(0) || ''}`.toUpperCase();
    const displayAddress = data.studentAddress?.trim() || data.address?.trim() || '—';

    doc.save();
    doc.roundedRect(0, 0, cardW, cardH, radius);
    doc.clip();

    drawHorizontalGradient(doc, 0, 0, cardW, mainH, '#1d4ed8', '#0f172a');
    doc.rect(0, mainH, cardW, barcodeH).fill('#ffffff');

    // Right section — title
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(13);
    doc.text('Student ID Card', rightX + 10, 10, { width: rightW - 16, lineBreak: false });

    // Right section — white detail panel
    const panelX = rightX + 8;
    const panelY = 28;
    const panelW = rightW - 14;
    const panelH = mainH - panelY - 8;
    doc.roundedRect(panelX, panelY, panelW, panelH, 6).fill('#f8fafc');

    const labelX = panelX + 8;
    const valueX = panelX + panelW * 0.42;
    const valueW = panelW - (valueX - panelX) - 8;
    let rowY = panelY + 9;

    const detailRows: [string, string][] = [
      ['Name', fullName],
      ['Student ID', data.admissionNumber],
      ['D.O.B', formatDobDisplay(data.dateOfBirth)],
      ['Address', displayAddress],
    ];

    detailRows.forEach(([label, value]) => {
      doc.fillColor('#64748b').font('Helvetica').fontSize(7);
      doc.text(label, labelX, rowY, { width: valueX - labelX - 4, lineBreak: false });
      doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(7);
      doc.text(value, valueX, rowY, { width: valueW, lineGap: 0.5 });
      rowY += label === 'Address' ? 22 : 17;
    });

    // Left section — school logo + name (bottom-left of left column)
    const logoPath = resolveUploadPath(data.logoUrl);
    const logoSize = 12;
    const brandY = mainH - 22;
    const brandX = 8;
    let nameX = brandX;
    if (logoPath) {
      try {
        doc.image(logoPath, brandX, brandY, { fit: [logoSize, logoSize] });
        nameX = brandX + logoSize + 4;
      } catch {
        /* skip invalid logo */
      }
    }
    doc.fillColor('#ffffff').font('Helvetica').fontSize(6);
    doc.text(schoolName, nameX, brandY + 2, { width: leftW - nameX - 6, lineBreak: false });

    // Circular photo — overlaps top edge
    const photoCx = leftW / 2;
    const photoCy = 22;
    const photoR = 20;
    const photoBorder = 3;
    doc.circle(photoCx, photoCy, photoR + photoBorder).fill('#ffffff');
    doc.circle(photoCx, photoCy, photoR).fill('#94a3b8');
    doc.circle(photoCx, photoCy, photoR - 4).fill('#64748b');
    doc.fillColor('#f8fafc').font('Helvetica-Bold').fontSize(14);
    doc.text(initials || '—', photoCx - photoR, photoCy - 7, { width: photoR * 2, align: 'center', lineBreak: false });

    drawBarcodeStrip(doc, 0, mainH, cardW, barcodeH, data.admissionNumber);

    doc.restore();
    doc.roundedRect(0, 0, cardW, cardH, radius).strokeColor('#cbd5e1').lineWidth(0.5).stroke();

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
      const line =
        `Exam: ${data.examTypeName}    Term: ${data.termName}    Class: ${data.className}    ` +
        `Max Marks: ${data.maxMarks}    Students: ${data.students.length}`;
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
      doc.font('Helvetica').fontSize(7.5).fillColor(MS.muted);
      doc.text(`Generated: ${formatGeneratedTimestamp(data.generatedAt)}`, margin, fy, { width: contentW, align: 'right' });
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
      `Max Marks: ${data.maxMarks}    Students: ${data.students.length}`;
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
    doc.font('Helvetica').fontSize(7.5).fillColor(MS.muted);
    doc.text(`Generated: ${formatGeneratedTimestamp(data.generatedAt)}`, margin, footerY - 4, {
      width: contentW,
      align: 'right',
    });
    doc.restore();

    doc.end();
  });
}

export interface ResultsAnalysisPdfData {
  schoolName: string;
  tagline?: string;
  logoUrl?: string;
  examTypeName: string;
  termName: string;
  className: string;
  maxMarks: number;
  minSubjectsForPass: number;
  generatedAt: Date;
  summary: {
    totalStudents: number;
    studentsWithExamMarks: number;
    studentsPassedOverall: number;
    overallPassRatePercent: number;
  };
  topPerformers: {
    rank: number;
    admissionNumber: string;
    lastName: string;
    firstName: string;
    subjectsPassed: number;
    subjectCount: number;
    averagePercent: number;
  }[];
  bottomPerformers: {
    rank: number;
    admissionNumber: string;
    lastName: string;
    firstName: string;
    subjectsPassed: number;
    subjectCount: number;
    averagePercent: number;
  }[];
}

export async function generateResultsAnalysisPdf(data: ResultsAnalysisPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const margin = 36;
    const doc = new PDFDocument({ margin, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const contentW = pageW - margin * 2;
    const logoPath = resolveUploadPath(data.logoUrl);
    const school = data.schoolName || 'School Pro Academy';
    const pageBottom = () => pageH - margin - 28;

    const drawBanner = () => {
      const bannerH = 72;
      doc.save();
      doc.rect(0, 0, pageW, bannerH).fill(MS.blue);

      if (logoPath) {
        try {
          doc.save();
          doc.circle(margin + 28, 36, 24).fill(MS.white);
          doc.restore();
          doc.image(logoPath, margin + 10, 18, { fit: [36, 36] });
        } catch {
          /* skip */
        }
      }

      const tx = logoPath ? margin + 58 : margin;
      doc.fillColor(MS.white).font('Helvetica-Bold').fontSize(15);
      doc.text(school, tx, 16, { width: contentW - 80, lineBreak: false });
      if (data.tagline) {
        doc.font('Helvetica').fontSize(8.5).fillColor('#dbeafe');
        doc.text(data.tagline, tx, 34, { width: contentW - 80, lineBreak: false });
      }
      doc.font('Helvetica-Bold').fontSize(10.5).fillColor('#bfdbfe');
      doc.text('RESULTS ANALYSIS', tx, data.tagline ? 48 : 38, { width: contentW - 80, lineBreak: false });
      doc.restore();
      return bannerH;
    };

    const drawPerformersTable = (
      title: string,
      hint: string,
      rows: ResultsAnalysisPdfData['topPerformers'],
      startY: number,
    ): number => {
      let y = startY;
      if (y + 60 > pageBottom()) {
        doc.addPage({ size: 'A4', margin });
        y = margin;
      }

      doc.fillColor(MS.ink).font('Helvetica-Bold').fontSize(11);
      doc.text(title, margin, y);
      y += 13;
      doc.fillColor(MS.muted).font('Helvetica').fontSize(8.5);
      doc.text(hint, margin, y, { width: contentW });
      y += 16;

      if (!rows.length) {
        doc.text('No ranked students with marks for this selection.', margin, y);
        return y + 20;
      }

      const headers = ['RANK', 'STUDENT ID', 'NAME', 'SUBJ PASSED', 'AVG %'];
      const buildRow = (s: ResultsAnalysisPdfData['topPerformers'][0]): string[] => [
        String(s.rank),
        s.admissionNumber,
        `${s.lastName}, ${s.firstName}`,
        `${s.subjectsPassed} / ${s.subjectCount}`,
        s.averagePercent.toFixed(2),
      ];

      const mins = [32, 68, 120, 72, 48];
      const widths = headers.map((label, i) => {
        let w = msTextWidth(doc, label, MS_HDR, true) + MS_PAD * 2 + 4;
        for (const row of rows) {
          const cell = buildRow(row)[i];
          w = Math.max(w, msTextWidth(doc, cell, MS_FONT) + MS_PAD * 2 + 6);
        }
        return Math.ceil(Math.max(mins[i] ?? 40, w));
      });

      const colW = msFitWidths(widths, contentW, mins);
      const headerH = 22;
      const rowH = 20;

      const drawTableHeader = () => {
        msDrawRankingsGrid(doc, margin, y, colW, headerH, MS.header);
        for (let i = 0; i < headers.length; i++) {
          const cx = msColX(margin, colW, i);
          const align: 'left' | 'center' | 'right' =
            i === 0 || i === 3 || i === 4 ? 'center' : 'left';
          msDrawRankingsCell(doc, headers[i], cx, y, colW[i], headerH, { header: true, align });
        }
        y += headerH;
      };

      drawTableHeader();

      rows.forEach((row, idx) => {
        if (y + rowH > pageBottom()) {
          doc.addPage({ size: 'A4', margin });
          y = margin;
          drawTableHeader();
        }
        const cells = buildRow(row);
        const fill = idx % 2 === 1 ? '#f8fafc' : MS.white;
        msDrawRankingsGrid(doc, margin, y, colW, rowH, fill);
        for (let i = 0; i < headers.length; i++) {
          const cx = msColX(margin, colW, i);
          const align: 'left' | 'center' | 'right' =
            i === 0 || i === 3 || i === 4 ? 'center' : 'left';
          msDrawRankingsCell(doc, cells[i], cx, y, colW[i], rowH, {
            align,
            posBadge: i === 0,
            bold: i === 4,
          });
        }
        y += rowH;
      });

      return y + 14;
    };

    let y = drawBanner() + 12;

    doc.fillColor(MS.meta).font('Helvetica').fontSize(8.5);
    const meta =
      `Exam: ${data.examTypeName}    Term: ${data.termName}    Class: ${data.className}    Max marks: ${data.maxMarks}`;
    doc.text(meta, margin, y, { width: contentW });
    y += 18;

    doc.roundedRect(margin, y, contentW, 68, 8).stroke(MS.border);
    doc.fillColor(MS.ink).font('Helvetica-Bold').fontSize(10);
    doc.text('Class overall pass rate', margin + 14, y + 12);
    doc.fillColor(MS.blue).font('Helvetica-Bold').fontSize(22);
    doc.text(`${data.summary.overallPassRatePercent.toFixed(1)}%`, margin + 14, y + 28);

    const statX = margin + contentW * 0.42;
    doc.fillColor(MS.muted).font('Helvetica').fontSize(8.5);
    doc.text(`Students in class: ${data.summary.totalStudents}`, statX, y + 14);
    doc.text(`With exam marks: ${data.summary.studentsWithExamMarks}`, statX, y + 28);
    doc.text(
      `Met pass criteria (${data.minSubjectsForPass}+ subjects): ${data.summary.studentsPassedOverall}`,
      statX,
      y + 42,
    );
    doc.text(
      `Pass detail: ${data.summary.studentsPassedOverall} of ${data.summary.totalStudents} students`,
      margin + 14,
      y + 52,
      { width: contentW - 28 },
    );
    y += 82;

    doc.fillColor(MS.muted).font('Helvetica').fontSize(8);
    doc.text(
      `A subject is passed when the mark is greater than 49. Class pass rate counts students with ${data.minSubjectsForPass} or more passed subjects.`,
      margin,
      y,
      { width: contentW, lineGap: 1 },
    );
    y += 24;

    const topN = data.topPerformers.length;
    y = drawPerformersTable(
      `Top ${topN} performers`,
      'Ranked by average % (then subjects passed)',
      data.topPerformers,
      y,
    );
    y = drawPerformersTable(
      `Bottom ${data.bottomPerformers.length} performers`,
      'Lowest average % among students with marks',
      data.bottomPerformers,
      y,
    );

    const footerY = pageH - margin - 6;
    doc.save();
    doc.strokeColor(MS.border).lineWidth(1);
    doc.moveTo(margin, footerY - 10).lineTo(margin + contentW, footerY - 10).stroke();
    doc.fillColor(MS.blue).font('Helvetica').fontSize(8);
    doc.text(`Official Academic Record — ${school}`, margin, footerY - 4, { lineBreak: false });
    doc.font('Helvetica').fontSize(7.5).fillColor(MS.muted);
    doc.text(`Generated: ${formatGeneratedTimestamp(data.generatedAt)}`, margin, footerY - 4, {
      width: contentW,
      align: 'right',
    });
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
    doc.text(`Mode: ${data.detailed ? 'Detailed' : 'Summary'}`, margin, y);
    y += 18;

    const summaryItems: { label: string; value: string; tone?: 'neutral' | 'positive' | 'warn' | 'danger' }[] = [
      { label: 'Students', value: String(data.summary.studentCount), tone: 'neutral' },
      { label: 'Reconciled', value: String(data.summary.reconciled), tone: 'positive' },
      { label: 'Unreconciled', value: String(data.summary.unreconciled), tone: 'danger' },
      { label: 'Pending', value: String(data.summary.pending), tone: 'warn' },
      { label: 'Expected', value: formatMoney(data.summary.totalExpectedRevenue), tone: 'neutral' },
      { label: 'Collected', value: formatMoney(data.summary.totalCollected), tone: 'positive' },
      { label: 'Variance', value: formatMoney(data.summary.totalVariance), tone: 'warn' },
      { label: 'Outstanding', value: formatMoney(data.summary.totalOutstanding), tone: 'danger' },
    ];
    const boxW = contentW / 4 - 6;
    summaryItems.forEach((item, i) => {
      const col = i % 4;
      const row = Math.floor(i / 4);
      const x = margin + col * (boxW + 8);
      const by = y + row * 36;
      const bg =
        item.tone === 'positive' ? '#ecfdf3' :
          item.tone === 'warn' ? '#fff7ed' :
            item.tone === 'danger' ? '#fef2f2' : BILL.rowAlt;
      const border =
        item.tone === 'positive' ? '#86efac' :
          item.tone === 'warn' ? '#fdba74' :
            item.tone === 'danger' ? '#fecaca' : BILL.border;
      const fg =
        item.tone === 'positive' ? '#166534' :
          item.tone === 'warn' ? '#9a3412' :
            item.tone === 'danger' ? '#991b1b' : BILL.ink;
      doc.save();
      doc.roundedRect(x, by, boxW, 28, 6).fillAndStroke(bg, border);
      doc.fillColor(BILL.muted).font('Helvetica').fontSize(7).text(item.label.toUpperCase(), x + 6, by + 5, { width: boxW - 12 });
      doc.fillColor(fg).font('Helvetica-Bold').fontSize(9).text(item.value, x + 6, by + 15, { width: boxW - 12 });
      doc.restore();
    });
    y += 78;

    const cols = data.detailed
      ? [
          { label: 'ID', w: 72 },
          { label: 'Student', w: 148 },
          { label: 'Class', w: 96 },
          { label: 'Status', w: 88 },
          { label: 'Billed', w: 74, align: 'right' as const },
          { label: 'Collected', w: 74, align: 'right' as const },
          { label: 'Closing', w: 74, align: 'right' as const },
          { label: 'Outstanding', w: 80, align: 'right' as const },
          { label: 'Variance', w: 63, align: 'right' as const },
        ]
      : [
          { label: 'ID', w: 74 },
          { label: 'Student', w: 170 },
          { label: 'Class', w: 100 },
          { label: 'Status', w: 90 },
          { label: 'Billed', w: 82, align: 'right' as const },
          { label: 'Collected', w: 82, align: 'right' as const },
          { label: 'Closing', w: 82, align: 'right' as const },
          { label: 'Outstanding', w: 89, align: 'right' as const },
        ];
    const tableW = cols.reduce((sum, c) => sum + c.w, 0);

    const drawHeader = () => {
      let x = margin;
      doc.save();
      doc.roundedRect(margin, y, tableW, 16, 4).fill(BILL.primary);
      doc.fillColor(BILL.white).font('Helvetica-Bold').fontSize(8);
      for (const c of cols) {
        doc.text(c.label, x + 4, y + 4, { width: c.w - 8, align: c.align || 'left', lineBreak: false });
        x += c.w;
      }
      doc.restore();
      y += 18;
    };

    drawHeader();
    let rowIndex = 0;
    for (const row of data.rows) {
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

      // Measure row height from wrapped cell content to avoid clipping/truncation.
      doc.font('Helvetica').fontSize(8);
      let contentH = 0;
      for (let i = 0; i < cols.length; i++) {
        if (cols[i].label === 'Status') continue;
        const cellHeight = doc.heightOfString(String(values[i]), {
          width: Math.max(8, cols[i].w - 8),
          align: cols[i].align || 'left',
        });
        contentH = Math.max(contentH, cellHeight);
      }
      const baseRowH = Math.max(14, Math.ceil(contentH) + 4);
      const noteH = data.detailed && row.discrepancies.length
        ? Math.max(
          12,
          Math.ceil(
            doc.heightOfString(`Note: ${row.discrepancies.join(' · ')}`, {
              width: contentW - 8,
            }),
          ) + 2,
        )
        : 0;
      const totalRowBlockH = baseRowH + noteH;

      if (y + totalRowBlockH > doc.page.height - 60) {
        doc.addPage({ size: 'A4', layout: 'landscape', margin });
        y = margin;
        drawHeader();
      }

      let x = margin;
      const rowY = y;
      doc.fillColor(BILL.ink).font('Helvetica').fontSize(8);
      if (rowIndex % 2 === 1) {
        doc.save();
        doc.rect(margin, rowY - 1, tableW, baseRowH + 1).fill('#f8fafc');
        doc.restore();
      }
      for (let i = 0; i < cols.length; i++) {
        if (cols[i].label === 'Status') {
          const statusText = String(values[i] || '').toUpperCase();
          const statusBg =
            statusText === 'RECONCILED' ? '#dcfce7' :
              statusText === 'UNRECONCILED' ? '#fee2e2' : '#fef3c7';
          const statusFg =
            statusText === 'RECONCILED' ? '#166534' :
              statusText === 'UNRECONCILED' ? '#991b1b' : '#92400e';
          const pillW = Math.min(cols[i].w - 10, Math.max(34, doc.widthOfString(statusText) + 12));
          doc.save();
          doc.roundedRect(x + 4, y + Math.max(1, Math.floor((baseRowH - 11) / 2)), pillW, 11, 5).fill(statusBg);
          doc.restore();
          doc.fillColor(statusFg).font('Helvetica-Bold').fontSize(6.8).text(statusText, x + 9, y + Math.max(3, Math.floor((baseRowH - 7) / 2)), {
            width: pillW - 10,
            align: 'center',
            lineBreak: false,
          });
          doc.fillColor(BILL.ink).font('Helvetica').fontSize(8);
        } else {
          doc.text(String(values[i]), x + 4, y + 2, { width: cols[i].w - 8, align: cols[i].align || 'left' });
        }
        x += cols[i].w;
      }
      y += baseRowH;
      rowIndex += 1;
      if (data.detailed && row.discrepancies.length) {
        doc.fillColor('#b45309').font('Helvetica').fontSize(7);
        doc.text(`Note: ${row.discrepancies.join(' · ')}`, margin + 4, y, { width: tableW - 8 });
        y += noteH;
      }
    }

    drawGeneratedFooter(doc, new Date(data.generatedAt), margin, contentW);
    doc.end();
  });
}

