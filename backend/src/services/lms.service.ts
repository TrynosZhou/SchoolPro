import { AppDataSource } from '../config/data-source';
import {
  ClassRecording,
  LessonContent,
  LibraryBookmark,
  LibraryResource,
  LmsAssignment,
  LmsSubmission,
  Notification,
  Student,
  VirtualClass,
} from '../entities';
import {
  AttendanceMode,
  LessonContentType,
  LibraryResourceType,
  LmsAssignmentStatus,
  LmsSubmissionStatus,
  UserRole,
  VirtualClassProvider,
  VirtualClassStatus,
} from '../entities/enums';
import { storageService, StorageFolder } from './storage.service';
import {
  CreateClassRecordingDto,
  CreateLessonContentDto,
  CreateLibraryResourceDto,
  CreateLmsAssignmentDto,
  CreateLmsSubmissionDto,
  CreateVirtualClassDto,
  GradeLmsSubmissionDto,
  UpdateLessonContentDto,
  UpdateLibraryResourceDto,
  UpdateLmsAssignmentDto,
  UpdateVirtualClassDto,
} from '../dtos/lms.dto';
import { relations } from '../utils/typeorm-helpers';

export class LmsHttpError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'LmsHttpError';
  }
}

function requireStaffId(staffId?: string): string {
  if (!staffId) throw new LmsHttpError(403, 'Staff profile required');
  return staffId;
}

function requireStudentId(studentId?: string): string {
  if (!studentId) throw new LmsHttpError(403, 'Student profile required');
  return studentId;
}

async function storeUpload(
  folder: StorageFolder,
  file?: Express.Multer.File,
): Promise<{ key: string; originalName: string; mimeType: string; size: number; url: string } | null> {
  if (!file) return null;
  return storageService.put({
    folder,
    buffer: file.buffer,
    originalName: file.originalname,
    mimeType: file.mimetype,
    });
}

function withFileUrls<T extends { attachmentKey?: string | null; fileKey?: string | null }>(
  row: T,
): T & { attachmentUrl?: string | null; fileUrl?: string | null } {
  return {
    ...row,
    attachmentUrl: storageService.publicUrl((row as { attachmentKey?: string }).attachmentKey),
    fileUrl: storageService.publicUrl((row as { fileKey?: string }).fileKey),
  };
}

// ── Assignments ─────────────────────────────────────────────────────────────

export async function createAssignment(
  dto: CreateLmsAssignmentDto,
  staffId: string | undefined,
  file?: Express.Multer.File,
) {
  const teacherId = requireStaffId(staffId);
  const stored = await storeUpload('lms-assignments', file);
  const repo = AppDataSource.getRepository(LmsAssignment);
  const row = repo.create({
    classId: dto.classId,
    subjectId: dto.subjectId,
    termId: dto.termId,
    teacherId,
    title: dto.title.trim(),
    description: dto.description,
    dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
    maxScore: dto.maxScore != null ? String(dto.maxScore) : undefined,
    status: dto.status ?? LmsAssignmentStatus.DRAFT,
    attachmentKey: stored?.key,
    attachmentOriginalName: stored?.originalName,
    attachmentMimeType: stored?.mimeType,
    attachmentSize: stored?.size,
  });
  const saved = await repo.save(row);
  return withFileUrls(saved);
}

export async function updateAssignment(
  id: string,
  dto: UpdateLmsAssignmentDto,
  staffId: string | undefined,
  file?: Express.Multer.File,
) {
  const teacherId = requireStaffId(staffId);
  const repo = AppDataSource.getRepository(LmsAssignment);
  const row = await repo.findOne({ where: { id } });
  if (!row) throw new LmsHttpError(404, 'Assignment not found');
  if (row.teacherId !== teacherId) {
    // Admins may update via staffId mismatch only if caller is elevated — routes gate roles.
  }

  if (dto.title !== undefined) row.title = dto.title.trim();
  if (dto.description !== undefined) row.description = dto.description ?? undefined;
  if (dto.subjectId !== undefined) row.subjectId = dto.subjectId ?? undefined;
  if (dto.termId !== undefined) row.termId = dto.termId ?? undefined;
  if (dto.dueAt !== undefined) row.dueAt = dto.dueAt ? new Date(dto.dueAt) : undefined;
  if (dto.maxScore !== undefined) row.maxScore = dto.maxScore != null ? String(dto.maxScore) : undefined;
  if (dto.status !== undefined) row.status = dto.status;

  if (file) {
    if (row.attachmentKey) await storageService.delete(row.attachmentKey);
    const stored = await storeUpload('lms-assignments', file);
    row.attachmentKey = stored?.key;
    row.attachmentOriginalName = stored?.originalName;
    row.attachmentMimeType = stored?.mimeType;
    row.attachmentSize = stored?.size;
  }

  return withFileUrls(await repo.save(row));
}

