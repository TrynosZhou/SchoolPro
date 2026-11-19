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

/** Returns a clean honorific (Mr, Mrs, Ms, Miss, Dr, Prof, Rev, Eng, Hon) or '' when not one. */
export function normalizeHonorific(input?: string | null): string {
  const raw = String(input || '').trim().replace(/\.$/, '');
  return /^(mr|mrs|ms|miss|dr|prof|rev|eng|hon)$/i.test(raw)
    ? raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase()
    : '';
}

/**
 * Normalizes the personal details sent from a form into column values.
 * Marital status / maiden-name only apply to women.
 */
export function buildPersonalDetails(
  input: { gender?: unknown; maritalStatus?: unknown; usesMaidenName?: unknown },
  current: { gender?: string | null; maritalStatus?: string | null; usesMaidenName?: boolean | null } = {},
) {
  const gender =
    input.gender !== undefined ? normalizeGender(input.gender as string) : normalizeGender(current.gender);
  const rawMarital = input.maritalStatus !== undefined ? (input.maritalStatus as string) : current.maritalStatus;
  const maritalStatus = gender === 'female' ? normalizeMaritalStatus(rawMarital) : null;
  const maiden = input.usesMaidenName !== undefined ? input.usesMaidenName : current.usesMaidenName;
  return { gender, maritalStatus, usesMaidenName: resolveUsesMaidenName(gender, maritalStatus, maiden) };
}

/** Normalize marital status to `single` / `married`, or null if unknown. */
export function normalizeMaritalStatus(input?: string | null): string | null {
  const v = String(input || '').trim().toLowerCase();
  if (!v) return null;
  if (v === 'single' || v === 'unmarried' || v === 'miss') return 'single';
  if (v === 'married' || v === 'mrs' || v === 'ms') return 'married';
  return null;
}

/** Only a married woman can keep her maiden name; everything else is `false`. */
export function resolveUsesMaidenName(
  gender: string | null | undefined,
  maritalStatus: string | null | undefined,
  usesMaidenName: unknown,
): boolean {
  return (
    normalizeGender(gender) === 'female' &&
    normalizeMaritalStatus(maritalStatus) === 'married' &&
    (usesMaidenName === true || usesMaidenName === 'true' || usesMaidenName === 1 || usesMaidenName === '1')
  );
}
