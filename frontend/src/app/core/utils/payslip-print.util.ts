export interface PayslipPrintBranding {
  schoolName?: string;
  tagline?: string;
  logoUrl?: string;
  address?: string;
  phone?: string;
  email?: string;
  currency?: string;
}

export interface PayslipPrintRun {
  reference: string;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  payDate?: string;
  status?: string;
}

export interface PayslipPrintRow {
  employeeNumber: string;
  staffName: string;
  department?: string;
  jobTitle?: string;
  baseSalary: number;
  housingAllowance: number;
  transportAllowance: number;
  medicalAllowance: number;
  otherAllowances: number;
  grossPay: number;
  payeAmount: number;
  nssaAmount: number;
  pensionAmount: number;
  loanDeduction: number;
  otherDeductions: number;
  totalDeductions: number;
  netPay: number;
  paymentMethod: string;
  bankName?: string;
  bankAccount?: string;
  status?: string;
  notes?: string;
  annualLeaveEntitlement?: number;
  monthlyLeaveAccrual?: number;
  leaveOpeningBalance?: number;
  leaveTakenDays?: number;
  leaveClosingBalance?: number;
}

function esc(text: string | undefined | null): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatMoney(amount: number, currency: string): string {
  const code = currency || 'USD';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).format(Number(amount) || 0);
  } catch {
    return `${code} ${(Number(amount) || 0).toFixed(2)}`;
  }
}

