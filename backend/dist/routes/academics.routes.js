"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-nocheck
const express_1 = require("express");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const data_source_1 = require("../config/data-source");
const entities_1 = require("../entities");
const enums_1 = require("../entities/enums");
const auth_1 = require("../middleware/auth");
const typeorm_helpers_1 = require("../utils/typeorm-helpers");
const message_attachments_1 = require("../utils/message-attachments");
const class_subject_teacher_service_1 = require("../services/class-subject-teacher.service");
const messaging_service_1 = require("../services/messaging.service");
const message_notify_service_1 = require("../services/message-notify.service");
const access_control_1 = require("../middleware/access-control");
const audit_log_service_1 = require("../services/audit-log.service");
const homework_assignments_1 = require("../utils/homework-assignments");
const homework_assignment_service_1 = require("../services/homework-assignment.service");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
const msgView = (0, access_control_1.requireModuleAccess)('communication', 'view');
const msgCreate = (0, access_control_1.requireModuleAccess)('communication', 'create');
const msgDelete = (0, access_control_1.requireModuleAccess)('communication', 'delete');
const messageRelations = (0, typeorm_helpers_1.relations)('sender', 'recipient', 'student', 'attachments');
router.get('/timetable', async (req, res) => {
    const { classId } = req.query;
    const repo = data_source_1.AppDataSource.getRepository(entities_1.Timetable);
    const where = {};
    if (classId)
        where.classId = classId;
    res.json(await repo.find({
        where,
        relations: (0, typeorm_helpers_1.relations)('subject', 'teacher', 'teacher.user', 'schoolClass'),
        order: { dayOfWeek: 'ASC', startTime: 'ASC' },
    }));
});
router.post('/timetable', (0, auth_1.authorize)(enums_1.UserRole.TEACHER, enums_1.UserRole.ADMIN), async (req, res) => {
    try {
        const repo = data_source_1.AppDataSource.getRepository(entities_1.Timetable);
        const { classId, subjectId, teacherId } = req.body || {};
        if (classId && subjectId && teacherId) {
            await (0, class_subject_teacher_service_1.assertTimetableTeacherMatchesAssignment)(String(classId), String(subjectId), String(teacherId));
        }
        const entry = await repo.save(repo.create(req.body));
        res.status(201).json(entry);
    }
    catch (err) {
        const e = err;
        const status = e.statusCode || (e.name === 'ClassSubjectTeacherConflictError' ? 409 : 400);
        res.status(status).json({ message: e.message || 'Failed to create timetable entry.' });
    }
});
router.get('/learning-schedules', (0, auth_1.authorize)(enums_1.UserRole.TEACHER, enums_1.UserRole.ADMIN, enums_1.UserRole.PARENT, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.STUDENT), async (req, res) => {
    const { classId, termId, weekStart } = req.query;
    const repo = data_source_1.AppDataSource.getRepository(entities_1.LearningSchedule);
    const where = {};
    if (req.user.role === enums_1.UserRole.STUDENT) {
        if (!req.user.studentId)
            return res.json([]);
        const student = await data_source_1.AppDataSource.query(`SELECT "classId" FROM students WHERE id = $1 AND "isActive" = true LIMIT 1`, [req.user.studentId]);
        const studentClassId = student[0]?.classId;
        if (!studentClassId)
            return res.json([]);
        where.classId = studentClassId;
    }
    else if (classId) {
        where.classId = classId;
    }
    if (termId)
        where.termId = termId;
    if (weekStart)
        where.weekStart = weekStart;
    res.json(await repo.find({
        where,
        relations: (0, typeorm_helpers_1.relations)('subject', 'teacher', 'teacher.user', 'schoolClass'),
        order: { weekStart: 'DESC' },
    }));
});
router.post('/learning-schedules', (0, auth_1.authorize)(enums_1.UserRole.TEACHER, enums_1.UserRole.ADMIN), async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.LearningSchedule);
    const entry = await repo.save(repo.create({ ...req.body, teacherId: req.user.staffId }));
    res.status(201).json(entry);
});
router.get('/weekly-assessments', (0, auth_1.authorize)(enums_1.UserRole.TEACHER, enums_1.UserRole.ADMIN, enums_1.UserRole.PARENT, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.STUDENT), async (req, res) => {
    const { studentId, classId, termId, weekStart } = req.query;
    const repo = data_source_1.AppDataSource.getRepository(entities_1.WeeklyAssessment);
    const qb = repo.createQueryBuilder('a')
        .leftJoinAndSelect('a.student', 's')
        .leftJoinAndSelect('a.subject', 'sub')
        .leftJoinAndSelect('a.teacher', 't');
    if (req.user.role === enums_1.UserRole.STUDENT) {
        if (!req.user.studentId)
            return res.json([]);
        qb.andWhere('a.studentId = :studentId', { studentId: req.user.studentId });
    }
    else {
        if (studentId)
            qb.andWhere('a.studentId = :studentId', { studentId });
        if (classId)
            qb.andWhere('s.classId = :classId', { classId });
    }
    if (termId)
        qb.andWhere('a.termId = :termId', { termId });
    if (weekStart)
        qb.andWhere('a.weekStart = :weekStart', { weekStart });
    res.json(await qb.orderBy('a.weekStart', 'DESC').getMany());
});
router.post('/weekly-assessments/bulk', (0, auth_1.authorize)(enums_1.UserRole.TEACHER, enums_1.UserRole.ADMIN), async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.WeeklyAssessment);
    const { assessments } = req.body;
    const saved = [];
    for (const a of assessments) {
        saved.push(await repo.save(repo.create({ ...a, teacherId: req.user.staffId })));
    }
    res.json(saved);
});
router.get('/homework-assignments/subjects', (0, auth_1.authorize)(enums_1.UserRole.TEACHER, enums_1.UserRole.ADMIN), async (req, res) => {
    try {
        const classId = String(req.query.classId || '');
        if (!classId)
            return res.status(400).json({ message: 'classId is required.' });
        const staffId = req.user.staffId;
        if (!staffId)
            return res.status(403).json({ message: 'Teacher profile not linked.' });
        const subjects = await (0, homework_assignment_service_1.listTeacherSubjectsForClass)(staffId, classId);
        res.json(subjects);
    }
    catch (err) {
        const e = err;
        res.status(e.statusCode || 400).json({ message: e.message || 'Failed to load subjects.' });
    }
});
router.get('/homework-assignments', (0, auth_1.authorize)(enums_1.UserRole.TEACHER, enums_1.UserRole.ADMIN, enums_1.UserRole.STUDENT, enums_1.UserRole.PARENT, enums_1.UserRole.PRINCIPAL), async (req, res) => {
    try {
        const termId = req.query.termId ? String(req.query.termId) : undefined;
        if (req.user.role === enums_1.UserRole.STUDENT) {
            if (!req.user.studentId)
                return res.json([]);
            const rows = await (0, homework_assignment_service_1.listStudentHomeworkAssignments)(req.user.studentId, termId);
            return res.json(rows);
        }
        const classId = req.query.classId ? String(req.query.classId) : undefined;
        const rows = await (0, homework_assignment_service_1.listTeacherHomeworkAssignments)(req, classId, termId);
        res.json(rows);
    }
    catch (err) {
        const e = err;
        res.status(e.statusCode || 400).json({ message: e.message || 'Failed to load assignments.' });
    }
});
router.post('/homework-assignments', (0, auth_1.authorize)(enums_1.UserRole.TEACHER, enums_1.UserRole.ADMIN), (req, res, next) => {
    homework_assignments_1.homeworkAssignmentUpload.single('file')(req, res, (err) => {
        if (err) {
            const message = err instanceof Error ? err.message : 'File upload failed.';
            return res.status(400).json({ message });
        }
        next();
    });
}, async (req, res) => {
    try {
        const file = req.file;
        if (!file)
            return res.status(400).json({ message: 'Assignment file is required.' });
        const classId = String(req.body.classId || '');
        const termId = String(req.body.termId || '');
        const title = String(req.body.title || '').trim();
        if (!classId || !termId || !title) {
            return res.status(400).json({ message: 'classId, termId, and title are required.' });
        }
        const created = await (0, homework_assignment_service_1.createHomeworkAssignment)(req, {
            classId,
            termId,
            subjectId: req.body.subjectId ? String(req.body.subjectId) : undefined,
            title,
            instructions: req.body.instructions ? String(req.body.instructions) : undefined,
            dueDate: req.body.dueDate ? String(req.body.dueDate) : undefined,
            originalFileName: file.originalname,
            storedFileName: file.filename,
            mimeType: file.mimetype,
            fileSize: file.size,
        });
        res.status(201).json(created);
    }
    catch (err) {
        const e = err;
        res.status(e.statusCode || 400).json({ message: e.message || 'Failed to post assignment.' });
    }
});
router.get('/messages/recipients', (0, auth_1.authorize)(enums_1.UserRole.TEACHER, enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL), msgView, async (req, res) => {
    const userRepo = data_source_1.AppDataSource.getRepository(entities_1.User);
    // Teachers only see parents/students they teach — not the full user directory.
    if (req.user.role === enums_1.UserRole.TEACHER && req.user.staffId) {
        const list = await (0, messaging_service_1.listTeacherMessagingRecipients)(req.user.staffId);
        return res.json({
            recipients: list.map((r) => ({
                id: r.id,
                firstName: r.firstName,
                lastName: r.lastName,
                email: r.email,
                role: r.role,
            })),
            registeredParentCount: list.filter((r) => r.role === enums_1.UserRole.PARENT).length,
        });
    }
    const users = await userRepo.find({
        where: { isActive: true },
        relations: (0, typeorm_helpers_1.relations)('parentProfile'),
        order: { lastName: 'ASC', firstName: 'ASC' },
    });
    const registeredParentCount = users.filter((u) => u.role === enums_1.UserRole.PARENT && u.parentProfile && u.id !== req.user.userId).length;
    res.json({
        recipients: users
            .filter((u) => u.id !== req.user.userId)
            .map((u) => ({
            id: u.id,
            firstName: u.firstName,
            lastName: u.lastName,
            email: u.email,
            role: u.role,
        })),
        registeredParentCount,
    });
});
router.get('/messages/unread-count', (0, auth_1.authorize)(enums_1.UserRole.TEACHER, enums_1.UserRole.PARENT, enums_1.UserRole.STUDENT, enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL), msgView, async (req, res) => {
    const rows = await data_source_1.AppDataSource.query(`SELECT COUNT(*)::int AS count FROM messages WHERE "recipientId" = $1 AND "isRead" = false`, [req.user.userId]);
    res.json({ count: Number(rows[0]?.count || 0) });
});
router.get('/messages/inbox', (0, auth_1.authorize)(enums_1.UserRole.TEACHER, enums_1.UserRole.PARENT, enums_1.UserRole.STUDENT, enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL), msgView, async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.Message);
    const messages = await repo.find({
        where: { recipientId: req.user.userId },
        relations: messageRelations,
        order: { sentAt: 'DESC' },
    });
    res.json(messages);
});
router.get('/messages/sent', (0, auth_1.authorize)(enums_1.UserRole.TEACHER, enums_1.UserRole.PARENT, enums_1.UserRole.STUDENT, enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL), msgView, async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.Message);
    const messages = await repo.find({
        where: { senderId: req.user.userId },
        relations: messageRelations,
        order: { sentAt: 'DESC' },
    });
    res.json(messages);
});
router.get('/messages', (0, auth_1.authorize)(enums_1.UserRole.TEACHER, enums_1.UserRole.PARENT, enums_1.UserRole.STUDENT, enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL), msgView, async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.Message);
    const messages = await repo.find({
        where: [{ recipientId: req.user.userId }, { senderId: req.user.userId }],
        relations: messageRelations,
        order: { sentAt: 'DESC' },
    });
    res.json(messages);
});
router.get('/messages/staff-recipients', (0, auth_1.authorize)(enums_1.UserRole.PARENT, enums_1.UserRole.STUDENT), msgView, async (req, res) => {
    // Restrict teachers to those actually assigned to the requester's child(ren)
    // (or, for students, their own teachers) — plus the school office.
    let list = [];
    if (req.user.role === enums_1.UserRole.PARENT && req.user.parentId) {
        list = await (0, messaging_service_1.listParentMessagingRecipients)(req.user.parentId);
    }
    else if (req.user.role === enums_1.UserRole.STUDENT && req.user.studentId) {
        list = await (0, messaging_service_1.listStudentMessagingRecipients)(req.user.studentId);
    }
    res.json(list);
});
// Recipients a teacher may contact: parents/students of the students they teach, plus office.
router.get('/messages/teacher-recipients', (0, auth_1.authorize)(enums_1.UserRole.TEACHER), msgView, async (req, res) => {
    if (!req.user.staffId)
        return res.json([]);
    const list = await (0, messaging_service_1.listTeacherMessagingRecipients)(req.user.staffId);
    res.json(list);
});
// Threaded conversation list for the current user: one entry per counterpart.
router.get('/messages/threads', (0, auth_1.authorize)(enums_1.UserRole.TEACHER, enums_1.UserRole.PARENT, enums_1.UserRole.STUDENT, enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL), msgView, async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.Message);
    const me = req.user.userId;
    const messages = await repo.find({
        where: [{ recipientId: me }, { senderId: me }],
        relations: (0, typeorm_helpers_1.relations)('sender', 'recipient'),
        order: { sentAt: 'DESC' },
    });
    const threads = new Map();
    for (const m of messages) {
        const key = m.threadId || (0, messaging_service_1.conversationKey)(m.senderId, m.recipientId);
        const fromMe = m.senderId === me;
        const other = fromMe ? m.recipient : m.sender;
        let entry = threads.get(key);
        if (!entry) {
            entry = {
                threadId: key,
                counterpart: other
                    ? { id: other.id, firstName: other.firstName, lastName: other.lastName, role: other.role }
                    : null,
                lastMessage: { subject: m.subject, body: m.body, sentAt: m.sentAt, fromMe },
                unreadCount: 0,
            };
            threads.set(key, entry);
        }
        if (!fromMe && !m.isRead)
            entry.unreadCount += 1;
    }
    res.json([...threads.values()]);
});
// All messages in a single conversation (and mark inbound ones read).
router.get('/messages/threads/:threadId', (0, auth_1.authorize)(enums_1.UserRole.TEACHER, enums_1.UserRole.PARENT, enums_1.UserRole.STUDENT, enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL), msgView, async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.Message);
    const me = req.user.userId;
    const threadId = String(req.params.threadId);
    const messages = await repo.find({
        where: [
            { threadId, recipientId: me },
            { threadId, senderId: me },
        ],
        relations: messageRelations,
        order: { sentAt: 'ASC' },
    });
    const unreadIds = messages.filter((m) => m.recipientId === me && !m.isRead).map((m) => m.id);
    if (unreadIds.length) {
        await repo.createQueryBuilder().update(entities_1.Message).set({ isRead: true }).whereInIds(unreadIds).execute();
        for (const m of messages)
            if (unreadIds.includes(m.id))
                m.isRead = true;
    }
    res.json(messages);
});
router.post('/messages/to-admin', (0, auth_1.authorize)(enums_1.UserRole.PARENT, enums_1.UserRole.STUDENT), msgCreate, message_attachments_1.messageAttachmentUpload.array('attachments', message_attachments_1.MAX_MESSAGE_ATTACHMENTS), async (req, res) => {
    if (!(0, access_control_1.denyUnlessModuleAccess)(req, res, 'communication', 'create'))
        return;
    const trimmedSubject = String(req.body?.subject || '').trim();
    const trimmedBody = String(req.body?.body || '').trim();
    const studentId = String(req.body?.studentId || '').trim() || undefined;
    const recipientEmail = String(req.body?.recipientEmail || '').trim();
    if (!recipientEmail) {
        return res.status(400).json({ message: 'Recipient email address is required' });
    }
    if (!trimmedSubject || !trimmedBody) {
        return res.status(400).json({ message: 'Subject and message body are required' });
    }
    const userRepo = data_source_1.AppDataSource.getRepository(entities_1.User);
    const messageRepo = data_source_1.AppDataSource.getRepository(entities_1.Message);
    const attachmentRepo = data_source_1.AppDataSource.getRepository(entities_1.MessageAttachment);
    const guardianRepo = data_source_1.AppDataSource.getRepository(entities_1.Guardian);
    const recipient = await (0, message_attachments_1.resolveStaffRecipientByEmail)(userRepo, recipientEmail);
    if (!recipient) {
        return res.status(404).json({
            message: 'No active school staff account found for that email address',
        });
    }
    if (recipient.id === req.user.userId) {
        return res.status(400).json({ message: 'You cannot send a message to yourself' });
    }
    // Restrict who a parent/student can reach: office staff, or only the
    // teacher(s) actually assigned to their child(ren) / themselves.
    const allowed = await (0, messaging_service_1.canMessageRecipient)(req.user, { id: recipient.id, role: recipient.role });
    if (!allowed) {
        return res.status(403).json({
            message: 'You can only message the school office or a teacher assigned to your child.',
        });
    }
    if (studentId) {
        const parentId = req.user.parentId;
        if (!parentId) {
            return res.status(400).json({ message: 'Invalid student reference' });
        }
        const link = await guardianRepo.findOne({ where: { studentId, parentId } });
        if (!link) {
            return res.status(403).json({ message: 'Selected student is not linked to your account' });
        }
    }
    const msg = await messageRepo.save(messageRepo.create({
        recipientId: recipient.id,
        senderId: req.user.userId,
        threadId: (0, messaging_service_1.conversationKey)(req.user.userId, recipient.id),
        subject: trimmedSubject,
        body: trimmedBody,
        studentId,
        isRead: false,
    }));
    void (0, message_notify_service_1.notifyNewMessage)(msg);
    void (0, audit_log_service_1.logAudit)({
        userId: req.user.userId,
        userRole: req.user.role,
        userEmail: req.user.email,
        action: 'create',
        module: 'communication',
        recordId: msg.id,
        recordLabel: trimmedSubject,
    });
    const files = Array.isArray(req.files) ? req.files : [];
    const savedAttachments = [];
    for (const file of files) {
        savedAttachments.push(await attachmentRepo.save(attachmentRepo.create({
            messageId: msg.id,
            originalName: file.originalname,
            storedName: file.filename,
            mimeType: file.mimetype,
            sizeBytes: file.size,
        })));
    }
    const full = await messageRepo.findOne({
        where: { id: msg.id },
        relations: messageRelations,
    });
    res.status(201).json(full);
});
router.get('/messages/attachments/:attachmentId', (0, auth_1.authorize)(enums_1.UserRole.TEACHER, enums_1.UserRole.PARENT, enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.STUDENT), msgView, async (req, res) => {
    const attachmentRepo = data_source_1.AppDataSource.getRepository(entities_1.MessageAttachment);
    const attachment = await attachmentRepo.findOne({
        where: { id: req.params.attachmentId },
        relations: (0, typeorm_helpers_1.relations)('message'),
    });
    if (!attachment?.message) {
        return res.status(404).json({ message: 'Attachment not found' });
    }
    const msg = attachment.message;
    const userId = req.user.userId;
    if (msg.senderId !== userId && msg.recipientId !== userId) {
        return res.status(403).json({ message: 'Not allowed to access this attachment' });
    }
    const fullPath = path_1.default.join(process.cwd(), 'uploads', 'message-attachments', attachment.storedName);
    if (!fs_1.default.existsSync(fullPath)) {
        return res.status(404).json({ message: 'Attachment file missing on server' });
    }
    res.setHeader('Content-Type', attachment.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${attachment.originalName.replace(/"/g, '')}"`);
    res.sendFile(fullPath);
});
router.post('/messages', (0, auth_1.authorize)(enums_1.UserRole.TEACHER, enums_1.UserRole.PARENT, enums_1.UserRole.STUDENT, enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL), msgCreate, async (req, res) => {
    const { recipientId, subject, body, studentId, broadcastToAllParents } = req.body || {};
    const trimmedSubject = String(subject || '').trim();
    const trimmedBody = String(body || '').trim();
    const ALL_REGISTERED_PARENTS = '__all_registered_parents__';
    const wantsBroadcast = broadcastToAllParents === true ||
        recipientId === ALL_REGISTERED_PARENTS ||
        String(recipientId || '') === ALL_REGISTERED_PARENTS;
    if (!trimmedSubject || !trimmedBody) {
        return res.status(400).json({ message: 'subject and body are required' });
    }
    const repo = data_source_1.AppDataSource.getRepository(entities_1.Message);
    const userRepo = data_source_1.AppDataSource.getRepository(entities_1.User);
    if (wantsBroadcast) {
        const canBroadcast = [enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL].includes(req.user.role);
        if (!canBroadcast) {
            return res.status(403).json({ message: 'Only administrators can send announcements to all parents' });
        }
        const parentUsers = await userRepo.find({
            where: { role: enums_1.UserRole.PARENT, isActive: true },
            relations: (0, typeorm_helpers_1.relations)('parentProfile'),
        });
        const recipients = parentUsers.filter((u) => u.parentProfile && u.id !== req.user.userId);
        if (!recipients.length) {
            return res.status(400).json({ message: 'No registered parents found to receive this announcement' });
        }
        const messages = recipients.map((recipient) => repo.create({
            recipientId: recipient.id,
            subject: trimmedSubject,
            body: trimmedBody,
            senderId: req.user.userId,
            threadId: (0, messaging_service_1.conversationKey)(req.user.userId, recipient.id),
            isRead: false,
        }));
        await repo.save(messages);
        for (const m of messages) {
            void (0, audit_log_service_1.logAudit)({
                userId: req.user.userId,
                userRole: req.user.role,
                userEmail: req.user.email,
                action: 'create',
                module: 'communication',
                recordId: m.id,
                recordLabel: trimmedSubject,
            });
        }
        return res.status(201).json({
            broadcast: true,
            sentCount: messages.length,
            subject: trimmedSubject,
        });
    }
    if (!recipientId) {
        return res.status(400).json({ message: 'recipientId is required' });
    }
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidPattern.test(String(recipientId))) {
        return res.status(400).json({ message: 'Invalid recipient selected' });
    }
    const recipient = await userRepo.findOne({ where: { id: recipientId, isActive: true } });
    if (!recipient)
        return res.status(404).json({ message: 'Recipient not found' });
    // Enforce parent↔teacher (and student↔teacher) messaging restrictions.
    const allowed = await (0, messaging_service_1.canMessageRecipient)(req.user, { id: recipient.id, role: recipient.role });
    if (!allowed) {
        return res.status(403).json({
            message: 'You are not allowed to message this recipient.',
        });
    }
    const msg = await repo.save(repo.create({
        recipientId,
        subject: trimmedSubject,
        body: trimmedBody,
        studentId: studentId || undefined,
        senderId: req.user.userId,
        threadId: (0, messaging_service_1.conversationKey)(req.user.userId, recipient.id),
        isRead: false,
    }));
    void (0, message_notify_service_1.notifyNewMessage)(msg);
    void (0, audit_log_service_1.logAudit)({
        userId: req.user.userId,
        userRole: req.user.role,
        userEmail: req.user.email,
        action: 'create',
        module: 'communication',
        recordId: msg.id,
        recordLabel: trimmedSubject,
    });
    const full = await repo.findOne({
        where: { id: msg.id },
        relations: messageRelations,
    });
    res.status(201).json(full);
});
router.patch('/messages/:id/read', (0, auth_1.authorize)(enums_1.UserRole.TEACHER, enums_1.UserRole.PARENT, enums_1.UserRole.STUDENT, enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL), msgView, async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.Message);
    const msg = await repo.findOne({
        where: { id: req.params.id, recipientId: req.user.userId },
        relations: messageRelations,
    });
    if (!msg)
        return res.status(404).json({ message: 'Message not found' });
    msg.isRead = true;
    await repo.save(msg);
    res.json(msg);
});
router.delete('/messages/:id', (0, auth_1.authorize)(enums_1.UserRole.TEACHER, enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL), msgDelete, async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.Message);
    const msg = await repo.findOne({
        where: { id: req.params.id },
        relations: (0, typeorm_helpers_1.relations)('attachments'),
    });
    if (!msg)
        return res.status(404).json({ message: 'Message not found' });
    if (msg.senderId !== req.user.userId && msg.recipientId !== req.user.userId) {
        return res.status(403).json({ message: 'Not allowed to delete this message' });
    }
    const storedNames = (msg.attachments || []).map((a) => a.storedName);
    await repo.remove(msg);
    (0, message_attachments_1.removeAttachmentFiles)(storedNames);
    void (0, audit_log_service_1.logAudit)({
        userId: req.user.userId,
        userRole: req.user.role,
        userEmail: req.user.email,
        action: 'delete',
        module: 'communication',
        recordId: msg.id,
        recordLabel: msg.subject,
    });
    res.json({ ok: true });
});
exports.default = router;
