import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Allow a teacher to be allocated to two or more classes in the same period
 * (timetable "Ignore conflicts" double-booking). Removes the unique constraint
 * that previously blocked overlapping teacher allocations.
 */
export class DropTeacherAllocationTeacherSlotUnique1740400000000
  implements MigrationInterface
{
  name = 'DropTeacherAllocationTeacherSlotUnique1740400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "teacher_allocations"
      DROP CONSTRAINT IF EXISTS "UQ_teacher_allocations_teacher_slot"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "teacher_allocations"
      ADD CONSTRAINT "UQ_teacher_allocations_teacher_slot"
      UNIQUE ("teacherId", "dayOfWeek", "startTime", "endTime")
    `);
  }
}
