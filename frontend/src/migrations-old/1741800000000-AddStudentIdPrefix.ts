import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStudentIdPrefix1741800000000 implements MigrationInterface {
  name = 'AddStudentIdPrefix1741800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "school_settings"
      ADD COLUMN IF NOT EXISTS "studentIdPrefix" character varying(8) NOT NULL DEFAULT 'SP'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "school_settings"
      DROP COLUMN IF EXISTS "studentIdPrefix"
    `);
  }
}
