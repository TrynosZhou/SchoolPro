"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddStaffGender1740300000000 = void 0;
class AddStaffGender1740300000000 {
    constructor() {
        this.name = 'AddStaffGender1740300000000';
    }
    async up(queryRunner) {
        await queryRunner.query(`
      ALTER TABLE "staff"
      ADD COLUMN IF NOT EXISTS "gender" character varying(16)
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`
      ALTER TABLE "staff" DROP COLUMN IF EXISTS "gender"
    `);
    }
}
exports.AddStaffGender1740300000000 = AddStaffGender1740300000000;
