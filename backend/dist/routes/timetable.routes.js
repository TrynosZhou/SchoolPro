"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-nocheck
const express_1 = require("express");
const typeorm_1 = require("typeorm");
const auth_1 = require("../middleware/auth");
const enums_1 = require("../entities/enums");
const timetable_generate_service_1 = require("../services/timetable-generate.service");
const school_branding_service_1 = require("../services/school-branding.service");
const data_source_1 = require("../config/data-source");
const entities_1 = require("../entities");
const timetable_summary_pdf_1 = require("../utils/timetable-summary.pdf");
const timetable_classic_pdf_1 = require("../utils/timetable-classic.pdf");
const teacher_display_1 = require("../utils/teacher-display");
const teacher_load_pdf_1 = require("../utils/teacher-load.pdf");
const typeorm_helpers_1 = require("../utils/typeorm-helpers");
const timetable_move_service_1 = require("../services/timetable-move.service");
const timetable_lock_service_1 = require("../services/timetable-lock.service");
const timetable_context_service_1 = require("../services/timetable-context.service");
const teacher_allocation_service_1 = require("../services/teacher-allocation.service");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
const manageRoles = [enums_1.UserRole.ADMIN, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.DIRECTOR];
const viewRoles = [...manageRoles, enums_1.UserRole.TEACHER];
function conflictStatus(err) {
    if (err.conflict) {
        return { status: 409, body: { message: err.message, conflict: err.conflict } };
    }
    return { status: 400, body: { message: err.message } };
}
function parsePeriodsQuery(raw) {
    if (typeof raw !== 'string' || !raw.trim())
        return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    }
    catch {
        return [];
    }
}
async function resolvePeriodsFromQuery(raw) {
    let periods = parsePeriodsQuery(raw);
    if (periods.length)
        return periods;
    const snapshot = await (0, timetable_generate_service_1.getTimetableSnapshot)();
    const times = new Map();
    for (const teacher of snapshot.teachers) {
        for (const slot of teacher.slots) {
            times.set(`${slot.startTime}|${slot.endTime}`, {
                startTime: slot.startTime,
                endTime: slot.endTime,
            });
        }
    }
    return [...times.values()].sort((a, b) => a.startTime.localeCompare(b.startTime));
}
async function loadTimetablePdfContext() {
    return (0, timetable_context_service_1.loadTimetableContext)();
}
router.get('/context', (0, auth_1.authorize)(...viewRoles), async (_req, res) => {
    try {
        const ctx = await loadTimetablePdfContext();
        res.json({
            schoolName: ctx.schoolName,
            titleLine: ctx.titleLine,
            termVersionLabel: ctx.termVersionLabel,
            termName: ctx.termName,
            yearName: ctx.yearName,
            timetableVersion: ctx.timetableVersion,
        });
    }
    catch (err) {
        const e = err;
        res.status(500).json({ message: e.message || 'Failed to load timetable context.' });
    }
});
router.patch('/version', (0, auth_1.authorize)(...manageRoles), async (req, res) => {
    try {
        const version = await (0, timetable_context_service_1.saveTimetableVersion)(req.body?.version);
        const ctx = await (0, timetable_context_service_1.loadTimetableContext)();
        res.json({
            timetableVersion: version,
            termVersionLabel: ctx.termVersionLabel,
            titleLine: ctx.titleLine,
        });
    }
    catch (err) {
        const e = err;
        res.status(400).json({ message: e.message || 'Failed to save timetable version.' });
    }
});
router.post('/generate', (0, auth_1.authorize)(...manageRoles), async (req, res) => {
    try {
        const { periods, replaceExisting, classIds, timetableVersion } = req.body || {};
        if (!Array.isArray(periods) || !periods.length) {
            return res.status(400).json({ message: 'periods array is required (lesson times from Configure Periods).' });
        }
        if (timetableVersion !== undefined && timetableVersion !== null && String(timetableVersion).trim()) {
            await (0, timetable_context_service_1.saveTimetableVersion)(timetableVersion);
        }
        const result = await (0, timetable_generate_service_1.generateTimetableFromTeacherLoad)({
            periods,
            replaceExisting: replaceExisting !== false,
            classIds: Array.isArray(classIds) ? classIds : undefined,
        });
        res.status(result.success ? 201 : 207).json(result);
    }
    catch (err) {
        const e = err;
        res.status(400).json({ message: e.message || 'Failed to generate timetable.' });
    }
});
router.get('/generate/snapshot', (0, auth_1.authorize)(...viewRoles), async (_req, res) => {
    try {
        res.json(await (0, timetable_generate_service_1.getTimetableSnapshot)());
    }
    catch (err) {
        const e = err;
        res.status(500).json({ message: e.message || 'Failed to load timetable snapshot.' });
    }
});
router.get('/generate/summary/pdf', (0, auth_1.authorize)(...viewRoles), async (req, res) => {
    try {
        const preview = String(req.query.preview || '').toLowerCase() === 'true';
        const periods = await resolvePeriodsFromQuery(req.query.periods);
        if (!periods.length) {
            return res.status(400).json({ message: 'No period times available. Configure periods or pass periods JSON.' });
        }
        const snapshot = await (0, timetable_generate_service_1.getTimetableSnapshot)();
        if (!snapshot.teachers.length) {
            return res.status(400).json({ message: 'No timetable data to export. Generate a timetable first.' });
        }
        const branding = await (0, school_branding_service_1.loadSchoolBranding)();
        const pdf = await (0, timetable_summary_pdf_1.generateTimetableSummaryPdf)({
            schoolName: branding.schoolName || 'School Pro Academy',
            tagline: branding.tagline,
            logoUrl: branding.logoUrl,
            generatedAt: new Date(),
            periods,
            teachers: snapshot.teachers.map((t) => ({
                teacherLabel: (0, timetable_summary_pdf_1.teacherInitials)(t.teacherName),
                teacherName: t.teacherName,
                employeeNumber: t.employeeNumber,
                slots: t.slots.map((s) => ({
                    dayOfWeek: s.dayOfWeek,
                    startTime: s.startTime,
                    endTime: s.endTime,
                    className: s.className,
                })),
            })),
        });
        const filename = 'teacher-summary-timetable.pdf';
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `${preview ? 'inline' : 'attachment'}; filename="${filename}"`);
        res.send(pdf);
    }
    catch (err) {
        const e = err;
        res.status(500).json({ message: e.message || 'Failed to generate summary timetable PDF.' });
    }
});
router.get('/generate/classes-grid/pdf', (0, auth_1.authorize)(...viewRoles), async (req, res) => {
    try {
        const preview = String(req.query.preview || '').toLowerCase() === 'true';
        const periods = await resolvePeriodsFromQuery(req.query.periods);
        if (!periods.length) {
            return res.status(400).json({ message: 'No period times available. Configure periods or pass periods JSON.' });
        }
        const snapshot = await (0, timetable_generate_service_1.getTimetableSnapshot)();
        if (!snapshot.classes.length) {
            return res.status(400).json({ message: 'No timetable data to export. Generate a timetable first.' });
        }
        const branding = await (0, school_branding_service_1.loadSchoolBranding)();
        const pdf = await (0, timetable_summary_pdf_1.generateTimetableClassesGridPdf)({
            schoolName: branding.schoolName || 'School Pro Academy',
            tagline: branding.tagline,
            logoUrl: branding.logoUrl,
            generatedAt: new Date(),
            periods,
            classes: snapshot.classes.map((c) => ({
                classLabel: (0, teacher_load_pdf_1.shortClassName)(c.className),
                className: c.className,
                slots: c.slots.map((s) => ({
                    dayOfWeek: s.dayOfWeek,
                    startTime: s.startTime,
                    endTime: s.endTime,
                    subjectName: s.subjectName,
                    subjectCode: s.subjectCode,
                    subjectShort: s.subjectShort,
                })),
            })),
        });
        const filename = 'class-timetables-grid.pdf';
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `${preview ? 'inline' : 'attachment'}; filename="${filename}"`);
        res.send(pdf);
    }
    catch (err) {
        const e = err;
        res.status(500).json({ message: e.message || 'Failed to generate class timetables PDF.' });
    }
});
router.get('/generate/teachers/all/pdf', (0, auth_1.authorize)(...viewRoles), async (req, res) => {
    try {
        const preview = String(req.query.preview || '').toLowerCase() === 'true';
        const periods = await resolvePeriodsFromQuery(req.query.periods);
        if (!periods.length) {
            return res.status(400).json({ message: 'No period times available. Configure periods or pass periods JSON.' });
        }
        const snapshot = await (0, timetable_generate_service_1.getTimetableSnapshot)();
        if (!snapshot.teachers.length) {
            return res.status(400).json({ message: 'No timetable data to export. Generate a timetable first.' });
        }
        const ctx = await loadTimetablePdfContext();
        const pdf = await (0, timetable_classic_pdf_1.generateAllTeacherTimetablesPdf)(snapshot.teachers.map((teacher) => ({
            schoolName: ctx.schoolName,
            logoUrl: ctx.branding.logoUrl,
            titleLine: ctx.titleLine,
            subtitleLine: `Teacher: ${teacher.teacherName}`,
            generatedAt: ctx.generatedAt,
            footerBrand: ctx.schoolName,
            teacherName: teacher.teacherName,
            periods,
            slots: teacher.slots.map((s) => ({
                dayOfWeek: s.dayOfWeek,
                startTime: s.startTime,
                endTime: s.endTime,
                className: s.className,
                subjectName: s.subjectName,
                subjectCode: s.subjectCode,
                subjectShort: s.subjectShort,
            })),
        })));
        const filename = 'all-teacher-timetables.pdf';
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `${preview ? 'inline' : 'attachment'}; filename="${filename}"`);
        res.send(pdf);
    }
    catch (err) {
        const e = err;
        res.status(500).json({ message: e.message || 'Failed to generate teacher timetables PDF.' });
    }
});
router.get('/generate/classes/all/pdf', (0, auth_1.authorize)(...viewRoles), async (req, res) => {
    try {
        const preview = String(req.query.preview || '').toLowerCase() === 'true';
        const periods = await resolvePeriodsFromQuery(req.query.periods);
        if (!periods.length) {
            return res.status(400).json({ message: 'No period times available. Configure periods or pass periods JSON.' });
        }
        const snapshot = await (0, timetable_generate_service_1.getTimetableSnapshot)();
        if (!snapshot.classes.length) {
            return res.status(400).json({ message: 'No timetable data to export. Generate a timetable first.' });
        }
        const ctx = await loadTimetablePdfContext();
        const classIds = snapshot.classes.map((c) => c.classId);
        const schoolClasses = classIds.length
            ? await data_source_1.AppDataSource.getRepository(entities_1.SchoolClass).find({
                where: { id: (0, typeorm_1.In)(classIds) },
                relations: (0, typeorm_helpers_1.relations)('classTeacher', 'classTeacher.user'),
            })
            : [];
        const classTeacherById = new Map(schoolClasses.map((sc) => {
            const name = sc.classTeacher ? (0, teacher_display_1.formatTeacherTimetableName)(sc.classTeacher) : '';
            return [sc.id, name];
        }));
        const pdf = await (0, timetable_classic_pdf_1.generateAllClassTimetablesPdf)(snapshot.classes.map((cls) => ({
            schoolName: ctx.schoolName,
            logoUrl: ctx.branding.logoUrl,
            titleLine: ctx.titleLine,
            subtitleLine: `Class: ${(0, teacher_load_pdf_1.shortClassName)(cls.className)}`,
            headerRight: (0, timetable_classic_pdf_1.formatClassTeacherHeader)(classTeacherById.get(cls.classId) || '') || undefined,
            generatedAt: ctx.generatedAt,
            footerBrand: ctx.schoolName,
            className: cls.className,
            periods,
            slots: cls.slots.map((s) => ({
                dayOfWeek: s.dayOfWeek,
                startTime: s.startTime,
                endTime: s.endTime,
                subjectName: s.subjectName,
                subjectCode: s.subjectCode,
                subjectShort: s.subjectShort,
                teacherName: s.teacherName,
            })),
        })));
        const filename = 'all-class-timetables.pdf';
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `${preview ? 'inline' : 'attachment'}; filename="${filename}"`);
        res.send(pdf);
    }
    catch (err) {
        const e = err;
        res.status(500).json({ message: e.message || 'Failed to generate class timetables PDF.' });
    }
});
router.get('/generate/teacher/pdf', (0, auth_1.authorize)(...viewRoles), async (req, res) => {
    try {
        const preview = String(req.query.preview || '').toLowerCase() === 'true';
        const teacherId = String(req.query.teacherId || '').trim();
        if (!teacherId) {
            return res.status(400).json({ message: 'teacherId is required.' });
        }
        const periods = await resolvePeriodsFromQuery(req.query.periods);
        if (!periods.length) {
            return res.status(400).json({ message: 'No period times available. Configure periods or pass periods JSON.' });
        }
        const snapshot = await (0, timetable_generate_service_1.getTimetableSnapshot)();
        const teacher = snapshot.teachers.find((t) => t.teacherId === teacherId);
        if (!teacher) {
            return res.status(404).json({ message: 'Teacher timetable not found. Generate a timetable first.' });
        }
        const ctx = await loadTimetablePdfContext();
        const pdf = await (0, timetable_classic_pdf_1.generateTeacherTimetablePdf)({
            schoolName: ctx.schoolName,
            logoUrl: ctx.branding.logoUrl,
            titleLine: ctx.titleLine,
            subtitleLine: `Teacher: ${teacher.teacherName}`,
            generatedAt: ctx.generatedAt,
            footerBrand: ctx.schoolName,
            teacherName: teacher.teacherName,
            periods,
            slots: teacher.slots.map((s) => ({
                dayOfWeek: s.dayOfWeek,
                startTime: s.startTime,
                endTime: s.endTime,
                className: s.className,
                subjectName: s.subjectName,
                subjectCode: s.subjectCode,
                subjectShort: s.subjectShort,
            })),
        });
        const safeName = teacher.teacherName.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'teacher';
        const filename = `timetable-teacher-${safeName}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `${preview ? 'inline' : 'attachment'}; filename="${filename}"`);
        res.send(pdf);
    }
    catch (err) {
        const e = err;
        res.status(500).json({ message: e.message || 'Failed to generate teacher timetable PDF.' });
    }
});
router.get('/generate/class/pdf', (0, auth_1.authorize)(...viewRoles), async (req, res) => {
    try {
        const preview = String(req.query.preview || '').toLowerCase() === 'true';
        const classId = String(req.query.classId || '').trim();
        if (!classId) {
            return res.status(400).json({ message: 'classId is required.' });
        }
        const periods = await resolvePeriodsFromQuery(req.query.periods);
        if (!periods.length) {
            return res.status(400).json({ message: 'No period times available. Configure periods or pass periods JSON.' });
        }
        const snapshot = await (0, timetable_generate_service_1.getTimetableSnapshot)();
        const cls = snapshot.classes.find((c) => c.classId === classId);
        if (!cls) {
            return res.status(404).json({ message: 'Class timetable not found. Generate a timetable first.' });
        }
        const ctx = await loadTimetablePdfContext();
        const schoolClass = await data_source_1.AppDataSource.getRepository(entities_1.SchoolClass).findOne({
            where: { id: classId },
            relations: (0, typeorm_helpers_1.relations)('classTeacher', 'classTeacher.user'),
        });
        const classTeacherName = schoolClass?.classTeacher
            ? (0, teacher_display_1.formatTeacherTimetableName)(schoolClass.classTeacher)
            : '';
        const headerRight = (0, timetable_classic_pdf_1.formatClassTeacherHeader)(classTeacherName);
        const pdf = await (0, timetable_classic_pdf_1.generateClassTimetablePdf)({
            schoolName: ctx.schoolName,
            logoUrl: ctx.branding.logoUrl,
            titleLine: ctx.titleLine,
            subtitleLine: `Class: ${(0, teacher_load_pdf_1.shortClassName)(cls.className)}`,
            headerRight: headerRight || undefined,
            generatedAt: ctx.generatedAt,
            footerBrand: ctx.schoolName,
            className: cls.className,
            periods,
            slots: cls.slots.map((s) => ({
                dayOfWeek: s.dayOfWeek,
                startTime: s.startTime,
                endTime: s.endTime,
                subjectName: s.subjectName,
                subjectCode: s.subjectCode,
                subjectShort: s.subjectShort,
                teacherName: s.teacherName,
            })),
        });
        const safeName = cls.className.replace(/[^\w\s.-]/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'class';
        const filename = `timetable-class-${safeName}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `${preview ? 'inline' : 'attachment'}; filename="${filename}"`);
        res.send(pdf);
    }
    catch (err) {
        const e = err;
        console.error('Class timetable PDF error:', e);
        res.status(500).json({ message: e.message || 'Failed to generate class timetable PDF.' });
    }
});
router.patch('/slots/:id/move', (0, auth_1.authorize)(...manageRoles), async (req, res) => {
    try {
        const { dayOfWeek, startTime, endTime } = req.body || {};
        const result = await (0, timetable_move_service_1.moveTimetableSlot)(req.params.id, { dayOfWeek, startTime, endTime });
        res.json(result);
    }
    catch (err) {
        const e = err;
        if (e.conflict) {
            return res.status(409).json({ message: e.message, conflict: e.conflict });
        }
        res.status(400).json({ message: e.message || 'Failed to move timetable slot.' });
    }
});
router.patch('/slots/:id/lock', (0, auth_1.authorize)(...manageRoles), async (req, res) => {
    try {
        const locked = req.body?.locked;
        if (typeof locked !== 'boolean') {
            return res.status(400).json({ message: 'locked (boolean) is required.' });
        }
        const result = await (0, timetable_lock_service_1.setTimetableSlotLocked)(req.params.id, locked);
        res.json(result);
    }
    catch (err) {
        const e = err;
        res.status(400).json({ message: e.message || 'Failed to update lesson lock.' });
    }
});
/** Teacher availability for a day/time slot (grey-out dropdown). */
router.get('/teacher-allocation/availability', (0, auth_1.authorize)(...viewRoles), async (req, res) => {
    try {
        const dayOfWeek = (0, teacher_allocation_service_1.parseDayOfWeekInput)(req.query.dayOfWeek);
        const startTime = String(req.query.startTime || '').trim();
        const endTime = String(req.query.endTime || '').trim();
        if (!startTime || !endTime) {
            return res.status(400).json({ message: 'startTime and endTime are required.' });
        }
        const excludeAllocationId = req.query.excludeAllocationId
            ? String(req.query.excludeAllocationId)
            : undefined;
        res.json(await (0, teacher_allocation_service_1.getTeacherAvailability)({ dayOfWeek, startTime, endTime, excludeAllocationId }));
    }
    catch (err) {
        const e = err;
        res.status(400).json({ message: e.message || 'Invalid availability request.' });
    }
});
/** Full weekly schedule for one teacher across all classes. */
router.get('/teacher-allocation/schedule/:teacherId', (0, auth_1.authorize)(...viewRoles), async (req, res) => {
    try {
        res.json(await (0, teacher_allocation_service_1.getTeacherWeeklySchedule)(req.params.teacherId));
    }
    catch (err) {
        const e = err;
        res.status(400).json({ message: e.message || 'Failed to load teacher schedule.' });
    }
});
/** Alias matching spec: GET /teacher-allocation/:teacherId */
router.get('/teacher-allocation/:teacherId', (0, auth_1.authorize)(...viewRoles), async (req, res) => {
    try {
        res.json(await (0, teacher_allocation_service_1.getTeacherWeeklySchedule)(req.params.teacherId));
    }
    catch (err) {
        const e = err;
        res.status(400).json({ message: e.message || 'Failed to load teacher schedule.' });
    }
});
router.post('/teacher-allocation', (0, auth_1.authorize)(...manageRoles), async (req, res) => {
    try {
        const { timetableEntryId, teacherId } = req.body || {};
        if (!timetableEntryId || !teacherId) {
            return res.status(400).json({ message: 'timetableEntryId and teacherId are required.' });
        }
        const row = await (0, teacher_allocation_service_1.createTeacherAllocation)({ timetableEntryId, teacherId });
        res.status(201).json(row);
    }
    catch (err) {
        const e = err;
        const out = conflictStatus(e);
        res.status(out.status).json(out.body);
    }
});
router.put('/teacher-allocation/:id', (0, auth_1.authorize)(...manageRoles), async (req, res) => {
    try {
        const row = await (0, teacher_allocation_service_1.updateTeacherAllocation)(req.params.id, req.body || {});
        res.json(row);
    }
    catch (err) {
        const e = err;
        if (e.message === 'Teacher allocation not found.') {
            return res.status(404).json({ message: e.message });
        }
        const out = conflictStatus(e);
        res.status(out.status).json(out.body);
    }
});
router.delete('/teacher-allocation/:id', (0, auth_1.authorize)(...manageRoles), async (req, res) => {
    try {
        res.json(await (0, teacher_allocation_service_1.deleteTeacherAllocation)(req.params.id));
    }
    catch (err) {
        const e = err;
        if (e.message === 'Teacher allocation not found.') {
            return res.status(404).json({ message: e.message });
        }
        res.status(400).json({ message: e.message || 'Failed to remove allocation.' });
    }
});
exports.default = router;
