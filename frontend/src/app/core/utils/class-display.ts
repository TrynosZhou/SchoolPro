/** Class option shape used in dropdowns across the app. */
export interface ClassOptionLike {
  id?: string;
  name: string;
  form?: { name: string; level?: number };
}

/** True for A-level forms (Form 5 and Form 6). */
export function isALevelForm(form?: { name?: string; level?: number } | null): boolean {
  if (!form) return false;
  const level = Number(form.level);
  if (level === 5 || level === 6) return true;
  const name = String(form.name || '').trim().toLowerCase();
  if (/^form\s*[56]\b/.test(name)) return true;
  if (/\b(lower|upper)\s*(six|6)\b/.test(name)) return true;
  if (/\b(l6|u6)\b/.test(name)) return true;
  return false;
}

/** True when a class belongs to Form 5 / Form 6 (A-level). */
export function isALevelClassOption(
  cls?: { name?: string; form?: { name?: string; level?: number } } | null,
): boolean {
  if (!cls) return false;
  if (isALevelForm(cls.form)) return true;
  const name = String(cls.name || '').trim().toLowerCase();
  if (/^(l6|u6|l\s*6|u\s*6)\b/.test(name)) return true;
  if (/^5[a-z0-9]/i.test(name)) return true;
  return false;
}

/** Label for class select options — class name only (e.g. 1A, 4B). */
export function classSelectLabel(c: ClassOptionLike): string {
  return c.name;
}

/** Standard student class label — e.g. Class 1A (uses class name only, not form). */
export function formatStudentClassLabel(className?: string | null): string {
  const name = String(className || '').trim();
  if (!name) return '—';
  return classHeaderLabel({ name });
}

/** Report card class value when the label already says "Class:" — e.g. L6 Sci, 1A. */
export function reportCardClassValue(className?: string | null): string {
  const name = String(className || '').trim();
  if (!name) return '—';
  return name.replace(/^class\s+/i, '');
}

/** @deprecated Prefer formatStudentClassLabel(className) — form is not shown in class labels. */
export function formatStudentClassFromParts(
  className?: string | null,
  _formName?: string | null,
): string {
  return formatStudentClassLabel(className);
}

export function formatGenderLabel(gender?: string | null): string {
  const raw = String(gender || '').trim();
  if (!raw) return '—';
  const v = raw.toLowerCase();
  if (v === 'm' || v === 'male') return 'Male';
  if (v === 'f' || v === 'female') return 'Female';
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/** Resolved display name after a class is selected (headers, filenames, etc.). */
export function classDisplayName(
  classes: ClassOptionLike[],
  classId: string | undefined | null,
): string {
  if (!classId) return '';
  return classes.find((c) => c.id === classId)?.name ?? '';
}

/** Header / picker label — e.g. Class 1A (not Form 1 1A). */
export function classHeaderLabel(c: ClassOptionLike | undefined | null): string {
  const name = c?.name?.trim();
  if (!name) return '';
  return /^class\s+/i.test(name) ? name : `Class ${name}`;
}

export function classHeaderLabelById(
  classes: ClassOptionLike[],
  classId: string | undefined | null,
): string {
  if (!classId) return '';
  return classHeaderLabel(classes.find((c) => c.id === classId));
}

/** Label for promotion rules — class name only (e.g. 1A, 4B). */
export function promotionClassLabel(c: ClassOptionLike): string {
  return c.name?.trim() || '—';
}
