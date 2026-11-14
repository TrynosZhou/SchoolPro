import { randomUUID } from 'crypto';
import { AppDataSource } from '../config/data-source';
import { ClassSubject, RecordBookColumn, RecordBookMark, SchoolClass, Student, User } from '../entities';
import { UserRole } from '../entities/enums';
import type { AuthRequest } from '../middleware/auth';
import { AccessControlService } from './access-control.service';
import { relations } from '../utils/typeorm-helpers';
import { assertTeacherSubjectAccess, isClassTeacher } from '../utils/teacher-class-access';

export const RECORD_BOOK_MAX_MARKS = 100;

export interface RecordBookSubjectOption {
  id: string;
  code: string;
  name: string;
}

export interface RecordBookMarkCell {
  marks: number | null;
  markId: string | null;
}

export interface RecordBookColumnDto {
  columnKey: string;
  label: string;
  sortOrder: number;
}

export interface RecordBookStudentRow {
  studentId: string;
  admissionNumber: string;
  lastName: string;
  firstName: string;
  gender: string;
  marksByColumn: Record<string, RecordBookMarkCell>;
}

export interface RecordBookData {
  maxMarks: number;
  term: { id: string; name: string };
  class: { id: string; name: string };
  teacher: { fullName: string };
  subject: RecordBookSubjectOption;
  columns: RecordBookColumnDto[];
  students: RecordBookStudentRow[];
}

export interface RecordBookSubjectsResponse {
  teacher: { fullName: string };
  subjects: RecordBookSubjectOption[];
}

function resolveOwnerKey(req: AuthRequest): string {
  if (req.user!.staffId) return req.user!.staffId;
  if (req.user!.userId) return `user:${req.user!.userId}`;
  throw new Error('Unable to identify record book owner for this account.');
}

export async function getTeacherFullName(req: AuthRequest): Promise<string> {
  const user = await AppDataSource.getRepository(User).findOne({
    where: { id: req.user!.userId },
  });
  if (!user) return 'Teacher';
  return `${user.firstName} ${user.lastName}`.trim() || user.email;
}

export async function listRecordBookSubjects(
  req: AuthRequest,
  classId: string,
): Promise<RecordBookSubjectsResponse> {
  const subjects = await getSubjectsForClass(req, classId);
  const fullName = await getTeacherFullName(req);
  return { teacher: { fullName }, subjects };
}

async function getSubjectsForClass(req: AuthRequest, classId: string): Promise<RecordBookSubjectOption[]> {
  const role = req.user!.role;
  const repo = AppDataSource.getRepository(ClassSubject);

  if (role !== UserRole.TEACHER) {
    const rows = await repo.find({
      where: { classId },
      relations: relations('subject'),
      order: { subject: { name: 'ASC' } },
    });
    return rows
      .filter((r) => r.subject)
      .map((r) => ({ id: r.subject!.id, code: r.subject!.code, name: r.subject!.name }));
  }

  const staffId = req.user!.staffId;
  if (!staffId) return [];

  const classTeacher = await isClassTeacher(staffId, classId);
  const where = classTeacher ? { classId } : { classId, teacherId: staffId };
  const rows = await repo.find({
    where,
    relations: relations('subject'),
    order: { subject: { name: 'ASC' } },
  });

  return rows
    .filter((r) => r.subject)
    .map((r) => ({ id: r.subject!.id, code: r.subject!.code, name: r.subject!.name }));
}

async function assertCanUseSubject(req: AuthRequest, classId: string, subjectId: string): Promise<void> {
  const subjects = await getSubjectsForClass(req, classId);
  if (!subjects.some((s) => s.id === subjectId)) {
    throw new Error('You are not assigned to teach this subject in the selected class.');
  }
  if (req.user!.role === UserRole.TEACHER) {
    const allowed = await assertTeacherSubjectAccess(req, classId, subjectId);
    if (!allowed) {
      throw new Error('You are not assigned to teach this subject in the selected class.');
    }
  }
}

async function resolveSubject(
  req: AuthRequest,
  classId: string,
  subjectId: string,
): Promise<RecordBookSubjectOption> {
  await assertCanUseSubject(req, classId, subjectId);
  const subjects = await getSubjectsForClass(req, classId);
  const subject = subjects.find((s) => s.id === subjectId);
  if (!subject) throw new Error('Subject not found for this class.');
  return subject;
}

