"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getActiveSchoolYear = getActiveSchoolYear;
exports.upsertEnrollmentSnapshot = upsertEnrollmentSnapshot;
exports.recordStudentExit = recordStudentExit;
exports.reinstateStudent = reinstateStudent;
exports.recordPromotionSnapshots = recordPromotionSnapshots;
exports.backfillStudentLifecycle = backfillStudentLifecycle;
const data_source_1 = require("../config/data-source");
const Student_1 = require("../entities/Student");
const SchoolYear_1 = require("../entities/SchoolYear");
const SchoolClass_1 = require("../entities/SchoolClass");
const Form_1 = require("../entities/Form");
const StudentEnrollment_1 = require("../entities/StudentEnrollment");
const enums_1 = require("../entities/enums");
/** The "current" academic year (flagged current, else most recent by start date). */
async function getActiveSchoolYear() {
    const repo = data_source_1.AppDataSource.getRepository(SchoolYear_1.SchoolYear);
    const current = await repo.findOne({ where: { isCurrent: true } });
    if (current)
        return current;
    const rows = await repo.find({ order: { startDate: 'DESC' }, take: 1 });
    return rows[0] ?? null;
}
async function resolveClassFormNames(classId, formId) {
    const result = {};
    if (classId) {
        const c = await data_source_1.AppDataSource.getRepository(SchoolClass_1.SchoolClass).findOne({ where: { id: classId } });
        result.className = c?.name;
    }
    if (formId) {
        const f = await data_source_1.AppDataSource.getRepository(Form_1.Form).findOne({ where: { id: formId } });
        result.formName = f?.name;
    }
    return result;
}
/**
 * Create or update the enrollment snapshot for a student in a given academic year.
 * Idempotent: keyed on (studentId, schoolYearId).
 */
async function upsertEnrollmentSnapshot(student, schoolYearId, opts) {
    const repo = data_source_1.AppDataSource.getRepository(StudentEnrollment_1.StudentEnrollment);
    let row = await repo.findOne({ where: { studentId: student.id, schoolYearId } });
    const names = opts?.className !== undefined || opts?.formName !== undefined
        ? { className: opts?.className, formName: opts?.formName }
        : await resolveClassFormNames(student.classId, student.formId);
    if (!row) {
        row = repo.create({
            studentId: student.id,
            schoolYearId,
            classId: student.classId ?? undefined,
            formId: student.formId ?? undefined,
            className: names.className,
            formName: names.formName,
            status: opts?.status ?? enums_1.EnrollmentStatus.ENROLLED,
            startDate: student.enrollmentDate ?? undefined,
            endDate: opts?.endDate ?? undefined,
        });
    }
    else {
        if (opts?.status)
            row.status = opts.status;
        if (opts?.endDate !== undefined)
            row.endDate = opts.endDate ?? undefined;
        // Keep class/form snapshot fresh while still enrolled.
        if (row.status === enums_1.EnrollmentStatus.ENROLLED) {
            row.classId = student.classId ?? undefined;
            row.formId = student.formId ?? undefined;
            row.className = names.className;
            row.formName = names.formName;
        }
    }
    return repo.save(row);
}
/**
 * Record a student's exit from the roll (withdrawn / transferred / graduated / suspended).
 * Updates the live Student record and marks the current-year enrollment snapshot as `left`.
 */
