"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-nocheck
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const enums_1 = require("../entities/enums");
const validate_dto_1 = require("../utils/validate-dto");
const lms_dto_1 = require("../dtos/lms.dto");
const lms_upload_1 = require("../utils/lms-upload");
const lms_service_1 = require("../services/lms.service");
const data_source_1 = require("../config/data-source");
const entities_1 = require("../entities");
const helpers_1 = require("../utils/helpers");
const typeorm_1 = require("typeorm");
const entities_2 = require("../entities");
const teacher_class_access_1 = require("../utils/teacher-class-access");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
const staffRoles = (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.TEACHER);
const manageRoles = (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.TEACHER);
const studentRoles = (0, auth_1.authorize)(enums_1.UserRole.STUDENT, enums_1.UserRole.PARENT, enums_1.UserRole.ADMIN, enums_1.UserRole.TEACHER);
function handleError(res, err) {
    if (err instanceof validate_dto_1.DtoValidationError) {
        return res.status(400).json({ message: err.message, details: err.details });
    }
    if (err instanceof lms_service_1.LmsHttpError) {
        return res.status(err.statusCode).json({ message: err.message });
    }
    if (err?.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ message: 'File too large' });
    }
    console.error(err);
    return res.status(500).json({ message: err.message || 'Request failed' });
}
function parseBodyJson(body) {
    // multipart fields arrive as strings; coerce booleans/numbers where needed
    const out = { ...body };
    for (const key of Object.keys(out)) {
        const v = out[key];
        if (typeof v !== 'string')
            continue;
        if (v === 'true')
            out[key] = true;
        else if (v === 'false')
            out[key] = false;
        else if (v === 'null')
            out[key] = null;
        else if (/^\d+(\.\d+)?$/.test(v) && ['maxScore', 'sortOrder', 'grade', 'durationSeconds'].includes(key)) {
            out[key] = Number(v);
        }
        else if (key === 'accessRoles') {
            try {
                out[key] = JSON.parse(v);
            }
            catch {
                out[key] = v.split(',').map((s) => s.trim()).filter(Boolean);
            }
        }
    }
    return out;
}
// ── Assignments ─────────────────────────────────────────────────────────────
router.get('/assignments', studentRoles, async (req, res) => {
    try {
        const studentId = req.user.role === enums_1.UserRole.STUDENT
            ? req.user.studentId
            : req.query.studentId;
        res.json(await (0, lms_service_1.listAssignments)({
            classId: req.query.classId,
            subjectId: req.query.subjectId,
            termId: req.query.termId,
            status: req.query.status,
            studentId: req.user.role === enums_1.UserRole.STUDENT ? studentId : undefined,
        }));
    }
    catch (err) {
        handleError(res, err);
    }
});
router.get('/assignments/:id', studentRoles, async (req, res) => {
    try {
        res.json(await (0, lms_service_1.getAssignment)(String(req.params.id)));
    }
    catch (err) {
        handleError(res, err);
    }
});
router.post('/assignments', manageRoles, lms_upload_1.lmsUpload.single('file'), async (req, res) => {
    try {
        const dto = await (0, validate_dto_1.validateDto)(lms_dto_1.CreateLmsAssignmentDto, parseBodyJson(req.body));
        res.status(201).json(await (0, lms_service_1.createAssignment)(dto, req.user.staffId, req.file));
    }
    catch (err) {
        handleError(res, err);
    }
});
router.put('/assignments/:id', manageRoles, lms_upload_1.lmsUpload.single('file'), async (req, res) => {
    try {
        const dto = await (0, validate_dto_1.validateDto)(lms_dto_1.UpdateLmsAssignmentDto, parseBodyJson(req.body));
        res.json(await (0, lms_service_1.updateAssignment)(String(req.params.id), dto, req.user.staffId, req.file));
    }
    catch (err) {
        handleError(res, err);
    }
});
router.delete('/assignments/:id', manageRoles, async (req, res) => {
    try {
        res.json(await (0, lms_service_1.deleteAssignment)(String(req.params.id)));
    }
    catch (err) {
        handleError(res, err);
    }
});
// ── Submissions ─────────────────────────────────────────────────────────────
router.get('/assignments/:id/submissions', staffRoles, async (req, res) => {
    try {
        res.json(await (0, lms_service_1.listSubmissions)(String(req.params.id)));
    }
    catch (err) {
        handleError(res, err);
    }
});
router.get('/assignments/:id/my-submission', (0, auth_1.authorize)(enums_1.UserRole.STUDENT), async (req, res) => {
    try {
        res.json(await (0, lms_service_1.getMySubmission)(String(req.params.id), req.user.studentId));
    }
    catch (err) {
        handleError(res, err);
    }
});
router.post('/assignments/:id/submissions', (0, auth_1.authorize)(enums_1.UserRole.STUDENT), lms_upload_1.lmsUpload.single('file'), async (req, res) => {
    try {
        const dto = await (0, validate_dto_1.validateDto)(lms_dto_1.CreateLmsSubmissionDto, parseBodyJson(req.body));
        res.status(201).json(await (0, lms_service_1.submitAssignment)(String(req.params.id), dto, req.user.studentId, req.file));
    }
    catch (err) {
        handleError(res, err);
    }
});
router.post('/submissions/:id/grade', staffRoles, async (req, res) => {
    try {
        const dto = await (0, validate_dto_1.validateDto)(lms_dto_1.GradeLmsSubmissionDto, req.body);
        res.json(await (0, lms_service_1.gradeSubmission)(String(req.params.id), dto, req.user.staffId));
    }
    catch (err) {
        handleError(res, err);
    }
});
// ── Lesson content ──────────────────────────────────────────────────────────
router.get('/lessons', studentRoles, async (req, res) => {
    try {
        const publishedOnly = req.user.role === enums_1.UserRole.STUDENT || req.user.role === enums_1.UserRole.PARENT;
        res.json(await (0, lms_service_1.listLessonContent)({
            classId: req.query.classId,
            subjectId: req.query.subjectId,
            termId: req.query.termId,
            publishedOnly,
        }));
    }
    catch (err) {
        handleError(res, err);
    }
});
router.post('/lessons', manageRoles, lms_upload_1.lmsUpload.single('file'), async (req, res) => {
    try {
        const dto = await (0, validate_dto_1.validateDto)(lms_dto_1.CreateLessonContentDto, parseBodyJson(req.body));
        res.status(201).json(await (0, lms_service_1.createLessonContent)(dto, req.user.staffId, req.file));
    }
    catch (err) {
        handleError(res, err);
    }
});
router.put('/lessons/:id', manageRoles, lms_upload_1.lmsUpload.single('file'), async (req, res) => {
    try {
        const dto = await (0, validate_dto_1.validateDto)(lms_dto_1.UpdateLessonContentDto, parseBodyJson(req.body));
        res.json(await (0, lms_service_1.updateLessonContent)(String(req.params.id), dto, req.file));
    }
    catch (err) {
        handleError(res, err);
    }
});
router.delete('/lessons/:id', manageRoles, async (req, res) => {
    try {
        res.json(await (0, lms_service_1.deleteLessonContent)(String(req.params.id)));
    }
    catch (err) {
        handleError(res, err);
    }
});
// ── Virtual classes ─────────────────────────────────────────────────────────
router.get('/virtual-classes', studentRoles, async (req, res) => {
    try {
        res.json(await (0, lms_service_1.listVirtualClasses)({
            classId: req.query.classId,
            teacherId: req.query.teacherId,
            from: req.query.from,
            to: req.query.to,
        }));
    }
    catch (err) {
        handleError(res, err);
    }
});
router.post('/virtual-classes', manageRoles, async (req, res) => {
    try {
        const dto = await (0, validate_dto_1.validateDto)(lms_dto_1.CreateVirtualClassDto, req.body);
        res.status(201).json(await (0, lms_service_1.createVirtualClass)(dto, req.user.staffId));
    }
    catch (err) {
        handleError(res, err);
    }
});
router.put('/virtual-classes/:id', manageRoles, async (req, res) => {
    try {
        const dto = await (0, validate_dto_1.validateDto)(lms_dto_1.UpdateVirtualClassDto, req.body);
        res.json(await (0, lms_service_1.updateVirtualClass)(String(req.params.id), dto));
    }
    catch (err) {
        handleError(res, err);
    }
});
router.delete('/virtual-classes/:id', manageRoles, async (req, res) => {
    try {
        res.json(await (0, lms_service_1.deleteVirtualClass)(String(req.params.id)));
    }
    catch (err) {
        handleError(res, err);
    }
});
router.post('/virtual-classes/:id/recordings', manageRoles, async (req, res) => {
    try {
        const dto = await (0, validate_dto_1.validateDto)(lms_dto_1.CreateClassRecordingDto, req.body);
        res.status(201).json(await (0, lms_service_1.addRecording)(String(req.params.id), dto));
    }
    catch (err) {
        handleError(res, err);
    }
});
router.get('/classes/:classId/recordings', studentRoles, async (req, res) => {
    try {
        res.json(await (0, lms_service_1.listRecordings)(String(req.params.classId)));
    }
    catch (err) {
        handleError(res, err);
    }
});
// ── Library ─────────────────────────────────────────────────────────────────
router.get('/library', studentRoles, async (req, res) => {
    try {
        const publishedOnly = ![enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.TEACHER].includes(req.user.role);
        res.json(await (0, lms_service_1.listLibraryResources)({
            q: req.query.q,
            subjectId: req.query.subjectId,
            gradeFormId: req.query.gradeFormId,
            resourceType: req.query.resourceType,
            publishedOnly,
        }, req.user.role));
    }
    catch (err) {
        handleError(res, err);
    }
});
router.get('/library/bookmarks', studentRoles, async (req, res) => {
    try {
        res.json(await (0, lms_service_1.listBookmarks)(req.user.userId));
    }
    catch (err) {
        handleError(res, err);
    }
});
router.post('/library', manageRoles, lms_upload_1.lmsUpload.single('file'), async (req, res) => {
    try {
        const dto = await (0, validate_dto_1.validateDto)(lms_dto_1.CreateLibraryResourceDto, parseBodyJson(req.body));
        res.status(201).json(await (0, lms_service_1.createLibraryResource)(dto, req.user.userId, req.file));
    }
    catch (err) {
        handleError(res, err);
    }
});
router.put('/library/:id', manageRoles, lms_upload_1.lmsUpload.single('file'), async (req, res) => {
    try {
        const dto = await (0, validate_dto_1.validateDto)(lms_dto_1.UpdateLibraryResourceDto, parseBodyJson(req.body));
        res.json(await (0, lms_service_1.updateLibraryResource)(String(req.params.id), dto, req.file));
    }
    catch (err) {
        handleError(res, err);
    }
});
router.delete('/library/:id', manageRoles, async (req, res) => {
    try {
        res.json(await (0, lms_service_1.deleteLibraryResource)(String(req.params.id)));
    }
    catch (err) {
        handleError(res, err);
    }
});
router.post('/library/:id/bookmark', studentRoles, async (req, res) => {
    try {
        res.status(201).json(await (0, lms_service_1.bookmarkResource)(req.user.userId, String(req.params.id)));
    }
    catch (err) {
        handleError(res, err);
    }
});
router.delete('/library/:id/bookmark', studentRoles, async (req, res) => {
    try {
        res.json(await (0, lms_service_1.removeBookmark)(req.user.userId, String(req.params.id)));
    }
    catch (err) {
        handleError(res, err);
    }
});
// ── Hybrid attendance (mode-aware bulk) ─────────────────────────────────────
router.post('/attendance/hybrid-bulk', (0, auth_1.authorize)(enums_1.UserRole.TEACHER, enums_1.UserRole.ADMIN), async (req, res) => {
    try {
        const repo = data_source_1.AppDataSource.getRepository(entities_1.StudentAttendance);
        const studentRepo = data_source_1.AppDataSource.getRepository(entities_2.Student);
        const { date = (0, helpers_1.today)(), records } = req.body;
        if (!(0, helpers_1.isSchoolDay)(date)) {
            return res.status(400).json({
                message: 'Attendance registers cannot be marked on weekends. Registers are marked Monday to Friday only.',
            });
        }
        if (!Array.isArray(records) || !records.length) {
            return res.status(400).json({ message: 'records array is required' });
        }
        const studentIds = [...new Set(records.map((r) => r.studentId))];
        const students = await studentRepo.find({
            where: { id: (0, typeorm_1.In)(studentIds) },
            select: { id: true, classId: true },
        });
        if (students.length !== studentIds.length) {
            return res.status(400).json({ message: 'One or more students were not found' });
        }
        const classIds = [...new Set(students.map((s) => s.classId).filter(Boolean))];
        if (classIds.length !== 1) {
            return res.status(400).json({ message: 'All students must belong to the same class' });
        }
        if (req.user.role === enums_1.UserRole.TEACHER) {
            if (!(await (0, teacher_class_access_1.assertTeacherClassTeacherAccess)(req, classIds[0]))) {
                return res.status(403).json({ message: 'Only the class teacher can mark attendance for this class' });
            }
        }
        else if (!(await (0, teacher_class_access_1.assertTeacherClassAccess)(req, classIds[0]))) {
            return res.status(403).json({ message: 'You are not assigned to this class' });
        }
        const saved = [];
        for (const r of records) {
            let existing = await repo.findOne({ where: { studentId: r.studentId, date } });
            const mode = Object.values(enums_1.AttendanceMode).includes(r.mode) ? r.mode : enums_1.AttendanceMode.IN_PERSON;
            if (existing) {
                existing.status = r.status;
                existing.mode = mode;
                existing.remarks = r.remarks;
                existing.markedById = req.user.staffId;
                saved.push(await repo.save(existing));
            }
            else {
                saved.push(await repo.save(repo.create({
                    studentId: r.studentId,
                    date,
                    status: r.status,
                    mode,
                    remarks: r.remarks,
                    markedById: req.user.staffId,
                })));
            }
        }
        res.json(saved);
    }
    catch (err) {
        handleError(res, err);
    }
});
exports.default = router;
