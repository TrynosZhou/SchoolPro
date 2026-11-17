// @ts-nocheck
import { Router, Response } from 'express';
import QRCode from 'qrcode';
import { randomBytes } from 'crypto';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { UserRole } from '../entities/enums';
import { AppDataSource } from '../config/data-source';
import { In, Brackets } from 'typeorm';
import { IdCard, IdCardScan, Student } from '../entities';
import { relations } from '../utils/typeorm-helpers';

const router = Router();

// Every route here needs a signed-in user. Without this, authorize() sees no user and answers 401,
// which the web app treats as an expired session and signs the user out.
router.use(authenticate);
const adminRoles = [UserRole.ADMIN, UserRole.PRINCIPAL, UserRole.DIRECTOR];

function newCode(): string {
  return `SP${randomBytes(5).toString('hex').toUpperCase()}`;
}

/** Returns the student's card, creating it (with a fresh code) the first time. */
async function ensureCardFor(studentId: string): Promise<IdCard> {
  const repo = AppDataSource.getRepository(IdCard);
  const existing = await repo.findOne({ where: { studentId } });
  if (existing) return existing;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await repo.save(repo.create({ studentId, code: newCode() }));
    } catch (err) {
      // Unlikely code collision: try again with a new code.
      const again = await repo.findOne({ where: { studentId } });
      if (again) return again;
      if (attempt === 4) throw err;
    }
  }
  throw new Error('Could not create the ID card.');
}

function qrPayload(code: string, admissionNumber?: string | null): string {
  return JSON.stringify({ card: code, student: admissionNumber || null });
}

/** Finds active students by first name, last name, full name or admission (student) number. */
router.get('/search', authorize(...adminRoles), async (req: AuthRequest, res: Response) => {
  try {
    const q = String(req.query.q ?? '').trim();
    if (q.length < 2) {
      return res.status(400).json({ message: 'Enter at least 2 characters of a name or student ID.' });
    }
    // Escape LIKE wildcards so the user's text is matched literally.
    const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const rows = await AppDataSource.getRepository(Student)
      .createQueryBuilder('s')
      .select(['s.id', 's.firstName', 's.lastName', 's.admissionNumber'])
      .where('"s"."isActive" = :active', { active: true })
      .andWhere(
        new Brackets((qb) => {
          qb.where('"s"."firstName" ILIKE :pattern', { pattern })
            .orWhere('"s"."lastName" ILIKE :pattern', { pattern })
            .orWhere('"s"."admissionNumber" ILIKE :pattern', { pattern })
            .orWhere("CONCAT(\"s\".\"firstName\", ' ', \"s\".\"lastName\") ILIKE :pattern", { pattern });
        }),
      )
      .orderBy('s.lastName', 'ASC')
      .addOrderBy('s.firstName', 'ASC')
      .limit(20)
      .getMany();
    res.json(
      rows.map((r) => ({
        id: r.id,
        firstName: r.firstName,
        lastName: r.lastName,
        admissionNumber: r.admissionNumber,
      })),
    );
  } catch (err) {
    res.status(500).json({ message: (err as Error).message || 'Search failed.' });
  }
});

/** Card data for the ID card page: the card code, its QR image and the student's printed details. */
router.get('/:studentId/card', authorize(...adminRoles), async (req: AuthRequest, res: Response) => {
  try {
    const student = await AppDataSource.getRepository(Student).findOne({
      where: { id: String(req.params.studentId), isActive: true },
      relations: relations('schoolClass', 'schoolClass.form', 'form'),
    });
    if (!student) return res.status(404).json({ message: 'Student not found.' });

    const card = await ensureCardFor(student.id);
    const qrDataUrl = await QRCode.toDataURL(qrPayload(card.code, student.admissionNumber), {
      margin: 1,
      width: 200,
      errorCorrectionLevel: 'M',
    });

    res.json({
      card: { code: card.code, qrDataUrl },
      student: {
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        admissionNumber: student.admissionNumber,
        photoUrl: student.photoUrl || undefined,
        dateOfBirth: student.dateOfBirth || undefined,
        gender: student.gender || undefined,
        className: student.schoolClass?.name || undefined,
        formName: student.form?.name || student.schoolClass?.form?.name || undefined,
      },
    });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message || 'Could not load the ID card.' });
  }
});

/** Creates ID cards for every active student who does not have one yet. */
router.post('/ensure-all', authorize(...adminRoles), async (_req: AuthRequest, res: Response) => {
  try {
    const students = await AppDataSource.getRepository(Student).find({
      where: { isActive: true },
      select: { id: true },
    });
    const cardRepo = AppDataSource.getRepository(IdCard);
    const withCards = new Set((await cardRepo.find({ select: { studentId: true } })).map((c) => c.studentId));
    let created = 0;
    for (const s of students) {
      if (withCards.has(s.id)) continue;
      await ensureCardFor(s.id);
      created += 1;
    }
    res.json({ created, total: students.length });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message || 'Could not generate cards.' });
  }
});

const DIRECTIONS = ['arrival', 'departure'];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function dateOnly(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function timeOnly(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Records an arrival or departure for the student whose card carries the scanned code. */
router.post('/scan', authorize(...adminRoles), async (req: AuthRequest, res: Response) => {
  try {
    const code = String(req.body?.code ?? '').trim();
    const direction = String(req.body?.direction ?? 'arrival').trim().toLowerCase();
    if (!code) return res.status(400).json({ message: 'Scan or enter a card code.' });
    if (!DIRECTIONS.includes(direction)) {
      return res.status(400).json({ message: 'Direction must be arrival or departure.' });
    }

    const card = await AppDataSource.getRepository(IdCard).findOne({ where: { code } });
    if (!card) return res.status(404).json({ message: 'No student ID card matches this code.' });

    const student = await AppDataSource.getRepository(Student).findOne({
      where: { id: card.studentId, isActive: true },
    });
    if (!student) return res.status(404).json({ message: 'This card belongs to an inactive student.' });

    const saved = await AppDataSource.getRepository(IdCardScan).save(
      AppDataSource.getRepository(IdCardScan).create({ studentId: student.id, direction }),
    );
    const when = new Date(saved.scannedAt);

    res.status(201).json({
      student: {
        id: student.id,
        name: `${student.firstName} ${student.lastName}`.trim(),
        admissionNumber: student.admissionNumber,
      },
      scan: {
        id: saved.id,
        direction,
        date: dateOnly(when),
        time: timeOnly(when),
      },
    });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message || 'Scan failed.' });
  }
});

/** Most recent card scans, newest first. */
router.get('/scans', authorize(...adminRoles), async (req: AuthRequest, res: Response) => {
  try {
    const requested = Number(req.query.limit);
    const limit = Number.isInteger(requested) ? Math.min(Math.max(requested, 1), 200) : 50;

    const scans = await AppDataSource.getRepository(IdCardScan).find({
      order: { scannedAt: 'DESC' },
      take: limit,
    });
    const ids = [...new Set(scans.map((s) => s.studentId))];
    const students = ids.length
      ? await AppDataSource.getRepository(Student).find({
          where: { id: In(ids) },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const names = new Map(students.map((s) => [s.id, `${s.firstName} ${s.lastName}`.trim()]));

    res.json(
      scans.map((s) => {
        const when = new Date(s.scannedAt);
        return {
          id: s.id,
          studentId: s.studentId,
          studentName: names.get(s.studentId) || '',
          date: dateOnly(when),
          time: timeOnly(when),
          direction: s.direction,
        };
      }),
    );
  } catch (err) {
    res.status(500).json({ message: (err as Error).message || 'Could not load scans.' });
  }
});

export default router;
