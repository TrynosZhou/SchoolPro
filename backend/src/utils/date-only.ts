/** Normalize a date string to YYYY-MM-DD for comparison. */
export function normalizeDateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);

  const slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const first = slashMatch[1].padStart(2, '0');
    const second = slashMatch[2].padStart(2, '0');
    const year = slashMatch[3];
    // MM/DD/YYYY (login date picker locale) and DD/MM/YYYY (common manual entry).
    return `${year}-${first}-${second}`;
  }

  const dashMatch = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dashMatch) {
    const day = dashMatch[1].padStart(2, '0');
    const month = dashMatch[2].padStart(2, '0');
    const year = dashMatch[3];
    return `${year}-${month}-${day}`;
  }

  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** Build password candidates for date-of-birth style portal passwords. */
export function datePasswordCandidates(value: string): string[] {
  const raw = String(value || '').trim();
  if (!raw) return [];

  const out = new Set<string>([raw]);
  const normalized = normalizeDateOnly(raw);
  if (normalized) out.add(normalized);

  if (normalized) {
    const [year, month, day] = normalized.split('-');
    out.add(`${day}/${month}/${year}`);
    out.add(`${month}/${day}/${year}`);
    out.add(`${day}-${month}-${year}`);
    out.add(`${Number(day)}/${Number(month)}/${year}`);
    out.add(`${Number(month)}/${Number(day)}/${year}`);

    const slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slashMatch) {
      const first = slashMatch[1].padStart(2, '0');
      const second = slashMatch[2].padStart(2, '0');
      const y = slashMatch[3];
      out.add(`${y}-${second}-${first}`);
      out.add(`${second}/${first}/${y}`);
    }
  }

  return [...out];
}

/** True when a typed secret matches the student's recorded date of birth. */
export function secretMatchesRecordDob(secret: string, recordDob: string): boolean {
  const target = normalizeDateOnly(recordDob);
  if (!target) return false;
  return datePasswordCandidates(secret).some((candidate) => normalizeDateOnly(candidate) === target);
}
