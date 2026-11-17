import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTwoFactorAuth1788493097960 implements MigrationInterface {
  name = 'AddTwoFactorAuth1788493097960';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "twoFactorEnabled" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "twoFactorSecret" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "twoFactorPendingSecret" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "twoFactorBackupCodes" jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "twoFactorEnabledAt" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "twoFactorEnabledAt"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "twoFactorBackupCodes"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "twoFactorPendingSecret"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "twoFactorSecret"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "twoFactorEnabled"`);
  }
}
