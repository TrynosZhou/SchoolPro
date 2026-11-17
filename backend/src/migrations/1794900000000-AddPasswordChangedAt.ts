import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPasswordChangedAt1794900000000 implements MigrationInterface {
  name = 'AddPasswordChangedAt1794900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "passwordChangedAt" TIMESTAMP WITH TIME ZONE`,
    );
    // Treat the account creation time as the initial password time so existing
    // users are not forced to change their passwords when expiry is switched on.
    await queryRunner.query(
      `UPDATE "users" SET "passwordChangedAt" = "createdAt" WHERE "passwordChangedAt" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "passwordChangedAt"`);
  }
}
