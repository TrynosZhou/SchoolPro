import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserPersonalDetails1795100000001 implements MigrationInterface {
  name = 'AddUserPersonalDetails1795100000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "gender" character varying(16)`);
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "maritalStatus" character varying(16)`);
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "usesMaidenName" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "salutation" character varying(16)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const c of ['salutation', 'usesMaidenName', 'maritalStatus', 'gender']) {
      await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "${c}"`);
    }
  }
}
