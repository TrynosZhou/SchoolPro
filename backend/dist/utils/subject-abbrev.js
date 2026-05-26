"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatSubjectAbbrev = formatSubjectAbbrev;
/** Short label for mark sheets (prefers subject code, e.g. ENG, MATH). */
function formatSubjectAbbrev(code, name) {
    const normalized = (code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (normalized.length >= 2 && normalized.length <= 8)
        return normalized;
    const words = name.trim().split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
        return words
            .map((w) => w[0])
            .join('')
            .toUpperCase()
            .slice(0, 6);
    }
    if (words.length === 1) {
        const w = words[0].toUpperCase();
        return w.length <= 6 ? w : w.slice(0, 4);
    }
    return '—';
}
