import { formatSubjectAbbrev } from './subject-abbrev';

/** Two-letter day labels for classic timetable grids (Mo, Tu, …). */
export function dayGridLabel(dayValue: number): string {
  const labels: Record<number, string> = {
    1: 'Mo',
    2: 'Tu',
    3: 'We',
    4: 'Th',
    5: 'Fr',
    6: 'Sa',
    7: 'Su',
  };
  return labels[dayValue] || '?';
}

export function shortClassCode(className: string): string {
  const name = String(className || '').trim();
  if (!name) return '';
  return name.replace(/^class\s+/i, '');
}

/** Shorter label for narrow timetable cells — e.g. "L6 Sciences" → "L6 Sci". */
export function compactClassGridLabel(className: string): string {
  const name = shortClassCode(className);
  if (!name) return '';

  const levelStream = name.match(/^(L6|U6)\s+(.+)$/i);
  if (levelStream) {
    const level = levelStream[1].toUpperCase();
    const stream = levelStream[2].trim();
    const shortStream =
      stream.length <= 4 ? stream : stream.split(/\s+/).map((w) => w.slice(0, 3)).join(' ');
    return `${level} ${shortStream}`.trim();
  }

  if (name.length <= 6) return name;

  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const last = parts[parts.length - 1];
    parts[parts.length - 1] = last.length > 3 ? `${last.slice(0, 3)}` : last;
    const compact = parts.join(' ');
    return compact.length < name.length ? compact : name;
  }

  return name.length > 8 ? `${name.slice(0, 7)}…` : name;
}

export function formatPeriodRange(period: { startTime: string; endTime: string }): string {
  const compact = (time: string) => {
    const [h, m] = String(time || '0:00').split(':');
    return `${Number(h)}:${m || '00'}`;
  };
  return `${compact(period.startTime)} - ${compact(period.endTime)}`;
}

/** Short subject label for timetable cells — prefers configured short, then code/name fallback. */
export function timetableSubjectShort(
  code: string | null | undefined,
  name: string,
  shortLabel?: string | null,
): string {
  const custom = String(shortLabel || '').trim();
  if (custom) return custom;

  const abbr = formatSubjectAbbrev(code, name);
  if (abbr.length <= 2) return abbr;
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 1 && name.length >= 2) {
    return name.charAt(0).toUpperCase() + name.charAt(1).toLowerCase();
  }
  return abbr.slice(0, 2);
}

export function teacherInitials(name: string): string {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '';

  const honorifics = new Set(['mr', 'mrs', 'ms', 'miss', 'dr', 'prof']);
  const meaningful = parts.filter((p) => !honorifics.has(p.toLowerCase()));
  if (meaningful.length >= 2) {
    const last = meaningful[meaningful.length - 1];
    if (last.length === 1) {
      const surname = meaningful[meaningful.length - 2];
      return `${surname.charAt(0)}${last.charAt(0)}`.toUpperCase();
    }
    return `${meaningful[0].charAt(0)}${last.charAt(0)}`.toUpperCase();
  }
  if (meaningful.length === 1) return meaningful[0].slice(0, 2).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2);
  return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`;
}

export function isBreakPeriod(period: { slotType?: string }): boolean {
  return period.slotType === 'break';
}

/** Lesson-only index (1, 2, 3…) for timetable headers; null for breaks. */
export function lessonPeriodNumber(periods: { slotType?: string }[], index: number): number | null {
  const period = periods[index];
  if (!period || isBreakPeriod(period)) return null;
  return periods.slice(0, index + 1).filter((p) => !isBreakPeriod(p)).length;
}

/** Count of lesson slots (excludes breaks). */
export function lessonPeriodCount(periods: { slotType?: string }[]): number {
  return periods.filter((p) => !isBreakPeriod(p)).length;
}

function breakDurationMinutes(period: { startTime?: string; endTime?: string }): number {
  const [sh, sm] = String(period.startTime || '0:0').split(':').map(Number);
  const [eh, em] = String(period.endTime || '0:0').split(':').map(Number);
  return eh * 60 + em - (sh * 60 + sm);
}

function breakStartMinutes(period: { startTime?: string }): number {
  const [h, m] = String(period.startTime || '0:0').split(':').map(Number);
  return h * 60 + m;
}

/** Lunch = named lunch, or a long break starting mid-day (e.g. 12:40–13:50). */
export function isLunchBreakPeriod(period: { name?: string; startTime?: string; endTime?: string }): boolean {
  const name = String(period.name || '').trim();
  if (/lunch/i.test(name)) return true;
  const start = breakStartMinutes(period);
  const duration = breakDurationMinutes(period);
  return start >= 11 * 60 + 30 && duration >= 35;
}

/** Short break = morning / mid-morning style slots. */
export function isShortBreakPeriod(period: { name?: string; startTime?: string; endTime?: string }): boolean {
  return !isLunchBreakPeriod(period);
}

/** Short break label for compact headers — e.g. BREAK, LUNCH */
export function breakPeriodLabel(period: { name?: string; startTime?: string; endTime?: string }): string {
  return breakPeriodHeaderTitle(period);
}

export function breakPeriodHeaderTitle(period: { name?: string; startTime?: string; endTime?: string }): string {
  return isLunchBreakPeriod(period) ? 'LUNCH' : 'BREAK';
}

/** Vertical label spanning break columns in the drag board — e.g. BREAK TIME, LUNCH TIME */
export function breakColumnVerticalLabel(period: { name?: string; startTime?: string; endTime?: string }): string {
  return isLunchBreakPeriod(period) ? 'LUNCH TIME' : 'BREAK TIME';
}
