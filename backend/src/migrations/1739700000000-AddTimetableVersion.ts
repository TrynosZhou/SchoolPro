import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTimetableVersion1739700000000 implements MigrationInterface {
  name = 'AddTimetableVersion1739700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "school_settings"
      ADD COLUMN IF NOT EXISTS "timetableVersion" character varying(32) NOT NULL DEFAULT '1'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "school_settings" DROP COLUMN IF EXISTS "timetableVersion"
    `);
  }
}
