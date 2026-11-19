import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMaritalStatus1795100000000 implements MigrationInterface {
  name = 'AddMaritalStatus1795100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['staff', 'parents']) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "maritalStatus" character varying(16)`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "usesMaidenName" boolean NOT NULL DEFAULT false`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['staff', 'parents']) {
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "usesMaidenName"`);
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "maritalStatus"`);
    }
  }
}
