import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddClassSubjectLessonLength1739400000000 implements MigrationInterface {
  name = 'AddClassSubjectLessonLength1739400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "class_subjects"
      ADD COLUMN IF NOT EXISTS "lessonLength" character varying(16) NOT NULL DEFAULT 'single'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "class_subjects" DROP COLUMN IF EXISTS "lessonLength"
    `);
  }
}
