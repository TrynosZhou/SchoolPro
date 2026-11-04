/** Normalize gender to `male` / `female`, or null if unknown. */
export function normalizeGender(input?: string | null): string | null {
  const v = String(input || '').trim().toLowerCase();
  if (!v) return null;
  if (v === 'm' || v === 'male') return 'male';
  if (v === 'f' || v === 'female') return 'female';
  return null;
}

/** Infer gender from guardian relationship labels (Father → male, Mother → female). */
export function inferGenderFromRelationship(relationship?: string | null): string | null {
  const r = String(relationship || '').trim().toLowerCase();
  if (!r) return null;
  if (/\bfather\b|\bdad\b|\bdaddy\b/.test(r)) return 'male';
  if (/\bmother\b|\bmom\b|\bmum\b/.test(r)) return 'female';
  return null;
}

export function resolveParentGender(
  explicit?: string | null,
  relationship?: string | null,
): string | null {
  return normalizeGender(explicit) ?? inferGenderFromRelationship(relationship);
}
