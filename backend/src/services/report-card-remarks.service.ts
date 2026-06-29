import { SubjectResultRow } from './report-card.service';

export interface ReportCardRemarksInput {
  firstName: string;
  lastName: string;
  averageMark?: number | null;
  overallGrade?: string | null;
  subjectsPassed?: number | null;
  totalSubjects?: number | null;
  subjectResults: SubjectResultRow[];
  classTeacherName?: string | null;
}

export interface ReportCardRemarksResult {
  classTeacherRemarks: string;
  principalRemarks: string;
}

function cleanName(value: string): string {
  return value.trim();
}

function subjectLabel(row: SubjectResultRow): string {
  return (row.subjectName || row.subject || '').split(' — ')[0].trim() || 'this subject';
}

function pickBestSubject(rows: SubjectResultRow[]): string | null {
  if (!rows.length) return null;
  const sorted = [...rows].sort((a, b) => Number(b.marks) - Number(a.marks));
  return subjectLabel(sorted[0]);
}

function pickFocusSubject(rows: SubjectResultRow[]): string | null {
  if (!rows.length) return null;
  const sorted = [...rows].sort((a, b) => Number(a.marks) - Number(b.marks));
  return subjectLabel(sorted[0]);
}

/** Remove redundant "by {student name}" and duplicate name mentions in saved remarks. */
export function sanitizeReportCardRemark(
  text: string,
  firstName: string,
  lastName: string,
): string {
  let result = (text || '').trim();
  if (!result) return result;

  const first = cleanName(firstName);
  const last = cleanName(lastName);
  const fullName = `${first} ${last}`.trim();
  if (!fullName) return result;

  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const fullPattern = escape(fullName);

  // e.g. "Deda Trena shows real potential by Deda Trena." → drop trailing "by Deda Trena"
  result = result.replace(new RegExp(`(\\b${fullPattern}\\b[^.]*?)\\s+by\\s+${fullPattern}\\.?`, 'gi'), '$1.');
  result = result.replace(new RegExp(`\\s+by\\s+${fullPattern}\\.?`, 'gi'), '.');

  // Collapse accidental double name at sentence start
  result = result.replace(
    new RegExp(`^(${fullPattern})\\s+\\1\\b`, 'i'),
    '$1',
  );

  return result.replace(/\.\s*\./g, '.').replace(/\s{2,}/g, ' ').trim();
}

export function buildReportCardRemarks(input: ReportCardRemarksInput): ReportCardRemarksResult {
  const firstName = cleanName(input.firstName) || 'The learner';
  const avg = input.averageMark != null ? Number(input.averageMark) : null;
  const bestSubject = pickBestSubject(input.subjectResults);
  const focusSubject = pickFocusSubject(input.subjectResults);
  const focus = focusSubject || 'weaker subjects';
  const strength = bestSubject || 'several subjects';

  let classTeacherBody: string;
  let principalBody: string;

  if (avg != null && avg >= 80) {
    classTeacherBody = `${firstName} has achieved excellent results this term, with notable strength in ${strength}. Maintain this standard of effort and conduct.`;
    principalBody = `An outstanding performance this term. Commended for academic excellence and positive conduct.`;
  } else if (avg != null && avg >= 65) {
    classTeacherBody = `${firstName} has performed well overall, particularly in ${strength}. Continued consistency should yield further improvement.`;
    principalBody = `A good performance this term. With sustained effort, especially in ${focus}, results can improve further.`;
  } else if (avg != null && avg >= 50) {
    classTeacherBody = `${firstName} shows real potential. Continued dedication in ${focus}, alongside strengths in other subjects, should lead to stronger results.`;
    principalBody = `A satisfactory performance with room for growth. More focus on ${focus}, while building on existing strengths, is encouraged.`;
  } else {
    classTeacherBody = `${firstName} needs to apply greater effort across subjects, with priority given to ${focus}. Improved study habits are required.`;
    principalBody = `Performance is below the expected standard. Immediate improvement in ${focus} and overall commitment to learning is required.`;
  }

  const teacherName = (input.classTeacherName || '').trim();
  const classTeacherRemarks = teacherName
    ? `${classTeacherBody}\n\n${teacherName}`
    : classTeacherBody;

  return {
    classTeacherRemarks: sanitizeReportCardRemark(classTeacherRemarks, input.firstName, input.lastName),
    principalRemarks: sanitizeReportCardRemark(principalBody, input.firstName, input.lastName),
  };
}
