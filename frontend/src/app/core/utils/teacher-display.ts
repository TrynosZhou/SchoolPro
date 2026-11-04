const HONORIFICS = new Set(['mr', 'mrs', 'ms', 'miss', 'dr', 'prof']);

export const TEACHER_TITLE_OPTIONS = ['Mr', 'Mrs', 'Ms', 'Miss', 'Dr', 'Prof'] as const;

export type TeacherTitle = (typeof TEACHER_TITLE_OPTIONS)[number];

export function formatTeacherTimetableName(input: {
  title?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}): string {
  const first = String(input.firstName || '').trim();
  const last = String(input.lastName || '').trim();
  const title = String(input.title || '').trim();
  const initial = first ? first.charAt(0).toUpperCase() : '';

  if (last && initial) {
    return title ? `${title} ${last} ${initial}` : `${last} ${initial}`;
  }
  if (last) return title ? `${title} ${last}` : last;
  if (first) return title ? `${title} ${first}` : first;
  return title || 'Teacher';
}

export function teacherInitialsFromDisplayName(name: string): string {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '';

  const meaningful = parts.filter((p) => !HONORIFICS.has(p.toLowerCase()));
  if (meaningful.length >= 2) {
    const last = meaningful[meaningful.length - 1];
    if (last.length === 1) {
      const surname = meaningful[meaningful.length - 2];
      return `${surname.charAt(0)}${last.charAt(0)}`.toUpperCase();
    }
    return `${meaningful[0].charAt(0)}${last.charAt(0)}`.toUpperCase();
  }
  if (meaningful.length === 1) return meaningful[0].slice(0, 2).toUpperCase();
  return parts[0].slice(0, 2).toUpperCase();
}
