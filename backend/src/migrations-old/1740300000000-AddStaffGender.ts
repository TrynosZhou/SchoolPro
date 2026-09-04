import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStaffGender1740300000000 implements MigrationInterface {
  name = 'AddStaffGender1740300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "staff"
      ADD COLUMN IF NOT EXISTS "gender" character varying(16)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "staff" DROP COLUMN IF EXISTS "gender"
    `);
  }
}
