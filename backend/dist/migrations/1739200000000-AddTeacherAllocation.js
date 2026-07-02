"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddTeacherAllocation1739200000000 = void 0;
class AddTeacherAllocation1739200000000 {
    constructor() {
        this.name = 'AddTeacherAllocation1739200000000';
    }
    async up(queryRunner) {
        await queryRunner.query(`
      CREATE TYPE "day_of_week_enum" AS ENUM (
        'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'
      )
    `);
        await queryRunner.query(`
      CREATE TABLE "teacher_allocations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "timetableEntryId" uuid NOT NULL,
        "teacherId" uuid NOT NULL,
        "subjectId" uuid NOT NULL,
        "classId" uuid NOT NULL,
        "dayOfWeek" "day_of_week_enum" NOT NULL,
        "startTime" character varying(8) NOT NULL,
        "endTime" character varying(8) NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_teacher_allocations" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_teacher_allocations_timetable_entry" UNIQUE ("timetableEntryId"),
        CONSTRAINT "UQ_teacher_allocations_teacher_slot" UNIQUE ("teacherId", "dayOfWeek", "startTime", "endTime"),
        CONSTRAINT "FK_teacher_allocations_timetable" FOREIGN KEY ("timetableEntryId")
          REFERENCES "timetables"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "FK_teacher_allocations_teacher" FOREIGN KEY ("teacherId")
          REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT "FK_teacher_allocations_subject" FOREIGN KEY ("subjectId")
          REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT "FK_teacher_allocations_class" FOREIGN KEY ("classId")
          REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);
        await queryRunner.query(`
      CREATE INDEX "idx_teacher_allocations_teacher" ON "teacher_allocations" ("teacherId")
    `);
        await queryRunner.query(`
      CREATE INDEX "idx_teacher_allocations_class" ON "teacher_allocations" ("classId")
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`DROP TABLE IF EXISTS "teacher_allocations"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "day_of_week_enum"`);
    }
}
exports.AddTeacherAllocation1739200000000 = AddTeacherAllocation1739200000000;
