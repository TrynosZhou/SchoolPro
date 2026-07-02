"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddStaffTitle1739800000000 = void 0;
class AddStaffTitle1739800000000 {
    constructor() {
        this.name = 'AddStaffTitle1739800000000';
    }
    async up(queryRunner) {
        await queryRunner.query(`
      ALTER TABLE "staff"
      ADD COLUMN IF NOT EXISTS "title" character varying(16)
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`
      ALTER TABLE "staff" DROP COLUMN IF EXISTS "title"
    `);
    }
}
exports.AddStaffTitle1739800000000 = AddStaffTitle1739800000000;
