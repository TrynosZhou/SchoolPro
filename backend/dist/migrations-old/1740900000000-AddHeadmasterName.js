"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddHeadmasterName1740900000000 = void 0;
class AddHeadmasterName1740900000000 {
    constructor() {
        this.name = 'AddHeadmasterName1740900000000';
    }
    async up(queryRunner) {
        await queryRunner.query(`
      ALTER TABLE "school_settings"
      ADD COLUMN IF NOT EXISTS "headmasterName" character varying
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`
      ALTER TABLE "school_settings" DROP COLUMN IF EXISTS "headmasterName"
    `);
    }
}
exports.AddHeadmasterName1740900000000 = AddHeadmasterName1740900000000;
