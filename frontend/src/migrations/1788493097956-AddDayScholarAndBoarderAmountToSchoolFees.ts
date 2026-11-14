import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDayScholarAndBoarderAmountToSchoolFees1788493097956 implements MigrationInterface {
  name = 'AddDayScholarAndBoarderAmountToSchoolFees1788493097956';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "school_fees" ADD COLUMN IF NOT EXISTS "dayScholarAmount" numeric(12,2) DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "school_fees" ADD COLUMN IF NOT EXISTS "boarderAmount" numeric(12,2) DEFAULT '0'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "school_fees" DROP COLUMN IF EXISTS "boarderAmount"`);
    await queryRunner.query(`ALTER TABLE "school_fees" DROP COLUMN IF EXISTS "dayScholarAmount"`);
  }
}
