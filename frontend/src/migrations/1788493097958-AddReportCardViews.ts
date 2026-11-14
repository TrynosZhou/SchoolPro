import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReportCardViews1788493097958 implements MigrationInterface {
  name = 'AddReportCardViews1788493097958';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "report_card_views" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "parentId" uuid NOT NULL,
        "studentId" uuid NOT NULL,
        "termId" uuid NOT NULL,
        "examTypeId" uuid NOT NULL,
        "firstViewedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "lastViewedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "viewCount" integer NOT NULL DEFAULT 1,
        CONSTRAINT "PK_report_card_views_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_report_card_views_parent_student_term_exam" UNIQUE ("parentId", "studentId", "termId", "examTypeId"),
        CONSTRAINT "FK_report_card_views_parent" FOREIGN KEY ("parentId") REFERENCES "parents"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "FK_report_card_views_student" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "FK_report_card_views_term" FOREIGN KEY ("termId") REFERENCES "terms"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "FK_report_card_views_exam_type" FOREIGN KEY ("examTypeId") REFERENCES "exam_types"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_report_card_views_term_exam" ON "report_card_views" ("termId", "examTypeId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_report_card_views_term_exam"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "report_card_views"`);
  }
}
