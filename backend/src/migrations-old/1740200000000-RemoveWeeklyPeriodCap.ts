import { MigrationInterface, QueryRunner } from 'typeorm';

/** 0 = no weekly period cap; teachers may exceed former default of 30. */
export class RemoveWeeklyPeriodCap1740200000000 implements MigrationInterface {
  name = 'RemoveWeeklyPeriodCap1740200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
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

  public async down(queryRunner: QueryRunner): Promise<void> {
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
