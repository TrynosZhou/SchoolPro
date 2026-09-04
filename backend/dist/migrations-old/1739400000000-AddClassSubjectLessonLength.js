"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddClassSubjectLessonLength1739400000000 = void 0;
class AddClassSubjectLessonLength1739400000000 {
    constructor() {
        this.name = 'AddClassSubjectLessonLength1739400000000';
    }
    async up(queryRunner) {
        await queryRunner.query(`
      ALTER TABLE "class_subjects"
      ADD COLUMN IF NOT EXISTS "lessonLength" character varying(16) NOT NULL DEFAULT 'single'
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`
      ALTER TABLE "class_subjects" DROP COLUMN IF EXISTS "lessonLength"
    `);
    }
}
exports.AddClassSubjectLessonLength1739400000000 = AddClassSubjectLessonLength1739400000000;
