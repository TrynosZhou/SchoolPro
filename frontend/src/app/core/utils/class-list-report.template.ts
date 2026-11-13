/**
 * Class List Report — redesigned A4 template (classic · modern · professional).
 *
 * Pure function: data in, HTML string out. Feed the string to whatever already
 * turns HTML into the PDF for  GET /students/class-list/pdf  (Puppeteer /
 * Playwright / wkhtmltopdf-style renderer). No external assets or fonts are
 * required; everything is inlined with system-font fallbacks.
 *
 * Page numbers use CSS @page margin boxes (Chromium 131+). If your renderer is
 * older, keep the footer text and let the renderer's own footerTemplate add the
 * page number.
 */

export interface ClassListStudent {
  admissionNumber: string;
  lastName: string;
  firstName: string;
  gender?: string | null; // 'Male' | 'Female'
  dateOfBirth?: string | Date | null;
  studentType?: string | null; // 'boarder' | 'day_scholar'
}

export interface ClassListReportData {
  schoolName: string;
  tagline?: string;
  logoUrl?: string; // http(s) URL or data: URI
  address?: string;
  contact?: string; // e.g. "Tel +263 … · info@school.edu"
  className: string;
  termName?: string;
  generatedAt: Date;
  students: ClassListStudent[];
}

const esc = (v: unknown): string =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const fmtDob = (d?: string | Date | null): string => {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d.length === 10 ? `${d}T12:00:00` : d) : d;
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const fmtGenerated = (d: Date): string =>
  `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}, ` +
  d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

const typeLabel = (t?: string | null): { text: string; cls: string } =>
  t === 'boarder'
    ? { text: 'Boarder', cls: 'boarder' }
    : t === 'day_scholar'
      ? { text: 'Day scholar', cls: 'day' }
      : { text: '—', cls: '' };

export const CLASS_LIST_REPORT_STYLES = `
  @page {
    size: A4;
    margin: 16mm 15mm 20mm 15mm;
    @bottom-left   { content: "__SCHOOL__"; font: 8pt/1 'Segoe UI', Arial, sans-serif; color: #6b7686; vertical-align: top; padding-top: 4mm; }
    @bottom-center { content: "__CLASS__ · Class list"; font: 8pt/1 'Segoe UI', Arial, sans-serif; color: #6b7686; vertical-align: top; padding-top: 4mm; }
    @bottom-right  { content: "Page " counter(page) " of " counter(pages); font: 8pt/1 'Segoe UI', Arial, sans-serif; color: #6b7686; vertical-align: top; padding-top: 4mm; }
  }
  :root {
    --navy: #16346b;
    --navy-deep: #0f2552;
    --gold: #a9863f;
    --ink: #1a2232;
    --muted: #5f6b7c;
    --hair: #d9dee7;
    --tint: #f5f7fb;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
    font-size: 9.5pt;
    color: var(--ink);
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .serif { font-family: Georgia, 'Times New Roman', 'Bitstream Charter', serif; }

  /* ── Letterhead ─────────────────────────────── */
  .letterhead {
    display: flex; align-items: center; gap: 5mm;
    padding-bottom: 4.5mm;
  }
  .crest { width: 19mm; height: 19mm; object-fit: contain; flex: none; }
  .crest-fallback {
    width: 19mm; height: 19mm; flex: none; border-radius: 50%;
    border: 1.2pt solid var(--navy); color: var(--navy);
    display: flex; align-items: center; justify-content: center;
    font-size: 15pt; font-weight: 700;
  }
  .school { flex: 1; min-width: 0; }
  .school h1 {
    margin: 0; font-size: 21pt; line-height: 1.1; font-weight: 700;
    color: var(--navy-deep); letter-spacing: .2pt;
  }
  .school .tagline {
    margin: 1.4mm 0 0; font-size: 9.5pt; font-style: italic; color: var(--gold);
  }
  .school-meta { text-align: right; font-size: 8pt; line-height: 1.55; color: var(--muted); }

  /* double rule: heavy navy + fine gold */
  .rule { height: 0; border-top: 2.2pt solid var(--navy); margin: 0; }
  .rule::after { content: ""; display: block; margin-top: 1pt; border-top: .6pt solid var(--gold); }

  /* ── Title block ────────────────────────────── */
  .title-block {
    display: flex; align-items: flex-end; justify-content: space-between;
    margin: 7mm 0 5mm;
  }
  .title-block .kind { margin: 0 0 1mm; font-size: 9pt; color: var(--muted); letter-spacing: .4pt; }
  .title-block h2 {
    margin: 0; font-size: 22pt; font-weight: 700; color: var(--navy-deep); line-height: 1.05;
  }
  .title-block .term { margin: 1.6mm 0 0; font-size: 9.5pt; color: var(--muted); }
  .generated { text-align: right; font-size: 8.5pt; color: var(--muted); line-height: 1.5; }
  .generated b { display: block; color: var(--ink); font-weight: 600; }

  /* ── Summary strip ──────────────────────────── */
  .summary {
    display: grid; grid-template-columns: 1.25fr 1fr 1fr 1fr 1fr;
    border: .6pt solid var(--hair); border-left: 2.4pt solid var(--navy);
    background: var(--tint); margin-bottom: 6mm;
  }
  .summary > div { padding: 3mm 4mm; border-left: .6pt solid var(--hair); }
  .summary > div:first-child { border-left: 0; }
  .summary .n { font-size: 15pt; font-weight: 700; color: var(--navy-deep); line-height: 1.1; }
  .summary .l { margin-top: .8mm; font-size: 8pt; color: var(--muted); }

  /* ── Roster table ───────────────────────────── */
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  thead th {
    background: var(--navy); color: #fff; font-weight: 600; font-size: 8.5pt;
    text-align: left; padding: 3mm 3mm; letter-spacing: .2pt;
    border-right: .6pt solid rgba(255,255,255,.18);
  }
  thead th:last-child { border-right: 0; }
  tbody td {
    padding: 3.1mm 3mm; border-bottom: .6pt solid var(--hair); vertical-align: middle;
  }
  tbody tr { break-inside: avoid; }
  tbody tr:nth-child(even) td { background: #f9fafc; }
  tbody tr:last-child td { border-bottom: 1.4pt solid var(--navy); }
  .num { width: 11mm; text-align: center; color: var(--muted); font-variant-numeric: tabular-nums; }
  thead th.num { text-align: center; color: #fff; }
  .sid { font-weight: 600; color: var(--navy); font-variant-numeric: tabular-nums; letter-spacing: .3pt; white-space: nowrap; }
  .surname { font-weight: 600; }
  .dob { white-space: nowrap; font-variant-numeric: tabular-nums; }
  .pill { display: inline-flex; align-items: center; gap: 1.6mm; white-space: nowrap; }
  .pill::before { content: ""; width: 2mm; height: 2mm; border-radius: 50%; background: var(--hair); }
  .pill.boarder::before { background: var(--navy); }
  .pill.day::before { background: var(--gold); }

  .end {
    display: flex; align-items: center; gap: 4mm; margin-top: 6mm;
    font-size: 8.5pt; color: var(--muted); font-style: italic;
  }
  .end::before, .end::after { content: ""; flex: 1; border-top: .6pt solid var(--hair); }
`;

