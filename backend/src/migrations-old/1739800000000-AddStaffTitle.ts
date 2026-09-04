import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStaffTitle1739800000000 implements MigrationInterface {
  name = 'AddStaffTitle1739800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "staff"
      ADD COLUMN IF NOT EXISTS "title" character varying(16)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "staff" DROP COLUMN IF EXISTS "title"
    `);
  }
}
