import { AppDataSource } from '../config/data-source';
import {
  ExamType,
  Guardian,
  ReportCard,
  ReportCardView,
  ResultsPublication,
  Term,
} from '../entities';

export interface ReportAccessChild {
  studentId: string;
  firstName: string;
  lastName: string;
  admissionNumber?: string;
  className?: string;
  formName?: string;
  relationship?: string;
  viewed: boolean;
  viewedAt?: string | null;
}

export interface ReportAccessParent {
  parentId: string;
  name: string;
  email?: string;
  phone?: string;
  totalChildren: number;
  viewedChildren: number;
  unviewedChildren: number;
  children: ReportAccessChild[];
}

export interface ReportAccessResult {
  term: { id: string; name: string; isCurrent: boolean } | null;
  examType: { id: string; name: string } | null;
  published: boolean;
  totalParents: number;
  parentsPending: number;
  parentsCompleted: number;
  parents: ReportAccessParent[];
}

/**
 * Record that a parent opened a linked child's report card for a term + exam type.
 * Idempotent per (parent, child, term, exam type); repeat opens bump the counter.
 * Never throws – tracking must not break the report card view itself.
 */
export async function recordParentReportView(params: {
  parentId: string;
  studentId: string;
  termId: string;
  examTypeId?: string | null;
}): Promise<void> {
  const { parentId, studentId, termId, examTypeId } = params;
  if (!parentId || !studentId || !termId || !examTypeId) return;
  try {
    await AppDataSource.query(
      `INSERT INTO "report_card_views"
         ("parentId", "studentId", "termId", "examTypeId", "firstViewedAt", "lastViewedAt", "viewCount")
       VALUES ($1, $2, $3, $4, now(), now(), 1)
       ON CONFLICT ("parentId", "studentId", "termId", "examTypeId")
       DO UPDATE SET "lastViewedAt" = now(), "viewCount" = "report_card_views"."viewCount" + 1`,
      [parentId, studentId, termId, examTypeId],
    );
  } catch (err) {
    console.error('Failed to record report card view:', err);
  }
}

/** Current term = flagged current, else the most recently starting term. */
async function resolveTerm(termId?: string): Promise<Term | null> {
  const repo = AppDataSource.getRepository(Term);
  if (termId) return repo.findOne({ where: { id: termId } });
  const current = await repo.find({ where: { isCurrent: true }, take: 1 });
  if (current[0]) return current[0];
  const latest = await repo.find({ order: { startDate: 'DESC' }, take: 1 });
  return latest[0] ?? null;
}

/**
 * Current exam type = the exam type whose results were most recently published for
 * the term (exam types have no "current" flag; parents can only open published results).
 */
async function resolveExamType(termId: string, examTypeId?: string): Promise<ExamType | null> {
  const repo = AppDataSource.getRepository(ExamType);
  if (examTypeId) return repo.findOne({ where: { id: examTypeId } });
  const pubs = await AppDataSource.getRepository(ResultsPublication).find({
    where: { termId },
    order: { publishedAt: 'DESC' },
    take: 1,
  });
  if (!pubs[0]) return null;
  return repo.findOne({ where: { id: pubs[0].examTypeId } });
}

export async function buildReportAccessReport(opts: {
  termId?: string;
  examTypeId?: string;
}): Promise<ReportAccessResult> {
  const term = await resolveTerm(opts.termId);
  const empty: ReportAccessResult = {
    term: term ? { id: term.id, name: term.name, isCurrent: !!term.isCurrent } : null,
    examType: null,
    published: false,
    totalParents: 0,
    parentsPending: 0,
    parentsCompleted: 0,
    parents: [],
  };
  if (!term) return empty;

  const examType = await resolveExamType(term.id, opts.examTypeId);
  if (!examType) return empty;
  empty.examType = { id: examType.id, name: examType.name };

  const publication = await AppDataSource.getRepository(ResultsPublication).findOne({
    where: { termId: term.id, examTypeId: examType.id },
  });
  if (!publication) return empty;
  empty.published = true;

  // Children with a published report card for this term + exam type, and their linked parents.
  const rows = await AppDataSource.getRepository(Guardian)
    .createQueryBuilder('g')
    .innerJoin('g.student', 's')
    .innerJoin('g.parent', 'p')
    .innerJoin('p.user', 'u')
    .leftJoin('s.schoolClass', 'sc')
    .leftJoin('sc.form', 'f')
    .innerJoin(
      ReportCard,
      'rc',
      'rc.studentId = s.id AND rc.termId = :termId AND rc.examTypeId = :examTypeId AND rc.isPublished = true',
      { termId: term.id, examTypeId: examType.id },
    )
    .select([
      'p.id AS "parentId"',
      'u.firstName AS "parentFirstName"',
      'u.lastName AS "parentLastName"',
      'u.email AS "parentEmail"',
      'u.phone AS "parentPhone"',
      's.id AS "studentId"',
      's.firstName AS "firstName"',
      's.lastName AS "lastName"',
      's.admissionNumber AS "admissionNumber"',
      'sc.name AS "className"',
      'f.name AS "formName"',
      'g.relationship AS "relationship"',
    ])
    .where('g.parentId IS NOT NULL')
    .andWhere('s.isActive = true')
    .orderBy('u.lastName', 'ASC')
    .addOrderBy('u.firstName', 'ASC')
    .addOrderBy('s.lastName', 'ASC')
    .addOrderBy('s.firstName', 'ASC')
    .getRawMany();

  const views = await AppDataSource.getRepository(ReportCardView).find({
    where: { termId: term.id, examTypeId: examType.id },
  });
  const viewedAt = new Map<string, Date>();
  for (const v of views) viewedAt.set(`${v.parentId}:${v.studentId}`, v.lastViewedAt);

  const byParent = new Map<string, ReportAccessParent>();
  for (const r of rows) {
    let parent = byParent.get(r.parentId);
    if (!parent) {
      parent = {
        parentId: r.parentId,
        name: `${r.parentFirstName ?? ''} ${r.parentLastName ?? ''}`.trim() || 'Unnamed parent',
        email: r.parentEmail ?? undefined,
        phone: r.parentPhone ?? undefined,
        totalChildren: 0,
        viewedChildren: 0,
        unviewedChildren: 0,
        children: [],
      };
      byParent.set(r.parentId, parent);
    }
    // A child could be linked twice to the same parent – list once.
    if (parent.children.some((c) => c.studentId === r.studentId)) continue;
    const seen = viewedAt.get(`${r.parentId}:${r.studentId}`);
    parent.children.push({
      studentId: r.studentId,
      firstName: r.firstName,
      lastName: r.lastName,
      admissionNumber: r.admissionNumber ?? undefined,
      className: r.className ?? undefined,
      formName: r.formName ?? undefined,
      relationship: r.relationship ?? undefined,
      viewed: !!seen,
      viewedAt: seen ? new Date(seen).toISOString() : null,
    });
  }

  const all = [...byParent.values()];
  for (const p of all) {
    p.totalChildren = p.children.length;
    p.viewedChildren = p.children.filter((c) => c.viewed).length;
    p.unviewedChildren = p.totalChildren - p.viewedChildren;
  }
  // Parents only appear while at least one child's report card is still unseen.
  const pending = all.filter((p) => p.unviewedChildren > 0);

  return {
    ...empty,
    totalParents: all.length,
    parentsPending: pending.length,
    parentsCompleted: all.length - pending.length,
    parents: pending,
  };
}
