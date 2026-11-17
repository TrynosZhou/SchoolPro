// @ts-nocheck
import { Router, Response } from 'express';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { UserRole } from '../entities/enums';
import { AppDataSource } from '../config/data-source';
import { LibraryBook, LibraryLoan } from '../entities/PhysicalLibrary';
import { Student, Staff } from '../entities';
import { notifyStudentParents } from '../services/parent-notify.service';
import { studentNames, staffNames } from '../utils/lookups';
import { today } from '../utils/helpers';
import { In } from 'typeorm';
import crypto from 'crypto';

const router = Router();

const MANAGE: UserRole[] = [UserRole.ADMIN, UserRole.PRINCIPAL, UserRole.DIRECTOR];
const LIBRARY_STAFF: UserRole[] = [...MANAGE, UserRole.TEACHER];

/** Daily fine rate per overdue day (configurable later via settings). */
const FINE_PER_DAY = 0.5;

router.use(authenticate);

// ---------------- Catalogue ----------------

router.get('/books', async (req: AuthRequest, res: Response) => {
  try {
    const { q, category } = req.query as any;
    const repo = AppDataSource.getRepository(LibraryBook);
    const qb = repo.createQueryBuilder('b').orderBy('b.title', 'ASC');
    if (category) qb.andWhere('b.category = :category', { category });
    if (q) {
      qb.andWhere('(b.title ILIKE :q OR b.author ILIKE :q OR b.isbn ILIKE :q OR b.barcode ILIKE :q)', {
        q: `%${q}%`,
      });
    }
    const rows = await qb.getMany();
    res.json(rows);
  } catch (e) {
    console.error('[library:books]', e);
    res.status(500).json({ message: 'Could not load books.' });
  }
});