export async function listAssignments(filters: {
  classId?: string;
  subjectId?: string;
  termId?: string;
  status?: LmsAssignmentStatus;
  studentId?: string;
}) {
  const qb = AppDataSource.getRepository(LmsAssignment)
    .createQueryBuilder('a')
    .leftJoinAndSelect('a.schoolClass', 'schoolClass')
    .leftJoinAndSelect('a.subject', 'subject')
    .leftJoinAndSelect('a.teacher', 'teacher')
    .orderBy('a.dueAt', 'ASC', 'NULLS LAST')
    .addOrderBy('a.createdAt', 'DESC');

  if (filters.classId) qb.andWhere('a.classId = :classId', { classId: filters.classId });
  if (filters.subjectId) qb.andWhere('a.subjectId = :subjectId', { subjectId: filters.subjectId });
  if (filters.termId) qb.andWhere('a.termId = :termId', { termId: filters.termId });
  if (filters.status) qb.andWhere('a.status = :status', { status: filters.status });
  if (filters.studentId) {
    qb.andWhere('a.status = :published', { published: LmsAssignmentStatus.PUBLISHED });
    const student = await AppDataSource.getRepository(Student).findOne({
      where: { id: filters.studentId },
    });
    if (!student?.classId) return [];
    qb.andWhere('a.classId = :studentClassId', { studentClassId: student.classId });
  }

  const rows = await qb.getMany();
  return rows.map((r) => withFileUrls(r));
}

export async function getAssignment(id: string) {
  const row = await AppDataSource.getRepository(LmsAssignment).findOne({
    where: { id },
    relations: relations('schoolClass', 'subject', 'teacher', 'term'),
  });
  if (!row) throw new LmsHttpError(404, 'Assignment not found');
  return withFileUrls(row);
}

export async function deleteAssignment(id: string) {
  const repo = AppDataSource.getRepository(LmsAssignment);
  const row = await repo.findOne({ where: { id } });
  if (!row) throw new LmsHttpError(404, 'Assignment not found');
  if (row.attachmentKey) await storageService.delete(row.attachmentKey);
  await repo.remove(row);
  return { deleted: true };
}

// ── Submissions ─────────────────────────────────────────────────────────────

export async function submitAssignment(
  assignmentId: string,
  dto: CreateLmsSubmissionDto,
  studentId: string | undefined,
  file?: Express.Multer.File,
) {
  const sid = requireStudentId(studentId);
  const assignment = await AppDataSource.getRepository(LmsAssignment).findOne({
    where: { id: assignmentId },
  });
  if (!assignment) throw new LmsHttpError(404, 'Assignment not found');
  if (assignment.status !== LmsAssignmentStatus.PUBLISHED) {
    throw new LmsHttpError(400, 'Assignment is not open for submissions');
  }

  const student = await AppDataSource.getRepository(Student).findOne({ where: { id: sid } });
  if (!student || student.classId !== assignment.classId) {
    throw new LmsHttpError(403, 'You are not enrolled in this assignment class');
  }

  if (!dto.textAnswer?.trim() && !file) {
    throw new LmsHttpError(400, 'Provide a text answer and/or a file');
  }

  const repo = AppDataSource.getRepository(LmsSubmission);
  let row = await repo.findOne({ where: { assignmentId, studentId: sid } });
  const late =
    assignment.dueAt && new Date() > new Date(assignment.dueAt)
      ? LmsSubmissionStatus.LATE
      : LmsSubmissionStatus.SUBMITTED;

  const stored = await storeUpload('lms-submissions', file);

  if (row) {
    if (row.status === LmsSubmissionStatus.GRADED) {
      throw new LmsHttpError(400, 'Graded submissions cannot be resubmitted');
    }
    if (stored && row.fileKey) await storageService.delete(row.fileKey);
    row.textAnswer = dto.textAnswer?.trim() || row.textAnswer;
    if (stored) {
      row.fileKey = stored.key;
      row.fileOriginalName = stored.originalName;
      row.fileMimeType = stored.mimeType;
      row.fileSize = stored.size;
    }
    row.status = late;
    row.submittedAt = new Date();
  } else {
    row = repo.create({
      assignmentId,
      studentId: sid,
      textAnswer: dto.textAnswer?.trim(),
      fileKey: stored?.key,
      fileOriginalName: stored?.originalName,
      fileMimeType: stored?.mimeType,
      fileSize: stored?.size,
      status: late,
      submittedAt: new Date(),
    });
  }

  return withFileUrls(await repo.save(row));
}

