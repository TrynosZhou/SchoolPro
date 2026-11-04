"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAnyClassTeacher = isAnyClassTeacher;
exports.getClassTeacherClassIds = getClassTeacherClassIds;
exports.assertTeacherClassAccess = assertTeacherClassAccess;
exports.isClassTeacher = isClassTeacher;
exports.assertTeacherSubjectAccess = assertTeacherSubjectAccess;
exports.assertTeacherClassTeacherAccess = assertTeacherClassTeacherAccess;
const data_source_1 = require("../config/data-source");
const enums_1 = require("../entities/enums");
async function isAnyClassTeacher(staffId) {
    const rows = await data_source_1.AppDataSource.query(`SELECT 1 FROM classes c WHERE c."classTeacherId" = $1 LIMIT 1`, [staffId]);
    return rows.length > 0;
}
async function getClassTeacherClassIds(staffId) {
    const rows = await data_source_1.AppDataSource.query(`SELECT c.id FROM classes c WHERE c."classTeacherId" = $1`, [staffId]);
    return rows.map((r) => r.id);
}
async function assertTeacherClassAccess(req, classId) {
    if (req.user.role !== enums_1.UserRole.TEACHER)
        return true;
    if (!req.user.staffId)
        return false;
    const [subjectAssignment, classTeacher] = await Promise.all([
        data_source_1.AppDataSource.query(`SELECT 1 FROM class_subjects cs WHERE cs."classId" = $1 AND cs."teacherId" = $2 LIMIT 1`, [classId, req.user.staffId]),
        isClassTeacher(req.user.staffId, classId),
    ]);
    return subjectAssignment.length > 0 || classTeacher;
}
async function isClassTeacher(staffId, classId) {
    const rows = await data_source_1.AppDataSource.query(`SELECT 1 FROM classes c WHERE c.id = $1 AND c."classTeacherId" = $2 LIMIT 1`, [classId, staffId]);
    return rows.length > 0;
}
async function assertTeacherSubjectAccess(req, classId, subjectId) {
    if (req.user.role !== enums_1.UserRole.TEACHER)
        return true;
    const staffId = req.user.staffId;
    if (!staffId)
        return false;
    if (await isClassTeacher(staffId, classId))
        return true;
    const rows = await data_source_1.AppDataSource.query(`SELECT 1 FROM class_subjects cs
     WHERE cs."classId" = $1 AND cs."subjectId" = $2 AND cs."teacherId" = $3
     LIMIT 1`, [classId, subjectId, staffId]);
    return rows.length > 0;
}
/** Teachers may mark attendance only for the class they are assigned as class teacher. */
async function assertTeacherClassTeacherAccess(req, classId) {
    if (req.user.role !== enums_1.UserRole.TEACHER)
        return true;
    if (!req.user.staffId)
        return false;
    const rows = await data_source_1.AppDataSource.query(`SELECT 1 FROM classes c WHERE c.id = $1 AND c."classTeacherId" = $2 LIMIT 1`, [classId, req.user.staffId]);
    return rows.length > 0;
}
