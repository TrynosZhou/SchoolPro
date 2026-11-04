"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddAnalyticsAndReporting1740700000000 = void 0;
/**
 * Analytics & Reporting foundations:
 *  - Student lifecycle columns (status / exitDate / exitReason / updatedAt) for retention & dropout tracking.
 *  - `student_enrollments` per-academic-year snapshot table (year-over-year retention backbone).
 *  - `report_templates` saved custom-report definitions.
 *  - Backfill: mark inactive students as withdrawn, and create current-year enrollment snapshots.
 */
class AddAnalyticsAndReporting1740700000000 {
    constructor() {
        this.name = 'AddAnalyticsAndReporting1740700000000';
    }
    async up(queryRunner) {
        // 1. Student lifecycle columns.
        await queryRunner.query(`ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "status" varchar(24) NOT NULL DEFAULT 'active'`);
        await queryRunner.query(`ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "exitDate" date`);
        await queryRunner.query(`ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "exitReason" varchar(255)`);
        await queryRunner.query(`ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP NOT NULL DEFAULT now()`);
        // Backfill: inactive students that were never given a specific exit status become 'withdrawn'.
        await queryRunner.query(`UPDATE "students" SET "status" = 'withdrawn' WHERE "isActive" = false AND ("status" IS NULL OR "status" = 'active')`);
        // 2. Per-academic-year enrollment snapshots.
        await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "student_enrollments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "studentId" uuid NOT NULL,
        "schoolYearId" uuid NOT NULL,
        "formId" uuid,
        "formName" varchar(120),
        "classId" uuid,
        "className" varchar(120),
        "status" varchar(24) NOT NULL DEFAULT 'enrolled',
        "startDate" date,
        "endDate" date,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_student_enrollments" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_enrollment_student_year" UNIQUE ("studentId", "schoolYearId"),
        CONSTRAINT "FK_student_enrollments_student" FOREIGN KEY ("studentId")
          REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "FK_student_enrollments_year" FOREIGN KEY ("schoolYearId")
          REFERENCES "school_years"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_enrollment_student" ON "student_enrollments" ("studentId")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_enrollment_year" ON "student_enrollments" ("schoolYearId")`);
        // Backfill current-year enrollment snapshots for active students.
        await queryRunner.query(`
      INSERT INTO "student_enrollments"
        ("studentId", "schoolYearId", "formId", "formName", "classId", "className", "status", "startDate")
      SELECT
        s."id",
        sy."id",
        s."formId",
        f."name",
        s."classId",
        c."name",
        'enrolled',
        s."enrollmentDate"
      FROM "students" s
      CROSS JOIN LATERAL (
        SELECT y."id" FROM "school_years" y
        ORDER BY y."isCurrent" DESC, y."startDate" DESC
        LIMIT 1
      ) sy
      LEFT JOIN "forms" f ON f."id" = s."formId"
      LEFT JOIN "classes" c ON c."id" = s."classId"
      WHERE s."isActive" = true
      ON CONFLICT ("studentId", "schoolYearId") DO NOTHING
    `);
        // 3. Saved report templates.
        await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "report_templates" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" varchar(120) NOT NULL,
        "description" text,
        "config" jsonb NOT NULL,
        "createdById" uuid,
        "createdByName" varchar(160),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_report_templates" PRIMARY KEY ("id")
      )
    `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_report_templates_name" ON "report_templates" ("name")`);
    }
    async down(queryRunner) {
        await queryRunner.query(`DROP TABLE IF EXISTS "report_templates"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "student_enrollments"`);
        await queryRunner.query(`ALTER TABLE "students" DROP COLUMN IF EXISTS "updatedAt"`);
        await queryRunner.query(`ALTER TABLE "students" DROP COLUMN IF EXISTS "exitReason"`);
        await queryRunner.query(`ALTER TABLE "students" DROP COLUMN IF EXISTS "exitDate"`);
        await queryRunner.query(`ALTER TABLE "students" DROP COLUMN IF EXISTS "status"`);
    }
}
exports.AddAnalyticsAndReporting1740700000000 = AddAnalyticsAndReporting1740700000000;