export async function listSubmissions(assignmentId: string) {
  const rows = await AppDataSource.getRepository(LmsSubmission).find({
    where: { assignmentId },
    relations: relations('student'),
    order: { submittedAt: 'DESC' },
  });
  return rows.map((r) => withFileUrls(r));
}

export async function getMySubmission(assignmentId: string, studentId: string | undefined) {
  const sid = requireStudentId(studentId);
  const row = await AppDataSource.getRepository(LmsSubmission).findOne({
    where: { assignmentId, studentId: sid },
  });
  return row ? withFileUrls(row) : null;
}

export async function gradeSubmission(
  submissionId: string,
  dto: GradeLmsSubmissionDto,
  staffId: string | undefined,
) {
  const gradedById = requireStaffId(staffId);
  const repo = AppDataSource.getRepository(LmsSubmission);
  const row = await repo.findOne({
    where: { id: submissionId },
    relations: relations('assignment', 'student'),
  });
  if (!row) throw new LmsHttpError(404, 'Submission not found');

  if (row.assignment?.maxScore != null && dto.grade > Number(row.assignment.maxScore)) {
    throw new LmsHttpError(400, `Grade cannot exceed max score (${row.assignment.maxScore})`);
  }

  row.grade = String(dto.grade);
  row.feedback = dto.feedback;
  row.status = dto.status ?? LmsSubmissionStatus.GRADED;
  row.gradedById = gradedById;
  row.gradedAt = new Date();
  const saved = await repo.save(row);

  if (row.student?.userId) {
    await AppDataSource.getRepository(Notification).save(
      AppDataSource.getRepository(Notification).create({
        userId: row.student.userId,
        title: 'Assignment graded',
        message: `Your submission for "${row.assignment?.title ?? 'assignment'}" was graded: ${dto.grade}`,
        type: 'lms_grade',
        metadata: { submissionId: row.id, assignmentId: row.assignmentId, grade: dto.grade },
      }),
    );
  }

  return withFileUrls(saved);
}

// ── Lesson content ──────────────────────────────────────────────────────────

export async function createLessonContent(
  dto: CreateLessonContentDto,
  staffId: string | undefined,
  file?: Express.Multer.File,
) {
  const uploadedById = requireStaffId(staffId);
  if (dto.contentType === LessonContentType.LINK && !dto.externalUrl?.trim()) {
    throw new LmsHttpError(400, 'externalUrl is required for link content');
  }
  if (
    (dto.contentType === LessonContentType.DOCUMENT || dto.contentType === LessonContentType.NOTE) &&
    !file &&
    !dto.externalUrl
  ) {
    throw new LmsHttpError(400, 'Upload a file or provide an externalUrl');
  }

  const stored = await storeUpload('lesson-content', file);
  const repo = AppDataSource.getRepository(LessonContent);
  const isPublished = dto.isPublished !== false;
  const row = repo.create({
    classId: dto.classId,
    subjectId: dto.subjectId,
    termId: dto.termId,
    uploadedById,
    title: dto.title.trim(),
    description: dto.description,
    contentType: dto.contentType,
    externalUrl: dto.externalUrl,
    fileKey: stored?.key,
    fileOriginalName: stored?.originalName,
    fileMimeType: stored?.mimeType,
    fileSize: stored?.size,
    sortOrder: dto.sortOrder ?? 0,
    isPublished,
    publishedAt: isPublished ? new Date() : undefined,
  });
  return withFileUrls(await repo.save(row));
}

