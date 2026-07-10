/** Short label for mark sheets — prefers configured short, then name (e.g. Eng), then alphabetic code. */
export function formatSubjectAbbrev(
  code: string | undefined | null,
  name: string,
  shortLabel?: string | null,
): string {
  const custom = String(shortLabel || '').trim();
  if (custom) return custom;

  const fromName = abbrevFromName(name);
  if (fromName) return fromName;

  const normalized = (code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  // Skip pure numeric exam/board codes (e.g. 0450) — those are not readable column headers.
  if (normalized.length >= 2 && normalized.length <= 8 && /[A-Z]/.test(normalized)) {
    return normalized;
  }

  return '—';
}

function abbrevFromName(name: string): string | null {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;

  if (words.length >= 2) {
    return words
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 6);
  }

  const word = words[0];
  if (word.length <= 3) {
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }
  // e.g. English → Eng, Mathematics → Mat
  return word.charAt(0).toUpperCase() + word.slice(1, 3).toLowerCase();
}