function formatDays(d: number | undefined): string {
  const n = Number(d) || 0;
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function formatDate(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso + (iso.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function paymentLabel(method: string): string {
  const map: Record<string, string> = {
    bank_transfer: 'Bank transfer',
    cash: 'Cash',
    ecocash: 'EcoCash',
  };
  return map[method] || method;
}

function lineRows(
  items: { label: string; amount: number }[],
  currency: string,
  negative = false,
): string {
  const visible = items.filter((i) => Math.abs(i.amount) >= 0.005);
  if (!visible.length) {
    return `<tr><td colspan="2" class="ps-empty">—</td></tr>`;
  }
  return visible
    .map(
      (i) => `<tr>
        <td>${esc(i.label)}</td>
        <td class="amt">${negative ? '−' : ''}${formatMoney(i.amount, currency)}</td>
      </tr>`,
    )
    .join('');
}

export const PAYSLIP_PRINT_STYLES = `
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 20px;
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    font-size: 11pt;
    color: #0f172a;
    background: #f1f5f9;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  @media print {
    body { padding: 0; background: #fff; }
  }
  .payslip-doc {
    max-width: 210mm;
    margin: 0 auto;
    background: #fff;
    border: 1px solid #e2e8f0;
    box-shadow: 0 4px 24px rgba(15, 23, 42, 0.08);
  }
  @media print {
    .payslip-doc { border: none; box-shadow: none; max-width: none; }
    .page-break { page-break-after: always; }
  }
  .ps-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 20px;
    padding: 22px 28px;
    background: linear-gradient(135deg, #1e1b4b 0%, #312e81 55%, #4f46e5 100%);
    color: #fff;
  }
  .ps-brand { display: flex; gap: 16px; align-items: center; flex: 1; min-width: 0; }
  .ps-logo {
    width: 56px; height: 56px; object-fit: contain;
    background: #fff; border-radius: 10px; padding: 4px; flex-shrink: 0;
  }
  .ps-logo-placeholder {
    width: 56px; height: 56px; border-radius: 10px; background: rgba(255,255,255,0.15);
    display: flex; align-items: center; justify-content: center; font-size: 22px; flex-shrink: 0;
  }
  .ps-school-name { margin: 0 0 4px; font-size: 18pt; font-weight: 700; letter-spacing: -0.02em; }
  .ps-tagline { margin: 0 0 6px; font-size: 9pt; opacity: 0.88; }
  .ps-contact { margin: 0; font-size: 8.5pt; opacity: 0.8; line-height: 1.45; }
  .ps-title-block { text-align: right; flex-shrink: 0; }
  .ps-badge {
    display: inline-block;
    padding: 6px 14px;
    background: rgba(255,255,255,0.95);
    color: #312e81;
    font-size: 11pt;
    font-weight: 800;
    letter-spacing: 0.12em;
    border-radius: 6px;
    margin-bottom: 10px;
  }
  .ps-period { margin: 0; font-size: 12pt; font-weight: 600; }
  .ps-ref { margin: 4px 0 0; font-size: 9pt; opacity: 0.85; }
  .ps-body { padding: 24px 28px 20px; }
  .ps-meta-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin-bottom: 22px;
  }
  @media (max-width: 520px) {
    .ps-meta-grid { grid-template-columns: 1fr; }
    .ps-header { flex-direction: column; }
    .ps-title-block { text-align: left; }
  }
  .ps-meta-card {
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 14px 16px;
    background: #f8fafc;
  }
  .ps-meta-card h3 {
    margin: 0 0 10px;
    font-size: 8pt;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #64748b;
    font-weight: 700;
  }
  .ps-meta-row { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 6px; font-size: 10pt; }
  .ps-meta-row:last-child { margin-bottom: 0; }
  .ps-meta-row span:first-child { color: #64748b; }
  .ps-meta-row strong { color: #0f172a; text-align: right; }
  .ps-columns {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 18px;
    margin-bottom: 20px;
  }
  @media (max-width: 520px) { .ps-columns { grid-template-columns: 1fr; } }
  .ps-col h3 {
    margin: 0 0 8px;
    font-size: 9pt;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #475569;
    font-weight: 700;
    padding-bottom: 6px;
    border-bottom: 2px solid #e2e8f0;
  }
  .ps-col.earnings h3 { border-bottom-color: #10b981; color: #047857; }
  .ps-col.deductions h3 { border-bottom-color: #f59e0b; color: #b45309; }
  .ps-table { width: 100%; border-collapse: collapse; font-size: 10pt; }
  .ps-table td { padding: 7px 4px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
  .ps-table td.amt { text-align: right; font-variant-numeric: tabular-nums; font-weight: 500; white-space: nowrap; }
  .ps-table tr.ps-total td {
    border-top: 2px solid #e2e8f0;
    border-bottom: none;
    font-weight: 700;
    padding-top: 10px;
    color: #0f172a;
  }
  .ps-empty { color: #94a3b8; font-style: italic; text-align: center; }
  .ps-net-box {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    margin-bottom: 20px;
    background: linear-gradient(90deg, #eef2ff 0%, #e0e7ff 100%);
    border: 1px solid #c7d2fe;
    border-radius: 10px;
  }
  .ps-net-box span { font-size: 11pt; font-weight: 600; color: #4338ca; text-transform: uppercase; letter-spacing: 0.04em; }
  .ps-net-box strong { font-size: 20pt; font-weight: 800; color: #312e81; font-variant-numeric: tabular-nums; }
  .ps-payment {
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 14px 16px;
    margin-bottom: 16px;
    background: #fff;
  }
  .ps-payment h3 {
    margin: 0 0 10px;
    font-size: 8pt;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #64748b;
  }
  .ps-payment-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px 20px; font-size: 10pt; }
  .ps-payment-grid dt { color: #64748b; margin: 0; font-weight: 500; }
  .ps-payment-grid dd { margin: 0 0 8px; font-weight: 600; color: #0f172a; }
  .ps-leave {
    border: 1px solid #bfdbfe;
    border-radius: 10px;
    padding: 14px 16px;
    margin-bottom: 16px;
    background: #f0f9ff;
  }
  .ps-leave h3 {
    margin: 0 0 8px;
    font-size: 8pt;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #0369a1;
    font-weight: 700;
  }
  .ps-leave-formula { font-size: 8.5pt; color: #64748b; margin: 0 0 10px; }
  .ps-leave-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px 16px; font-size: 10pt; }
  .ps-leave-grid div { display: flex; justify-content: space-between; gap: 8px; }
  .ps-leave-grid .lbl { color: #64748b; }
  .ps-leave-grid .val { font-weight: 600; }
  .ps-leave-grid .highlight .val { color: #0369a1; font-size: 11pt; }
  .ps-notes {
    font-size: 9pt;
    color: #475569;
    padding: 10px 14px;
    background: #fffbeb;
    border: 1px solid #fde68a;
    border-radius: 8px;
    margin-bottom: 16px;
  }
  .ps-footer {
    padding: 14px 28px 18px;
    border-top: 1px solid #e2e8f0;
    font-size: 8pt;
    color: #94a3b8;
    display: flex;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
  }
  .ps-confidential { font-weight: 600; color: #64748b; }
  .page-break { page-break-after: always; height: 0; }
`;

export function resolveLogoUrl(logoUrl: string | undefined, apiBase: string): string | null {
  if (!logoUrl?.trim()) return null;
  const path = logoUrl.trim();
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const origin = apiBase.replace(/\/api\/?$/, '');
  return `${origin}${path.startsWith('/') ? path : `/${path}`}`;
}

export function buildPayslipPrintBlock(
  run: PayslipPrintRun,
  p: PayslipPrintRow,
  branding: PayslipPrintBranding,
  logoAbsoluteUrl: string | null,
): string {
  const currency = branding.currency || 'USD';
  const school = esc(branding.schoolName || 'School');
  const generated = new Date().toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const earnings = [
    { label: 'Basic salary', amount: Number(p.baseSalary) },
    { label: 'Housing allowance', amount: Number(p.housingAllowance) },
    { label: 'Transport allowance', amount: Number(p.transportAllowance) },
    { label: 'Medical allowance', amount: Number(p.medicalAllowance) },
    { label: 'Other allowances', amount: Number(p.otherAllowances) },
  ];

  const deductions = [
    { label: 'PAYE (tax)', amount: Number(p.payeAmount) },
    { label: 'NSSA', amount: Number(p.nssaAmount) },
    { label: 'Pension', amount: Number(p.pensionAmount) },
    { label: 'Loan repayment', amount: Number(p.loanDeduction) },
    { label: 'Other deductions', amount: Number(p.otherDeductions) },
  ];

  const logoHtml = logoAbsoluteUrl
    ? `<img class="ps-logo" src="${esc(logoAbsoluteUrl)}" alt="" />`
    : `<div class="ps-logo-placeholder" aria-hidden="true">🏫</div>`;

  const contactParts = [
    branding.address,
    branding.phone ? `Tel: ${branding.phone}` : '',
    branding.email,
  ].filter(Boolean);

  return `
  <article class="payslip-doc">
    <header class="ps-header">
      <div class="ps-brand">
        ${logoHtml}
        <div>
          <h1 class="ps-school-name">${school}</h1>
          ${branding.tagline ? `<p class="ps-tagline">${esc(branding.tagline)}</p>` : ''}
          ${contactParts.length ? `<p class="ps-contact">${contactParts.map((c) => esc(c)).join('<br>')}</p>` : ''}
        </div>
      </div>
      <div class="ps-title-block">
        <div class="ps-badge">PAYSLIP</div>
        <p class="ps-period">${esc(run.periodLabel)}</p>
        <p class="ps-ref">${esc(run.reference)}</p>
      </div>
    </header>

    <div class="ps-body">
      <div class="ps-meta-grid">
        <div class="ps-meta-card">
          <h3>Employee</h3>
          <div class="ps-meta-row"><span>Name</span><strong>${esc(p.staffName)}</strong></div>
          <div class="ps-meta-row"><span>Employee no.</span><strong>${esc(p.employeeNumber)}</strong></div>
          <div class="ps-meta-row"><span>Department</span><strong>${esc(p.department || '—')}</strong></div>
          ${p.jobTitle ? `<div class="ps-meta-row"><span>Job title</span><strong>${esc(p.jobTitle)}</strong></div>` : ''}
        </div>
        <div class="ps-meta-card">
          <h3>Pay period</h3>
          <div class="ps-meta-row"><span>Period</span><strong>${esc(run.periodLabel)}</strong></div>
          <div class="ps-meta-row"><span>From</span><strong>${formatDate(run.periodStart)}</strong></div>
          <div class="ps-meta-row"><span>To</span><strong>${formatDate(run.periodEnd)}</strong></div>
          <div class="ps-meta-row"><span>Pay date</span><strong>${formatDate(run.payDate)}</strong></div>
          ${p.status ? `<div class="ps-meta-row"><span>Status</span><strong>${esc(p.status)}</strong></div>` : ''}
        </div>
      </div>

      <div class="ps-columns">
        <div class="ps-col earnings">
          <h3>Earnings</h3>
          <table class="ps-table">
            <tbody>
              ${lineRows(earnings, currency)}
              <tr class="ps-total">
                <td>Gross pay</td>
                <td class="amt">${formatMoney(p.grossPay, currency)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="ps-col deductions">
          <h3>Deductions</h3>
          <table class="ps-table">
            <tbody>
              ${lineRows(deductions, currency, true)}
              <tr class="ps-total">
                <td>Total deductions</td>
                <td class="amt">−${formatMoney(p.totalDeductions, currency)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="ps-net-box">
        <span>Net pay (take home)</span>
        <strong>${formatMoney(p.netPay, currency)}</strong>
      </div>

      <section class="ps-leave">
        <h3>Annual leave</h3>
        <p class="ps-leave-formula">Monthly accrual: ${formatDays(p.annualLeaveEntitlement ?? 12)} days ÷ 12 = <strong>${formatDays(p.monthlyLeaveAccrual ?? 1)} day(s)</strong> per month</p>
        <div class="ps-leave-grid">
          <div><span class="lbl">Annual entitlement</span><span class="val">${formatDays(p.annualLeaveEntitlement ?? 12)} days</span></div>
          <div><span class="lbl">Accrued this month</span><span class="val">+${formatDays(p.monthlyLeaveAccrual ?? 1)}</span></div>
          <div><span class="lbl">Opening balance</span><span class="val">${formatDays(p.leaveOpeningBalance ?? 0)}</span></div>
          <div><span class="lbl">Leave taken</span><span class="val">−${formatDays(p.leaveTakenDays ?? 0)}</span></div>
          <div class="highlight" style="grid-column: 1 / -1"><span class="lbl">Closing balance</span><span class="val">${formatDays(p.leaveClosingBalance ?? 0)} days</span></div>
        </div>
      </section>

      <section class="ps-payment">
        <h3>Payment details</h3>
        <dl class="ps-payment-grid">
          <dt>Payment method</dt>
          <dd>${esc(paymentLabel(p.paymentMethod))}</dd>
          ${p.bankName ? `<dt>Bank</dt><dd>${esc(p.bankName)}</dd>` : ''}
          ${p.bankAccount ? `<dt>Account number</dt><dd>${esc(p.bankAccount)}</dd>` : ''}
        </dl>
      </section>

      ${p.notes ? `<div class="ps-notes"><strong>Notes:</strong> ${esc(p.notes)}</div>` : ''}
    </div>

    <footer class="ps-footer">
      <span class="ps-confidential">Confidential — for employee use only</span>
      <span>Generated ${esc(generated)} · ${esc(run.reference)}</span>
    </footer>
  </article>`;
}

export function buildPayslipPrintDocument(
  title: string,
  bodyHtml: string,
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)}</title>
  <style>${PAYSLIP_PRINT_STYLES}</style>
</head>
<body>${bodyHtml}</body>
</html>`;
}

export function openPayslipPrintWindow(html: string, title: string): boolean {
  const win = window.open('', '_blank');
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.document.title = title;
  win.focus();
  setTimeout(() => win.print(), 350);
  return true;
}