export async function buildRecordBook(
  req: AuthRequest,
  params: { classId: string; termId: string; subjectId: string },
): Promise<RecordBookData> {
  const { classId, termId, subjectId } = params;
  const ownerKey = resolveOwnerKey(req);
  const subject = await resolveSubject(req, classId, subjectId);
  const fullName = await getTeacherFullName(req);

  const schoolClass = await AppDataSource.getRepository(SchoolClass).findOne({ where: { id: classId } });
  if (!schoolClass) throw new Error('Class not found');

  const students = await AppDataSource.getRepository(Student).find({
    where: { classId, isActive: true },
    order: { lastName: 'ASC', firstName: 'ASC' },
  });

  const columnRepo = AppDataSource.getRepository(RecordBookColumn);
  const columns = await columnRepo.find({
    where: { termId, classId, ownerKey, subjectId },
    order: { sortOrder: 'ASC', createdAt: 'ASC' },
  });

  const markRepo = AppDataSource.getRepository(RecordBookMark);
  const marks = columns.length
    ? await markRepo.find({
        where: { termId, classId, ownerKey, subjectId },
      })
    : [];

  const markLookup = new Map<string, RecordBookMark>();
  for (const mark of marks) {
    markLookup.set(`${mark.studentId}:${mark.columnKey}`, mark);
  }

  const studentsOut: RecordBookStudentRow[] = students.map((s) => {
    const marksByColumn: Record<string, RecordBookMarkCell> = {};
    for (const col of columns) {
      const m = markLookup.get(`${s.id}:${col.columnKey}`);
      marksByColumn[col.columnKey] = {
        marks: m != null ? Number(m.marks) : null,
        markId: m?.id || null,
      };
    }
    return {
      studentId: s.id,
      admissionNumber: s.admissionNumber,
      lastName: s.lastName,
      firstName: s.firstName,
      gender: s.gender || '—',
      marksByColumn,
    };
  });

  return {
    maxMarks: RECORD_BOOK_MAX_MARKS,
    term: { id: termId, name: '' },
    class: { id: schoolClass.id, name: schoolClass.name },
    teacher: { fullName },
    subject,
    columns: columns.map((c) => ({
      columnKey: c.columnKey,
      label: c.label,
      sortOrder: c.sortOrder,
    })),
    students: studentsOut,
  };
}

export async function addRecordBookColumn(
  req: AuthRequest,
  params: { classId: string; termId: string; subjectId: string; label?: string },
): Promise<RecordBookColumnDto> {
  const { classId, termId, subjectId } = params;
  const ownerKey = resolveOwnerKey(req);
  await assertCanUseSubject(req, classId, subjectId);

  const repo = AppDataSource.getRepository(RecordBookColumn);
  const existing = await repo.find({
    where: { termId, classId, ownerKey, subjectId },
    order: { sortOrder: 'ASC', createdAt: 'ASC' },
  });

  const sortOrder = existing.length;
  const label = params.label?.trim() || `Test ${sortOrder + 1}`;
  const columnKey = `test-${randomUUID()}`;

  const created = await repo.save(
    repo.create({
      termId,
      classId,
      subjectId,
      ownerKey,
      columnKey,
      label,
      sortOrder,
    }),
  );

  return {
    columnKey: created.columnKey,
    label: created.label,
    sortOrder: created.sortOrder,
  };
}

export async function saveRecordBookRow(
  req: AuthRequest,
  params: {
    classId: string;
    termId: string;
    subjectId: string;
    studentId: string;
    marks: { columnKey: string; marks: number }[];
  },
): Promise<{ saved: number }> {
  const { classId, termId, subjectId, studentId, marks } = params;
  const ownerKey = resolveOwnerKey(req);

  if (!marks.length) {
    return { saved: 0 };
  }

  await assertCanUseSubject(req, classId, subjectId);

  if (!(await AccessControlService.userCanAccessStudent(req.user!, studentId))) {
    throw new Error('You do not have access to this student record.');
  }

  const columnRepo = AppDataSource.getRepository(RecordBookColumn);
  const allowedColumns = await columnRepo.find({
    where: { termId, classId, ownerKey, subjectId },
  });
  const allowedKeys = new Set(allowedColumns.map((c) => c.columnKey));

  const repo = AppDataSource.getRepository(RecordBookMark);
  const enteredById = req.user!.staffId;
  let saved = 0;

  for (const entry of marks) {
    if (!allowedKeys.has(entry.columnKey)) {
      throw new Error('One or more test columns are not valid for this record book.');
    }
    if (!Number.isFinite(entry.marks) || entry.marks < 0 || entry.marks > RECORD_BOOK_MAX_MARKS) {
      throw new Error(`Marks must be between 0 and ${RECORD_BOOK_MAX_MARKS}.`);
    }

    let existing = await repo.findOne({
      where: {
        termId,
        classId,
        ownerKey,
        subjectId,
        studentId,
        columnKey: entry.columnKey,
      },
    });

    if (existing) {
      existing.marks = entry.marks;
      if (enteredById) existing.enteredById = enteredById;
    } else {
      existing = repo.create({
        termId,
        classId,
        ownerKey,
        subjectId,
        studentId,
        columnKey: entry.columnKey,
        marks: entry.marks,
        enteredById,
      });
    }

    await repo.save(existing);
    saved += 1;
  }

  return { saved };
}
