/**
 * Display order for exam types in dropdowns.
 *
 * Mid-term assessments come before end-of-term exams. Every other type keeps
 * the order the server returned, so custom types (e.g. Continuous Assessment)
 * stay where they are.
 */
export function sortExamTypes<T extends { name: string }>(types: T[] | null | undefined): T[] {
  const list = [...(types ?? [])];
  const rank = (name: string): number => {
    const n = name.toLowerCase();
    if (/\bmid\b/.test(n)) return 1;
    if (/\bend\b/.test(n)) return 2;
    return 0;
  };
  return list
    .map((t, index) => ({ t, index, r: rank(t.name) }))
    .sort((a, b) => a.r - b.r || a.index - b.index)
    .map((x) => x.t);
}
