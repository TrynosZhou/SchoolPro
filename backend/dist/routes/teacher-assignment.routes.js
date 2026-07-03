"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const enums_1 = require("../entities/enums");
const validate_dto_1 = require("../utils/validate-dto");
const teacher_assignment_dto_1 = require("../dtos/teacher-assignment.dto");
const teacher_assignment_service_1 = require("../services/teacher-assignment.service");
const validate_dto_2 = require("../utils/validate-dto");
const router = (0, express_1.Router)();
const canView = (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL);
const canManage = (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.PRINCIPAL);
router.use(auth_1.authenticate);
function handleError(res, err) {
    if (err instanceof validate_dto_2.DtoValidationError) {
        return res.status(400).json({ message: err.message, details: err.details });
    }
    if (err instanceof teacher_assignment_service_1.TeacherAssignmentConflictError) {
        return res.status(409).json({ message: err.message });
    }
    const status = err?.statusCode;
    if (status && status >= 400 && status < 500) {
        return res.status(status).json({ message: err.message });
    }
    console.error(err);
    return res.status(500).json({ message: err.message || 'Request failed' });
}
router.get('/sections', canView, async (req, res) => {
    try {
        const formId = req.query.formId ? String(req.query.formId) : undefined;
        res.json(await (0, teacher_assignment_service_1.listSections)(formId));
    }
    catch (err) {
        handleError(res, err);
    }
});
router.get('/', canView, async (req, res) => {
    try {
        const activeOnly = req.query.includeInactive !== 'true';
        res.json(await (0, teacher_assignment_service_1.listTeacherAssignments)({
            teacherId: req.query.teacherId ? String(req.query.teacherId) : undefined,
            classId: req.query.classId ? String(req.query.classId) : undefined,
            sectionId: req.query.sectionId ? String(req.query.sectionId) : undefined,
            activeOnly,
        }));
    }
    catch (err) {
        handleError(res, err);
    }
});
router.post('/', canManage, async (req, res) => {
    try {
        const dto = await (0, validate_dto_1.validateDto)(teacher_assignment_dto_1.CreateTeacherAssignmentDto, req.body);
        res.status(201).json(await (0, teacher_assignment_service_1.createTeacherAssignment)(dto));
    }
    catch (err) {
        handleError(res, err);
    }
});
router.post('/bulk', canManage, async (req, res) => {
    try {
        const dto = await (0, validate_dto_1.validateDto)(teacher_assignment_dto_1.BulkTeacherAssignmentDto, req.body);
        res.status(201).json(await (0, teacher_assignment_service_1.bulkCreateTeacherAssignments)(dto));
    }
    catch (err) {
        handleError(res, err);
    }
});
router.post('/sync-teacher-load', canManage, async (_req, res) => {
    try {
        const synced = await (0, teacher_assignment_service_1.syncSubjectAssignmentsFromClassSubjects)();
        res.json({ synced });
    }
    catch (err) {
        handleError(res, err);
    }
});
router.post('/reset-all', canManage, async (req, res) => {
    try {
        const confirmText = String(req.body?.confirmText ?? '').trim();
        if (confirmText !== 'RESET') {
            return res.status(400).json({ message: 'Type RESET to confirm this action' });
        }
        res.json(await (0, teacher_assignment_service_1.resetAllTeacherAssignments)());
    }
    catch (err) {
        handleError(res, err);
    }
});
router.post('/teacher/:teacherId/reset', canManage, async (req, res) => {
    try {
        const confirmText = String(req.body?.confirmText ?? '').trim();
        if (confirmText !== 'RESET') {
            return res.status(400).json({ message: 'Type RESET to confirm this action' });
        }
        res.json(await (0, teacher_assignment_service_1.resetTeacherAssignments)(String(req.params.teacherId)));
    }
    catch (err) {
        handleError(res, err);
    }
});
router.patch('/:id', canManage, async (req, res) => {
    try {
        const dto = await (0, validate_dto_1.validateDto)(teacher_assignment_dto_1.UpdateTeacherAssignmentDto, req.body);
        res.json(await (0, teacher_assignment_service_1.updateTeacherAssignment)(String(req.params.id), dto));
    }
    catch (err) {
        handleError(res, err);
    }
});
router.post('/:id/end', canManage, async (req, res) => {
    try {
        const endDate = req.body?.endDate ? String(req.body.endDate) : undefined;
        res.json(await (0, teacher_assignment_service_1.endTeacherAssignment)(String(req.params.id), endDate));
    }
    catch (err) {
        handleError(res, err);
    }
});
router.get('/workload/summary', canView, async (_req, res) => {
    try {
        res.json(await (0, teacher_assignment_service_1.getWorkloadSummaryReport)());
    }
    catch (err) {
        handleError(res, err);
    }
});
router.get('/class-roster/:classId', canView, async (req, res) => {
    try {
        const sectionId = req.query.sectionId ? String(req.query.sectionId) : undefined;
        res.json(await (0, teacher_assignment_service_1.getClassRoster)(String(req.params.classId), sectionId));
    }
    catch (err) {
        handleError(res, err);
    }
});
router.get('/teacher-schedule/:teacherId', canView, async (req, res) => {
    try {
        res.json(await (0, teacher_assignment_service_1.getTeacherWeeklySchedule)(String(req.params.teacherId)));
    }
    catch (err) {
        handleError(res, err);
    }
});
router.post('/timetable-slots', canManage, async (req, res) => {
    try {
        const dto = await (0, validate_dto_1.validateDto)(teacher_assignment_dto_1.CreateTimetableSlotDto, req.body);
        res.status(201).json(await (0, teacher_assignment_service_1.createTimetableSlot)(dto));
    }
    catch (err) {
        handleError(res, err);
    }
});
router.patch('/timetable-slots/:id', canManage, async (req, res) => {
    try {
        const dto = await (0, validate_dto_1.validateDto)(teacher_assignment_dto_1.UpdateTimetableSlotDto, req.body);
        res.json(await (0, teacher_assignment_service_1.updateTimetableSlot)(String(req.params.id), dto));
    }
    catch (err) {
        handleError(res, err);
    }
});
router.delete('/timetable-slots/:id', canManage, async (req, res) => {
    try {
        await (0, teacher_assignment_service_1.deleteTimetableSlot)(String(req.params.id));
        res.status(204).send();
    }
    catch (err) {
        handleError(res, err);
    }
});
exports.default = router;
