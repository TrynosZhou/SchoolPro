import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReportCardConductRatings1741000000000 implements MigrationInterface {
  name = 'AddReportCardConductRatings1741000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "report_cards"
      ADD COLUMN IF NOT EXISTS "behaviorRating" character varying(32),
      ADD COLUMN IF NOT EXISTS "attitudeRating" character varying(32)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "report_cards"
      DROP COLUMN IF EXISTS "behaviorRating",
      DROP COLUMN IF EXISTS "attitudeRating"
    `);
  }
}
