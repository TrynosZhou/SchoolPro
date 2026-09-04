"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RemoveWeeklyPeriodCap1740200000000 = void 0;
/** 0 = no weekly period cap; teachers may exceed former default of 30. */
class RemoveWeeklyPeriodCap1740200000000 {
    constructor() {
        this.name = 'RemoveWeeklyPeriodCap1740200000000';
    }
    async up(queryRunner) {
        await queryRunner.query(`
      ALTER TABLE "school_settings"
      ALTER COLUMN "maxWeeklyPeriods" SET DEFAULT 0
    `);
        await queryRunner.query(`
      UPDATE "school_settings"
      SET "maxWeeklyPeriods" = 0
      WHERE "maxWeeklyPeriods" = 30
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`
      ALTER TABLE "school_settings"
      ALTER COLUMN "maxWeeklyPeriods" SET DEFAULT 30
    `);
        await queryRunner.query(`
      UPDATE "school_settings"
      SET "maxWeeklyPeriods" = 30
      WHERE "maxWeeklyPeriods" = 0
    `);
    }
}
exports.RemoveWeeklyPeriodCap1740200000000 = RemoveWeeklyPeriodCap1740200000000;
