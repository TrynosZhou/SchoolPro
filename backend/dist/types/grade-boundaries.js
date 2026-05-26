"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_GRADE_BOUNDARIES = void 0;
exports.validateGradeBoundaries = validateGradeBoundaries;
exports.calculateGradeFromBoundaries = calculateGradeFromBoundaries;
exports.DEFAULT_GRADE_BOUNDARIES = [
    { grade: 'A', label: 'Excellent', minPercent: 80 },
    { grade: 'B', label: 'Very Good', minPercent: 70 },
    { grade: 'C', label: 'Good', minPercent: 60 },
    { grade: 'D', label: 'Pass', minPercent: 50 },
    { grade: 'E', label: 'Weak Pass', minPercent: 40 },
    { grade: 'U', label: 'Ungraded', minPercent: 0 },
];
function validateGradeBoundaries(boundaries) {
    if (!Array.isArray(boundaries) || boundaries.length === 0) {
        return 'At least one grade boundary is required';
    }
    for (const b of boundaries) {
        if (!b.grade?.trim())
            return 'Each row needs a grade code (e.g. A, B, C)';
        const min = Number(b.minPercent);
        if (Number.isNaN(min) || min < 0 || min > 100) {
            return 'Minimum percentages must be between 0 and 100';
        }
    }
    const grades = boundaries.map((b) => b.grade.trim().toUpperCase());
    if (new Set(grades).size !== grades.length)
        return 'Grade codes must be unique';
    if (!boundaries.some((b) => Number(b.minPercent) === 0)) {
        return 'Include one boundary at 0% (lowest band)';
    }
    return null;
}
function calculateGradeFromBoundaries(marks, max, boundaries) {
    const pct = max > 0 ? (marks / max) * 100 : 0;
    const sorted = [...boundaries].sort((a, b) => b.minPercent - a.minPercent);
    for (const b of sorted) {
        if (pct >= Number(b.minPercent))
            return b.grade.trim();
    }
    return sorted[sorted.length - 1]?.grade?.trim() ?? 'U';
}