async function recordStudentExit(studentId, status, opts) {
    const repo = data_source_1.AppDataSource.getRepository(Student_1.Student);
    const student = await repo.findOne({ where: { id: studentId } });
    if (!student)
        return null;
    const exitDate = opts?.exitDate || new Date().toISOString().slice(0, 10);
    student.status = status;
    student.exitDate = exitDate;
    if (opts?.reason)
        student.exitReason = opts.reason;
    // Suspension keeps the student on the active roll; all other exits deactivate.
    const deactivate = opts?.deactivate ?? status !== enums_1.StudentStatus.SUSPENDED;
    if (deactivate)
        student.isActive = false;
    await repo.save(student);
    const year = await getActiveSchoolYear();
    if (year && status !== enums_1.StudentStatus.SUSPENDED) {
        await upsertEnrollmentSnapshot(student, year.id, {
            status: enums_1.EnrollmentStatus.LEFT,
            endDate: exitDate,
        });
    }
    return student;
}
/** Reinstate a previously exited student to active status. */
async function reinstateStudent(studentId) {
    const repo = data_source_1.AppDataSource.getRepository(Student_1.Student);
    const student = await repo.findOne({ where: { id: studentId } });
    if (!student)
        return null;
    student.status = enums_1.StudentStatus.ACTIVE;
    student.isActive = true;
    student.exitDate = undefined;
    student.exitReason = undefined;
    await repo.save(student);
    const year = await getActiveSchoolYear();
    if (year) {
        await upsertEnrollmentSnapshot(student, year.id, { status: enums_1.EnrollmentStatus.ENROLLED, endDate: null });
    }
    return student;
}
/**
 * Record year-over-year enrollment snapshots for a class promotion / completion batch.
 * Marks the completing year's snapshots as completed and (for genuine promotions) creates
 * the next year's enrolled snapshots — this is what makes retention measurable across years.
 */
async function recordPromotionSnapshots(opts) {
    if (!opts.studentIds.length)
        return;
    const ds = data_source_1.AppDataSource;
    await ds.query(`UPDATE "student_enrollments"
       SET "status" = 'completed', "endDate" = COALESCE($2, "endDate"), "updatedAt" = now()
     WHERE "schoolYearId" = $1 AND "studentId" = ANY($3::uuid[])`, [opts.completingYearId, opts.completingYearEndDate ?? null, opts.studentIds]);
    if (!opts.graduation) {
        await ds.query(`INSERT INTO "student_enrollments"
         ("studentId", "schoolYearId", "formId", "formName", "classId", "className", "status", "startDate")
       SELECT unnest($1::uuid[]), $2, $3, $4, $5, $6, 'enrolled', $7
       ON CONFLICT ("studentId", "schoolYearId") DO UPDATE
         SET "formId" = EXCLUDED."formId",
             "formName" = EXCLUDED."formName",
             "classId" = EXCLUDED."classId",
             "className" = EXCLUDED."className",
             "status" = 'enrolled',
             "endDate" = NULL,
             "updatedAt" = now()`, [
            opts.studentIds,
            opts.targetYearId,
            opts.toFormId ?? null,
            opts.toFormName ?? null,
            opts.toClassId ?? null,
            opts.toClassName ?? null,
            opts.targetYearStartDate ?? null,
        ]);
    }
}
/**
 * Startup backfill (idempotent). Ensures existing data has sensible lifecycle values:
 *  - inactive students with no explicit exit status are marked withdrawn;
 *  - every active student has a current-year enrollment snapshot.
 * Safe to run repeatedly; only touches rows that need it.
 */
async function backfillStudentLifecycle() {
    const ds = data_source_1.AppDataSource;
    const statusRes = await ds.query(`UPDATE "students" SET "status" = 'withdrawn'
     WHERE "isActive" = false AND ("status" IS NULL OR "status" = 'active')`);
    const statusFixed = Array.isArray(statusRes) ? statusRes[1] ?? 0 : 0;
    const year = await getActiveSchoolYear();
    let snapshotsCreated = 0;
    if (year) {
        const insertRes = await ds.query(`
      INSERT INTO "student_enrollments"
        ("studentId", "schoolYearId", "formId", "formName", "classId", "className", "status", "startDate")
      SELECT s."id", $1, s."formId", f."name", s."classId", c."name", 'enrolled', s."enrollmentDate"
      FROM "students" s
      LEFT JOIN "forms" f ON f."id" = s."formId"
      LEFT JOIN "classes" c ON c."id" = s."classId"
      WHERE s."isActive" = true
      ON CONFLICT ("studentId", "schoolYearId") DO NOTHING
      `, [year.id]);
        snapshotsCreated = Array.isArray(insertRes) ? insertRes[1] ?? 0 : 0;
    }
    return { statusFixed, snapshotsCreated };
}