export function buildClassListReportHtml(data: ClassListReportData): string {
  const rows = data.students;
  const count = (fn: (s: ClassListStudent) => boolean) => rows.filter(fn).length;
  const male = count((s) => s.gender === 'Male');
  const female = count((s) => s.gender === 'Female');
  const boarders = count((s) => s.studentType === 'boarder');
  const days = count((s) => s.studentType === 'day_scholar');

  const css = CLASS_LIST_REPORT_STYLES
    .replace('__SCHOOL__', esc(data.schoolName).replace(/"/g, '\\"'))
    .replace('__CLASS__', esc(data.className).replace(/"/g, '\\"'));

  const crest = data.logoUrl
    ? `<img class="crest" src="${esc(data.logoUrl)}" alt="" />`
    : `<div class="crest-fallback serif">${esc(data.schoolName.charAt(0))}</div>`;

  const meta = [data.address, data.contact].filter(Boolean).map(esc).join('<br />');

  const body = rows
    .map((s, i) => {
      const t = typeLabel(s.studentType);
      return `<tr>
        <td class="num">${i + 1}</td>
        <td class="sid">${esc(s.admissionNumber)}</td>
        <td class="surname">${esc(s.lastName)}</td>
        <td>${esc(s.firstName)}</td>
        <td>${esc(s.gender || '—')}</td>
        <td class="dob">${fmtDob(s.dateOfBirth)}</td>
        <td><span class="pill ${t.cls}">${t.text}</span></td>
      </tr>`;
    })
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Class list — ${esc(data.className)}</title>
<style>${css}</style>
</head>
<body>
  <header class="letterhead">
    ${crest}
    <div class="school">
      <h1 class="serif">${esc(data.schoolName)}</h1>
      ${data.tagline ? `<p class="tagline serif">${esc(data.tagline)}</p>` : ''}
    </div>
    ${meta ? `<div class="school-meta">${meta}</div>` : ''}
  </header>
  <div class="rule"></div>

  <section class="title-block">
    <div>
      <p class="kind">Class list report</p>
      <h2 class="serif">${esc(data.className)}</h2>
      ${data.termName ? `<p class="term">${esc(data.termName)}</p>` : ''}
    </div>
    <div class="generated">Generated<b>${esc(fmtGenerated(data.generatedAt))}</b></div>
  </section>

  <section class="summary">
    <div><div class="n serif">${rows.length}</div><div class="l">Total students</div></div>
    <div><div class="n serif">${male}</div><div class="l">Male</div></div>
    <div><div class="n serif">${female}</div><div class="l">Female</div></div>
    <div><div class="n serif">${boarders}</div><div class="l">Boarders</div></div>
    <div><div class="n serif">${days}</div><div class="l">Day scholars</div></div>
  </section>

  <table>
    <thead>
      <tr>
        <th class="num">No.</th>
        <th>Student ID</th>
        <th>Last name</th>
        <th>First name</th>
        <th>Gender</th>
        <th>Date of birth</th>
        <th>Type</th>
      </tr>
    </thead>
    <tbody>${body}</tbody>
  </table>

  <div class="end">End of class list · ${rows.length} student${rows.length === 1 ? '' : 's'}</div>
</body>
</html>`;
}
