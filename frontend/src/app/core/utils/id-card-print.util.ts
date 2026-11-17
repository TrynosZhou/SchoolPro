export interface IdCardPrintData {
  schoolName?: string;
  firstName: string;
  lastName: string;
  admissionNumber?: string;
  classLabel: string;
  dateOfBirth?: string;
  gender?: string;
  /** Absolute or root-relative URL of the student's photo, or '' when there is none. */
  photoUrl?: string;
  /** Data URL of the QR code. */
  qrDataUrl: string;
  code: string;
}

function esc(text: string | undefined | null): string {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function absoluteUrl(url: string | undefined): string {
  if (!url) return '';
  try {
    return new URL(url, window.location.origin).toString();
  } catch {
    return '';
  }
}

/** Standard CR80 card (85.6 x 54 mm) laid out from the on-screen 340 x 214 px design. */
export function buildIdCardPrintDocument(d: IdCardPrintData): string {
  const photo = absoluteUrl(d.photoUrl);
  const photoHtml = photo
    ? `<img src="${esc(photo)}" alt="" style="width:100%;height:100%;object-fit:cover;object-position:top" />`
    : `<svg viewBox="0 0 24 24" width="55%" height="55%" fill="none" stroke="#94a3b8" stroke-width="1.5"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/></svg>`;
  const genderRow = d.gender
    ? `<tr><td class="k">Gender</td><td class="v">${esc(d.gender)}</td></tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Student ID - ${esc(d.firstName)} ${esc(d.lastName)}</title>
<style>
  @page { size: 85.6mm 54mm; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; background: #e5e7eb; }
  .toolbar { display: flex; gap: 8px; justify-content: center; padding: 14px; }
  .toolbar button { padding: 8px 18px; border: 0; border-radius: 6px; background: #1a3a6b; color: #fff; font-size: 14px; cursor: pointer; }
  .toolbar button.secondary { background: #fff; color: #1a3a6b; border: 1px solid #1a3a6b; }
  .sheet { display: flex; justify-content: center; padding: 8px 0 24px; }
  .frame { width: 85.6mm; height: 54mm; overflow: hidden; background: #fff; box-shadow: 0 4px 14px rgba(0,0,0,.2); }
  .card { width: 340px; height: 214px; transform: scale(0.9514); transform-origin: top left; border: 2px solid #1a3a6b; border-radius: 10px; overflow: hidden; display: flex; flex-direction: column; background: #fff; color: #1e293b; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .head { background: linear-gradient(90deg,#1a3a6b,#2563eb); color: #fff; padding: 8px 12px; display: flex; justify-content: space-between; align-items: center; }
  .head b { font-size: 12px; letter-spacing: .4px; }
  .head span { font-size: 8px; opacity: .85; letter-spacing: 1px; text-transform: uppercase; }
  .body { flex: 1; display: flex; padding: 10px 12px; gap: 12px; min-height: 0; }
  .photo { width: 78px; height: 100px; flex: 0 0 78px; border: 1px solid #cbd5e1; border-radius: 5px; overflow: hidden; background: #e2e8f0; display: flex; align-items: center; justify-content: center; }
  .info { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; }
  .name { font-size: 16px; font-weight: 800; color: #1a3a6b; line-height: 1.25; margin-bottom: 6px; word-break: break-word; }
  table { width: 100%; font-size: 9.5px; border-collapse: collapse; }
  td.k { color: #64748b; width: 34%; padding: 1px 0; white-space: nowrap; }
  td.v { font-weight: 600; }
  .qr { flex: 0 0 84px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; }
  .qr img { width: 72px; height: 72px; }
  .qr div { font-family: monospace; font-size: 10px; font-weight: 700; color: #1e293b; letter-spacing: 0; white-space: nowrap; }
  .foot { background: #f1f5f9; border-top: 1px solid #e2e8f0; padding: 4px 12px; display: flex; justify-content: space-between; font-size: 8px; color: #64748b; }
  @media print {
    body { background: #fff; }
    .toolbar { display: none; }
    .sheet { padding: 0; display: block; }
    .frame { box-shadow: none; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <button onclick="window.print()">Print</button>
    <button class="secondary" onclick="window.close()">Close</button>
  </div>
  <div class="sheet">
    <div class="frame">
      <div class="card">
        <div class="head"><b>${esc(d.schoolName || 'School Pro Academy')}</b><span>Student ID</span></div>
        <div class="body">
          <div class="photo">${photoHtml}</div>
          <div class="info">
            <div class="name">${esc(d.firstName)} ${esc(d.lastName)}</div>
            <table>
              <tr><td class="k">Adm. No.</td><td class="v">${esc(d.admissionNumber) || '—'}</td></tr>
              <tr><td class="k">Class</td><td class="v">${esc(d.classLabel)}</td></tr>
              <tr><td class="k">Date of Birth</td><td class="v">${esc(d.dateOfBirth) || '—'}</td></tr>
              ${genderRow}
            </table>
          </div>
          <div class="qr"><img src="${esc(d.qrDataUrl)}" alt="QR code" /><div>${esc(d.code)}</div></div>
        </div>
        <div class="foot"><span>Verify at /verify</span><span>ID-${esc(d.code.slice(0, 8))}</span></div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/** Opens the card in a new tab as a print preview. Returns false if the browser blocked the popup. */
export function openIdCardPrintWindow(html: string): boolean {
  const win = window.open('', '_blank');
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  return true;
}
