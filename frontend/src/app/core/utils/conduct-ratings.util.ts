export type ConductRating = 'excellent' | 'good' | 'satisfactory' | 'needs_improvement' | 'poor';

export const CONDUCT_RATING_OPTIONS: { value: ConductRating; label: string }[] = [
  { value: 'excellent', label: 'Excellent' },
  { value: 'good', label: 'Good' },
  { value: 'satisfactory', label: 'Satisfactory' },
  { value: 'needs_improvement', label: 'Needs improvement' },
  { value: 'poor', label: 'Poor' },
];

export function conductRatingLabel(value?: string | null): string {
  return CONDUCT_RATING_OPTIONS.find((o) => o.value === value)?.label || '—';
}
