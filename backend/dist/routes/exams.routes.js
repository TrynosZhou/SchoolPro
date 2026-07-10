"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-nocheck
const express_1 = require("express");
const data_source_1 = require("../config/data-source");
const entities_1 = require("../entities");
const enums_1 = require("../entities/enums");
const fin_reports_service_1 = require("../services/fin-reports.service");
const auth_1 = require("../middleware/auth");
const grade_service_1 = require("../services/grade.service");
const class_display_1 = require("../utils/class-display");
const entities_2 = require("../entities");
const honours_service_1 = require("../services/honours.service");
const report_card_service_1 = require("../services/report-card.service");
const school_branding_service_1 = require("../services/school-branding.service");
const grade_boundaries_1 = require("../types/grade-boundaries");
const pdf_1 = require("../utils/pdf");
const mark_sheet_service_1 = require("../services/mark-sheet.service");
const results_analysis_service_1 = require("../services/results-analysis.service");
const ranking_service_1 = require("../services/ranking.service");
const mark_entry_progress_service_1 = require("../services/mark-entry-progress.service");
const record_book_service_1 = require("../services/record-book.service");
const report_card_remarks_service_1 = require("../services/report-card-remarks.service");
const helpers_1 = require("../utils/helpers");
const typeorm_helpers_1 = require("../utils/typeorm-helpers");
const publish_results_service_1 = require("../services/publish-results.service");
const notification_log_service_1 = require("../services/notification-log.service");
const ResultsPublication_1 = require("../entities/ResultsPublication");
const access_control_1 = require("../middleware/access-control");
const access_control_service_1 = require("../services/access-control.service");
const portal_roles_1 = require("../config/portal-roles");
const teacher_class_access_1 = require("../utils/teacher-class-access");
const PUBLISH_ROLES = [enums_1.UserRole.ADMIN, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.DIRECTOR];
const acadView = (0, access_control_1.requireModuleAccess)('academics', 'view');
const acadCreate = (0, access_control_1.requireModuleAccess)('academics', 'create');
const acadEdit = (0, access_control_1.requireModuleAccess)('academics', 'edit');
function isPortalViewer(role) {
    return role === enums_1.UserRole.PARENT || role === enums_1.UserRole.STUDENT;
}
async function assertReportVisibleToPortalUser(report, examTypeId) {
    if (!report.isPublished) {
        return 'Results for this term and exam type have not been published yet.';
    }
    const effectiveExamTypeId = examTypeId || report.examTypeId;
    if (!effectiveExamTypeId)
        return null;
    const pub = await data_source_1.AppDataSource.getRepository(ResultsPublication_1.ResultsPublication).findOne({
        where: { termId: report.termId, examTypeId: effectiveExamTypeId },
    });
    if (!pub) {
        return 'Results for this term and exam type have not been published yet.';
    }
    return null;
}
/**
 * Gate report-card access for portal users (parents & students). Returns an error
 * message string to block with a 403, or null to allow. Admin/teacher/etc. bypass.
 * Enforces, in order:
 *   1. the viewer is actually linked to the student (student = self, parent = guardian),
 *   2. the results have been published,
 *   3. the student has NO outstanding fees balance.
 */