export async function updateLessonContent(id: string, dto: UpdateLessonContentDto, file?: Express.Multer.File) {
  const repo = AppDataSource.getRepository(LessonContent);
  const row = await repo.findOne({ where: { id } });
  if (!row) throw new LmsHttpError(404, 'Lesson content not found');

  if (dto.title !== undefined) row.title = dto.title.trim();
  if (dto.description !== undefined) row.description = dto.description ?? undefined;
  if (dto.contentType !== undefined) row.contentType = dto.contentType;
  if (dto.externalUrl !== undefined) row.externalUrl = dto.externalUrl ?? undefined;
  if (dto.sortOrder !== undefined) row.sortOrder = dto.sortOrder;
  if (dto.isPublished !== undefined) {
    row.isPublished = dto.isPublished;
    if (dto.isPublished && !row.publishedAt) row.publishedAt = new Date();
  }
  if (file) {
    if (row.fileKey) await storageService.delete(row.fileKey);
    const stored = await storeUpload('lesson-content', file);
    row.fileKey = stored?.key;
    row.fileOriginalName = stored?.originalName;
    row.fileMimeType = stored?.mimeType;
    row.fileSize = stored?.size;
  }
  return withFileUrls(await repo.save(row));
}

export async function listLessonContent(filters: {
  classId?: string;
  subjectId?: string;
  termId?: string;
  publishedOnly?: boolean;
}) {
  const qb = AppDataSource.getRepository(LessonContent)
    .createQueryBuilder('c')
    .leftJoinAndSelect('c.subject', 'subject')
    .leftJoinAndSelect('c.schoolClass', 'schoolClass')
    .orderBy('c.sortOrder', 'ASC')
    .addOrderBy('c.createdAt', 'DESC');

  if (filters.classId) qb.andWhere('(c.classId = :classId OR c.classId IS NULL)', { classId: filters.classId });
  if (filters.subjectId) qb.andWhere('c.subjectId = :subjectId', { subjectId: filters.subjectId });
  if (filters.termId) qb.andWhere('c.termId = :termId', { termId: filters.termId });
  if (filters.publishedOnly) qb.andWhere('c.isPublished = true');

  return (await qb.getMany()).map((r) => withFileUrls(r));
}

export async function deleteLessonContent(id: string) {
  const repo = AppDataSource.getRepository(LessonContent);
  const row = await repo.findOne({ where: { id } });
  if (!row) throw new LmsHttpError(404, 'Lesson content not found');
  if (row.fileKey) await storageService.delete(row.fileKey);
  await repo.remove(row);
  return { deleted: true };
}

// ── Virtual classes ─────────────────────────────────────────────────────────

export async function createVirtualClass(dto: CreateVirtualClassDto, staffId: string | undefined) {
  const teacherId = requireStaffId(staffId);
  const provider = dto.provider ?? VirtualClassProvider.MANUAL;
  if (provider === VirtualClassProvider.MANUAL && !dto.joinUrl?.trim()) {
    throw new LmsHttpError(400, 'joinUrl is required for manual virtual classes');
  }
  // Zoom / Google Meet meeting creation is wired in a later phase when API keys exist.
  if (provider !== VirtualClassProvider.MANUAL) {
    throw new LmsHttpError(
      501,
      `${provider} meeting creation is not configured yet — use provider "manual" with a join URL`,
    );
  }

  const repo = AppDataSource.getRepository(VirtualClass);
  const row = repo.create({
    classId: dto.classId,
    subjectId: dto.subjectId,
    teacherId,
    title: dto.title.trim(),
    description: dto.description,
    startsAt: new Date(dto.startsAt),
    endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
    provider,
    status: VirtualClassStatus.SCHEDULED,
    joinUrl: dto.joinUrl,
    hostUrl: dto.hostUrl,
  });
  const saved = await repo.save(row);

  // Notify students in the class (best-effort).
  const students = await AppDataSource.getRepository(Student).find({
    where: { classId: dto.classId, isActive: true },
  });
  const notifRepo = AppDataSource.getRepository(Notification);
  for (const s of students) {
    if (!s.userId) continue;
    await notifRepo.save(
      notifRepo.create({
        userId: s.userId,
        title: 'Virtual class scheduled',
        message: `"${saved.title}" starts ${saved.startsAt.toISOString()}`,
        type: 'virtual_class',
        metadata: { virtualClassId: saved.id, joinUrl: saved.joinUrl, startsAt: saved.startsAt },
      }),
    );
  }

  return saved;
}

