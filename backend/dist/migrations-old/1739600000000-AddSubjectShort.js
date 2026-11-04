"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddSubjectShort1739600000000 = void 0;
class AddSubjectShort1739600000000 {
    constructor() {
        this.name = 'AddSubjectShort1739600000000';
    }
    async up(queryRunner) {
        await queryRunner.query(`
      ALTER TABLE "subjects"
      ADD COLUMN IF NOT EXISTS "short" character varying(16)
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`
      ALTER TABLE "subjects" DROP COLUMN IF EXISTS "short"
    `);
    }
}
exports.AddSubjectShort1739600000000 = AddSubjectShort1739600000000;