async function assertPortalReportCardAccess(req, report, examTypeId) {
    const role = req.user.role;
    if (!isPortalViewer(role))
        return null;
    const studentId = report.studentId;
    if (role === enums_1.UserRole.STUDENT) {
        if (req.user.studentId !== studentId) {
            return 'You can only view your own report card.';
        }
    }
    else if (role === enums_1.UserRole.PARENT) {
        if (!req.user.parentId) {
            return 'Parent profile not linked. Please sign out and sign in again.';
        }
        const link = await data_source_1.AppDataSource.getRepository(entities_1.Guardian).findOne({
            where: { parentId: req.user.parentId, studentId },
        });
        if (!link) {
            return 'You can only view report cards for your linked children.';
        }
    }
    const publishBlock = await assertReportVisibleToPortalUser(report, examTypeId);
    if (publishBlock)
        return publishBlock;
    const owed = await (0, fin_reports_service_1.fetchStudentInvoiceBalance)(studentId);
    if (owed > 0.005) {
        return `This report card is locked because of an outstanding fees balance of $${owed.toFixed(2)}. Please settle the balance with the school finance office to view or download the report card.`;
    }
    return null;
}
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
router.get('/types', acadView, async (req, res) => {
    const { termId } = req.query;
    if (termId && isPortalViewer(req.user.role)) {
        return res.json(await (0, publish_results_service_1.listPublishedExamTypesForTerm)(termId));
    }
    const repo = data_source_1.AppDataSource.getRepository(entities_1.ExamType);
    res.json(await repo.find());
});
router.get('/grade-boundaries', (0, auth_1.authorize)(enums_1.UserRole.TEACHER, enums_1.UserRole.ADMIN, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PARENT, enums_1.UserRole.STUDENT), acadView, async (_req, res) => {
    res.json(await (0, grade_service_1.getGradeBoundaries)());
});
router.get('/results-publications/status', (0, auth_1.authorize)(...PUBLISH_ROLES), async (req, res) => {
    const { termId, examTypeId } = req.query;
    if (!termId || !examTypeId) {
        return res.status(400).json({ message: 'termId and examTypeId are required' });
    }
    res.json(await (0, publish_results_service_1.getPublicationStatus)(termId, examTypeId));
});
router.get('/results-notifications', (0, auth_1.authorize)(...PUBLISH_ROLES), async (req, res) => {
    const { termId, examTypeId } = req.query;
    if (!termId || !examTypeId) {
        return res.status(400).json({ message: 'termId and examTypeId are required' });
    }
    try {
        res.json(await (0, notification_log_service_1.listResultNotificationLogsForExam)(termId, examTypeId));
    }
    catch (err) {
        return res.status(400).json({
            message: err instanceof Error ? err.message : 'Failed to load notification logs',
        });
    }
});
router.post('/results/publish', (0, auth_1.authorize)(...PUBLISH_ROLES), async (req, res) => {
    const { termId, examTypeId, notifyWhatsApp, notifySms } = req.body;
    if (!termId || !examTypeId) {
        return res.status(400).json({ message: 'termId and examTypeId are required' });
    }
    try {
        const result = await (0, publish_results_service_1.publishResults)({
            termId,
            examTypeId,
            publishedByUserId: req.user.id,
            notifyWhatsApp: notifyWhatsApp !== false,
            notifySms: notifySms !== false,
        });
        res.json(result);
    }
    catch (err) {
        return res.status(400).json({ message: err instanceof Error ? err.message : 'Publish failed' });
    }
});
router.post('/results/unpublish', (0, auth_1.authorize)(...PUBLISH_ROLES), async (req, res) => {
    const { termId, examTypeId } = req.body;
    if (!termId || !examTypeId) {
        return res.status(400).json({ message: 'termId and examTypeId are required' });
    }
    try {
        const result = await (0, publish_results_service_1.unpublishResults)(termId, examTypeId);
        res.json(result);
    }
    catch (err) {
        return res.status(400).json({ message: err instanceof Error ? err.message : 'Unpublish failed' });
    }
});
router.get('/school-branding', (0, auth_1.authorize)(enums_1.UserRole.TEACHER, enums_1.UserRole.ADMIN, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PARENT, enums_1.UserRole.STUDENT), async (_req, res) => {
    res.json(await (0, school_branding_service_1.loadSchoolBranding)());
});
router.get('/terms', (0, auth_1.authorize)(...portal_roles_1.SCHOOL_READ_ROLES, enums_1.UserRole.TEACHER, enums_1.UserRole.PARENT, enums_1.UserRole.STUDENT), (0, access_control_1.requireFinanceOrModuleAccess)('academics', 'view'), async (_req, res) => {
    const years = await data_source_1.AppDataSource.getRepository(entities_1.SchoolYear).find({
        relations: (0, typeorm_helpers_1.relations)('terms'),
        order: { startDate: 'DESC' },
    });
    const terms = years.flatMap((y) => y.terms || []).sort((a, b) => a.name.localeCompare(b.name));
    res.json(terms);
});
router.get('/class-subjects', (0, auth_1.authorize)(enums_1.UserRole.TEACHER, enums_1.UserRole.ADMIN, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.DIRECTOR), acadView, async (req, res) => {
    const { classId } = req.query;
    if (!classId)
        return res.status(400).json({ message: 'classId is required' });
    if (!(await (0, teacher_class_access_1.assertTeacherClassAccess)(req, classId))) {
        return res.status(403).json({ message: 'You are not assigned to this class' });
    }
    const where = { classId: classId };
    if (req.user.role === enums_1.UserRole.TEACHER) {
        if (!req.user.staffId)
            return res.json([]);
        where.teacherId = req.user.staffId;
    }
    const rows = await data_source_1.AppDataSource.getRepository(entities_2.ClassSubject).find({
        where,
        relations: (0, typeorm_helpers_1.relations)('subject'),
        order: { subject: { name: 'ASC' } },
    });
    res.json(rows.map((r) => r.subject).filter(Boolean));
});
router.get('/marks/entry', (0, auth_1.authorize)(enums_1.UserRole.TEACHER, enums_1.UserRole.ADMIN, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.DIRECTOR), acadView, async (req, res) => {
    const { classId, subjectId, examTypeId, termId } = req.query;
    if (!classId || !subjectId || !examTypeId || !termId) {
        return res.status(400).json({ message: 'classId, subjectId, examTypeId, and termId are required' });
    }
    if (!(await (0, teacher_class_access_1.assertTeacherClassAccess)(req, classId))) {
        return res.status(403).json({ message: 'You are not assigned to this class' });
    }
    if (!(await (0, teacher_class_access_1.assertTeacherSubjectAccess)(req, classId, subjectId))) {
        return res.status(403).json({ message: 'You are not assigned to teach this subject' });
    }
    const examType = await data_source_1.AppDataSource.getRepository(entities_1.ExamType).findOne({ where: { id: examTypeId } });
    const schoolClass = await data_source_1.AppDataSource.getRepository(entities_1.SchoolClass).findOne({
        where: { id: classId },
        relations: (0, typeorm_helpers_1.relations)('form'),
    });
    const studentRepo = data_source_1.AppDataSource.getRepository(entities_1.Student);
    const markRepo = data_source_1.AppDataSource.getRepository(entities_1.ExamMark);
    const students = await studentRepo.find({
        where: { classId: classId, isActive: true },
        order: { lastName: 'ASC', firstName: 'ASC' },
    });
    const existing = await markRepo.find({
        where: {
            classId: classId,
            subjectId: subjectId,
            examTypeId: examTypeId,
            termId: termId,
        },
    });
    const markByStudent = new Map(existing.map((m) => [m.studentId, m]));
    res.json({
        maxMarks: examType ? Number(examType.maxMarks) : 100,
        examTypeName: examType?.name,
        showGradePoints: (0, class_display_1.isALevelClassOption)(schoolClass),
        students: students.map((s) => {
            const m = markByStudent.get(s.id);
            return {
                studentId: s.id,
                studentNumber: s.admissionNumber,
                lastName: s.lastName,
                firstName: s.firstName,
                gender: s.gender || '—',
                marks: m != null ? Number(m.marks) : null,
                remarks: m?.remarks || '',
                grade: m?.grade || null,
                markId: m?.id || null,
            };
        }),
    });
});
router.get('/marks', (0, auth_1.authorize)(enums_1.UserRole.TEACHER, enums_1.UserRole.ADMIN, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PARENT, enums_1.UserRole.STUDENT), acadView, async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.ExamMark);
    const { classId, subjectId, termId, examTypeId, studentId } = req.query;
    const where = {};
    if (classId)
        where.classId = classId;
    if (subjectId)
        where.subjectId = subjectId;
    if (termId)
        where.termId = termId;
    if (examTypeId)
        where.examTypeId = examTypeId;
    if (studentId)
        where.studentId = studentId;
    if (isPortalViewer(req.user.role)) {
        const accessible = await access_control_service_1.AccessControlService.getAccessibleStudentIds(req.user);
        const ids = accessible === 'all' ? [] : accessible;
        if (studentId && !ids.includes(studentId)) {
            return res.status(403).json({ message: 'Access denied' });
        }
        if (!studentId && ids.length === 1) {
            where.studentId = ids[0];
        }
    }
    const marks = await repo.find({
        where,
        relations: (0, typeorm_helpers_1.relations)('student', 'subject', 'examType', 'term', 'enteredBy', 'enteredBy.user'),
        order: { student: { lastName: 'ASC' } },
    });
    if (isPortalViewer(req.user.role)) {
        const accessible = await access_control_service_1.AccessControlService.getAccessibleStudentIds(req.user);
        const ids = new Set(accessible === 'all' ? [] : accessible);
        if (ids.size) {
            return res.json(marks.filter((m) => ids.has(m.studentId)));
        }
    }
    res.json(marks);
});
async function upsertExamMark(repo, data) {
    const examType = await data_source_1.AppDataSource.getRepository(entities_1.ExamType).findOne({ where: { id: data.examTypeId } });
    const maxMarks = examType ? Number(examType.maxMarks) : 100;
    const grade = await (0, grade_service_1.gradeForMarks)(data.marks, maxMarks);
    let existing = await repo.findOne({
        where: {
            studentId: data.studentId,
            examTypeId: data.examTypeId,
            subjectId: data.subjectId,
            termId: data.termId,
        },
    });
    if (existing) {
        existing.marks = data.marks;
        existing.grade = grade;
        existing.remarks = data.remarks ?? existing.remarks;
        existing.classId = data.classId;
        if (data.enteredById)
            existing.enteredById = data.enteredById;
    }
    else {
        existing = repo.create({
            ...data,
            grade,
        });
    }
    const saved = await repo.save(existing);
    await (0, report_card_service_1.syncReportCardForStudent)(data.studentId, data.termId);
    return saved;
}
router.post('/marks/save-one', (0, auth_1.authorize)(enums_1.UserRole.TEACHER, enums_1.UserRole.ADMIN, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.DIRECTOR), acadCreate, async (req, res) => {
    const { studentId, examTypeId, classId, subjectId, termId, marks, remarks } = req.body;
    if (!studentId || !examTypeId || !classId || !subjectId || !termId) {
        return res.status(400).json({ message: 'Missing required fields' });
    }
    if (marks === null || marks === undefined || marks === '') {
        return res.status(400).json({ message: 'Marks value required' });
    }
    if (!(await access_control_service_1.AccessControlService.userCanAccessStudent(req.user, studentId))) {
        return res.status(403).json({ message: 'You do not have access to this student record' });
    }
    if (!(await (0, teacher_class_access_1.assertTeacherClassAccess)(req, classId))) {
        return res.status(403).json({ message: 'You are not assigned to this class' });
    }
    if (!(await (0, teacher_class_access_1.assertTeacherSubjectAccess)(req, classId, subjectId))) {
        return res.status(403).json({ message: 'You are not assigned to teach this subject' });
    }
    const repo = data_source_1.AppDataSource.getRepository(entities_1.ExamMark);
    const saved = await upsertExamMark(repo, {
        studentId,
        examTypeId,
        classId,
        subjectId,
        termId,
        marks: Number(marks),
        remarks: remarks || '',
        enteredById: req.user.staffId,
    });
    res.json(saved);
});
router.post('/marks/bulk', (0, auth_1.authorize)(enums_1.UserRole.TEACHER, enums_1.UserRole.ADMIN, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.DIRECTOR), acadCreate, async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.ExamMark);
    const { examTypeId, classId, subjectId, termId, marks } = req.body;
    if (classId && !(await (0, teacher_class_access_1.assertTeacherClassAccess)(req, classId))) {
        return res.status(403).json({ message: 'You are not assigned to this class' });
    }
    if (classId && subjectId && !(await (0, teacher_class_access_1.assertTeacherSubjectAccess)(req, classId, subjectId))) {
        return res.status(403).json({ message: 'You are not assigned to teach this subject' });
    }
    const saved = [];
    const syncedStudents = new Set();
    for (const m of marks) {
        if (m.marks === null || m.marks === undefined || m.marks === '')
            continue;
        if (!(await access_control_service_1.AccessControlService.userCanAccessStudent(req.user, m.studentId))) {
            continue;
        }
        const row = await upsertExamMark(repo, {
            studentId: m.studentId,
            examTypeId,
            classId,
            subjectId,
            termId,
            marks: Number(m.marks),
            remarks: m.remarks || '',
            enteredById: req.user.staffId,
        });
        saved.push(row);
        syncedStudents.add(m.studentId);
    }
    res.json({ saved: saved.length, students: syncedStudents.size });
});
router.post('/report-cards/generate', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.PRINCIPAL), acadCreate, async (req, res) => {
    const { termId, classId } = req.body;
    const markRepo = data_source_1.AppDataSource.getRepository(entities_1.ExamMark);
    const reportRepo = data_source_1.AppDataSource.getRepository(entities_1.ReportCard);
    const studentRepo = data_source_1.AppDataSource.getRepository(entities_1.Student);
    await (0, honours_service_1.calculateHonoursRoll)(termId, classId);
    const students = await studentRepo.find({
        where: classId ? { classId, isActive: true } : { isActive: true },
        relations: (0, typeorm_helpers_1.relations)('schoolClass', 'schoolClass.form'),
    });
    const generated = [];
    for (const student of students) {
        const marks = await markRepo.find({
            where: { studentId: student.id, termId },
            relations: (0, typeorm_helpers_1.relations)('subject', 'examType'),
        });
        if (!marks.length)
            continue;
        const subjectMap = new Map();
        for (const m of marks) {
            const key = m.subject.name;
            const cur = subjectMap.get(key) || { marks: 0, count: 0 };
            cur.marks += Number(m.marks);
            cur.count += 1;
            if (m.remarks)
                cur.remarks = m.remarks;
            subjectMap.set(key, cur);
        }
        const subjectResults = await Promise.all([...subjectMap.entries()].map(async ([subject, v]) => {
            const avgMark = v.marks / v.count;
            return {
                subject,
                marks: Math.round(avgMark),
                grade: await (0, grade_service_1.gradeForMarks)(avgMark),
                remarks: v.remarks,
            };
        }));
        const avg = subjectResults.reduce((s, r) => s + r.marks, 0) / subjectResults.length;
        const honour = await data_source_1.AppDataSource.getRepository('HonourRoll').findOne?.({
            where: { studentId: student.id, termId },
        }).catch(() => null);
        let report = await reportRepo.findOne({ where: { studentId: student.id, termId } });
        if (!report) {
            report = reportRepo.create({ studentId: student.id, termId });
        }
        report.subjectResults = subjectResults;
        report.averageMark = avg;
        report.overallGrade = await (0, grade_service_1.gradeForMarks)(avg);
        report.isPublished = false;
        await reportRepo.save(report);
        generated.push(report);
    }
    res.json({ message: `Generated ${generated.length} report cards`, count: generated.length });
});
router.get('/mark-sheet', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.DIRECTOR, enums_1.UserRole.TEACHER), async (req, res) => {
    const { examTypeId, termId, classId } = req.query;
    if (!examTypeId || !termId || !classId) {
        return res.status(400).json({ message: 'examTypeId, termId, and classId are required' });
    }
    try {
        const sheet = await (0, mark_sheet_service_1.buildMarkSheet)({
            examTypeId: examTypeId,
            termId: termId,
            classId: classId,
        });
        if (!sheet.subjects.length) {
            return res.status(404).json({
                message: 'No subjects assigned to this class. Add subjects in School Settings first.',
            });
        }
        const hasAnyMarks = sheet.students.some((s) => Object.values(s.marksBySubject).some((c) => c.marks != null));
        if (!hasAnyMarks) {
            return res.status(404).json({
                message: 'No exam marks found for this class, exam type, and term. Enter marks first.',
            });
        }
        res.json(sheet);
    }
    catch (err) {
        return res.status(400).json({ message: err instanceof Error ? err.message : 'Failed to build mark sheet' });
    }
});
router.get('/results-analysis/student', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.DIRECTOR, enums_1.UserRole.TEACHER), async (req, res) => {
    const { examTypeId, termId, classId, studentId } = req.query;
    if (!examTypeId || !termId || !classId || !studentId) {
        return res.status(400).json({
            message: 'examTypeId, termId, classId, and studentId are required',
        });
    }
    try {
        const analysis = await (0, results_analysis_service_1.buildStudentSubjectAnalysis)({
            examTypeId: examTypeId,
            termId: termId,
            classId: classId,
            studentId: studentId,
        });
        res.json(analysis);
    }
    catch (err) {
        return res.status(400).json({
            message: err instanceof Error ? err.message : 'Failed to build student subject analysis',
        });
    }
});
router.get('/results-analysis/subject', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.DIRECTOR, enums_1.UserRole.TEACHER), async (req, res) => {
    const { examTypeId, termId, classId, subjectId, topN } = req.query;
    if (!examTypeId || !termId || !classId || !subjectId) {
        return res.status(400).json({
            message: 'examTypeId, termId, classId, and subjectId are required',
        });
    }
    try {
        const analysis = await (0, results_analysis_service_1.buildSubjectAnalysis)({
            examTypeId: examTypeId,
            termId: termId,
            classId: classId,
            subjectId: subjectId,
            topN: topN ? Number(topN) : undefined,
        });
        res.json(analysis);
    }
    catch (err) {
        return res.status(400).json({
            message: err instanceof Error ? err.message : 'Failed to build subject analysis',
        });
    }
});
router.get('/results-analysis', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.DIRECTOR, enums_1.UserRole.TEACHER), async (req, res) => {
    const { examTypeId, termId, classId, topN } = req.query;
    if (!examTypeId || !termId || !classId) {
        return res.status(400).json({ message: 'examTypeId, termId, and classId are required' });
    }
    try {
        const analysis = await (0, results_analysis_service_1.buildResultsAnalysis)({
            examTypeId: examTypeId,
            termId: termId,
            classId: classId,
            topN: topN ? Number(topN) : undefined,
        });
        if (analysis.summary.studentsWithExamMarks === 0) {
            return res.status(404).json({
                message: 'No exam marks found for this class, exam type, and term. Enter marks first.',
            });
        }
        res.json(analysis);
    }
    catch (err) {
        return res.status(400).json({
            message: err instanceof Error ? err.message : 'Failed to build results analysis',
        });
    }
});
router.get('/results-analysis/pdf', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.DIRECTOR, enums_1.UserRole.TEACHER), async (req, res) => {
    const { examTypeId, termId, classId, topN } = req.query;
    if (!examTypeId || !termId || !classId) {
        return res.status(400).json({ message: 'examTypeId, termId, and classId are required' });
    }
    try {
        const analysis = await (0, results_analysis_service_1.buildResultsAnalysis)({
            examTypeId: examTypeId,
            termId: termId,
            classId: classId,
            topN: topN ? Number(topN) : undefined,
        });
        if (analysis.summary.studentsWithExamMarks === 0) {
            return res.status(404).json({
                message: 'No exam marks found for this class, exam type, and term. Enter marks first.',
            });
        }
        const branding = await (0, school_branding_service_1.loadSchoolBranding)();
        const pdf = await (0, pdf_1.generateResultsAnalysisPdf)({
            schoolName: branding.schoolName || 'School Pro Academy',
            tagline: branding.tagline,
            logoUrl: branding.logoUrl,
            examTypeName: analysis.examType.name,
            termName: analysis.term.name,
            className: analysis.class.name,
            maxMarks: analysis.examType.maxMarks,
            minSubjectsForPass: analysis.minSubjectsForPass,
            generatedAt: new Date(),
            summary: analysis.summary,
            topPerformers: analysis.topPerformers,
            bottomPerformers: analysis.bottomPerformers,
        });
        const safeName = `${analysis.class.name}-${analysis.examType.name}`.replace(/[^\w\-]+/g, '-').replace(/-+/g, '-');
        const filename = `results-analysis-${safeName}.pdf`;
        const inline = req.query.preview === 'true';
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${filename}"`);
        res.send(pdf);
    }
    catch (err) {
        return res.status(400).json({
            message: err instanceof Error ? err.message : 'Failed to generate results analysis PDF',
        });
    }
});
router.get('/rankings', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.DIRECTOR, enums_1.UserRole.TEACHER), async (req, res) => {
    const { examTypeId, termId, rankingType, classId, formId, subjectId } = req.query;
    if (!examTypeId || !termId || !rankingType) {
        return res.status(400).json({ message: 'examTypeId, termId, and rankingType are required' });
    }
    const type = rankingType;
    if (!['class', 'form', 'subject'].includes(type)) {
        return res.status(400).json({ message: 'rankingType must be class, form, or subject' });
    }
    try {
        const rankings = await (0, ranking_service_1.buildRankings)({
            examTypeId: examTypeId,
            termId: termId,
            rankingType: type,
            classId: classId,
            formId: formId,
            subjectId: subjectId,
        });
        if (!rankings.students.length) {
            return res.status(404).json({
                message: 'No ranked students found for this selection. Enter exam marks first.',
            });
        }
        res.json(rankings);
    }
    catch (err) {
        return res.status(400).json({
            message: err instanceof Error ? err.message : 'Failed to build rankings',
        });
    }
});
router.get('/rankings/pdf', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.DIRECTOR, enums_1.UserRole.TEACHER), async (req, res) => {
    const { examTypeId, termId, rankingType, classId, formId, subjectId } = req.query;
    if (!examTypeId || !termId || !rankingType) {
        return res.status(400).json({ message: 'examTypeId, termId, and rankingType are required' });
    }
    const type = rankingType;
    if (!['class', 'form', 'subject'].includes(type)) {
        return res.status(400).json({ message: 'rankingType must be class, form, or subject' });
    }
    try {
        const rankings = await (0, ranking_service_1.buildRankings)({
            examTypeId: examTypeId,
            termId: termId,
            rankingType: type,
            classId: classId,
            formId: formId,
            subjectId: subjectId,
        });
        if (!rankings.students.length) {
            return res.status(404).json({
                message: 'No ranked students found for this selection. Enter exam marks first.',
            });
        }
        const scopeParts = [];
        if (rankings.class)
            scopeParts.push((0, class_display_1.formatStudentClassLabel)(rankings.class.name));
        if (rankings.form)
            scopeParts.push(`Form: ${rankings.form.name}`);
        if (rankings.subject)
            scopeParts.push(`Subject: ${rankings.subject.name}`);
        const pdf = await (0, pdf_1.generateRankingsPdf)({
            schoolName: rankings.schoolName,
            tagline: rankings.tagline,
            logoUrl: rankings.logoUrl,
            rankingType: rankings.rankingType,
            rankingLabel: rankings.rankingLabel,
            examTypeName: rankings.examType.name,
            termName: rankings.term.name,
            scopeLabel: scopeParts.join(' · '),
            maxMarks: rankings.examType.maxMarks,
            generatedAt: new Date(),
            students: rankings.students,
        });
        const safeName = rankings.rankingLabel.replace(/[^\w\-]+/g, '-').replace(/-+/g, '-');
        const filename = `rankings-${safeName}.pdf`;
        const inline = req.query.preview === 'true';
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${filename}"`);
        res.send(pdf);
    }
    catch (err) {
        return res.status(400).json({
            message: err instanceof Error ? err.message : 'Failed to generate rankings PDF',
        });
    }
});
router.get('/mark-entry-progress', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.DIRECTOR, enums_1.UserRole.TEACHER), acadView, async (req, res) => {
    const { examTypeId, termId, classId, formId } = req.query;
    if (!examTypeId || !termId) {
        return res.status(400).json({ message: 'examTypeId and termId are required' });
    }
    if (classId && !(await (0, teacher_class_access_1.assertTeacherClassAccess)(req, classId))) {
        return res.status(403).json({ message: 'You are not assigned to this class' });
    }
    try {
        const staffId = req.user.role === enums_1.UserRole.TEACHER ? req.user.staffId : undefined;
        const data = await (0, mark_entry_progress_service_1.buildMarkEntryProgress)({
            examTypeId: examTypeId,
            termId: termId,
            classId: classId,
            formId: formId,
            staffId,
        });
        res.json(data);
    }
    catch (err) {
        return res.status(400).json({
            message: err instanceof Error ? err.message : 'Failed to load mark entry progress',
        });
    }
});
router.get('/record-book/subjects', (0, auth_1.authorize)(enums_1.UserRole.TEACHER, enums_1.UserRole.ADMIN, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.DIRECTOR), acadView, async (req, res) => {
    const { classId } = req.query;
    if (!classId) {
        return res.status(400).json({ message: 'classId is required' });
    }
    if (!(await (0, teacher_class_access_1.assertTeacherClassAccess)(req, classId))) {
        return res.status(403).json({ message: 'You are not assigned to this class' });
    }
    try {
        const data = await (0, record_book_service_1.listRecordBookSubjects)(req, classId);
        res.json(data);
    }
    catch (err) {
        return res.status(400).json({
            message: err instanceof Error ? err.message : 'Failed to load subjects',
        });
    }
});
router.get('/record-book', (0, auth_1.authorize)(enums_1.UserRole.TEACHER, enums_1.UserRole.ADMIN, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.DIRECTOR), acadView, async (req, res) => {
    const { classId, termId, subjectId } = req.query;
    if (!classId || !termId || !subjectId) {
        return res.status(400).json({ message: 'classId, termId, and subjectId are required' });
    }
    if (!(await (0, teacher_class_access_1.assertTeacherClassAccess)(req, classId))) {
        return res.status(403).json({ message: 'You are not assigned to this class' });
    }
    try {
        const data = await (0, record_book_service_1.buildRecordBook)(req, {
            classId: classId,
            termId: termId,
            subjectId: subjectId,
        });
        const term = await data_source_1.AppDataSource.getRepository(entities_1.Term).findOne({ where: { id: termId } });
        data.term.name = term?.name || '';
        res.json(data);
    }
    catch (err) {
        return res.status(400).json({
            message: err instanceof Error ? err.message : 'Failed to load record book',
        });
    }
});
router.post('/record-book/add-column', (0, auth_1.authorize)(enums_1.UserRole.TEACHER, enums_1.UserRole.ADMIN, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.DIRECTOR), acadCreate, async (req, res) => {
    const { classId, termId, subjectId, label } = req.body || {};
    if (!classId || !termId || !subjectId) {
        return res.status(400).json({ message: 'classId, termId, and subjectId are required' });
    }
    if (!(await (0, teacher_class_access_1.assertTeacherClassAccess)(req, classId))) {
        return res.status(403).json({ message: 'You are not assigned to this class' });
    }
    try {
        const column = await (0, record_book_service_1.addRecordBookColumn)(req, { classId, termId, subjectId, label });
        res.json(column);
    }
    catch (err) {
        return res.status(400).json({
            message: err instanceof Error ? err.message : 'Failed to add column',
        });
    }
});
router.post('/record-book/save-row', (0, auth_1.authorize)(enums_1.UserRole.TEACHER, enums_1.UserRole.ADMIN, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.DIRECTOR), acadCreate, async (req, res) => {
    const { classId, termId, subjectId, studentId, marks } = req.body || {};
    if (!classId || !termId || !subjectId || !studentId || !Array.isArray(marks)) {
        return res.status(400).json({ message: 'classId, termId, subjectId, studentId, and marks are required' });
    }
    if (!(await (0, teacher_class_access_1.assertTeacherClassAccess)(req, classId))) {
        return res.status(403).json({ message: 'You are not assigned to this class' });
    }
    try {
        const result = await (0, record_book_service_1.saveRecordBookRow)(req, {
            classId,
            termId,
            subjectId,
            studentId,
            marks: marks
                .filter((m) => m?.columnKey && m.marks !== null && m.marks !== undefined && m.marks !== '')
                .map((m) => ({
                columnKey: m.columnKey,
                marks: Number(m.marks),
            }))
                .filter((m) => Number.isFinite(m.marks)),
        });
        res.json(result);
    }
    catch (err) {
        return res.status(400).json({
            message: err instanceof Error ? err.message : 'Failed to save marks',
        });
    }
});
router.get('/mark-sheet/pdf', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.DIRECTOR, enums_1.UserRole.TEACHER), async (req, res) => {
    const { examTypeId, termId, classId } = req.query;
    if (!examTypeId || !termId || !classId) {
        return res.status(400).json({ message: 'examTypeId, termId, and classId are required' });
    }
    try {
        const sheet = await (0, mark_sheet_service_1.buildMarkSheet)({
            examTypeId: examTypeId,
            termId: termId,
            classId: classId,
        });
        if (!sheet.subjects.length) {
            return res.status(404).json({ message: 'No subjects assigned to this class.' });
        }
        const pdf = await (0, pdf_1.generateMarkSheetPdf)({
            schoolName: sheet.schoolName,
            tagline: sheet.tagline,
            logoUrl: sheet.logoUrl,
            examTypeName: sheet.examType.name,
            termName: sheet.term.name,
            className: sheet.class.name,
            classTeacherName: sheet.class.classTeacherName,
            maxMarks: sheet.examType.maxMarks,
            generatedAt: new Date(),
            subjects: sheet.subjects.map((s) => ({ code: s.code, name: s.name })),
            students: sheet.students.map((row) => ({
                position: row.position,
                admissionNumber: row.admissionNumber,
                lastName: row.lastName,
                firstName: row.firstName,
                gender: row.gender,
                subjectCount: row.subjectCount,
                subjectsPassed: row.subjectsPassed,
                averagePercent: row.averagePercent,
                gradeCounts: row.gradeCounts,
                cells: sheet.subjects.map((sub) => row.marksBySubject[sub.id]?.marks ?? null),
            })),
        });
        const safeName = `${sheet.class.name}-${sheet.examType.name}`.replace(/[^\w\-]+/g, '-').replace(/-+/g, '-');
        const filename = `mark-sheet-${safeName}.pdf`;
        const inline = req.query.preview === 'true';
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${filename}"`);
        res.send(pdf);
    }
    catch (err) {
        return res.status(400).json({ message: err instanceof Error ? err.message : 'Failed to generate PDF' });
    }
});
router.post('/report-cards/generate-class', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.DIRECTOR, enums_1.UserRole.TEACHER), async (req, res) => {
    const { examTypeId, termId, classId } = req.body;
    if (!examTypeId || !termId || !classId) {
        return res.status(400).json({ message: 'examTypeId, termId, and classId are required' });
    }
    try {
        const result = await (0, report_card_service_1.generateClassReportCards)({ examTypeId, termId, classId });
        if (!result.count) {
            return res.status(404).json({
                message: 'No exam marks found for this class, exam type, and term. Enter marks first.',
            });
        }
        res.json(result);
    }
    catch (err) {
        return res.status(400).json({ message: err instanceof Error ? err.message : 'Generation failed' });
    }
});
router.get('/report-cards/by-class', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.DIRECTOR, enums_1.UserRole.TEACHER), async (req, res) => {
    const { examTypeId, termId, classId } = req.query;
    if (!examTypeId || !termId || !classId) {
        return res.status(400).json({ message: 'examTypeId, termId, and classId are required' });
    }
    const reports = await data_source_1.AppDataSource.getRepository(entities_1.ReportCard)
        .createQueryBuilder('rc')
        .leftJoinAndSelect('rc.student', 'student')
        .leftJoinAndSelect('student.schoolClass', 'schoolClass')
        .leftJoinAndSelect('schoolClass.form', 'form')
        .leftJoinAndSelect('rc.term', 'term')
        .leftJoinAndSelect('rc.examType', 'examType')
        .where('rc.termId = :termId', { termId })
        .andWhere('rc.examTypeId = :examTypeId', { examTypeId })
        .andWhere('student.classId = :classId', { classId })
        .orderBy('rc.classPosition', 'ASC', 'NULLS LAST')
        .addOrderBy('student.lastName', 'ASC')
        .getMany();
    await (0, report_card_service_1.applyFormRankingsToReports)(reports, examTypeId, termId);
    const attendanceMap = await (0, report_card_service_1.getClassTermAttendanceMap)(classId, termId);
    res.json({
        count: reports.length,
        reports: (0, report_card_service_1.attachAttendanceToReports)(reports, attendanceMap),
    });
});
router.get('/report-cards/:studentId/:termId', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.DIRECTOR, enums_1.UserRole.TEACHER, enums_1.UserRole.PARENT, enums_1.UserRole.STUDENT), acadView, async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.ReportCard);
    const where = {
        studentId: req.params.studentId,
        termId: req.params.termId,
    };
    if (req.query.examTypeId) {
        where.examTypeId = req.query.examTypeId;
    }
    let report = await repo.findOne({
        where,
        relations: (0, typeorm_helpers_1.relations)('student', 'student.schoolClass', 'student.schoolClass.form', 'term', 'examType'),
    });
    if (!report && !req.query.examTypeId) {
        const latest = await repo.find({
            where: { studentId: req.params.studentId, termId: req.params.termId },
            relations: (0, typeorm_helpers_1.relations)('student', 'student.schoolClass', 'student.schoolClass.form', 'term', 'examType'),
            order: { generatedAt: 'DESC' },
            take: 1,
        });
        report = latest[0] ?? null;
    }
    if (!report)
        return res.status(404).json({ message: 'Report card not found' });
    if (req.user.role === enums_1.UserRole.TEACHER) {
        if (!(await access_control_service_1.AccessControlService.userCanAccessStudent(req.user, report.studentId))) {
            return res.status(403).json({ message: 'You do not have access to this student record' });
        }
    }
    const portalBlock = await assertPortalReportCardAccess(req, report, req.query.examTypeId);
    if (portalBlock)
        return res.status(403).json({ message: portalBlock });
    // Recompute class & form position (and totals) so the rank always shows on the
    // portal view, even for reports created via paths that didn't persist positions.
    const maxMarks = Number(report.examType?.maxMarks) || 100;
    const metrics = await (0, report_card_service_1.getReportCardPdfMetrics)(report, maxMarks);
    res.json({
        ...report,
        subjectResults: metrics.subjectResults,
        classPosition: metrics.classPosition ?? report.classPosition ?? null,
        formPosition: metrics.formPosition ?? report.formPosition ?? null,
        classTotal: metrics.classTotal ?? report.classTotal ?? null,
        formTotal: metrics.formTotal ?? report.formTotal ?? null,
        subjectsPassed: metrics.subjectsPassed ?? report.subjectsPassed ?? null,
        totalSubjects: metrics.totalSubjects ?? report.totalSubjects ?? null,
    });
});
router.get('/report-cards/:studentId/:termId/pdf', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.DIRECTOR, enums_1.UserRole.TEACHER, enums_1.UserRole.PARENT, enums_1.UserRole.STUDENT), acadView, async (req, res) => {
    try {
        const repo = data_source_1.AppDataSource.getRepository(entities_1.ReportCard);
        const where = {
            studentId: req.params.studentId,
            termId: req.params.termId,
        };
        if (req.query.examTypeId) {
            where.examTypeId = req.query.examTypeId;
        }
        const report = await repo.findOne({
            where,
            relations: (0, typeorm_helpers_1.relations)('student', 'student.schoolClass', 'student.schoolClass.form', 'term', 'examType'),
        });
        if (!report)
            return res.status(404).json({ message: 'Report card not found' });
        if (req.user.role === enums_1.UserRole.TEACHER) {
            if (!(await access_control_service_1.AccessControlService.userCanAccessStudent(req.user, report.studentId))) {
                return res.status(403).json({ message: 'You do not have access to this student record' });
            }
        }
        const portalBlock = await assertPortalReportCardAccess(req, report, req.query.examTypeId);
        if (portalBlock)
            return res.status(403).json({ message: portalBlock });
        const settings = await data_source_1.AppDataSource.getRepository(entities_1.SchoolSettings).findOne({ where: { id: 'default' } });
        const inline = req.query.preview === 'true';
        const maxMarks = Number(report.examType?.maxMarks) || 100;
        const metrics = await (0, report_card_service_1.getReportCardPdfMetrics)(report, maxMarks);
        const pdf = await (0, pdf_1.generateReportCardPdf)({
            schoolName: settings?.schoolName || 'School Pro Academy',
            tagline: settings?.tagline || undefined,
            logoUrl: settings?.logoUrl || undefined,
            address: settings?.address || undefined,
            phone: settings?.phone || undefined,
            email: settings?.email || undefined,
            website: settings?.website || undefined,
            studentName: `${report.student.firstName} ${report.student.lastName}`,
            admissionNumber: report.student.admissionNumber,
            className: report.student.schoolClass?.name || '',
            formName: report.student.schoolClass?.form?.name || '',
            formLevel: report.student.schoolClass?.form?.level,
            termName: report.term.name,
            examTypeName: report.examType?.name,
            subjectResults: metrics.subjectResults,
            averageMark: Number(report.averageMark),
            overallGrade: report.overallGrade,
            classPosition: metrics.classPosition ?? report.classPosition,
            formPosition: metrics.formPosition ?? report.formPosition,
            classTotal: metrics.classTotal,
            formTotal: metrics.formTotal,
            subjectsPassed: metrics.subjectsPassed,
            totalSubjects: metrics.totalSubjects,
            attendance: metrics.attendance,
            classTeacherRemarks: report.classTeacherRemarks,
            principalRemarks: report.principalRemarks,
            headmasterName: settings?.headmasterName || undefined,
            generatedAt: report.generatedAt ? new Date(report.generatedAt) : new Date(),
            gradeBoundaries: settings?.gradeBoundaries?.length
                ? settings.gradeBoundaries
                : grade_boundaries_1.DEFAULT_GRADE_BOUNDARIES,
            reportCardId: report.id,
        });
        res.setHeader('Content-Type', 'application/pdf');
        const pdfFilename = (0, helpers_1.reportCardPdfFilename)(report.student.firstName, report.student.lastName, report.student.admissionNumber || 'report-card');
        res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${pdfFilename}"`);
        res.send(pdf);
    }
    catch (err) {
        console.error('Report card PDF generation failed:', err);
        if (!res.headersSent) {
            res.status(500).json({
                message: err instanceof Error ? err.message : 'Failed to generate report card PDF',
            });
        }
    }
});
router.patch('/report-cards/:id/remarks', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.DIRECTOR, enums_1.UserRole.TEACHER), async (req, res) => {
    const { classTeacherRemarks, principalRemarks, behaviorRating, attitudeRating, regenerateClassTeacherRemarks, } = req.body;
    const repo = data_source_1.AppDataSource.getRepository(entities_1.ReportCard);
    const report = await repo.findOne({
        where: { id: req.params.id },
        relations: (0, typeorm_helpers_1.relations)('student', 'student.schoolClass', 'student.schoolClass.form', 'student.schoolClass.classTeacher', 'student.schoolClass.classTeacher.user'),
    });
    if (!report)
        return res.status(404).json({ message: 'Report card not found' });
    // Teachers can only update class teacher remarks and only for their assigned class.
    if (req.user.role === enums_1.UserRole.TEACHER) {
        if (principalRemarks !== undefined) {
            return res.status(403).json({ message: 'Teachers cannot update principal remarks' });
        }
        const allowed = await data_source_1.AppDataSource.query(`SELECT 1 FROM class_subjects cs WHERE cs."classId" = $1 AND cs."teacherId" = $2 LIMIT 1`, [report.student.classId, req.user.staffId]);
        if (!allowed.length) {
            return res.status(403).json({ message: 'You are not assigned to this student class' });
        }
    }
    let ratingsChanged = false;
    if (behaviorRating !== undefined) {
        if (behaviorRating && !(0, report_card_remarks_service_1.isValidConductRating)(behaviorRating)) {
            return res.status(400).json({ message: 'Invalid behavior rating' });
        }
        report.behaviorRating = behaviorRating || null;
        ratingsChanged = true;
    }
    if (attitudeRating !== undefined) {
        if (attitudeRating && !(0, report_card_remarks_service_1.isValidConductRating)(attitudeRating)) {
            return res.status(400).json({ message: 'Invalid attitude rating' });
        }
        report.attitudeRating = attitudeRating || null;
        ratingsChanged = true;
    }
    if (classTeacherRemarks !== undefined) {
        const cleaned = (0, report_card_remarks_service_1.sanitizeReportCardRemark)(String(classTeacherRemarks || ''), report.student.firstName, report.student.lastName);
        report.classTeacherRemarks = cleaned.trim() || null;
    }
    else if (ratingsChanged
        || regenerateClassTeacherRemarks) {
        if (!(0, report_card_remarks_service_1.isValidConductRating)(report.behaviorRating)
            || !(0, report_card_remarks_service_1.isValidConductRating)(report.attitudeRating)) {
            return res.status(400).json({
                message: 'Set behaviour and attitude ratings before regenerating class teacher remarks',
            });
        }
        const attendance = await (0, report_card_service_1.getStudentTermAttendance)(report.studentId, report.termId, report.student.classId);
        const teacherUser = report.student.schoolClass?.classTeacher?.user;
        const classTeacherName = teacherUser
            ? `${(teacherUser.lastName || '').trim()} ${(teacherUser.firstName || '').charAt(0).toUpperCase()}.`.trim()
            : null;
        report.classTeacherRemarks = (0, report_card_remarks_service_1.buildClassTeacherRemarks)({
            firstName: report.student.firstName,
            lastName: report.student.lastName,
            behaviorRating: report.behaviorRating,
            attitudeRating: report.attitudeRating,
            attendance,
            classTeacherName,
        });
    }
    if (principalRemarks !== undefined) {
        const cleaned = (0, report_card_remarks_service_1.sanitizeReportCardRemark)(String(principalRemarks || ''), report.student.firstName, report.student.lastName);
        report.principalRemarks = cleaned.trim() || null;
    }
    const saved = await repo.save(report);
    const full = await repo.findOne({
        where: { id: saved.id },
        relations: (0, typeorm_helpers_1.relations)('student', 'student.schoolClass', 'student.schoolClass.form', 'term', 'examType'),
    });
    res.json(full || saved);
});
router.post('/honours/calculate', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.PRINCIPAL), async (req, res) => {
    const { termId, classId } = req.body;
    const honours = await (0, honours_service_1.calculateHonoursRoll)(termId, classId);
    res.json(honours);
});
router.get('/honours', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.DIRECTOR, enums_1.UserRole.TEACHER), async (req, res) => {
    const { termId, classId, formId } = req.query;
    const qb = data_source_1.AppDataSource.getRepository(entities_1.HonourRoll).createQueryBuilder('h')
        .leftJoinAndSelect('h.student', 's')
        .leftJoinAndSelect('h.schoolClass', 'c')
        .leftJoinAndSelect('c.form', 'f');
    if (termId)
        qb.andWhere('h.termId = :termId', { termId });
    if (classId)
        qb.andWhere('h.classId = :classId', { classId });
    if (formId)
        qb.andWhere('c.formId = :formId', { formId });
    const honours = await qb.orderBy('h.overallRank', 'ASC').getMany();
    res.json(honours);
});
exports.default = router;
