/** Class option shape used in dropdowns across the app. */
export interface ClassOptionLike {
  id?: string;
  name: string;
  form?: { name: string };
}

/** Label for class select options — class name only (e.g. 1A, 4B). */
export function classSelectLabel(c: ClassOptionLike): string {
  return c.name;
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
