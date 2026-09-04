import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUniqueTeacherClassAssignment1740100000000 implements MigrationInterface {
  name = 'AddUniqueTeacherClassAssignment1740100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Keep the newest active row per teacher + class; end older duplicates.
    await queryRunner.query(`
      WITH ranked AS (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY "teacherId", "classId"
            ORDER BY "createdAt" DESC, id DESC
          ) AS rn
        FROM "teacher_assignments"
        WHERE "isActive" = true AND "endDate" IS NULL
      )
      UPDATE "teacher_assignments" ta
      SET "isActive" = false, "endDate" = CURRENT_DATE
      FROM ranked r
      WHERE ta.id = r.id AND r.rn > 1
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_active_teacher_per_class"
      ON "teacher_assignments" ("teacherId", "classId")
      WHERE "isActive" = true AND "endDate" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_active_teacher_per_class"`);
  }
}
