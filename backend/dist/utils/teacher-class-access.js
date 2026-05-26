"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertTeacherClassAccess = assertTeacherClassAccess;
const data_source_1 = require("../config/data-source");
const enums_1 = require("../entities/enums");
async function assertTeacherClassAccess(req, classId) {
    if (req.user.role !== enums_1.UserRole.TEACHER)
        return true;
    if (!req.user.staffId)
        return false;
    const allowed = await data_source_1.AppDataSource.query(`SELECT 1 FROM class_subjects cs WHERE cs."classId" = $1 AND cs."teacherId" = $2 LIMIT 1`, [classId, req.user.staffId]);
    return allowed.length > 0;
}