export async function updateVirtualClass(id: string, dto: UpdateVirtualClassDto) {
  const repo = AppDataSource.getRepository(VirtualClass);
  const row = await repo.findOne({ where: { id } });
  if (!row) throw new LmsHttpError(404, 'Virtual class not found');

  if (dto.title !== undefined) row.title = dto.title.trim();
  if (dto.description !== undefined) row.description = dto.description ?? undefined;
  if (dto.startsAt !== undefined) row.startsAt = new Date(dto.startsAt);
  if (dto.endsAt !== undefined) row.endsAt = dto.endsAt ? new Date(dto.endsAt) : undefined;
  if (dto.status !== undefined) row.status = dto.status;
  if (dto.joinUrl !== undefined) row.joinUrl = dto.joinUrl ?? undefined;
  if (dto.hostUrl !== undefined) row.hostUrl = dto.hostUrl ?? undefined;

  return repo.save(row);
}

export async function listVirtualClasses(filters: { classId?: string; teacherId?: string; from?: string; to?: string }) {
  const qb = AppDataSource.getRepository(VirtualClass)
    .createQueryBuilder('v')
    .leftJoinAndSelect('v.schoolClass', 'schoolClass')
    .leftJoinAndSelect('v.subject', 'subject')
    .leftJoinAndSelect('v.teacher', 'teacher')
    .leftJoinAndSelect('v.recordings', 'recordings')
    .orderBy('v.startsAt', 'ASC');

  if (filters.classId) qb.andWhere('v.classId = :classId', { classId: filters.classId });
  if (filters.teacherId) qb.andWhere('v.teacherId = :teacherId', { teacherId: filters.teacherId });
  if (filters.from) qb.andWhere('v.startsAt >= :from', { from: filters.from });
  if (filters.to) qb.andWhere('v.startsAt <= :to', { to: filters.to });

  return qb.getMany();
}

export async function deleteVirtualClass(id: string) {
  const repo = AppDataSource.getRepository(VirtualClass);
  const row = await repo.findOne({ where: { id } });
  if (!row) throw new LmsHttpError(404, 'Virtual class not found');
  await repo.remove(row);
  return { deleted: true };
}

export async function addRecording(virtualClassId: string, dto: CreateClassRecordingDto) {
  const vc = await AppDataSource.getRepository(VirtualClass).findOne({ where: { id: virtualClassId } });
  if (!vc) throw new LmsHttpError(404, 'Virtual class not found');
  const repo = AppDataSource.getRepository(ClassRecording);
  return repo.save(
    repo.create({
      virtualClassId,
      title: dto.title.trim(),
      recordingUrl: dto.recordingUrl,
      durationSeconds: dto.durationSeconds,
      recordedAt: dto.recordedAt ? new Date(dto.recordedAt) : new Date(),
    }),
  );
}

export async function listRecordings(classId: string) {
  return AppDataSource.getRepository(ClassRecording)
    .createQueryBuilder('r')
    .innerJoinAndSelect('r.virtualClass', 'v')
    .where('v.classId = :classId', { classId })
    .orderBy('r.recordedAt', 'DESC')
    .getMany();
}

// ── Library ─────────────────────────────────────────────────────────────────

function canAccessResource(resource: LibraryResource, role: UserRole): boolean {
  if (!resource.accessRoles?.length) return true;
  return resource.accessRoles.includes(role);
}

export async function createLibraryResource(
  dto: CreateLibraryResourceDto,
  userId: string,
  file?: Express.Multer.File,
) {
  if (dto.resourceType === LibraryResourceType.LINK && !dto.externalUrl?.trim()) {
    throw new LmsHttpError(400, 'externalUrl is required for link resources');
  }
  if (dto.resourceType !== LibraryResourceType.LINK && !file && !dto.externalUrl) {
    throw new LmsHttpError(400, 'Upload a file or provide an externalUrl');
  }

  const stored = await storeUpload('library', file);
  const repo = AppDataSource.getRepository(LibraryResource);
  const row = repo.create({
    title: dto.title.trim(),
    description: dto.description,
    resourceType: dto.resourceType,
    externalUrl: dto.externalUrl,
    subjectId: dto.subjectId,
    gradeFormId: dto.gradeFormId,
    uploadedById: userId,
    accessRoles: dto.accessRoles ?? [],
    isPublished: dto.isPublished !== false,
    fileKey: stored?.key,
    fileOriginalName: stored?.originalName,
    fileMimeType: stored?.mimeType,
    fileSize: stored?.size,
  });
  return withFileUrls(await repo.save(row));
}

