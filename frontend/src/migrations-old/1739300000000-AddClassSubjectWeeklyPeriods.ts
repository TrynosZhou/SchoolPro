import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddClassSubjectWeeklyPeriods1739300000000 implements MigrationInterface {
  name = 'AddClassSubjectWeeklyPeriods1739300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "class_subjects"
      ADD COLUMN IF NOT EXISTS "weeklyPeriods" integer NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "class_subjects" DROP COLUMN IF EXISTS "weeklyPeriods"
    `);
  }
}
