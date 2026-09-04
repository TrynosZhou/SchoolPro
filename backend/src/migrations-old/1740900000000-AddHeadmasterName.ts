import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHeadmasterName1740900000000 implements MigrationInterface {
  name = 'AddHeadmasterName1740900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "school_settings"
      ADD COLUMN IF NOT EXISTS "headmasterName" character varying
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "school_settings" DROP COLUMN IF EXISTS "headmasterName"
    `);
  }
}
