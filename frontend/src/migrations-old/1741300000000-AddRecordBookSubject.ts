import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRecordBookSubject1741300000000 implements MigrationInterface {
  name = 'AddRecordBookSubject1741300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "record_book_marks"`);
    await queryRunner.query(`DELETE FROM "record_book_columns"`);

    await queryRunner.query(`ALTER TABLE "record_book_columns" DROP CONSTRAINT IF EXISTS "UQ_record_book_columns_scope_key"`);
    await queryRunner.query(`ALTER TABLE "record_book_marks" DROP CONSTRAINT IF EXISTS "UQ_record_book_marks_cell"`);

    await queryRunner.query(`ALTER TABLE "record_book_columns" ADD COLUMN "subjectId" uuid`);
    await queryRunner.query(`ALTER TABLE "record_book_marks" ADD COLUMN "subjectId" uuid`);

    await queryRunner.query(`
      ALTER TABLE "record_book_columns"
      ADD CONSTRAINT "FK_record_book_columns_subject"
      FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "record_book_marks"
      ADD CONSTRAINT "FK_record_book_marks_subject"
      FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE
    `);

    await queryRunner.query(`ALTER TABLE "record_book_columns" ALTER COLUMN "subjectId" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "record_book_marks" ALTER COLUMN "subjectId" SET NOT NULL`);

    await queryRunner.query(`
      ALTER TABLE "record_book_columns"
      ADD CONSTRAINT "UQ_record_book_columns_scope_key"
      UNIQUE ("termId", "classId", "ownerKey", "subjectId", "columnKey")
    `);
    await queryRunner.query(`
      ALTER TABLE "record_book_marks"
      ADD CONSTRAINT "UQ_record_book_marks_cell"
      UNIQUE ("termId", "classId", "ownerKey", "subjectId", "studentId", "columnKey")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "record_book_marks" DROP CONSTRAINT IF EXISTS "UQ_record_book_marks_cell"`);
    await queryRunner.query(`ALTER TABLE "record_book_columns" DROP CONSTRAINT IF EXISTS "UQ_record_book_columns_scope_key"`);
    await queryRunner.query(`ALTER TABLE "record_book_marks" DROP CONSTRAINT IF EXISTS "FK_record_book_marks_subject"`);
    await queryRunner.query(`ALTER TABLE "record_book_columns" DROP CONSTRAINT IF EXISTS "FK_record_book_columns_subject"`);
    await queryRunner.query(`ALTER TABLE "record_book_marks" DROP COLUMN "subjectId"`);
    await queryRunner.query(`ALTER TABLE "record_book_columns" DROP COLUMN "subjectId"`);
    await queryRunner.query(`
      ALTER TABLE "record_book_columns"
      ADD CONSTRAINT "UQ_record_book_columns_scope_key"
      UNIQUE ("termId", "classId", "ownerKey", "columnKey")
    `);
    await queryRunner.query(`
      ALTER TABLE "record_book_marks"
      ADD CONSTRAINT "UQ_record_book_marks_cell"
      UNIQUE ("termId", "classId", "ownerKey", "studentId", "columnKey")
    `);
  }
}
