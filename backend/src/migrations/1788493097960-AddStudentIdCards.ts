import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStudentIdCards1788493097960 implements MigrationInterface {
  name = 'AddStudentIdCards1788493097960';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "student_id_cards" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "studentId" uuid NOT NULL,
        "code" character varying(32) NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_student_id_cards_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_student_id_cards_student" UNIQUE ("studentId"),
        CONSTRAINT "UQ_student_id_cards_code" UNIQUE ("code"),
        CONSTRAINT "FK_student_id_cards_student" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "student_id_cards"`);
  }
}
