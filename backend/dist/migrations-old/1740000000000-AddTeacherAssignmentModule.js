"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddTeacherAssignmentModule1740000000000 = void 0;
class AddTeacherAssignmentModule1740000000000 {
    constructor() {
        this.name = 'AddTeacherAssignmentModule1740000000000';
    }
    async up(queryRunner) {
        await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "sections" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" varchar NOT NULL,
        "code" varchar,
        "formId" uuid NOT NULL REFERENCES "forms"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        "isActive" boolean NOT NULL DEFAULT true
      )
    `);
        await queryRunner.query(`
      ALTER TABLE "classes"
      ADD COLUMN IF NOT EXISTS "sectionId" uuid REFERENCES "sections"("id") ON DELETE SET NULL ON UPDATE CASCADE
    `);
        await queryRunner.query(`
      ALTER TABLE "staff"
      ADD COLUMN IF NOT EXISTS "maxWeeklyPeriods" int
    `);
        await queryRunner.query(`
      ALTER TABLE "school_settings"
      ADD COLUMN IF NOT EXISTS "minWeeklyPeriods" int NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "maxWeeklyPeriods" int NOT NULL DEFAULT 30
    `);
        await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "teacher_assignment_role_enum" AS ENUM ('class_teacher', 'subject_teacher');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
        await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "teacher_assignments" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "teacherId" uuid NOT NULL REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        "classId" uuid NOT NULL REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        "sectionId" uuid REFERENCES "sections"("id") ON DELETE SET NULL ON UPDATE CASCADE,
        "subjectId" uuid REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE,
        "role" "teacher_assignment_role_enum" NOT NULL,
        "startDate" date NOT NULL DEFAULT CURRENT_DATE,
        "endDate" date,
        "isActive" boolean NOT NULL DEFAULT true,
        "weeklyPeriods" int NOT NULL DEFAULT 0,
        "lessonLength" varchar(16) NOT NULL DEFAULT 'single',
        "isSharedSplit" boolean NOT NULL DEFAULT false,
        "notes" text,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
        await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_active_class_teacher_per_class"
      ON "teacher_assignments" ("classId")
      WHERE "role" = 'class_teacher' AND "isActive" = true AND "endDate" IS NULL
    `);
        await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_active_subject_teacher_per_class_subject"
      ON "teacher_assignments" ("classId", "subjectId")
      WHERE "role" = 'subject_teacher' AND "isActive" = true AND "endDate" IS NULL AND "isSharedSplit" = false
    `);
        await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "timetable_slots" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "teacherAssignmentId" uuid NOT NULL REFERENCES "teacher_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        "timetableEntryId" uuid REFERENCES "timetables"("id") ON DELETE SET NULL ON UPDATE CASCADE,
        "dayOfWeek" varchar(16) NOT NULL,
        "periodNumber" int NOT NULL,
        "startTime" varchar(8) NOT NULL,
        "endTime" varchar(8) NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
        await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_timetable_slots_assignment"
      ON "timetable_slots" ("teacherAssignmentId")
    `);
        // Backfill homeroom assignments from classes.classTeacherId
        await queryRunner.query(`
      INSERT INTO "teacher_assignments" (
        "teacherId", "classId", "sectionId", "subjectId", "role",
        "startDate", "isActive", "weeklyPeriods", "lessonLength"
      )
      SELECT
        c."classTeacherId",
        c.id,
        c."sectionId",
        NULL,
        'class_teacher',
        CURRENT_DATE,
        true,
        0,
        'single'
      FROM "classes" c
      WHERE c."classTeacherId" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM "teacher_assignments" ta
          WHERE ta."classId" = c.id
            AND ta."role" = 'class_teacher'
            AND ta."isActive" = true
            AND ta."endDate" IS NULL
        )
    `);
        // Backfill subject teacher assignments from class_subjects
        await queryRunner.query(`
      INSERT INTO "teacher_assignments" (
        "teacherId", "classId", "sectionId", "subjectId", "role",
        "startDate", "isActive", "weeklyPeriods", "lessonLength"
      )
      SELECT
        cs."teacherId",
        cs."classId",
        c."sectionId",
        cs."subjectId",
        'subject_teacher',
        CURRENT_DATE,
        true,
        COALESCE(cs."weeklyPeriods", 0),
        COALESCE(cs."lessonLength", 'single')
      FROM "class_subjects" cs
      INNER JOIN "classes" c ON c.id = cs."classId"
      WHERE cs."teacherId" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM "teacher_assignments" ta
          WHERE ta."classId" = cs."classId"
            AND ta."subjectId" = cs."subjectId"
            AND ta."role" = 'subject_teacher'
            AND ta."isActive" = true
            AND ta."endDate" IS NULL
        )
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`DROP TABLE IF EXISTS "timetable_slots"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "teacher_assignments"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "teacher_assignment_role_enum"`);
        await queryRunner.query(`ALTER TABLE "classes" DROP COLUMN IF EXISTS "sectionId"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "sections"`);
        await queryRunner.query(`ALTER TABLE "staff" DROP COLUMN IF EXISTS "maxWeeklyPeriods"`);
        await queryRunner.query(`
      ALTER TABLE "school_settings"
      DROP COLUMN IF EXISTS "minWeeklyPeriods",
      DROP COLUMN IF EXISTS "maxWeeklyPeriods"
    `);
    }
}
exports.AddTeacherAssignmentModule1740000000000 = AddTeacherAssignmentModule1740000000000;
