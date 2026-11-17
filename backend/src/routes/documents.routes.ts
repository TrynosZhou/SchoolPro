// @ts-nocheck
import { Router, Response } from 'express';
import { randomBytes } from 'crypto';
import { Brackets, In } from 'typeorm';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { UserRole } from '../entities/enums';
import { AppDataSource } from '../config/data-source';
import { IssuedDocument, Student } from '../entities';
import { loadSchoolBranding } from '../services/school-branding.service';
import { buildLetterHtml } from '../utils/document-letter.html';

const router = Router();
// Every route needs a signed-in user; see id-cards.routes.ts for why this matters.
router.use(authenticate);

const adminRoles = [UserRole.ADMIN, UserRole.PRINCIPAL, UserRole.DIRECTOR];
const DOCUMENT_TYPES = ['transfer', 'bonafide', 'testimonial', 'achievement', 'completion', 'other'];

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function newReference(): string {
  const year = new Date().getFullYear();
  return `DOC-${year}-${randomBytes(4).toString('hex').toUpperCase()}`;
}

/** Lists issued documents, optionally filtered by type and a search term. */
router.get('/', authorize(...adminRoles), async (req: AuthRequest, res: Response) => {
  try {
    const type = String(req.query.type ?? '').trim();
    const q = String(req.query.q ?? '').trim();
    const qb = AppDataSource.getRepository(IssuedDocument)
      .createQueryBuilder('d')
      .leftJoin(Student, 's', 'CAST("s"."id" AS text) = CAST("d"."studentId" AS text)');
    if (type && DOCUMENT_TYPES.includes(type)) qb.andWhere('"d"."type" = :type', { type });
    if (q) {
      const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      qb.andWhere(
        new Brackets((w) => {
          w.where('"d"."title" ILIKE :pattern', { pattern })
            .orWhere('"d"."referenceCode" ILIKE :pattern', { pattern })
            .orWhere('"d"."recipientName" ILIKE :pattern', { pattern })
            .orWhere('"s"."firstName" ILIKE :pattern', { pattern })
            .orWhere('"s"."lastName" ILIKE :pattern', { pattern })
            .orWhere("CONCAT(\"s\".\"firstName\", ' ', \"s\".\"lastName\") ILIKE :pattern", { pattern });
        }),
      );
    }
    const rows = await qb.orderBy('"d"."issuedAt"', 'DESC').limit(200).getMany();

    // Show the student's full name, built from the students table.
    const ids = [...new Set(rows.map((r) => r.studentId).filter(Boolean))];
    const students = ids.length
      ? await AppDataSource.getRepository(Student).find({
          where: { id: In(ids) },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const names = new Map(students.map((st) => [st.id, `${st.firstName} ${st.lastName}`.trim()]));
    res.json(rows.map((r) => ({ ...r, studentName: r.studentId ? names.get(r.studentId) || null : null })));
  } catch (err) {
    res.status(500).json({ message: (err as Error).message || 'Could not load documents.' });
  }
});

/** Issues a new document. The student's name is copied onto the document when a student is chosen. */
router.post('/', authorize(...adminRoles), async (req: AuthRequest, res: Response) => {
  try {
    const body = req.body || {};
    const type = String(body.type ?? '').trim();
    const title = String(body.title ?? '').trim();
    const text = String(body.body ?? '').trim();
    if (!DOCUMENT_TYPES.includes(type)) return res.status(400).json({ message: 'Choose a valid document type.' });
    if (!title) return res.status(400).json({ message: 'Enter a title.' });
    if (!text) return res.status(400).json({ message: 'Enter the document text.' });

    let studentId = null;
    if (body.studentId) {
      const student = await AppDataSource.getRepository(Student).findOne({ where: { id: String(body.studentId) } });
      if (!student) return res.status(404).json({ message: 'Student not found.' });
      studentId = student.id;
    }

    const repo = AppDataSource.getRepository(IssuedDocument);
    const saved = await repo.save(
      repo.create({
        type,
        title: title.slice(0, 200),
        body: text,
        referenceCode: newReference(),
        studentId,
        recipientName: body.recipientName ? String(body.recipientName).trim().slice(0, 200) : null,
        issuedByName: req.user?.email || null,
        issuedAt: new Date(),
      }),
    );
    res.status(201).json(saved);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message || 'Could not issue the document.' });
  }
});

/** Printable HTML version of a document, with the school's details at the top. */
router.get('/:id/print', authorize(...adminRoles), async (req: AuthRequest, res: Response) => {
  try {
    const doc = await AppDataSource.getRepository(IssuedDocument).findOne({ where: { id: String(req.params.id) } });
    if (!doc) return res.status(404).json({ message: 'Document not found.' });
    const school = await loadSchoolBranding();
    const html = await buildLetterHtml(doc, school);
    res.type('html').send(html);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message || 'Could not print the document.' });
  }
});

export default router;
