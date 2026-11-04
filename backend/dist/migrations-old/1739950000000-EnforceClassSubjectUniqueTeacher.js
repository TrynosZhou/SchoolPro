"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnforceClassSubjectUniqueTeacher1739950000000 = void 0;
class EnforceClassSubjectUniqueTeacher1739950000000 {
    constructor() {
        this.name = 'EnforceClassSubjectUniqueTeacher1739950000000';
    }
    async up(queryRunner) {
        await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_class_subject_class_subject"
      ON "class_subjects" ("classId", "subjectId")
    `);
        // Retain the earliest row when duplicate class/subject pairs exist.
        await queryRunner.query(`
      DELETE FROM "class_subjects" a
      USING "class_subjects" b
      WHERE a."classId" = b."classId"
        AND a."subjectId" = b."subjectId"
        AND a.id > b.id
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`DROP INDEX IF EXISTS "uq_class_subject_class_subject"`);
    }
}
exports.EnforceClassSubjectUniqueTeacher1739950000000 = EnforceClassSubjectUniqueTeacher1739950000000;
