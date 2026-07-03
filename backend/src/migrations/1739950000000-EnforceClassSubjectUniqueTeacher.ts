import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnforceClassSubjectUniqueTeacher1739950000000 implements MigrationInterface {
  name = 'EnforceClassSubjectUniqueTeacher1739950000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_class_subject_class_subject"
      ON "class_subjects" ("classId", "subjectId")
    `);

    // Retain the earliest row when duplicate class/subject pairs exist.
    await queryRunner.query(`
      DELETE FROM "class_subjects" a
      USING "class_subjects" b
      WHERE a."classId" = b."classId"
        AND a."subjectId" = b."subjectId"
        AND a.id > b.id
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_class_subject_class_subject"`);
  }
}
