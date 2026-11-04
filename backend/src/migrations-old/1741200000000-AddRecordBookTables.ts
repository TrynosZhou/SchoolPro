import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRecordBookTables1741200000000 implements MigrationInterface {
  name = 'AddRecordBookTables1741200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "record_book_marks"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "record_book_columns"`);

    await queryRunner.query(`
      CREATE TABLE "record_book_columns" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "termId" uuid NOT NULL,
        "classId" uuid NOT NULL,
        "ownerKey" character varying NOT NULL,
        "columnKey" character varying NOT NULL,
        "label" character varying NOT NULL,
        "sortOrder" integer NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_record_book_columns" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_record_book_columns_scope_key" UNIQUE ("termId", "classId", "ownerKey", "columnKey"),
        CONSTRAINT "FK_record_book_columns_term" FOREIGN KEY ("termId") REFERENCES "terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT "FK_record_book_columns_class" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "record_book_marks" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "termId" uuid NOT NULL,
        "classId" uuid NOT NULL,
        "ownerKey" character varying NOT NULL,
        "studentId" uuid NOT NULL,
        "columnKey" character varying NOT NULL,
        "marks" numeric(6,2) NOT NULL,
        "enteredById" uuid,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_record_book_marks" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_record_book_marks_cell" UNIQUE ("termId", "classId", "ownerKey", "studentId", "columnKey"),
        CONSTRAINT "FK_record_book_marks_term" FOREIGN KEY ("termId") REFERENCES "terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT "FK_record_book_marks_class" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "FK_record_book_marks_student" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "FK_record_book_marks_entered_by" FOREIGN KEY ("enteredById") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "record_book_marks"`);
    await queryRunner.query(`DROP TABLE "record_book_columns"`);
  }
}
