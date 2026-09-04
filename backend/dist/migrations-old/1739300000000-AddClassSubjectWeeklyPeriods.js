"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddClassSubjectWeeklyPeriods1739300000000 = void 0;
class AddClassSubjectWeeklyPeriods1739300000000 {
    constructor() {
        this.name = 'AddClassSubjectWeeklyPeriods1739300000000';
    }
    async up(queryRunner) {
        await queryRunner.query(`
      ALTER TABLE "class_subjects"
      ADD COLUMN IF NOT EXISTS "weeklyPeriods" integer NOT NULL DEFAULT 0
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`
      ALTER TABLE "class_subjects" DROP COLUMN IF EXISTS "weeklyPeriods"
    `);
    }
}
exports.AddClassSubjectWeeklyPeriods1739300000000 = AddClassSubjectWeeklyPeriods1739300000000;
