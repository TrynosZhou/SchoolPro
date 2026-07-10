"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeGender = normalizeGender;
exports.inferGenderFromRelationship = inferGenderFromRelationship;
exports.resolveParentGender = resolveParentGender;
/** Normalize gender to `male` / `female`, or null if unknown. */
function normalizeGender(input) {
    const v = String(input || '').trim().toLowerCase();
    if (!v)
        return null;
    if (v === 'm' || v === 'male')
        return 'male';
    if (v === 'f' || v === 'female')
        return 'female';
    return null;
}
/** Infer gender from guardian relationship labels (Father → male, Mother → female). */
function inferGenderFromRelationship(relationship) {
    const r = String(relationship || '').trim().toLowerCase();
    if (!r)
        return null;
    if (/\bfather\b|\bdad\b|\bdaddy\b/.test(r))
        return 'male';
    if (/\bmother\b|\bmom\b|\bmum\b/.test(r))
        return 'female';
    return null;
}
function resolveParentGender(explicit, relationship) {
    return normalizeGender(explicit) ?? inferGenderFromRelationship(relationship);
}
