// @ts-nocheck
import fs from 'fs';
import path from 'path';
import QRCode from 'qrcode';
import type { SchoolBranding } from './pdf';

/**
 * Classical, modern A4 letterhead for issued certificates and letters
 * (bonafide, transfer, testimonial, achievement, completion, other).
 */

export interface LetterData {
  title: string;
  body: string;
  referenceCode: string;
  issuedAt: Date;
  recipientName?: string | null;
}

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};

/** Reads the school logo from the uploads folder and inlines it, so the page needs no auth for images. */
function logoDataUri(logoUrl?: string): string {
  if (!logoUrl) return '';
  try {
    const full = path.join(process.cwd(), logoUrl.replace(/^\/+/, ''));
    if (!fs.existsSync(full)) return '';
    const mime = MIME[path.extname(full).toLowerCase()];
    if (!mime) return '';
    return `data:${mime};base64,${fs.readFileSync(full).toString('base64')}`;
  } catch {
    return '';
  }
}

function renderParagraphs(body: string): string {
  return esc(body)
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const cls = /^TO WHOM IT MAY CONCERN[.:]?$/i.test(p) ? ' class="salutation"' : '';
      return `<p${cls}>${p.replace(/\n/g, '<br>')}</p>`;
    })
    .join('\n');
}

