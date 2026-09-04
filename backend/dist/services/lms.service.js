"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AttendanceMode = exports.LmsHttpError = void 0;
exports.createAssignment = createAssignment;
exports.updateAssignment = updateAssignment;
exports.listAssignments = listAssignments;
exports.getAssignment = getAssignment;
exports.deleteAssignment = deleteAssignment;
exports.submitAssignment = submitAssignment;
exports.listSubmissions = listSubmissions;
exports.getMySubmission = getMySubmission;
exports.gradeSubmission = gradeSubmission;
exports.createLessonContent = createLessonContent;
exports.updateLessonContent = updateLessonContent;
exports.listLessonContent = listLessonContent;
exports.deleteLessonContent = deleteLessonContent;
exports.createVirtualClass = createVirtualClass;
exports.updateVirtualClass = updateVirtualClass;
exports.listVirtualClasses = listVirtualClasses;
exports.deleteVirtualClass = deleteVirtualClass;
exports.addRecording = addRecording;
exports.listRecordings = listRecordings;
exports.createLibraryResource = createLibraryResource;
exports.updateLibraryResource = updateLibraryResource;
exports.listLibraryResources = listLibraryResources;
exports.deleteLibraryResource = deleteLibraryResource;
exports.bookmarkResource = bookmarkResource;
exports.removeBookmark = removeBookmark;
exports.listBookmarks = listBookmarks;
const data_source_1 = require("../config/data-source");
const entities_1 = require("../entities");
const enums_1 = require("../entities/enums");
Object.defineProperty(exports, "AttendanceMode", { enumerable: true, get: function () { return enums_1.AttendanceMode; } });
const storage_service_1 = require("./storage.service");
const typeorm_helpers_1 = require("../utils/typeorm-helpers");
class LmsHttpError extends Error {
    constructor(statusCode, message) {
        super(message);
        this.statusCode = statusCode;
        this.name = 'LmsHttpError';
    }
}
exports.LmsHttpError = LmsHttpError;
function requireStaffId(staffId) {
    if (!staffId)
        throw new LmsHttpError(403, 'Staff profile required');
    return staffId;
}
function requireStudentId(studentId) {
    if (!studentId)
        throw new LmsHttpError(403, 'Student profile required');
    return studentId;
}
async function storeUpload(folder, file) {
    if (!file)
        return null;
    return storage_service_1.storageService.put({
        folder,
        buffer: file.buffer,
        originalName: file.originalname,
        mimeType: file.mimetype,
    });
}
function withFileUrls(row) {
    return {
        ...row,
        attachmentUrl: storage_service_1.storageService.publicUrl(row.attachmentKey),
        fileUrl: storage_service_1.storageService.publicUrl(row.fileKey),
    };
}
// ── Assignments ─────────────────────────────────────────────────────────────
async function createAssignment(dto, staffId, file) {
    const teacherId = requireStaffId(staffId);
    const stored = await storeUpload('lms-assignments', file);
    const repo = data_source_1.AppDataSource.getRepository(entities_1.LmsAssignment);
    const row = repo.create({
        classId: dto.classId,
        subjectId: dto.subjectId,
        termId: dto.termId,
        teacherId,
        title: dto.title.trim(),
        description: dto.description,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
        maxScore: dto.maxScore != null ? String(dto.maxScore) : undefined,
        status: dto.status ?? enums_1.LmsAssignmentStatus.DRAFT,
        attachmentKey: stored?.key,
        attachmentOriginalName: stored?.originalName,
        attachmentMimeType: stored?.mimeType,
        attachmentSize: stored?.size,
    });
    const saved = await repo.save(row);
    return withFileUrls(saved);
}
async function updateAssignment(id, dto, staffId, file) {
    const teacherId = requireStaffId(staffId);
    const repo = data_source_1.AppDataSource.getRepository(entities_1.LmsAssignment);
    const row = await repo.findOne({ where: { id } });
    if (!row)
        throw new LmsHttpError(404, 'Assignment not found');
    if (row.teacherId !== teacherId) {
        // Admins may update via staffId mismatch only if caller is elevated — routes gate roles.
    }
    if (dto.title !== undefined)
        row.title = dto.title.trim();
    if (dto.description !== undefined)
        row.description = dto.description ?? undefined;
    if (dto.subjectId !== undefined)
        row.subjectId = dto.subjectId ?? undefined;
    if (dto.termId !== undefined)
        row.termId = dto.termId ?? undefined;
    if (dto.dueAt !== undefined)
        row.dueAt = dto.dueAt ? new Date(dto.dueAt) : undefined;
    if (dto.maxScore !== undefined)
        row.maxScore = dto.maxScore != null ? String(dto.maxScore) : undefined;
    if (dto.status !== undefined)
        row.status = dto.status;
    if (file) {
        if (row.attachmentKey)
            await storage_service_1.storageService.delete(row.attachmentKey);
        const stored = await storeUpload('lms-assignments', file);
        row.attachmentKey = stored?.key;
        row.attachmentOriginalName = stored?.originalName;
        row.attachmentMimeType = stored?.mimeType;
        row.attachmentSize = stored?.size;
    }
    return withFileUrls(await repo.save(row));
}
async function listAssignments(filters) {
    const qb = data_source_1.AppDataSource.getRepository(entities_1.LmsAssignment)
        .createQueryBuilder('a')
        .leftJoinAndSelect('a.schoolClass', 'schoolClass')
        .leftJoinAndSelect('a.subject', 'subject')
        .leftJoinAndSelect('a.teacher', 'teacher')
        .orderBy('a.dueAt', 'ASC', 'NULLS LAST')
        .addOrderBy('a.createdAt', 'DESC');
    if (filters.classId)
        qb.andWhere('a.classId = :classId', { classId: filters.classId });
    if (filters.subjectId)
        qb.andWhere('a.subjectId = :subjectId', { subjectId: filters.subjectId });
    if (filters.termId)
        qb.andWhere('a.termId = :termId', { termId: filters.termId });
    if (filters.status)
        qb.andWhere('a.status = :status', { status: filters.status });
    if (filters.studentId) {
        qb.andWhere('a.status = :published', { published: enums_1.LmsAssignmentStatus.PUBLISHED });
        const student = await data_source_1.AppDataSource.getRepository(entities_1.Student).findOne({
            where: { id: filters.studentId },
        });
        if (!student?.classId)
            return [];
        qb.andWhere('a.classId = :studentClassId', { studentClassId: student.classId });
    }
    const rows = await qb.getMany();
    return rows.map((r) => withFileUrls(r));
}
async function getAssignment(id) {
    const row = await data_source_1.AppDataSource.getRepository(entities_1.LmsAssignment).findOne({
        where: { id },
        relations: (0, typeorm_helpers_1.relations)('schoolClass', 'subject', 'teacher', 'term'),
    });
    if (!row)
        throw new LmsHttpError(404, 'Assignment not found');
    return withFileUrls(row);
}
async function deleteAssignment(id) {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.LmsAssignment);
    const row = await repo.findOne({ where: { id } });
    if (!row)
        throw new LmsHttpError(404, 'Assignment not found');
    if (row.attachmentKey)
        await storage_service_1.storageService.delete(row.attachmentKey);
    await repo.remove(row);
    return { deleted: true };
}
// ── Submissions ─────────────────────────────────────────────────────────────
async function submitAssignment(assignmentId, dto, studentId, file) {
    const sid = requireStudentId(studentId);
    const assignment = await data_source_1.AppDataSource.getRepository(entities_1.LmsAssignment).findOne({
        where: { id: assignmentId },
    });
    if (!assignment)
        throw new LmsHttpError(404, 'Assignment not found');
    if (assignment.status !== enums_1.LmsAssignmentStatus.PUBLISHED) {
        throw new LmsHttpError(400, 'Assignment is not open for submissions');
    }
    const student = await data_source_1.AppDataSource.getRepository(entities_1.Student).findOne({ where: { id: sid } });
    if (!student || student.classId !== assignment.classId) {
        throw new LmsHttpError(403, 'You are not enrolled in this assignment class');
    }
    if (!dto.textAnswer?.trim() && !file) {
        throw new LmsHttpError(400, 'Provide a text answer and/or a file');
    }
    const repo = data_source_1.AppDataSource.getRepository(entities_1.LmsSubmission);
    let row = await repo.findOne({ where: { assignmentId, studentId: sid } });
    const late = assignment.dueAt && new Date() > new Date(assignment.dueAt)
        ? enums_1.LmsSubmissionStatus.LATE
        : enums_1.LmsSubmissionStatus.SUBMITTED;
    const stored = await storeUpload('lms-submissions', file);
    if (row) {
        if (row.status === enums_1.LmsSubmissionStatus.GRADED) {
            throw new LmsHttpError(400, 'Graded submissions cannot be resubmitted');
        }
        if (stored && row.fileKey)
            await storage_service_1.storageService.delete(row.fileKey);
        row.textAnswer = dto.textAnswer?.trim() || row.textAnswer;
        if (stored) {
            row.fileKey = stored.key;
            row.fileOriginalName = stored.originalName;
            row.fileMimeType = stored.mimeType;
            row.fileSize = stored.size;
        }
        row.status = late;
        row.submittedAt = new Date();
    }
    else {
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
async function listSubmissions(assignmentId) {
    const rows = await data_source_1.AppDataSource.getRepository(entities_1.LmsSubmission).find({
        where: { assignmentId },
        relations: (0, typeorm_helpers_1.relations)('student'),
        order: { submittedAt: 'DESC' },
    });
    return rows.map((r) => withFileUrls(r));
}
async function getMySubmission(assignmentId, studentId) {
    const sid = requireStudentId(studentId);
    const row = await data_source_1.AppDataSource.getRepository(entities_1.LmsSubmission).findOne({
        where: { assignmentId, studentId: sid },
    });
    return row ? withFileUrls(row) : null;
}
async function gradeSubmission(submissionId, dto, staffId) {
    const gradedById = requireStaffId(staffId);
    const repo = data_source_1.AppDataSource.getRepository(entities_1.LmsSubmission);
    const row = await repo.findOne({
        where: { id: submissionId },
        relations: (0, typeorm_helpers_1.relations)('assignment', 'student'),
    });
    if (!row)
        throw new LmsHttpError(404, 'Submission not found');
    if (row.assignment?.maxScore != null && dto.grade > Number(row.assignment.maxScore)) {
        throw new LmsHttpError(400, `Grade cannot exceed max score (${row.assignment.maxScore})`);
    }
    row.grade = String(dto.grade);
    row.feedback = dto.feedback;
    row.status = dto.status ?? enums_1.LmsSubmissionStatus.GRADED;
    row.gradedById = gradedById;
    row.gradedAt = new Date();
    const saved = await repo.save(row);
    if (row.student?.userId) {
        await data_source_1.AppDataSource.getRepository(entities_1.Notification).save(data_source_1.AppDataSource.getRepository(entities_1.Notification).create({
            userId: row.student.userId,
            title: 'Assignment graded',
            message: `Your submission for "${row.assignment?.title ?? 'assignment'}" was graded: ${dto.grade}`,
            type: 'lms_grade',
            metadata: { submissionId: row.id, assignmentId: row.assignmentId, grade: dto.grade },
        }));
    }
    return withFileUrls(saved);
}
// ── Lesson content ──────────────────────────────────────────────────────────
async function createLessonContent(dto, staffId, file) {
    const uploadedById = requireStaffId(staffId);
    if (dto.contentType === enums_1.LessonContentType.LINK && !dto.externalUrl?.trim()) {
        throw new LmsHttpError(400, 'externalUrl is required for link content');
    }
    if ((dto.contentType === enums_1.LessonContentType.DOCUMENT || dto.contentType === enums_1.LessonContentType.NOTE) &&
        !file &&
        !dto.externalUrl) {
        throw new LmsHttpError(400, 'Upload a file or provide an externalUrl');
    }
    const stored = await storeUpload('lesson-content', file);
    const repo = data_source_1.AppDataSource.getRepository(entities_1.LessonContent);
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
async function updateLessonContent(id, dto, file) {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.LessonContent);
    const row = await repo.findOne({ where: { id } });
    if (!row)
        throw new LmsHttpError(404, 'Lesson content not found');
    if (dto.title !== undefined)
        row.title = dto.title.trim();
    if (dto.description !== undefined)
        row.description = dto.description ?? undefined;
    if (dto.contentType !== undefined)
        row.contentType = dto.contentType;
    if (dto.externalUrl !== undefined)
        row.externalUrl = dto.externalUrl ?? undefined;
    if (dto.sortOrder !== undefined)
        row.sortOrder = dto.sortOrder;
    if (dto.isPublished !== undefined) {
        row.isPublished = dto.isPublished;
        if (dto.isPublished && !row.publishedAt)
            row.publishedAt = new Date();
    }
    if (file) {
        if (row.fileKey)
            await storage_service_1.storageService.delete(row.fileKey);
        const stored = await storeUpload('lesson-content', file);
        row.fileKey = stored?.key;
        row.fileOriginalName = stored?.originalName;
        row.fileMimeType = stored?.mimeType;
        row.fileSize = stored?.size;
    }
    return withFileUrls(await repo.save(row));
}
async function listLessonContent(filters) {
    const qb = data_source_1.AppDataSource.getRepository(entities_1.LessonContent)
        .createQueryBuilder('c')
        .leftJoinAndSelect('c.subject', 'subject')
        .leftJoinAndSelect('c.schoolClass', 'schoolClass')
        .orderBy('c.sortOrder', 'ASC')
        .addOrderBy('c.createdAt', 'DESC');
    if (filters.classId)
        qb.andWhere('(c.classId = :classId OR c.classId IS NULL)', { classId: filters.classId });
    if (filters.subjectId)
        qb.andWhere('c.subjectId = :subjectId', { subjectId: filters.subjectId });
    if (filters.termId)
        qb.andWhere('c.termId = :termId', { termId: filters.termId });
    if (filters.publishedOnly)
        qb.andWhere('c.isPublished = true');
    return (await qb.getMany()).map((r) => withFileUrls(r));
}
async function deleteLessonContent(id) {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.LessonContent);
    const row = await repo.findOne({ where: { id } });
    if (!row)
        throw new LmsHttpError(404, 'Lesson content not found');
    if (row.fileKey)
        await storage_service_1.storageService.delete(row.fileKey);
    await repo.remove(row);
    return { deleted: true };
}
// ── Virtual classes ─────────────────────────────────────────────────────────
async function createVirtualClass(dto, staffId) {
    const teacherId = requireStaffId(staffId);
    const provider = dto.provider ?? enums_1.VirtualClassProvider.MANUAL;
    if (provider === enums_1.VirtualClassProvider.MANUAL && !dto.joinUrl?.trim()) {
        throw new LmsHttpError(400, 'joinUrl is required for manual virtual classes');
    }
    // Zoom / Google Meet meeting creation is wired in a later phase when API keys exist.
    if (provider !== enums_1.VirtualClassProvider.MANUAL) {
        throw new LmsHttpError(501, `${provider} meeting creation is not configured yet — use provider "manual" with a join URL`);
    }
    const repo = data_source_1.AppDataSource.getRepository(entities_1.VirtualClass);
    const row = repo.create({
        classId: dto.classId,
        subjectId: dto.subjectId,
        teacherId,
        title: dto.title.trim(),
        description: dto.description,
        startsAt: new Date(dto.startsAt),
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        provider,
        status: enums_1.VirtualClassStatus.SCHEDULED,
        joinUrl: dto.joinUrl,
        hostUrl: dto.hostUrl,
    });
    const saved = await repo.save(row);
    // Notify students in the class (best-effort).
    const students = await data_source_1.AppDataSource.getRepository(entities_1.Student).find({
        where: { classId: dto.classId, isActive: true },
    });
    const notifRepo = data_source_1.AppDataSource.getRepository(entities_1.Notification);
    for (const s of students) {
        if (!s.userId)
            continue;
        await notifRepo.save(notifRepo.create({
            userId: s.userId,
            title: 'Virtual class scheduled',
            message: `"${saved.title}" starts ${saved.startsAt.toISOString()}`,
            type: 'virtual_class',
            metadata: { virtualClassId: saved.id, joinUrl: saved.joinUrl, startsAt: saved.startsAt },
        }));
    }
    return saved;
}
async function updateVirtualClass(id, dto) {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.VirtualClass);
    const row = await repo.findOne({ where: { id } });
    if (!row)
        throw new LmsHttpError(404, 'Virtual class not found');
    if (dto.title !== undefined)
        row.title = dto.title.trim();
    if (dto.description !== undefined)
        row.description = dto.description ?? undefined;
    if (dto.startsAt !== undefined)
        row.startsAt = new Date(dto.startsAt);
    if (dto.endsAt !== undefined)
        row.endsAt = dto.endsAt ? new Date(dto.endsAt) : undefined;
    if (dto.status !== undefined)
        row.status = dto.status;
    if (dto.joinUrl !== undefined)
        row.joinUrl = dto.joinUrl ?? undefined;
    if (dto.hostUrl !== undefined)
        row.hostUrl = dto.hostUrl ?? undefined;
    return repo.save(row);
}
async function listVirtualClasses(filters) {
    const qb = data_source_1.AppDataSource.getRepository(entities_1.VirtualClass)
        .createQueryBuilder('v')
        .leftJoinAndSelect('v.schoolClass', 'schoolClass')
        .leftJoinAndSelect('v.subject', 'subject')
        .leftJoinAndSelect('v.teacher', 'teacher')
        .leftJoinAndSelect('v.recordings', 'recordings')
        .orderBy('v.startsAt', 'ASC');
    if (filters.classId)
        qb.andWhere('v.classId = :classId', { classId: filters.classId });
    if (filters.teacherId)
        qb.andWhere('v.teacherId = :teacherId', { teacherId: filters.teacherId });
    if (filters.from)
        qb.andWhere('v.startsAt >= :from', { from: filters.from });
    if (filters.to)
        qb.andWhere('v.startsAt <= :to', { to: filters.to });
    return qb.getMany();
}
async function deleteVirtualClass(id) {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.VirtualClass);
    const row = await repo.findOne({ where: { id } });
    if (!row)
        throw new LmsHttpError(404, 'Virtual class not found');
    await repo.remove(row);
    return { deleted: true };
}
async function addRecording(virtualClassId, dto) {
    const vc = await data_source_1.AppDataSource.getRepository(entities_1.VirtualClass).findOne({ where: { id: virtualClassId } });
    if (!vc)
        throw new LmsHttpError(404, 'Virtual class not found');
    const repo = data_source_1.AppDataSource.getRepository(entities_1.ClassRecording);
    return repo.save(repo.create({
        virtualClassId,
        title: dto.title.trim(),
        recordingUrl: dto.recordingUrl,
        durationSeconds: dto.durationSeconds,
        recordedAt: dto.recordedAt ? new Date(dto.recordedAt) : new Date(),
    }));
}
async function listRecordings(classId) {
    return data_source_1.AppDataSource.getRepository(entities_1.ClassRecording)
        .createQueryBuilder('r')
        .innerJoinAndSelect('r.virtualClass', 'v')
        .where('v.classId = :classId', { classId })
        .orderBy('r.recordedAt', 'DESC')
        .getMany();
}
// ── Library ─────────────────────────────────────────────────────────────────
function canAccessResource(resource, role) {
    if (!resource.accessRoles?.length)
        return true;
    return resource.accessRoles.includes(role);
}
async function createLibraryResource(dto, userId, file) {
    if (dto.resourceType === enums_1.LibraryResourceType.LINK && !dto.externalUrl?.trim()) {
        throw new LmsHttpError(400, 'externalUrl is required for link resources');
    }
    if (dto.resourceType !== enums_1.LibraryResourceType.LINK && !file && !dto.externalUrl) {
        throw new LmsHttpError(400, 'Upload a file or provide an externalUrl');
    }
    const stored = await storeUpload('library', file);
    const repo = data_source_1.AppDataSource.getRepository(entities_1.LibraryResource);
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
async function updateLibraryResource(id, dto, file) {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.LibraryResource);
    const row = await repo.findOne({ where: { id } });
    if (!row)
        throw new LmsHttpError(404, 'Resource not found');
    if (dto.title !== undefined)
        row.title = dto.title.trim();
    if (dto.description !== undefined)
        row.description = dto.description ?? undefined;
    if (dto.resourceType !== undefined)
        row.resourceType = dto.resourceType;
    if (dto.externalUrl !== undefined)
        row.externalUrl = dto.externalUrl ?? undefined;
    if (dto.subjectId !== undefined)
        row.subjectId = dto.subjectId ?? undefined;
    if (dto.gradeFormId !== undefined)
        row.gradeFormId = dto.gradeFormId ?? undefined;
    if (dto.accessRoles !== undefined)
        row.accessRoles = dto.accessRoles;
    if (dto.isPublished !== undefined)
        row.isPublished = dto.isPublished;
    if (file) {
        if (row.fileKey)
            await storage_service_1.storageService.delete(row.fileKey);
        const stored = await storeUpload('library', file);
        row.fileKey = stored?.key;
        row.fileOriginalName = stored?.originalName;
        row.fileMimeType = stored?.mimeType;
        row.fileSize = stored?.size;
    }
    return withFileUrls(await repo.save(row));
}
async function listLibraryResources(filters, role) {
    const qb = data_source_1.AppDataSource.getRepository(entities_1.LibraryResource)
        .createQueryBuilder('r')
        .leftJoinAndSelect('r.subject', 'subject')
        .leftJoinAndSelect('r.gradeForm', 'gradeForm')
        .orderBy('r.createdAt', 'DESC');
    if (filters.q) {
        qb.andWhere('(r.title ILIKE :q OR r.description ILIKE :q)', { q: `%${filters.q}%` });
    }
    if (filters.subjectId)
        qb.andWhere('r.subjectId = :subjectId', { subjectId: filters.subjectId });
    if (filters.gradeFormId)
        qb.andWhere('r.gradeFormId = :gradeFormId', { gradeFormId: filters.gradeFormId });
    if (filters.resourceType)
        qb.andWhere('r.resourceType = :resourceType', { resourceType: filters.resourceType });
    if (filters.publishedOnly)
        qb.andWhere('r.isPublished = true');
    const rows = await qb.getMany();
    return rows.filter((r) => canAccessResource(r, role)).map((r) => withFileUrls(r));
}
async function deleteLibraryResource(id) {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.LibraryResource);
    const row = await repo.findOne({ where: { id } });
    if (!row)
        throw new LmsHttpError(404, 'Resource not found');
    if (row.fileKey)
        await storage_service_1.storageService.delete(row.fileKey);
    await repo.remove(row);
    return { deleted: true };
}
async function bookmarkResource(userId, resourceId) {
    const resource = await data_source_1.AppDataSource.getRepository(entities_1.LibraryResource).findOne({ where: { id: resourceId } });
    if (!resource)
        throw new LmsHttpError(404, 'Resource not found');
    const repo = data_source_1.AppDataSource.getRepository(entities_1.LibraryBookmark);
    const existing = await repo.findOne({ where: { userId, resourceId } });
    if (existing)
        return existing;
    return repo.save(repo.create({ userId, resourceId }));
}
async function removeBookmark(userId, resourceId) {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.LibraryBookmark);
    const existing = await repo.findOne({ where: { userId, resourceId } });
    if (!existing)
        throw new LmsHttpError(404, 'Bookmark not found');
    await repo.remove(existing);
    return { deleted: true };
}
async function listBookmarks(userId) {
    const rows = await data_source_1.AppDataSource.getRepository(entities_1.LibraryBookmark).find({
        where: { userId },
        relations: (0, typeorm_helpers_1.relations)('resource', 'resource.subject', 'resource.gradeForm'),
        order: { createdAt: 'DESC' },
    });
    return rows.map((b) => ({
        ...b,
        resource: b.resource ? withFileUrls(b.resource) : b.resource,
    }));
}
