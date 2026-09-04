import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSubjectShort1739600000000 implements MigrationInterface {
  name = 'AddSubjectShort1739600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "subjects"
      ADD COLUMN IF NOT EXISTS "short" character varying(16)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "subjects" DROP COLUMN IF EXISTS "short"
    `);
  }
}
