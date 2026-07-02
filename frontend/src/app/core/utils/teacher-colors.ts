export interface TeacherColorStyle {
  background: string;
  color: string;
  border?: string;
}

const TEACHER_PALETTE: TeacherColorStyle[] = [
  { background: '#5b8f6b', color: '#ffffff' },
  { background: '#3d5a80', color: '#ffffff' },
  { background: '#6b8cae', color: '#ffffff' },
  { background: '#8b6b4a', color: '#ffffff' },
  { background: '#7a5c8a', color: '#ffffff' },
  { background: '#4a8a8a', color: '#ffffff' },
  { background: '#9a6b4a', color: '#ffffff' },
  { background: '#f4f4f4', color: '#111827', border: '#94a3b8' },
  { background: '#c45c5c', color: '#ffffff' },
  { background: '#5c7a4a', color: '#ffffff' },
  { background: '#4a6fa5', color: '#ffffff' },
  { background: '#a56b4a', color: '#ffffff' },
];

export function buildTeacherColorMap(teacherIds: string[]): Map<string, TeacherColorStyle> {
  const unique = [...new Set(teacherIds.filter(Boolean))].sort();
  const map = new Map<string, TeacherColorStyle>();
  unique.forEach((id, index) => {
    map.set(id, TEACHER_PALETTE[index % TEACHER_PALETTE.length]);
  });
  return map;
}

export function teacherColorFor(
  teacherId: string,
  colorMap: Map<string, TeacherColorStyle>,
): TeacherColorStyle {
  return colorMap.get(teacherId) || { background: '#e2e8f0', color: '#0f172a', border: '#94a3b8' };
}
