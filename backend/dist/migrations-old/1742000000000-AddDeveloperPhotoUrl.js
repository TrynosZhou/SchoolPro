"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddDeveloperPhotoUrl1742000000000 = void 0;
class AddDeveloperPhotoUrl1742000000000 {
    constructor() {
        this.name = 'AddDeveloperPhotoUrl1742000000000';
    }
    async up(queryRunner) {
        await queryRunner.query(`
      ALTER TABLE "school_settings"
      ADD COLUMN IF NOT EXISTS "developerPhotoUrl" character varying
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`
      ALTER TABLE "school_settings"
      DROP COLUMN IF EXISTS "developerPhotoUrl"
    `);
    }
}
exports.AddDeveloperPhotoUrl1742000000000 = AddDeveloperPhotoUrl1742000000000;
