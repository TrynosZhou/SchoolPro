"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureUploadDirs = ensureUploadDirs;
exports.generateReceiptPdf = generateReceiptPdf;
exports.generateInvoicePdf = generateInvoicePdf;
exports.generateReportCardPdf = generateReportCardPdf;
exports.generateClassListPdf = generateClassListPdf;
exports.generateMarkSheetPdf = generateMarkSheetPdf;
exports.generateRankingsPdf = generateRankingsPdf;
exports.generateReconciliationPdf = generateReconciliationPdf;
const pdfkit_1 = __importDefault(require("pdfkit"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const qrcode_1 = __importDefault(require("qrcode"));
const subject_abbrev_1 = require("./subject-abbrev");
const grade_boundaries_1 = require("../types/grade-boundaries");
const receiptsDir = path_1.default.join(process.cwd(), 'uploads', 'receipts');
const invoicesDir = path_1.default.join(process.cwd(), 'uploads', 'invoices');
const logosDir = path_1.default.join(process.cwd(), 'uploads', 'logos');
function ensureUploadDirs() {
    fs_1.default.mkdirSync(receiptsDir, { recursive: true });
    fs_1.default.mkdirSync(invoicesDir, { recursive: true });
    fs_1.default.mkdirSync(logosDir, { recursive: true });
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
function formatMoney(amount, currency = 'USD') {
    if (currency === 'USD')
        return `$${amount.toFixed(2)}`;
    return `${currency} ${amount.toFixed(2)}`;
}
function drawBillingDocHeader(doc, branding, pageW, margin, docTitle) {
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
        }
        catch {
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
function drawBillingContactFooter(doc, branding, margin, contentW, y) {
    const parts = [];
    if (branding.address)
        parts.push(branding.address);
    if (branding.phone)
        parts.push(`Tel: ${branding.phone}`);
    if (branding.email)
        parts.push(branding.email);
    if (!parts.length)
        return;
    doc.fillColor(BILL.muted).font('Helvetica').fontSize(8);
    doc.text(parts.join('  ·  '), margin, y, { width: contentW, align: 'center', lineBreak: false });
}
function drawGeneratedFooter(doc, generatedAt, margin, contentW) {
    const width = contentW ?? doc.page.width - margin * 2;
    const y = doc.page.height - margin - 10;
    doc.font('Helvetica').fontSize(7.5).fillColor('#64748b');
    doc.text(`Generated: ${formatGeneratedTimestamp(generatedAt)}`, margin, y, { width, align: 'center' });
}
function pad2(n) {
    return String(n).padStart(2, '0');
}
function formatGeneratedTimestamp(date) {
    return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}, ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}
function resolveUploadPath(publicUrl) {
    if (!publicUrl)
        return null;
    const relative = publicUrl.replace(/^\/+/, '');
    const full = path_1.default.join(process.cwd(), relative);
    return fs_1.default.existsSync(full) ? full : null;
}
function formatSubjectLabel(r) {
    const name = (r.subjectName || r.subject.split(' — ')[0] || r.subject).trim();
    const code = r.subjectCode?.trim();
    return code ? `${name} (${code})` : name;
}
function formatReceiptClassLabel(raw) {
    const cls = String(raw || '').trim();
    if (!cls || cls === 'N/A')
        return '—';
    if (/^class\s+/i.test(cls))
        return cls.replace(/\s+/g, ' ').trim();
    return `Class ${cls.replace(/\s+/g, '')}`;
}
function formatPaymentMethod(method) {
    const map = {
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
function drawPaidWatermark(doc, pageW, pageH) {
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
function drawReceiptLabelValue(doc, label, value, x, y, opts) {
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
    }
    else {
        doc.font('Helvetica');
    }
    doc.fillColor(BILL.ink).fontSize(valueSize);
    doc.text(value, x, valueY, { width, lineBreak: false });
    return valueY + doc.heightOfString(value, { width });
}
function drawStatusPill(doc, x, y, label, tone = 'paid') {
    const styles = {
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
function invoiceStatusTone(status) {
    const s = String(status || '').toLowerCase();
    if (s === 'paid')
        return 'paid';
    if (s === 'partial')
        return 'partial';
    if (s === 'overdue')
        return 'overdue';
    if (s === 'sent')
        return 'sent';
    return 'pending';
}
function formatFeeTypeLabel(feeType) {
    const raw = String(feeType || '').trim();
    if (!raw)
        return '—';
    return raw
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
}
function formatInvoiceDate(d) {
    if (!d)
        return '—';
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime()))
        return d;
    return `${pad2(dt.getDate())}/${pad2(dt.getMonth() + 1)}/${dt.getFullYear()}`;
}
function drawInvoiceWatermark(doc, pageW, pageH, status) {
    const s = String(status || '').toLowerCase();
    let label = '';
    let color = '#4f46e5';
    if (s === 'paid') {
        label = 'PAID';
        color = '#059669';
    }
    else if (s === 'overdue') {
        label = 'OVERDUE';
        color = '#dc2626';
    }
    else if (s === 'partial') {
        label = 'PARTIAL';
        color = '#d97706';
    }
    else {
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
async function generateReceiptPdf(data) {
    ensureUploadDirs();
    const filename = `${data.receiptNumber}.pdf`;
    const filepath = path_1.default.join(receiptsDir, filename);
    const currency = data.currency || 'USD';
    const school = data.schoolName || 'School Pro Academy';
    const verifyPayload = JSON.stringify({
        receipt: data.receiptNumber,
        student: data.admissionNumber,
        amount: Number(data.amount.toFixed(2)),
        date: data.paidAt.toISOString(),
        school,
    });
    const qrBuffer = await qrcode_1.default.toBuffer(verifyPayload, { margin: 1, width: 220, errorCorrectionLevel: 'M' });
    return new Promise((resolve, reject) => {
        const margin = 50;
        const doc = new pdfkit_1.default({ margin, size: 'A4' });
        const stream = fs_1.default.createWriteStream(filepath);
        doc.pipe(stream);
        const pageW = doc.page.width;
        const pageH = doc.page.height;
        const contentW = pageW - margin * 2;
        drawPaidWatermark(doc, pageW, pageH);
        let y = drawBillingDocHeader(doc, data, pageW, margin, 'OFFICIAL PAYMENT RECEIPT');
        const metaTop = y;
        const qrSize = 72;
        const metaW = contentW - qrSize - 16;
        const metaX = margin + 16;
        const col2X = margin + metaW / 2 + 4;
        const fieldW = metaW / 2 - 24;
        const estimateLabelValueHeight = (label, value, valueSize = RECEIPT_LABEL.valueSize) => {
            doc.font('Helvetica').fontSize(RECEIPT_LABEL.labelSize);
            const labelH = doc.heightOfString(label, { width: fieldW });
            doc.font('Helvetica-Bold').fontSize(valueSize);
            const valueH = doc.heightOfString(value, { width: fieldW });
            return labelH + RECEIPT_LABEL.gap + valueH;
        };
        let metaY = metaTop + 14;
        let metaContentBottom = metaTop + 14;
        metaY += 34; // status pill
        const row1H = Math.max(estimateLabelValueHeight('RECEIPT NO.', data.receiptNumber), estimateLabelValueHeight('DATE & TIME', formatGeneratedTimestamp(data.paidAt)));
        const row1Bottom = metaY + row1H;
        metaContentBottom = Math.max(metaContentBottom, row1Bottom);
        metaY = row1Bottom + 12;
        if (data.paymentReference || data.invoiceNumber) {
            let row2H = 0;
            if (data.paymentReference) {
                row2H = Math.max(row2H, estimateLabelValueHeight('PAYMENT REF.', data.paymentReference, RECEIPT_LABEL.valueSizeSm));
            }
            if (data.invoiceNumber) {
                row2H = Math.max(row2H, estimateLabelValueHeight('INVOICE NO.', data.invoiceNumber, RECEIPT_LABEL.valueSizeSm));
            }
            metaContentBottom = Math.max(metaContentBottom, metaY + row2H);
        }
        const metaH = Math.max(108, metaContentBottom - metaTop + 14);
        doc.save();
        doc.roundedRect(margin, metaTop, metaW, metaH, 8).fill('#f8fafc');
        doc.strokeColor(BILL.border).lineWidth(0.75);
        doc.roundedRect(margin, metaTop, metaW, metaH, 8).stroke();
        doc.restore();
        const qrX = margin + metaW + 16;
        doc.save();
        doc.roundedRect(qrX, metaTop, qrSize, metaH, 8).fill(BILL.white);
        doc.strokeColor(BILL.border).lineWidth(0.75);
        doc.roundedRect(qrX, metaTop, qrSize, metaH, 8).stroke();
        doc.restore();
        metaY = metaTop + 14;
        drawStatusPill(doc, metaX, metaY, 'PAID IN FULL', 'paid');
        metaY += 34;
        const row1DrawnBottom = Math.max(drawReceiptLabelValue(doc, 'RECEIPT NO.', data.receiptNumber, metaX, metaY, { width: fieldW }), drawReceiptLabelValue(doc, 'DATE & TIME', formatGeneratedTimestamp(data.paidAt), col2X, metaY, {
            width: fieldW,
        }));
        metaContentBottom = Math.max(metaContentBottom, row1DrawnBottom);
        metaY = row1DrawnBottom + 12;
        if (data.paymentReference || data.invoiceNumber) {
            let row2Bottom = metaY;
            if (data.paymentReference) {
                row2Bottom = Math.max(row2Bottom, drawReceiptLabelValue(doc, 'PAYMENT REF.', data.paymentReference, metaX, metaY, {
                    width: fieldW,
                    valueSize: RECEIPT_LABEL.valueSizeSm,
                }));
            }
            if (data.invoiceNumber) {
                row2Bottom = Math.max(row2Bottom, drawReceiptLabelValue(doc, 'INVOICE NO.', data.invoiceNumber, col2X, metaY, {
                    width: fieldW,
                    valueSize: RECEIPT_LABEL.valueSizeSm,
                }));
            }
            metaContentBottom = Math.max(metaContentBottom, row2Bottom);
        }
        try {
            doc.image(qrBuffer, qrX + 8, metaTop + 8, { fit: [qrSize - 16, qrSize - 28] });
        }
        catch {
            /* skip invalid qr */
        }
        doc.fillColor(BILL.muted).font('Helvetica').fontSize(6.5);
        doc.text('Scan to verify', qrX, metaTop + metaH - 14, { width: qrSize, align: 'center', lineBreak: false });
        y = metaContentBottom + 22;
        doc.font('Helvetica-Bold').fontSize(10).fillColor(BILL.ink).text('RECEIVED FROM', margin, y, {
            characterSpacing: 0.5,
        });
        y += 20;
        const studentCardPad = 16;
        const studentFieldW = contentW / 2 - studentCardPad - 8;
        const studentCardH = 78;
        doc.save();
        doc.roundedRect(margin, y, contentW, studentCardH, 8).fill(BILL.white);
        doc.strokeColor(BILL.border).lineWidth(0.75);
        doc.roundedRect(margin, y, contentW, studentCardH, 8).stroke();
        doc.restore();
        const sY = y + studentCardPad;
        drawReceiptLabelValue(doc, 'STUDENT NAME', data.studentName, margin + studentCardPad, sY, {
            width: studentFieldW,
        });
        drawReceiptLabelValue(doc, 'STUDENT ID', data.admissionNumber, margin + contentW / 2 + 8, sY, {
            width: studentFieldW,
        });
        drawReceiptLabelValue(doc, 'CLASS', formatReceiptClassLabel(data.className), margin + studentCardPad, sY + 38, { width: contentW - studentCardPad * 2 });
        y += studentCardH + 20;
        const tableHeaderH = 22;
        const rowH = 24;
        doc.save();
        doc.rect(margin, y, contentW, tableHeaderH).fill(BILL.primary);
        doc.fillColor(BILL.white).font('Helvetica-Bold').fontSize(8);
        doc.text('DESCRIPTION', margin + 10, y + 7);
        doc.text('QTY', margin + contentW * 0.58, y + 7, { width: 40, align: 'center' });
        doc.text('UNIT PRICE', margin + contentW * 0.68, y + 7, { width: 72, align: 'right' });
        doc.text('AMOUNT', margin + contentW * 0.82, y + 7, { width: contentW * 0.16 - 10, align: 'right' });
        doc.restore();
        y += tableHeaderH;
        doc.save();
        doc.rect(margin, y, contentW, rowH).fill(BILL.rowAlt);
        doc.restore();
        doc.strokeColor(BILL.border).lineWidth(0.5);
        doc.moveTo(margin, y + rowH).lineTo(margin + contentW, y + rowH).stroke();
        doc.fillColor(BILL.ink).font('Helvetica').fontSize(9);
        doc.text(data.label, margin + 10, y + 7, { width: contentW * 0.55 - 12, lineBreak: false });
        doc.text('1', margin + contentW * 0.58, y + 7, { width: 40, align: 'center' });
        doc.text(formatMoney(data.amount, currency), margin + contentW * 0.68, y + 7, {
            width: 72,
            align: 'right',
        });
        doc.font('Helvetica-Bold');
        doc.text(formatMoney(data.amount, currency), margin + contentW * 0.82, y + 7, {
            width: contentW * 0.16 - 10,
            align: 'right',
        });
        y += rowH + 2;
        doc.save();
        doc.rect(margin, y, contentW, rowH).fill('#f1f5f9');
        doc.restore();
        doc.fillColor(BILL.muted).font('Helvetica').fontSize(9);
        doc.text('Payment method', margin + 10, y + 7);
        doc.fillColor(BILL.ink).font('Helvetica-Bold').fontSize(9);
        doc.text(formatPaymentMethod(data.method), margin + contentW * 0.58, y + 7, {
            width: contentW * 0.4,
            align: 'right',
        });
        y += rowH + 14;
        const totalBoxH = 58;
        doc.save();
        doc.roundedRect(margin, y, contentW, totalBoxH, 8).fill('#eef2ff');
        doc.strokeColor(BILL.primary).lineWidth(1);
        doc.roundedRect(margin, y, contentW, totalBoxH, 8).stroke();
        doc.restore();
        doc.fillColor(BILL.muted).font('Helvetica').fontSize(9);
        doc.text('TOTAL AMOUNT PAID', margin + 16, y + 10, { characterSpacing: RECEIPT_LABEL.tracking });
        doc.fillColor(BILL.primary).font('Helvetica-Bold').fontSize(22);
        doc.text(formatMoney(data.amount, currency), margin + 16, y + 28, {
            width: contentW - 32,
            align: 'right',
        });
        y += totalBoxH + 18;
        if (data.notes?.trim()) {
            y = drawReceiptLabelValue(doc, 'NOTES', data.notes.trim(), margin, y, {
                width: contentW,
                valueBold: false,
                valueSize: RECEIPT_LABEL.valueSizeSm,
                gap: 12,
            }) + 10;
        }
        const sigY = y;
        const sigW = (contentW - 24) / 2;
        const drawSigLine = (title, x) => {
            doc.fillColor(BILL.muted).font('Helvetica').fontSize(8).text(title, x, sigY);
            doc.strokeColor(BILL.border).lineWidth(0.75);
            doc.moveTo(x, sigY + 36).lineTo(x + sigW, sigY + 36).stroke();
            doc.fillColor(BILL.muted).font('Helvetica').fontSize(7).text('Signature', x, sigY + 40);
        };
        drawSigLine('Received by (Finance Office)', margin);
        drawSigLine('Authorized signatory', margin + sigW + 24);
        y = sigY + 58;
        doc.fillColor(BILL.ink).font('Helvetica').fontSize(9);
        doc.text('Thank you for your payment. Please retain this receipt for your records. For queries, contact the school finance office.', margin, y, { width: contentW, align: 'center' });
        y += 28;
        drawBillingContactFooter(doc, data, margin, contentW, y);
        y += 16;
        doc.fillColor(BILL.muted).font('Helvetica').fontSize(7.5);
        doc.text('This is a computer-generated receipt and is valid without a physical signature when verified by QR code or receipt number.', margin, y, { width: contentW, align: 'center' });
        drawGeneratedFooter(doc, data.paidAt, margin, contentW);
        doc.end();
        stream.on('finish', () => resolve(filepath));
        stream.on('error', reject);
    });
}
async function generateInvoicePdf(data) {
    ensureUploadDirs();
    const filename = `${data.invoiceNumber}.pdf`;
    const filepath = path_1.default.join(invoicesDir, filename);
    const currency = data.currency || 'USD';
    const balance = Math.max(0, data.totalAmount - data.amountPaid);
    const school = data.schoolName || 'School Pro Academy';
    const statusTone = invoiceStatusTone(data.status);
    const statusLabel = String(data.status || 'sent').toUpperCase();
    const verifyPayload = JSON.stringify({
        invoice: data.invoiceNumber,
        student: data.admissionNumber,
        total: Number(data.totalAmount.toFixed(2)),
        balance: Number(balance.toFixed(2)),
        due: data.dueDate,
        school,
    });
    const qrBuffer = await qrcode_1.default.toBuffer(verifyPayload, { margin: 1, width: 220, errorCorrectionLevel: 'M' });
    return new Promise((resolve, reject) => {
        const margin = 50;
        const doc = new pdfkit_1.default({ margin, size: 'A4' });
        const stream = fs_1.default.createWriteStream(filepath);
        doc.pipe(stream);
        const pageW = doc.page.width;
        const pageH = doc.page.height;
        const contentW = pageW - margin * 2;
        const pageBottom = () => doc.page.height - margin - 24;
        drawInvoiceWatermark(doc, pageW, pageH, data.status);
        let y = drawBillingDocHeader(doc, data, pageW, margin, 'STUDENT FEE INVOICE');
        const qrSize = 72;
        const metaW = contentW - qrSize - 16;
        const metaTop = y;
        const metaX = margin + 16;
        const col2X = margin + metaW / 2 + 4;
        const fieldW = metaW / 2 - 24;
        const estimateLabelValueHeight = (label, value, valueSize = RECEIPT_LABEL.valueSize) => {
            doc.font('Helvetica').fontSize(RECEIPT_LABEL.labelSize);
            const labelH = doc.heightOfString(label, { width: fieldW });
            doc.font('Helvetica-Bold').fontSize(valueSize);
            const valueH = doc.heightOfString(value, { width: fieldW });
            return labelH + RECEIPT_LABEL.gap + valueH;
        };
        let metaY = metaTop + 14;
        let metaContentBottom = metaTop + 14;
        drawStatusPill(doc, metaX, metaY, statusLabel, statusTone);
        metaY += 34;
        const row1H = Math.max(estimateLabelValueHeight('INVOICE NO.', data.invoiceNumber), estimateLabelValueHeight('ISSUED', formatInvoiceDate(data.issuedDate)));
        const row1Bottom = metaY + row1H;
        metaContentBottom = Math.max(metaContentBottom, row1Bottom);
        metaY = row1Bottom + 12;
        let row2H = Math.max(estimateLabelValueHeight('DUE DATE', formatInvoiceDate(data.dueDate), RECEIPT_LABEL.valueSizeSm), data.termName
            ? estimateLabelValueHeight('TERM', data.termName, RECEIPT_LABEL.valueSizeSm)
            : 0);
        metaContentBottom = Math.max(metaContentBottom, metaY + row2H);
        const metaH = Math.max(100, metaContentBottom - metaTop + 14);
        doc.save();
        doc.roundedRect(margin, metaTop, metaW, metaH, 8).fill('#f8fafc');
        doc.strokeColor(BILL.border).lineWidth(0.75);
        doc.roundedRect(margin, metaTop, metaW, metaH, 8).stroke();
        doc.restore();
        const qrX = margin + metaW + 16;
        doc.save();
        doc.roundedRect(qrX, metaTop, qrSize, metaH, 8).fill(BILL.white);
        doc.strokeColor(BILL.border).lineWidth(0.75);
        doc.roundedRect(qrX, metaTop, qrSize, metaH, 8).stroke();
        doc.restore();
        metaY = metaTop + 14;
        drawStatusPill(doc, metaX, metaY, statusLabel, statusTone);
        metaY += 34;
        const row1DrawnBottom = Math.max(drawReceiptLabelValue(doc, 'INVOICE NO.', data.invoiceNumber, metaX, metaY, { width: fieldW }), drawReceiptLabelValue(doc, 'ISSUED', formatInvoiceDate(data.issuedDate), col2X, metaY, { width: fieldW }));
        metaContentBottom = Math.max(metaContentBottom, row1DrawnBottom);
        metaY = row1DrawnBottom + 12;
        let row2Bottom = metaY;
        row2Bottom = Math.max(row2Bottom, drawReceiptLabelValue(doc, 'DUE DATE', formatInvoiceDate(data.dueDate), metaX, metaY, {
            width: fieldW,
            valueSize: RECEIPT_LABEL.valueSizeSm,
        }));
        if (data.termName) {
            row2Bottom = Math.max(row2Bottom, drawReceiptLabelValue(doc, 'TERM', data.termName, col2X, metaY, {
                width: fieldW,
                valueSize: RECEIPT_LABEL.valueSizeSm,
            }));
        }
        metaContentBottom = Math.max(metaContentBottom, row2Bottom);
        try {
            doc.image(qrBuffer, qrX + 8, metaTop + 8, { fit: [qrSize - 16, qrSize - 28] });
        }
        catch {
            /* skip invalid qr */
        }
        doc.fillColor(BILL.muted).font('Helvetica').fontSize(6.5);
        doc.text('Scan to verify', qrX, metaTop + metaH - 14, { width: qrSize, align: 'center', lineBreak: false });
        y = metaContentBottom + 18;
        const gap = 8;
        const cardW = (contentW - gap * 2) / 3;
        const drawSummaryCard = (x, label, value, tone = 'neutral') => {
            const bg = tone === 'positive' ? '#ecfdf3' : tone === 'warn' ? '#fff7ed' : tone === 'danger' ? '#fef2f2' : '#eff6ff';
            const border = tone === 'positive' ? '#86efac' : tone === 'warn' ? '#fdba74' : tone === 'danger' ? '#fecaca' : '#bfdbfe';
            const fg = tone === 'positive' ? '#166534' : tone === 'warn' ? '#9a3412' : tone === 'danger' ? '#991b1b' : '#1d4ed8';
            doc.save();
            doc.roundedRect(x, y, cardW, 42, 7).fillAndStroke(bg, border);
            doc.restore();
            doc.font('Helvetica').fontSize(7.5).fillColor(BILL.muted).text(label.toUpperCase(), x + 9, y + 8, {
                width: cardW - 18,
            });
            doc.font('Helvetica-Bold').fontSize(11).fillColor(fg).text(value, x + 9, y + 21, { width: cardW - 18 });
        };
        drawSummaryCard(margin, 'Invoice Total', formatMoney(data.totalAmount, currency), 'neutral');
        drawSummaryCard(margin + cardW + gap, 'Amount Paid', formatMoney(data.amountPaid, currency), 'positive');
        drawSummaryCard(margin + (cardW + gap) * 2, 'Balance Due', formatMoney(balance, currency), balance > 0 ? (statusTone === 'overdue' ? 'danger' : 'warn') : 'positive');
        y += 52;
        doc.font('Helvetica-Bold').fontSize(10).fillColor(BILL.ink).text('BILL TO', margin, y, {
            characterSpacing: 0.5,
        });
        y += 20;
        const billPad = 16;
        const billFieldW = contentW / 2 - billPad - 8;
        const studentCardH = 78;
        doc.save();
        doc.roundedRect(margin, y, contentW, studentCardH, 8).fill(BILL.white);
        doc.strokeColor(BILL.border).lineWidth(0.75);
        doc.roundedRect(margin, y, contentW, studentCardH, 8).stroke();
        doc.restore();
        const bY = y + billPad;
        drawReceiptLabelValue(doc, 'STUDENT NAME', data.studentName, margin + billPad, bY, { width: billFieldW });
        drawReceiptLabelValue(doc, 'STUDENT ID', data.admissionNumber, margin + contentW / 2 + 8, bY, {
            width: billFieldW,
        });
        drawReceiptLabelValue(doc, 'CLASS', formatReceiptClassLabel(data.className), margin + billPad, bY + 38, {
            width: billFieldW,
        });
        drawReceiptLabelValue(doc, 'FEE TYPE', formatFeeTypeLabel(data.feeType), margin + contentW / 2 + 8, bY + 38, {
            width: billFieldW,
        });
        y += studentCardH + 18;
        if (data.description?.trim()) {
            y =
                drawReceiptLabelValue(doc, 'DESCRIPTION', data.description.trim(), margin, y, {
                    width: contentW,
                    valueBold: false,
                    valueSize: RECEIPT_LABEL.valueSizeSm,
                }) + 12;
        }
        doc.font('Helvetica-Bold').fontSize(10).fillColor(BILL.ink).text('LINE ITEMS', margin, y, {
            characterSpacing: 0.5,
        });
        y += 16;
        const colWeights = [0.46, 0.1, 0.2, 0.24];
        const cols = colWeights.map((w) => ({ w: Math.floor(contentW * w) }));
        const tableW = cols.reduce((s, c) => s + c.w, 0);
        const used = cols.reduce((s, c) => s + c.w, 0);
        cols[cols.length - 1].w += contentW - used;
        const colHeaders = ['DESCRIPTION', 'QTY', 'UNIT PRICE', 'AMOUNT'];
        const colAligns = ['left', 'center', 'right', 'right'];
        const drawTableHeader = () => {
            doc.save();
            doc.roundedRect(margin, y, tableW, 20, 5).fill(BILL.primary);
            doc.restore();
            let x = margin;
            doc.font('Helvetica-Bold').fontSize(8).fillColor(BILL.white);
            colHeaders.forEach((label, i) => {
                doc.text(label, x + 6, y + 6, { width: cols[i].w - 12, align: colAligns[i], lineBreak: false });
                x += cols[i].w;
            });
            y += 22;
        };
        drawTableHeader();
        const lines = data.lines?.length > 0
            ? data.lines
            : [{ description: data.description, quantity: 1, unitPrice: data.totalAmount, amount: data.totalAmount }];
        let rowIndex = 0;
        lines.forEach((line) => {
            const vals = [
                line.description || '—',
                String(line.quantity),
                formatMoney(Number(line.unitPrice), currency),
                formatMoney(Number(line.amount), currency),
            ];
            doc.font('Helvetica').fontSize(9);
            let rowH = 0;
            for (let i = 0; i < cols.length; i++) {
                rowH = Math.max(rowH, doc.heightOfString(vals[i], { width: cols[i].w - 12, align: colAligns[i] }));
            }
            rowH = Math.max(20, Math.ceil(rowH) + 8);
            if (y + rowH > pageBottom()) {
                doc.addPage({ size: 'A4', margin });
                y = margin;
                drawTableHeader();
            }
            if (rowIndex % 2 === 1) {
                doc.save();
                doc.rect(margin, y, tableW, rowH).fill(BILL.rowAlt);
                doc.restore();
            }
            doc.fillColor(BILL.ink).font('Helvetica').fontSize(9);
            let x = margin;
            for (let i = 0; i < cols.length; i++) {
                if (i === cols.length - 1)
                    doc.font('Helvetica-Bold');
                doc.text(vals[i], x + 6, y + 4, { width: cols[i].w - 12, align: colAligns[i] });
                if (i === cols.length - 1)
                    doc.font('Helvetica');
                x += cols[i].w;
            }
            y += rowH;
            rowIndex += 1;
        });
        y += 14;
        const summaryBoxW = 220;
        const summaryX = margin + contentW - summaryBoxW;
        const summaryRows = [
            { label: 'Subtotal', value: formatMoney(data.totalAmount, currency), bold: false },
            { label: 'Paid', value: formatMoney(data.amountPaid, currency), bold: false },
            { label: 'Balance Due', value: formatMoney(balance, currency), bold: true },
        ];
        const boxH = 14 + summaryRows.length * 18 + 12;
        doc.save();
        doc.roundedRect(summaryX, y, summaryBoxW, boxH, 8).fill('#f8fafc');
        doc.strokeColor(BILL.border).lineWidth(0.75);
        doc.roundedRect(summaryX, y, summaryBoxW, boxH, 8).stroke();
        doc.restore();
        let sy = y + 12;
        summaryRows.forEach((row) => {
            if (row.bold)
                doc.font('Helvetica-Bold').fontSize(11).fillColor(BILL.primary);
            else
                doc.font('Helvetica').fontSize(10).fillColor(BILL.ink);
            doc.text(row.label, summaryX + 12, sy, { width: 90 });
            doc.text(row.value, summaryX + 110, sy, { width: summaryBoxW - 122, align: 'right' });
            sy += 18;
        });
        y += boxH + 18;
        const payBoxH = 48;
        doc.save();
        doc.roundedRect(margin, y, contentW, payBoxH, 8).fill('#eef2ff');
        doc.strokeColor(BILL.primary).lineWidth(0.75);
        doc.roundedRect(margin, y, contentW, payBoxH, 8).stroke();
        doc.restore();
        doc.fillColor(BILL.primary).font('Helvetica-Bold').fontSize(9).text('PAYMENT INSTRUCTIONS', margin + 14, y + 10);
        doc.fillColor(BILL.ink).font('Helvetica').fontSize(9);
        doc.text(`Please settle the balance of ${formatMoney(balance, currency)} by ${formatInvoiceDate(data.dueDate)}. ` +
            'Payments may be made at the finance office (cash, bank transfer, EcoCash, OneMoney, or InnBucks). ' +
            'Quote invoice number when paying.', margin + 14, y + 24, { width: contentW - 28 });
        y += payBoxH + 16;
        doc.fillColor(BILL.muted).font('Helvetica').fontSize(8);
        doc.text('This is a computer-generated tax invoice. Retain for your records. Verify authenticity using the QR code or invoice number.', margin, y, { width: contentW, align: 'center' });
        y += 22;
        drawBillingContactFooter(doc, data, margin, contentW, y);
        y += 14;
        drawGeneratedFooter(doc, new Date(), margin, contentW);
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
function positionSuffix(n) {
    if (n === 1)
        return '1st';
    if (n === 2)
        return '2nd';
    if (n === 3)
        return '3rd';
    return `${n}th`;
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
function formatClassMean(mean) {
    if (mean == null || String(mean).trim() === '')
        return '—';
    const n = Number(mean);
    return Number.isFinite(n) ? n.toFixed(1) : String(mean);
}
function formatPositionOutOf(position, total) {
    if (!position || !total)
        return '—';
    return `${position} Out Of ${total}`;
}
function formatSubjectsPassed(passed, total) {
    if (passed == null || !total)
        return '—';
    return `${passed} Out Of ${total}`;
}
async function generateReportCardPdf(data) {
    const generated = data.generatedAt || new Date();
    const verifyPayload = JSON.stringify({
        type: 'report-card',
        student: data.admissionNumber,
        term: data.termName,
        exam: data.examTypeName || '',
        average: data.averageMark ?? null,
        classPosition: data.classPosition ?? null,
        issued: generated.toISOString(),
        school: data.schoolName || 'School Pro Academy',
        id: data.reportCardId || '',
    });
    const qrBuffer = await qrcode_1.default.toBuffer(verifyPayload, {
        margin: 1,
        width: 160,
        errorCorrectionLevel: 'M',
    });
    const gradeLegend = (data.gradeBoundaries?.length ? data.gradeBoundaries : grade_boundaries_1.DEFAULT_GRADE_BOUNDARIES)
        .slice()
        .sort((a, b) => b.minPercent - a.minPercent);
    return new Promise((resolve, reject) => {
        const margin = 36;
        const pageW = 595.28;
        const contentW = pageW - margin * 2;
        const doc = new pdfkit_1.default({ margin, size: 'A4' });
        const chunks = [];
        doc.on('data', (c) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
        const school = data.schoolName || 'School Pro Academy';
        const pageBottom = () => doc.page.height - margin - 72;
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
            }
            catch {
                /* skip invalid image */
            }
        }
        doc.fillColor(RC.white).font('Helvetica-Bold').fontSize(logoPath ? 18 : 20);
        doc.text(school, textX, 20, { width: textW, align: logoPath ? 'left' : 'center' });
        if (data.tagline) {
            doc.font('Helvetica').fontSize(10).fillColor('#e0e7ff');
            doc.text(data.tagline, textX, 42, { width: textW, align: logoPath ? 'left' : 'center' });
        }
        doc.font('Helvetica-Bold').fontSize(13).fillColor('#c7d2fe');
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
        doc.font('Helvetica').fontSize(9.5).fillColor(RC.muted);
        doc.text(chips.join('   ·   '), margin, y, { width: contentW, align: 'center' });
        y += 24;
        // —— Student identity card ——
        const cardH = 84;
        doc.roundedRect(margin, y, contentW, cardH, 8).fillAndStroke(RC.rowAlt, RC.border);
        doc.fillColor(RC.ink).font('Helvetica-Bold').fontSize(17);
        doc.text(data.studentName, margin + 16, y + 12);
        doc.font('Helvetica').fontSize(10.5).fillColor(RC.muted);
        doc.text(`Student ID: ${data.admissionNumber}`, margin + 16, y + 34);
        doc.text(`Class: ${data.className || '—'}`, margin + 16, y + 50);
        if (data.formName) {
            doc.text(`Form: ${data.formName}`, margin + 16, y + 64);
        }
        const drawPositionBadge = (label, position, total, badgeX, badgeW, highlight) => {
            if (!position)
                return;
            doc.roundedRect(badgeX, y + 10, badgeW, 62, 6)
                .fillAndStroke(highlight ? '#fef3c7' : '#e0e7ff', highlight ? RC.gold : RC.accent);
            doc.fillColor(highlight ? '#92400e' : RC.primaryDark).font('Helvetica').fontSize(7.5);
            doc.text(label, badgeX, y + 16, { width: badgeW, align: 'center' });
            doc.font('Helvetica-Bold').fontSize(10.5);
            doc.text(formatPositionOutOf(position, total), badgeX, y + 30, {
                width: badgeW,
                align: 'center',
                lineGap: 0,
            });
        };
        const badgeW = 88;
        if (data.formPosition) {
            drawPositionBadge('FORM POSITION', data.formPosition, data.formTotal, margin + contentW - badgeW - 14, badgeW, (data.formPosition || 0) <= 3);
        }
        if (data.classPosition) {
            const classBadgeX = data.formPosition
                ? margin + contentW - badgeW * 2 - 22
                : margin + contentW - badgeW - 14;
            drawPositionBadge('CLASS POSITION', data.classPosition, data.classTotal, classBadgeX, badgeW, (data.classPosition || 0) <= 3);
        }
        y += cardH + 14;
        // —— Summary stat boxes ——
        const boxGap = 6;
        const boxW = (contentW - boxGap * 3) / 4;
        const summaries = [
            { label: 'Average', value: data.averageMark != null ? `${Number(data.averageMark).toFixed(1)}%` : '—' },
            {
                label: 'Class position',
                value: formatPositionOutOf(data.classPosition, data.classTotal),
            },
            {
                label: 'Form position',
                value: formatPositionOutOf(data.formPosition, data.formTotal),
            },
            {
                label: 'Subjects passed',
                value: formatSubjectsPassed(data.subjectsPassed, data.totalSubjects),
            },
        ];
        summaries.forEach((s, i) => {
            const bx = margin + i * (boxW + boxGap);
            doc.roundedRect(bx, y, boxW, 54, 6).fillAndStroke(RC.white, RC.border);
            doc.fillColor(RC.muted).font('Helvetica').fontSize(7.5);
            doc.text(s.label.toUpperCase(), bx + 6, y + 8, { width: boxW - 12 });
            doc.fillColor(RC.primaryDark).font('Helvetica-Bold').fontSize(11);
            doc.text(s.value, bx + 6, y + 24, { width: boxW - 12, lineGap: 0 });
        });
        y += 64;
        // —— Results table ——
        doc.fillColor(RC.ink).font('Helvetica-Bold').fontSize(12);
        doc.text('Academic performance', margin, y);
        y += 18;
        const cellPad = 6;
        const wSubject = 112;
        const wCode = 52;
        const wMark = 50;
        const wGrade = 52;
        const wPos = 52;
        const wMean = 44;
        const wRemarks = contentW - (wSubject + wCode + wMark + wGrade + wPos + wMean);
        const tableRight = margin + contentW;
        const colLeft = {
            subject: margin,
            code: margin + wSubject,
            mark: margin + wSubject + wCode,
            grade: margin + wSubject + wCode + wMark,
            pos: margin + wSubject + wCode + wMark + wGrade,
            mean: margin + wSubject + wCode + wMark + wGrade + wPos,
            remarks: margin + wSubject + wCode + wMark + wGrade + wPos + wMean,
        };
        const colText = {
            subject: { x: colLeft.subject + cellPad, w: wSubject - cellPad * 2 },
            code: { x: colLeft.code + cellPad, w: wCode - cellPad * 2 },
            mark: { x: colLeft.mark + cellPad, w: wMark - cellPad * 2 },
            grade: { x: colLeft.grade + cellPad, w: wGrade - cellPad * 2 },
            pos: { x: colLeft.pos + cellPad, w: wPos - cellPad * 2 },
            mean: { x: colLeft.mean + cellPad, w: wMean - cellPad * 2 },
            remarks: { x: colLeft.remarks + cellPad, w: wRemarks - cellPad * 2 },
        };
        const vLineXs = [
            margin,
            colLeft.code,
            colLeft.mark,
            colLeft.grade,
            colLeft.pos,
            colLeft.mean,
            colLeft.remarks,
            tableRight,
        ];
        const headerRowH = 28;
        const baseRowH = 24;
        const headerFontSize = 8;
        const bodyFontSize = 9.5;
        const nowrap = { lineBreak: false };
        const gridColor = '#94a3b8';
        const gridLine = 0.75;
        const drawGradePill = (grade, cellX, cellW, rowY, rowH) => {
            const letter = (grade || '—').trim() || '—';
            doc.font('Helvetica-Bold').fontSize(bodyFontSize);
            const textW = doc.widthOfString(letter);
            const pillW = Math.min(cellW - 4, Math.max(textW + 12, 18));
            const pillH = 17;
            const px = cellX + (cellW - pillW) / 2;
            const py = rowY + (rowH - pillH) / 2;
            doc.roundedRect(px, py, pillW, pillH, 3).fill(RC.gradePillBg);
            doc.fillColor(RC.primary).font('Helvetica-Bold').fontSize(bodyFontSize);
            doc.text(letter, px, py + 4, { width: pillW, align: 'center', ...nowrap });
        };
        const strokeHLine = (lineY) => {
            doc.strokeColor(gridColor).lineWidth(gridLine);
            doc.moveTo(margin, lineY).lineTo(tableRight, lineY).stroke();
        };
        const strokeVLines = (topY, bottomY) => {
            doc.strokeColor(gridColor).lineWidth(gridLine);
            for (const x of vLineXs) {
                doc.moveTo(x, topY).lineTo(x, bottomY).stroke();
            }
        };
        const strokeTableOutline = (topY, bottomY, roundTop = false) => {
            doc.strokeColor(gridColor).lineWidth(gridLine);
            if (roundTop) {
                doc.roundedRect(margin, topY, contentW, bottomY - topY, 4).stroke();
            }
            else {
                doc.rect(margin, topY, contentW, bottomY - topY).stroke();
            }
        };
        const drawHeaderLabel = (label, cellX, cellW, hy, align = 'left') => {
            const textW = doc.widthOfString(label);
            let tx = cellX + cellPad;
            if (align === 'center')
                tx = cellX + (cellW - textW) / 2;
            doc.text(label, tx, hy, nowrap);
        };
        const drawTableHeader = (headerY) => {
            doc.rect(margin, headerY, contentW, headerRowH).fill(RC.tableHeaderBg);
            doc.fillColor('#000000').font('Helvetica-Bold').fontSize(headerFontSize);
            const hy = headerY + 10;
            drawHeaderLabel('SUBJECT', colLeft.subject, wSubject, hy);
            drawHeaderLabel('CODE', colLeft.code, wCode, hy, 'center');
            drawHeaderLabel('MARK', colLeft.mark, wMark, hy, 'center');
            drawHeaderLabel('GRADE', colLeft.grade, wGrade, hy, 'center');
            drawHeaderLabel('RANK', colLeft.pos, wPos, hy, 'center');
            drawHeaderLabel('MEAN', colLeft.mean, wMean, hy, 'center');
            drawHeaderLabel('REMARKS', colLeft.remarks, wRemarks, hy);
        };
        let segmentTop = y;
        let rowIndex = 0;
        let roundTableTop = true;
        strokeHLine(segmentTop);
        drawTableHeader(y);
        y += headerRowH;
        strokeHLine(y);
        data.subjectResults.forEach((r) => {
            const subjectName = (r.subjectName || r.subject.split(' — ')[0] || r.subject).trim() || '—';
            const subjectCode = r.subjectCode?.trim() || '—';
            const meanValue = formatClassMean(r.mean);
            const subjectPositionValue = formatSubjectPosition(r.subjectPosition, r.subjectPositionTotal ?? data.formTotal);
            const remarksText = (r.remarks || '—').trim() || '—';
            doc.font('Helvetica').fontSize(bodyFontSize);
            const remarksBlockH = doc.heightOfString(remarksText, { width: colText.remarks.w });
            const subjectBlockH = doc.heightOfString(subjectName, { width: colText.subject.w });
            const rowH = Math.max(baseRowH, remarksBlockH + 14, subjectBlockH + 12, 22);
            if (y + rowH > pageBottom()) {
                strokeVLines(segmentTop, y);
                strokeTableOutline(segmentTop, y, roundTableTop);
                doc.addPage();
                y = margin;
                segmentTop = y;
                rowIndex = 0;
                roundTableTop = false;
                strokeHLine(segmentTop);
                drawTableHeader(y);
                y += headerRowH;
                strokeHLine(y);
            }
            const bg = rowIndex % 2 === 0 ? RC.white : RC.rowAlt;
            doc.rect(margin, y, contentW, rowH).fill(bg);
            const rowTextY = y + 7;
            doc.fillColor('#000000').font('Helvetica').fontSize(bodyFontSize);
            doc.text(subjectName, colText.subject.x, rowTextY, { width: colText.subject.w, lineGap: 1 });
            doc.text(subjectCode, colText.code.x, rowTextY, {
                width: colText.code.w,
                align: 'center',
                ...nowrap,
            });
            doc.font('Helvetica-Bold').fillColor('#000000');
            doc.text(String(r.marks ?? '—'), colText.mark.x, rowTextY, {
                width: colText.mark.w,
                align: 'center',
                ...nowrap,
            });
            drawGradePill(r.grade || '—', colLeft.grade, wGrade, y, rowH);
            doc.fillColor('#000000').font('Helvetica').fontSize(bodyFontSize);
            doc.text(subjectPositionValue, colText.pos.x, rowTextY, {
                width: colText.pos.w,
                align: 'center',
                ...nowrap,
            });
            doc.text(meanValue, colText.mean.x, rowTextY, {
                width: colText.mean.w,
                align: 'center',
                ...nowrap,
            });
            doc.fillColor(RC.ink).font('Helvetica').fontSize(bodyFontSize);
            doc.text(remarksText, colText.remarks.x, rowTextY, { width: colText.remarks.w, lineGap: 2 });
            y += rowH;
            strokeHLine(y);
            rowIndex += 1;
        });
        strokeVLines(segmentTop, y);
        strokeTableOutline(segmentTop, y, roundTableTop);
        y += 12;
        // —— Comments ——
        if (data.classTeacherRemarks || data.principalRemarks) {
            if (y + 80 > pageBottom()) {
                doc.addPage();
                y = margin;
            }
            doc.fillColor(RC.ink).font('Helvetica-Bold').fontSize(12);
            doc.text('Comments', margin, y);
            y += 16;
            const drawComment = (title, body) => {
                doc.font('Helvetica').fontSize(10.5);
                const bodyH = doc.heightOfString(body, { width: contentW - 24, lineGap: 2 });
                const h = Math.max(48, bodyH + 32);
                doc.roundedRect(margin, y, contentW, h, 6).stroke(RC.border);
                doc.fillColor(RC.muted).font('Helvetica-Bold').fontSize(8.5);
                doc.text(title.toUpperCase(), margin + 12, y + 8);
                doc.fillColor(RC.ink).font('Helvetica').fontSize(10.5);
                doc.text(body, margin + 12, y + 22, { width: contentW - 24, lineGap: 2 });
                y += h + 8;
            };
            if (data.classTeacherRemarks)
                drawComment('Class teacher', data.classTeacherRemarks);
            if (data.principalRemarks)
                drawComment('Principal', data.principalRemarks);
        }
        // —— Grade scale legend ——
        if (y + 52 > pageBottom()) {
            doc.addPage();
            y = margin;
        }
        doc.fillColor(RC.ink).font('Helvetica-Bold').fontSize(11);
        doc.text('Grading scale', margin, y);
        y += 14;
        const legendText = gradeLegend
            .map((b) => {
            const label = b.label ? ` ${b.label}` : '';
            return `${b.grade} ≥ ${b.minPercent}%${label}`;
        })
            .join('   ·   ');
        doc.font('Helvetica').fontSize(8.5).fillColor(RC.muted);
        doc.text(legendText, margin, y, { width: contentW - 88, lineGap: 2 });
        y += 24;
        // —— Signatures ——
        if (y + 58 > pageBottom()) {
            doc.addPage();
            y = margin;
        }
        const sigW = (contentW - 24) / 3;
        const sigLabels = ['Class teacher', 'Principal', 'Parent / guardian'];
        sigLabels.forEach((label, i) => {
            const sx = margin + i * (sigW + 12);
            doc.strokeColor(RC.border).moveTo(sx, y + 28).lineTo(sx + sigW, y + 28).stroke();
            doc.fillColor(RC.muted).font('Helvetica').fontSize(8.5);
            doc.text(label.toUpperCase(), sx, y + 34, { width: sigW });
            doc.text('Signature & date', sx, y + 46, { width: sigW });
        });
        y += 58;
        // —— Footer: issued date, QR, generated ——
        const footerY = doc.page.height - margin - 56;
        doc.fillColor(RC.muted).font('Helvetica').fontSize(8.5);
        doc.text(`Issued: ${generated.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`, margin, footerY, { width: contentW - 90 });
        try {
            doc.image(qrBuffer, margin + contentW - 72, footerY - 4, { fit: [64, 64] });
            doc.fontSize(7).text('Scan to verify', margin + contentW - 72, footerY + 62, { width: 64, align: 'center' });
        }
        catch {
            /* skip invalid QR */
        }
        drawGeneratedFooter(doc, generated, margin, contentW - 80);
        doc.end();
    });
}
async function generateClassListPdf(data) {
    return new Promise((resolve, reject) => {
        const doc = new pdfkit_1.default({ margin: 40, size: 'A4' });
        const chunks = [];
        doc.on('data', (c) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
        const pageBottom = () => doc.page.height - 50;
        const pageW = doc.page.width;
        const margin = 40;
        const contentW = pageW - margin * 2;
        const logoPath = resolveUploadPath(data.logoUrl);
        if (logoPath) {
            try {
                doc.image(logoPath, margin, 26, { fit: [36, 36], align: 'center', valign: 'center' });
            }
            catch {
                /* skip invalid logo */
            }
        }
        const titleX = logoPath ? margin + 46 : margin;
        const titleW = logoPath ? contentW - 46 : contentW;
        doc.fontSize(16).text(data.schoolName, titleX, 32, { width: titleW, align: logoPath ? 'left' : 'center' });
        if (data.tagline) {
            doc.fontSize(9).fillColor('#64748b').text(data.tagline, titleX, 50, { width: titleW, align: logoPath ? 'left' : 'center' });
            doc.fillColor('#000000');
        }
        doc.fontSize(13).text('CLASS LIST REPORT', { align: 'center' });
        doc.moveDown(0.5);
        doc.fontSize(10);
        doc.text(`Class: ${data.classLabel}`, { align: 'center' });
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
        drawGeneratedFooter(doc, data.generatedAt, margin, contentW);
        doc.end();
    });
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
const GRADE_COLS = ['A', 'B', 'C', 'D', 'E', 'U'];
function msTextWidth(doc, text, size, bold = false) {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size);
    return doc.widthOfString(text || '—');
}
function msFitWidths(widths, target, mins) {
    let total = widths.reduce((a, b) => a + b, 0);
    if (total > target) {
        const scale = target / total;
        widths = widths.map((w, i) => Math.max(mins[i] ?? 14, Math.floor(w * scale)));
        total = widths.reduce((a, b) => a + b, 0);
        if (total > target) {
            const fix = target / total;
            widths = widths.map((w, i) => Math.max(mins[i] ?? 12, Math.floor(w * fix)));
        }
    }
    else if (total < target) {
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
function msColX(startX, widths, index) {
    let x = startX;
    for (let i = 0; i < index; i++)
        x += widths[i];
    return x;
}
function msSpanWidth(widths, from, count) {
    let w = 0;
    for (let i = from; i < from + count; i++)
        w += widths[i];
    return w;
}
function msHeaderText(doc, text, x, y, w, h, align = 'center') {
    doc.fillColor(MS.white).font('Helvetica-Bold').fontSize(MS_HDR);
    const pad = 2;
    doc.text(text, x + pad, y + (h - MS_HDR) / 2 - 1, {
        width: Math.max(0, w - pad * 2),
        align,
        lineBreak: false,
    });
}
function msDrawPill(doc, cx, cy, text, bg, fg, fontSize = 7.5) {
    doc.font('Helvetica-Bold').fontSize(fontSize);
    const tw = doc.widthOfString(text);
    const pw = tw + 10;
    const ph = fontSize + 5;
    const px = cx - pw / 2;
    const py = cy - ph / 2;
    doc.roundedRect(px, py, pw, ph, ph / 2).fill(bg);
    doc.fillColor(fg).text(text, px, py + 2, { width: pw, align: 'center', lineBreak: false });
}
async function generateMarkSheetPdf(data) {
    return new Promise((resolve, reject) => {
        const margin = 18;
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
            ...data.subjects.map((s) => (0, subject_abbrev_1.formatSubjectAbbrev)(s.code, s.name)),
            'COUNT',
            'SUBJ PASSED',
            'AVERAGE %',
            ...GRADE_COLS,
        ];
        const mins = [
            22, 52, 58, 58, 38,
            ...Array(subjectCount).fill(26),
            30, 44, 52,
            ...Array(gradeCount).fill(22),
        ];
        const widths = colLabels.map((label, i) => {
            let w = msTextWidth(doc, label, MS_HDR, true) + MS_PAD * 2 + 4;
            if (i === 1)
                w = Math.max(w, 52);
            if (i === 2 || i === 3)
                w = Math.max(w, 58);
            for (const row of data.students) {
                let sample = '';
                if (i === 0)
                    sample = row.position != null ? String(row.position) : '—';
                else if (i === 1)
                    sample = row.admissionNumber;
                else if (i === 2)
                    sample = row.lastName;
                else if (i === 3)
                    sample = row.firstName;
                else if (i === 4)
                    sample = row.gender || '—';
                else if (i < fixedCols + subjectCount) {
                    const m = row.cells[i - fixedCols];
                    sample = m != null ? String(m) : '—';
                }
                else if (i === fixedCols + subjectCount)
                    sample = String(row.subjectCount);
                else if (i === fixedCols + subjectCount + 1)
                    sample = String(row.subjectsPassed);
                else if (i === fixedCols + subjectCount + 2) {
                    sample = row.averagePercent != null ? row.averagePercent.toFixed(2) : '—';
                }
                else {
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
                }
                catch {
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
        const drawMeta = (y) => {
            const line = `Exam: ${data.examTypeName}    Term: ${data.termName}    Class: ${data.className}    ` +
                `Max Marks: ${data.maxMarks}    Students: ${data.students.length}`;
            doc.fillColor(MS.meta).font('Helvetica').fontSize(8.5);
            doc.text(line, margin, y + 4, { width: contentW, lineBreak: false });
            return y + 18;
        };
        const drawGroupHeader = (y) => {
            doc.save();
            doc.rect(margin, y, tableW, groupH).fill(MS.header);
            const subStart = fixedCols;
            const sumStart = fixedCols + subjectCount;
            const avgIdx = sumStart + summaryCols;
            const gradeStart = avgIdx + 1;
            msHeaderText(doc, '', margin, y, msSpanWidth(colW, 0, fixedCols), groupH);
            msHeaderText(doc, 'SUBJECT SCORES', msColX(margin, colW, subStart), y, msSpanWidth(colW, subStart, subjectCount), groupH);
            msHeaderText(doc, 'SUMMARY', msColX(margin, colW, sumStart), y, msSpanWidth(colW, sumStart, summaryCols), groupH);
            if (gradeCount > 0) {
                msHeaderText(doc, 'GRADES', msColX(margin, colW, gradeStart), y, msSpanWidth(colW, gradeStart, gradeCount), groupH);
            }
            doc.restore();
            return y + groupH;
        };
        const drawColumnHeader = (y) => {
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
        const drawRowBorder = (y) => {
            doc.save();
            doc.strokeColor(MS.border).lineWidth(0.8);
            doc.moveTo(margin, y + rowH).lineTo(margin + tableW, y + rowH).stroke();
            doc.restore();
        };
        const drawStudentRow = (row, y) => {
            const cy = y + rowH / 2;
            let cx = margin;
            // Position circle
            const posW = colW[0];
            if (row.position != null) {
                const r = 8;
                doc.circle(margin + posW / 2, cy, r).fill(MS.blue);
                doc.fillColor(MS.white).font('Helvetica-Bold').fontSize(8);
                doc.text(String(row.position), margin + posW / 2 - r, cy - 4, { width: r * 2, align: 'center' });
            }
            else {
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
                }
                else {
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
            }
            else {
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
                }
                else {
                    doc.fillColor(MS.muted).font('Helvetica').fontSize(MS_FONT);
                    doc.text('0', cx, cy - 4, { width: gw, align: 'center' });
                }
                cx += gw;
            }
            drawRowBorder(y);
        };
        const drawTableBlock = (startY) => {
            let y = drawGroupHeader(startY);
            y = drawColumnHeader(y);
            for (const row of data.students) {
                if (y + rowH > tableBottom())
                    return { y, needsPage: true };
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
        const renderPage = (continued) => {
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
                if (y + rowH > tableBottom())
                    break;
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
function msDrawRankingsGrid(doc, x, y, widths, height, fill) {
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
function msDrawRankingsCell(doc, text, x, y, w, h, opts) {
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
async function generateRankingsPdf(data) {
    return new Promise((resolve, reject) => {
        const margin = 24;
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
                }
                catch {
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
        const buildRow = (s) => [
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
        const colAligns = headers.map((_, i) => {
            if (i === 0)
                return 'center';
            if (i === headers.length - 1)
                return 'right';
            if (i >= numericStart)
                return 'center';
            return 'left';
        });
        let y = drawBanner() + 10;
        doc.fillColor(MS.meta).font('Helvetica').fontSize(8.5);
        const meta = `Exam: ${data.examTypeName}    Term: ${data.termName}    ${data.scopeLabel}    ` +
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
        const drawRow = (row, idx) => {
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
async function generateReconciliationPdf(data) {
    return new Promise((resolve, reject) => {
        const doc = new pdfkit_1.default({ size: 'A4', layout: 'landscape', margin: 36 });
        const chunks = [];
        doc.on('data', (c) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
        const pageW = doc.page.width;
        const margin = 36;
        const contentW = pageW - margin * 2;
        const branding = {
            schoolName: data.schoolName,
            tagline: data.tagline,
            logoUrl: data.logoUrl,
        };
        let y = drawBillingDocHeader(doc, branding, pageW, margin, 'Student Reconciliation Report');
        doc.fillColor(BILL.muted).font('Helvetica').fontSize(9);
        doc.text(`Period: ${data.dateFrom} → ${data.dateTo}${data.termName ? `  ·  Term: ${data.termName}` : ''}`, margin, y, { width: contentW });
        y += 14;
        doc.text(`Mode: ${data.detailed ? 'Detailed' : 'Summary'}`, margin, y);
        y += 18;
        const summaryItems = [
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
            const bg = item.tone === 'positive' ? '#ecfdf3' :
                item.tone === 'warn' ? '#fff7ed' :
                    item.tone === 'danger' ? '#fef2f2' : BILL.rowAlt;
            const border = item.tone === 'positive' ? '#86efac' :
                item.tone === 'warn' ? '#fdba74' :
                    item.tone === 'danger' ? '#fecaca' : BILL.border;
            const fg = item.tone === 'positive' ? '#166534' :
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
                { label: 'Billed', w: 74, align: 'right' },
                { label: 'Collected', w: 74, align: 'right' },
                { label: 'Closing', w: 74, align: 'right' },
                { label: 'Outstanding', w: 80, align: 'right' },
                { label: 'Variance', w: 63, align: 'right' },
            ]
            : [
                { label: 'ID', w: 74 },
                { label: 'Student', w: 170 },
                { label: 'Class', w: 100 },
                { label: 'Status', w: 90 },
                { label: 'Billed', w: 82, align: 'right' },
                { label: 'Collected', w: 82, align: 'right' },
                { label: 'Closing', w: 82, align: 'right' },
                { label: 'Outstanding', w: 89, align: 'right' },
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
                if (cols[i].label === 'Status')
                    continue;
                const cellHeight = doc.heightOfString(String(values[i]), {
                    width: Math.max(8, cols[i].w - 8),
                    align: cols[i].align || 'left',
                });
                contentH = Math.max(contentH, cellHeight);
            }
            const baseRowH = Math.max(14, Math.ceil(contentH) + 4);
            const noteH = data.detailed && row.discrepancies.length
                ? Math.max(12, Math.ceil(doc.heightOfString(`Note: ${row.discrepancies.join(' · ')}`, {
                    width: contentW - 8,
                })) + 2)
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
                    const statusBg = statusText === 'RECONCILED' ? '#dcfce7' :
                        statusText === 'UNRECONCILED' ? '#fee2e2' : '#fef3c7';
                    const statusFg = statusText === 'RECONCILED' ? '#166534' :
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
                }
                else {
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
