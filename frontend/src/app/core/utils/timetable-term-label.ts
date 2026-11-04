export function buildTimetableTermVersionLabel(
  termName?: string | null,
  yearName?: string | null,
  version: string | number = 1,
): string {
  const term = String(termName || '').trim();
  const year = String(yearName || '').trim();
  const versionLabel = String(version ?? '').trim() || '1';
  if (term && year) return `${term} (${year}) Version ${versionLabel}`;
  if (term) return `${term} Version ${versionLabel}`;
  if (year) return `${year} Version ${versionLabel}`;
  return `Version ${versionLabel}`;
}

export function timetableTermPrefix(termName?: string | null, yearName?: string | null): string {
  const term = String(termName || '').trim();
  const year = String(yearName || '').trim();
  if (term && year) return `${term} (${year})`;
  if (term) return term;
  if (year) return year;
  return '';
}

export function normalizeTimetableVersion(raw: unknown): string {
  const value = String(raw ?? '').trim();
  return value ? value.slice(0, 32) : '1';
}
