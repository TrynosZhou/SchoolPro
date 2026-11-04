import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTimetableSlotLocked1739500000000 implements MigrationInterface {
  name = 'AddTimetableSlotLocked1739500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "timetables"
      ADD COLUMN IF NOT EXISTS "isLocked" boolean NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "timetables" DROP COLUMN IF EXISTS "isLocked"
    `);
  }
}