router.post('/books', authorize(...LIBRARY_STAFF), async (req: AuthRequest, res: Response) => {
  try {
    const b = req.body ?? {};
    if (!b.title) return res.status(400).json({ message: 'title is required.' });
    const repo = AppDataSource.getRepository(LibraryBook);
    const totalCopies = Math.max(1, Number(b.totalCopies) || 1);
    const row = await repo.save(
      repo.create({
        isbn: b.isbn || undefined,
        barcode: b.barcode || `BK-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
        title: b.title,
        author: b.author || undefined,
        publisher: b.publisher || undefined,
        category: b.category || undefined,
        totalCopies,
        availableCopies: totalCopies,
        shelfLocation: b.shelfLocation || undefined,
      }),
    );
    res.status(201).json(row);
  } catch (e) {
    console.error('[library:create-book]', e);
    res.status(500).json({ message: 'Could not create book.' });
  }
});

router.patch('/books/:id', authorize(...LIBRARY_STAFF), async (req: AuthRequest, res: Response) => {
  try {
    const repo = AppDataSource.getRepository(LibraryBook);
    const row = await repo.findOne({ where: { id: String(req.params.id) } });
    if (!row) return res.status(404).json({ message: 'Book not found.' });
    const b = req.body ?? {};
    const fields = ['isbn', 'barcode', 'title', 'author', 'publisher', 'category', 'totalCopies', 'shelfLocation', 'isActive'];
    for (const f of fields) if (b[f] !== undefined) (row as any)[f] = b[f];
    // keep availableCopies consistent when totalCopies changes
    if (b.totalCopies !== undefined) {
      const issued = await AppDataSource.getRepository(LibraryLoan).count({
        where: { bookId: row.id, status: 'issued' as any },
      });
      row.availableCopies = Math.max(0, Number(row.totalCopies) - issued);
    }
    await repo.save(row);
    res.json(row);
  } catch (e) {
    console.error('[library:update-book]', e);
    res.status(500).json({ message: 'Could not update book.' });
  }
});

/** Lookup by barcode/ISBN for scanning. */
router.get('/books/lookup/:code', async (req: AuthRequest, res: Response) => {
  try {
    const code = String(req.params.code);
    const book = await AppDataSource.getRepository(LibraryBook).findOne({
      where: [{ barcode: code }, { isbn: code }],
    });
    if (!book) return res.status(404).json({ message: 'Book not found.' });
    res.json(book);
  } catch (e) {
    res.status(500).json({ message: 'Lookup failed.' });
  }
});

// ---------------- Loans ----------------

router.get('/loans', authorize(...LIBRARY_STAFF), async (req: AuthRequest, res: Response) => {
  try {
    const { status, studentId, staffId, overdue } = req.query as any;
    const repo = AppDataSource.getRepository(LibraryLoan);
    const qb = repo.createQueryBuilder('l').orderBy('l.issueDate', 'DESC');
    if (status) qb.andWhere('l.status = :status', { status });
    if (studentId) qb.andWhere('l.borrowerStudentId = :studentId', { studentId });
    if (staffId) qb.andWhere('l.borrowerStaffId = :staffId', { staffId });
    let rows = await qb.take(500).getMany();
    if (overdue === 'true') rows = rows.filter((r) => r.status === 'issued' && r.dueDate < today());

    const bookIds = [...new Set(rows.map((r) => r.bookId))];
    const books = bookIds.length
      ? await AppDataSource.getRepository(LibraryBook).find({ where: { id: In(bookIds) } })
      : [];
    const [sNames, tNames] = await Promise.all([
      studentNames(rows.map((r) => r.borrowerStudentId)),
      staffNames(rows.map((r) => r.borrowerStaffId)),
    ]);
    res.json(
      rows.map((r) => ({
        ...r,
        book: books.find((b) => b.id === r.bookId),
        borrowerName:
          r.borrowerName ||
          (r.borrowerType === 'staff' ? tNames.get(r.borrowerStaffId || '') : sNames.get(r.borrowerStudentId || '')),
      })),
    );
  } catch (e) {
    console.error('[library:loans]', e);
    res.status(500).json({ message: 'Could not load loans.' });
  }
});

router.post('/loans', authorize(...LIBRARY_STAFF), async (req: AuthRequest, res: Response) => {
  try {
    const b = req.body ?? {};
    const bookId = b.bookId || b.barcode; // accept scanned barcode
    if (!bookId) return res.status(400).json({ message: 'bookId or barcode is required.' });

    const bookRepo = AppDataSource.getRepository(LibraryBook);
    const book = await bookRepo.findOne({ where: [{ id: bookId }, { barcode: bookId }] });
    if (!book || !book.isActive) return res.status(404).json({ message: 'Book not found.' });
    if (book.availableCopies <= 0) return res.status(409).json({ message: 'No copies available.' });

    const borrowerType = b.borrowerType || (b.studentId ? 'student' : 'staff');
    if (borrowerType === 'student' && !b.studentId) {
      return res.status(400).json({ message: 'studentId is required for student borrowers.' });
    }
    if (borrowerType === 'staff' && !b.staffId && !b.borrowerName) {
      return res.status(400).json({ message: 'staffId or borrowerName is required for staff borrowers.' });
    }

    const loanRepo = AppDataSource.getRepository(LibraryLoan);
    const dueDate = b.dueDate || addDays(today(), 14);
    const issueDate = today();
    const row = await loanRepo.save(
      loanRepo.create({
        bookId: book.id,
        copyNumber: b.copyNumber || 1,
        borrowerType,
        borrowerStudentId: b.studentId || undefined,
        borrowerStaffId: b.staffId || undefined,
        borrowerName: b.borrowerName || undefined,
        issueDate,
        dueDate,
        status: 'issued',
        issuedById: req.user!.userId,
      }),
    );
    await bookRepo.update(book.id, { availableCopies: book.availableCopies - 1 });

    // Notify student borrower
    if (b.studentId) {
      const names = await studentNames([b.studentId]);
      await notifyStudentParents([b.studentId], {
        title: 'Library book issued',
        message: `${names.get(b.studentId) || 'Your child'} borrowed "${book.title}" — due ${dueDate}.`,
        type: 'library',
        metadata: { loanId: row.id, bookId: book.id },
      }).catch(() => undefined);
    }

    res.status(201).json({ ...row, book });
  } catch (e) {
    console.error('[library:issue]', e);
    res.status(500).json({ message: 'Could not issue book.' });
  }
});

/** Return a loan — by id or by scanning barcode again. */
router.post('/loans/return', authorize(...LIBRARY_STAFF), async (req: AuthRequest, res: Response) => {
  try {
    const { loanId, barcode } = req.body ?? {};
    const loanRepo = AppDataSource.getRepository(LibraryLoan);
    const bookRepo = AppDataSource.getRepository(LibraryBook);

    let loan: LibraryLoan | null = null;
    if (loanId) {
      loan = await loanRepo.findOne({ where: { id: loanId, status: 'issued' as any } });
    } else if (barcode) {
      const book = await bookRepo.findOne({ where: { barcode } });
      if (book) {
        loan = await loanRepo.findOne({ where: { bookId: book.id, status: 'issued' as any }, order: { issueDate: 'ASC' } as any });
      }
    }
    if (!loan) return res.status(404).json({ message: 'No active loan found for this scan.' });

    const returnDate = today();
    const overdueDays = Math.max(0, daysBetween(loan.dueDate, returnDate));
    const fine = Number((overdueDays * FINE_PER_DAY).toFixed(2));
    loan.status = 'returned';
    loan.returnDate = returnDate;
    loan.fineAmount = fine as any;
    await loanRepo.save(loan);

    await bookRepo.increment({ id: loan.bookId }, 'availableCopies', 1);
    res.json({ ...loan, overdueDays, fine });
  } catch (e) {
    console.error('[library:return]', e);
    res.status(500).json({ message: 'Could not return book.' });
  }
});

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00`).getTime();
  const b = new Date(`${to}T00:00:00`).getTime();
  return Math.floor((b - a) / 86400000);
}

export default router;
