"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DropTeacherAllocationTeacherSlotUnique1740400000000 = void 0;
/**
 * Allow a teacher to be allocated to two or more classes in the same period
 * (timetable "Ignore conflicts" double-booking). Removes the unique constraint
 * that previously blocked overlapping teacher allocations.
 */
class DropTeacherAllocationTeacherSlotUnique1740400000000 {
    constructor() {
        this.name = 'DropTeacherAllocationTeacherSlotUnique1740400000000';
    }
    async up(queryRunner) {
        await queryRunner.query(`
      ALTER TABLE "teacher_allocations"
      DROP CONSTRAINT IF EXISTS "UQ_teacher_allocations_teacher_slot"
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`
      ALTER TABLE "teacher_allocations"
      ADD CONSTRAINT "UQ_teacher_allocations_teacher_slot"
      UNIQUE ("teacherId", "dayOfWeek", "startTime", "endTime")
    `);
    }
}
exports.DropTeacherAllocationTeacherSlotUnique1740400000000 = DropTeacherAllocationTeacherSlotUnique1740400000000;
