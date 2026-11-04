"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddStudentIdPrefix1741800000000 = void 0;
class AddStudentIdPrefix1741800000000 {
    constructor() {
        this.name = 'AddStudentIdPrefix1741800000000';
    }
    async up(queryRunner) {
        await queryRunner.query(`
      ALTER TABLE "school_settings"
      ADD COLUMN IF NOT EXISTS "studentIdPrefix" character varying(8) NOT NULL DEFAULT 'SP'
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`
      ALTER TABLE "school_settings"
      DROP COLUMN IF EXISTS "studentIdPrefix"
    `);
    }
}
exports.AddStudentIdPrefix1741800000000 = AddStudentIdPrefix1741800000000;