export async function buildLetterHtml(doc: LetterData, school: SchoolBranding): Promise<string> {
  const schoolName = school.schoolName || 'School';
  const issued = new Date(doc.issuedAt).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const logo = logoDataUri(school.logoUrl);
  const logoHtml = logo
    ? `<img class="logo" src="${logo}" alt="" />`
    : `<div class="crest" aria-hidden="true">${esc(schoolName.charAt(0).toUpperCase())}</div>`;

  let qrHtml = '';
  try {
    const payload = JSON.stringify({
      document: doc.referenceCode,
      title: doc.title,
      issued: new Date(doc.issuedAt).toISOString().slice(0, 10),
      school: schoolName,
    });
    const qr = await QRCode.toDataURL(payload, { margin: 1, width: 240, errorCorrectionLevel: 'M' });
    qrHtml = `<div class="verify"><img src="${qr}" alt="Verification QR code" /><span>Scan to verify authenticity</span></div>`;
  } catch {
    qrHtml = '';
  }

  const contact = [school.address, school.phone, school.email, school.website]
    .filter((v) => v && String(v).trim())
    .map((v) => esc(v))
    .join('<i>&#9670;</i>');

  const signatory = school.headmasterName || 'Headmaster / Principal';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(doc.title)} - ${esc(doc.referenceCode)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Source+Serif+4:wght@400;600&display=swap" rel="stylesheet" />
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  :root { --navy: #0f1d36; --brass: #b8924a; --ink: #1f2937; --muted: #6b7280; }
  html, body { margin: 0; padding: 0; }
  body {
    background: #e9ebef; color: var(--ink);
    font-family: 'Source Serif 4', Georgia, 'Times New Roman', serif;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .toolbar { display: flex; gap: 10px; justify-content: center; padding: 16px; }
  .toolbar button {
    font-family: inherit; font-size: 14px; padding: 9px 22px; border-radius: 4px; cursor: pointer;
    background: var(--navy); color: #fff; border: 1px solid var(--navy); letter-spacing: .04em;
  }
  .toolbar button.secondary { background: #fff; color: var(--navy); }
  .page {
    position: relative; width: 210mm; min-height: 297mm; margin: 0 auto 24px; background: #fff;
    padding: 12mm; box-shadow: 0 6px 28px rgba(15, 29, 54, .18);
  }
  .frame {
    position: relative; min-height: calc(297mm - 24mm); padding: 13mm 16mm 10mm;
    border: 1.5px solid var(--navy); outline: 1px solid var(--brass); outline-offset: -6px;
    display: flex; flex-direction: column; overflow: hidden;
  }
  .watermark {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none;
    font-family: 'Cormorant Garamond', Georgia, serif; font-size: 120px; font-weight: 700; color: var(--navy);
    opacity: .035; transform: rotate(-24deg); white-space: nowrap; text-transform: uppercase;
  }
  header { text-align: center; position: relative; }
  .logo { height: 22mm; width: auto; max-width: 60mm; display: block; margin: 0 auto 4mm; object-fit: contain; }
  .crest {
    width: 17mm; height: 17mm; margin: 0 auto 4mm; border-radius: 50%; border: 1.5px solid var(--brass);
    display: flex; align-items: center; justify-content: center; color: var(--navy);
    font-family: 'Cormorant Garamond', Georgia, serif; font-size: 26px; font-weight: 700;
  }
  .school {
    margin: 0; font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 700; font-size: 30px;
    letter-spacing: .06em; color: var(--navy); text-transform: uppercase;
  }
  .tagline { margin: 4px 0 0; font-style: italic; font-size: 13px; color: var(--muted); letter-spacing: .05em; }
  .rule { margin: 6mm 0 0; border: 0; height: 5px; border-top: 2px solid var(--navy); border-bottom: 1px solid var(--brass); }
  h1.title {
    margin: 9mm 0 0; text-align: center; font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 700;
    font-size: 26px; letter-spacing: .22em; text-transform: uppercase; color: var(--navy);
  }
  .title-orn { display: flex; align-items: center; justify-content: center; gap: 10px; margin: 3mm 0 7mm; color: var(--brass); }
  .title-orn::before, .title-orn::after { content: ""; width: 42mm; height: 1px; background: var(--brass); }
  .title-orn span { font-size: 11px; line-height: 1; }
  .meta { display: flex; justify-content: space-between; font-size: 12.5px; color: var(--muted); letter-spacing: .03em; margin-bottom: 8mm; }
  .meta b { color: var(--navy); font-weight: 600; }
  .to { margin: 0 0 6mm; font-size: 15px; }
  .to b { color: var(--navy); }
  .content { flex: 1; font-size: 15.5px; line-height: 1.85; text-align: justify; position: relative; }
  .content p { margin: 0 0 5mm; }
  .content .salutation { font-weight: 600; letter-spacing: .08em; color: var(--navy); text-align: left; }
  .foot { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 12mm; gap: 12mm; position: relative; }
  .sig { min-width: 68mm; }
  .sig .space { height: 16mm; }
  .sig .line { border-top: 1px solid var(--navy); margin-bottom: 6px; width: 100%; }
  .sig .name { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 19px; font-weight: 700; color: var(--navy); }
  .sig .role { font-size: 12px; color: var(--muted); letter-spacing: .04em; }
  .verify { text-align: center; font-size: 10px; color: var(--muted); letter-spacing: .04em; }
  .verify img { width: 24mm; height: 24mm; display: block; margin: 0 auto 3px; padding: 2px; border: 1px solid var(--brass); }
  .contact {
    margin-top: 9mm; padding-top: 3mm; border-top: 1px solid var(--brass); text-align: center;
    font-size: 10.5px; color: var(--muted); letter-spacing: .05em; position: relative;
  }
  .contact i { color: var(--brass); font-style: normal; margin: 0 8px; font-size: 8px; }
  @media print {
    body { background: #fff; }
    .toolbar { display: none; }
    .page { margin: 0; box-shadow: none; }
  }
  @media (max-width: 800px) {
    .page { width: 100%; padding: 8px; }
    .frame { padding: 24px 18px; }
  }
</style>
</head>
<body>
<div class="toolbar">
  <button onclick="window.print()">Print</button>
  <button class="secondary" onclick="window.close()">Close</button>
</div>
<div class="page">
  <div class="frame">
    <div class="watermark" aria-hidden="true">${esc(schoolName)}</div>
    <header>
      ${logoHtml}
      <h2 class="school">${esc(schoolName)}</h2>
      ${school.tagline ? `<p class="tagline">${esc(school.tagline)}</p>` : ''}
      <hr class="rule" />
    </header>
    <h1 class="title">${esc(doc.title)}</h1>
    <div class="title-orn" aria-hidden="true"><span>&#9670;</span></div>
    <div class="meta">
      <span>Ref: <b>${esc(doc.referenceCode)}</b></span>
      <span>Date: <b>${esc(issued)}</b></span>
    </div>
    ${doc.recipientName ? `<p class="to"><b>To:</b> ${esc(doc.recipientName)}</p>` : ''}
    <section class="content">
${renderParagraphs(doc.body)}
    </section>
    <div class="foot">
      <div class="sig">
        <div class="space"></div>
        <div class="line"></div>
        <div class="name">${esc(signatory)}</div>
        <div class="role">${school.headmasterName ? 'Headmaster / Principal' : 'Authorised Signatory'}</div>
      </div>
      ${qrHtml}
    </div>
    ${contact ? `<div class="contact">${contact}</div>` : ''}
  </div>
</div>
</body>
</html>`;
}
