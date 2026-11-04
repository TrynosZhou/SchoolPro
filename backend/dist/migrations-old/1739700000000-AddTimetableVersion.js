"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddTimetableVersion1739700000000 = void 0;
class AddTimetableVersion1739700000000 {
    constructor() {
        this.name = 'AddTimetableVersion1739700000000';
    }
    async up(queryRunner) {
        await queryRunner.query(`
      ALTER TABLE "school_settings"
      ADD COLUMN IF NOT EXISTS "timetableVersion" character varying(32) NOT NULL DEFAULT '1'
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`
      ALTER TABLE "school_settings" DROP COLUMN IF EXISTS "timetableVersion"
    `);
    }
}
exports.AddTimetableVersion1739700000000 = AddTimetableVersion1739700000000;
