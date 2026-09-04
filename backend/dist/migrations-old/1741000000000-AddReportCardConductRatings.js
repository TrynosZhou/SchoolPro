"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddReportCardConductRatings1741000000000 = void 0;
class AddReportCardConductRatings1741000000000 {
    constructor() {
        this.name = 'AddReportCardConductRatings1741000000000';
    }
    async up(queryRunner) {
        await queryRunner.query(`
      ALTER TABLE "report_cards"
      ADD COLUMN IF NOT EXISTS "behaviorRating" character varying(32),
      ADD COLUMN IF NOT EXISTS "attitudeRating" character varying(32)
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`
      ALTER TABLE "report_cards"
      DROP COLUMN IF EXISTS "behaviorRating",
      DROP COLUMN IF EXISTS "attitudeRating"
    `);
    }
}
exports.AddReportCardConductRatings1741000000000 = AddReportCardConductRatings1741000000000;
