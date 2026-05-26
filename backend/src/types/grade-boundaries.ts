export interface GradeBoundary {
  grade: string;
  label?: string;
  /** Minimum percentage (inclusive) for this grade. */
  minPercent: number;
}

export const DEFAULT_GRADE_BOUNDARIES: GradeBoundary[] = [
  { grade: 'A', label: 'Excellent', minPercent: 80 },
  { grade: 'B', label: 'Very Good', minPercent: 70 },
  { grade: 'C', label: 'Good', minPercent: 60 },
  { grade: 'D', label: 'Pass', minPercent: 50 },
  { grade: 'E', label: 'Weak Pass', minPercent: 40 },
  { grade: 'U', label: 'Ungraded', minPercent: 0 },
];

export function validateGradeBoundaries(boundaries: GradeBoundary[]): string | null {
  if (!Array.isArray(boundaries) || boundaries.length === 0) {
    return 'At least one grade boundary is required';
  }
  for (const b of boundaries) {
    if (!b.grade?.trim()) return 'Each row needs a grade code (e.g. A, B, C)';
    const min = Number(b.minPercent);
    if (Number.isNaN(min) || min < 0 || min > 100) {
      return 'Minimum percentages must be between 0 and 100';
    }
  }
  const grades = boundaries.map((b) => b.grade.trim().toUpperCase());
  if (new Set(grades).size !== grades.length) return 'Grade codes must be unique';
  if (!boundaries.some((b) => Number(b.minPercent) === 0)) {
    return 'Include one boundary at 0% (lowest band)';
  }
  return null;
}

export function calculateGradeFromBoundaries(
  marks: number,
  max: number,
  boundaries: GradeBoundary[]
): string {
  const pct = max > 0 ? (marks / max) * 100 : 0;
  const sorted = [...boundaries].sort((a, b) => b.minPercent - a.minPercent);
  for (const b of sorted) {
    if (pct >= Number(b.minPercent)) return b.grade.trim();
  }
  return sorted[sorted.length - 1]?.grade?.trim() ?? 'U';
}
