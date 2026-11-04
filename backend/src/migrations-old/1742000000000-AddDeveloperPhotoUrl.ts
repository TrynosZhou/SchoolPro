import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDeveloperPhotoUrl1742000000000 implements MigrationInterface {
  name = 'AddDeveloperPhotoUrl1742000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "school_settings"
      ADD COLUMN IF NOT EXISTS "developerPhotoUrl" character varying
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "school_settings"
      DROP COLUMN IF EXISTS "developerPhotoUrl"
    `);
  }
}