export async function updateLibraryResource(id: string, dto: UpdateLibraryResourceDto, file?: Express.Multer.File) {
  const repo = AppDataSource.getRepository(LibraryResource);
  const row = await repo.findOne({ where: { id } });
  if (!row) throw new LmsHttpError(404, 'Resource not found');

  if (dto.title !== undefined) row.title = dto.title.trim();
  if (dto.description !== undefined) row.description = dto.description ?? undefined;
  if (dto.resourceType !== undefined) row.resourceType = dto.resourceType;
  if (dto.externalUrl !== undefined) row.externalUrl = dto.externalUrl ?? undefined;
  if (dto.subjectId !== undefined) row.subjectId = dto.subjectId ?? undefined;
  if (dto.gradeFormId !== undefined) row.gradeFormId = dto.gradeFormId ?? undefined;
  if (dto.accessRoles !== undefined) row.accessRoles = dto.accessRoles;
  if (dto.isPublished !== undefined) row.isPublished = dto.isPublished;

  if (file) {
    if (row.fileKey) await storageService.delete(row.fileKey);
    const stored = await storeUpload('library', file);
    row.fileKey = stored?.key;
    row.fileOriginalName = stored?.originalName;
    row.fileMimeType = stored?.mimeType;
    row.fileSize = stored?.size;
  }

  return withFileUrls(await repo.save(row));
}

export async function listLibraryResources(
  filters: {
    q?: string;
    subjectId?: string;
    gradeFormId?: string;
    resourceType?: LibraryResourceType;
    publishedOnly?: boolean;
  },
  role: UserRole,
) {
  const qb = AppDataSource.getRepository(LibraryResource)
    .createQueryBuilder('r')
    .leftJoinAndSelect('r.subject', 'subject')
    .leftJoinAndSelect('r.gradeForm', 'gradeForm')
    .orderBy('r.createdAt', 'DESC');

  if (filters.q) {
    qb.andWhere('(r.title ILIKE :q OR r.description ILIKE :q)', { q: `%${filters.q}%` });
  }
  if (filters.subjectId) qb.andWhere('r.subjectId = :subjectId', { subjectId: filters.subjectId });
  if (filters.gradeFormId) qb.andWhere('r.gradeFormId = :gradeFormId', { gradeFormId: filters.gradeFormId });
  if (filters.resourceType) qb.andWhere('r.resourceType = :resourceType', { resourceType: filters.resourceType });
  if (filters.publishedOnly) qb.andWhere('r.isPublished = true');

  const rows = await qb.getMany();
  return rows.filter((r) => canAccessResource(r, role)).map((r) => withFileUrls(r));
}

export async function deleteLibraryResource(id: string) {
  const repo = AppDataSource.getRepository(LibraryResource);
  const row = await repo.findOne({ where: { id } });
  if (!row) throw new LmsHttpError(404, 'Resource not found');
  if (row.fileKey) await storageService.delete(row.fileKey);
  await repo.remove(row);
  return { deleted: true };
}

export async function bookmarkResource(userId: string, resourceId: string) {
  const resource = await AppDataSource.getRepository(LibraryResource).findOne({ where: { id: resourceId } });
  if (!resource) throw new LmsHttpError(404, 'Resource not found');
  const repo = AppDataSource.getRepository(LibraryBookmark);
  const existing = await repo.findOne({ where: { userId, resourceId } });
  if (existing) return existing;
  return repo.save(repo.create({ userId, resourceId }));
}

export async function removeBookmark(userId: string, resourceId: string) {
  const repo = AppDataSource.getRepository(LibraryBookmark);
  const existing = await repo.findOne({ where: { userId, resourceId } });
  if (!existing) throw new LmsHttpError(404, 'Bookmark not found');
  await repo.remove(existing);
  return { deleted: true };
}

export async function listBookmarks(userId: string) {
  const rows = await AppDataSource.getRepository(LibraryBookmark).find({
    where: { userId },
    relations: relations('resource', 'resource.subject', 'resource.gradeForm'),
    order: { createdAt: 'DESC' },
  });
  return rows.map((b) => ({
    ...b,
    resource: b.resource ? withFileUrls(b.resource) : b.resource,
  }));
}

export { AttendanceMode };
