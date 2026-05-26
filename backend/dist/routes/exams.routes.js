"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-nocheck
const express_1 = require("express");
const data_source_1 = require("../config/data-source");
const entities_1 = require("../entities");
const enums_1 = require("../entities/enums");
const auth_1 = require("../middleware/auth");
const grade_service_1 = require("../services/grade.service");
const entities_2 = require("../entities");
const honours_service_1 = require("../services/honours.service");
const report_card_service_1 = require("../services/report-card.service");
const pdf_1 = require("../utils/pdf");
const mark_sheet_service_1 = require("../services/mark-sheet.service");
const typeorm_helpers_1 = require("../utils/typeorm-helpers");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
router.get('/types', async (_req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.ExamType);
    res.json(await repo.find());
});
router.get('/terms', (0, auth_1.authorize)(enums_1.UserRole.TEACHER, enums_1.UserRole.ADMIN, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.DIRECTOR), async (_req, res) => {
    const years = await data_source_1.AppDataSource.getRepository(entities_1.SchoolYear).find({
        relations: (0, typeorm_helpers_1.relations)('terms'),
        order: { startDate: 'DESC' },
    });
    const terms = years.flatMap((y) => y.terms || []).sort((a, b) => a.name.localeCompare(b.name));
    res.json(terms);
});
router.get('/class-subjects', (0, auth_1.authorize)(enums_1.UserRole.TEACHER, enums_1.UserRole.ADMIN, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.DIRECTOR), async (req, res) => {
    const { classId } = req.query;
    if (!classId)
        return res.status(400).json({ message: 'classId is required' });
    const rows = await data_source_1.AppDataSource.getRepository(entities_2.ClassSubject).find({
        where: { classId: classId },
        relations: (0, typeorm_helpers_1.relations)('subject'),
        order: { subject: { name: 'ASC' } },
    });
    res.json(rows.map((r) => r.subject).filter(Boolean));
});
router.get('/marks/entry', (0, auth_1.authorize)(enums_1.UserRole.TEACHER, enums_1.UserRole.ADMIN, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.DIRECTOR), async (req, res) => {
    const { classId, subjectId, examTypeId, termId } = req.query;
    if (!classId || !subjectId || !examTypeId || !termId) {
        return res.status(400).json({ message: 'classId, subjectId, examTypeId, and termId are required' });
    }
    const examType = await data_source_1.AppDataSource.getRepository(entities_1.ExamType).findOne({ where: { id: examTypeId } });
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
router.get('/marks', (0, auth_1.authorize)(enums_1.UserRole.TEACHER, enums_1.UserRole.ADMIN, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PARENT, enums_1.UserRole.STUDENT), async (req, res) => {
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
    const marks = await repo.find({
        where,
        relations: (0, typeorm_helpers_1.relations)('student', 'subject', 'examType', 'term', 'enteredBy', 'enteredBy.user'),
        order: { student: { lastName: 'ASC' } },
    });
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
router.post('/marks/save-one', (0, auth_1.authorize)(enums_1.UserRole.TEACHER, enums_1.UserRole.ADMIN, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.DIRECTOR), async (req, res) => {
    const { studentId, examTypeId, classId, subjectId, termId, marks, remarks } = req.body;
    if (!studentId || !examTypeId || !classId || !subjectId || !termId) {
        return res.status(400).json({ message: 'Missing required fields' });
    }
    if (marks === null || marks === undefined || marks === '') {
        return res.status(400).json({ message: 'Marks value required' });
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
router.post('/marks/bulk', (0, auth_1.authorize)(enums_1.UserRole.TEACHER, enums_1.UserRole.ADMIN, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.DIRECTOR), async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.ExamMark);
    const { examTypeId, classId, subjectId, termId, marks } = req.body;
    const saved = [];
    const syncedStudents = new Set();
    for (const m of marks) {
        if (m.marks === null || m.marks === undefined || m.marks === '')
            continue;
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
router.post('/report-cards/generate', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.PRINCIPAL), async (req, res) => {
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
        report.isPublished = true;
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
    res.json({ count: reports.length, reports });
});
router.get('/report-cards/:studentId/:termId', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.DIRECTOR, enums_1.UserRole.TEACHER, enums_1.UserRole.PARENT, enums_1.UserRole.STUDENT), async (req, res) => {
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
    res.json(report);
});
router.get('/report-cards/:studentId/:termId/pdf', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.DIRECTOR, enums_1.UserRole.TEACHER, enums_1.UserRole.PARENT, enums_1.UserRole.STUDENT), async (req, res) => {
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
    const settings = await data_source_1.AppDataSource.getRepository(entities_1.SchoolSettings).findOne({ where: { id: 'default' } });
    const inline = req.query.preview === 'true';
    const pdf = await (0, pdf_1.generateReportCardPdf)({
        schoolName: settings?.schoolName || 'School Pro Academy',
        tagline: settings?.tagline || undefined,
        logoUrl: settings?.logoUrl || undefined,
        studentName: `${report.student.firstName} ${report.student.lastName}`,
        admissionNumber: report.student.admissionNumber,
        className: report.student.schoolClass?.name || '',
        formName: report.student.schoolClass?.form?.name || '',
        termName: report.term.name,
        examTypeName: report.examType?.name,
        subjectResults: report.subjectResults,
        averageMark: Number(report.averageMark),
        overallGrade: report.overallGrade,
        classPosition: report.classPosition,
        formPosition: report.formPosition,
        classTeacherRemarks: report.classTeacherRemarks,
        principalRemarks: report.principalRemarks,
        generatedAt: report.generatedAt ? new Date(report.generatedAt) : new Date(),
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="report-card-${report.student.admissionNumber}.pdf"`);
    res.send(pdf);
});
router.patch('/report-cards/:id/remarks', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.DIRECTOR, enums_1.UserRole.TEACHER), async (req, res) => {
    const { classTeacherRemarks, principalRemarks } = req.body;
    const repo = data_source_1.AppDataSource.getRepository(entities_1.ReportCard);
    const report = await repo.findOne({
        where: { id: req.params.id },
        relations: (0, typeorm_helpers_1.relations)('student'),
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
    if (classTeacherRemarks !== undefined) {
        report.classTeacherRemarks = String(classTeacherRemarks || '').trim() || null;
    }
    if (principalRemarks !== undefined) {
        report.principalRemarks = String(principalRemarks || '').trim() || null;
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
