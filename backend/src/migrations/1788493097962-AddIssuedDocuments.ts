import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIssuedDocuments1788493097962 implements MigrationInterface {
  name = 'AddIssuedDocuments1788493097962';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "issued_documents" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "type" character varying(32) NOT NULL,
        "title" character varying(200) NOT NULL,
        "body" text NOT NULL,
        "referenceCode" character varying(32) NOT NULL,
        "studentId" uuid,
        "studentName" character varying(200),
        "recipientName" character varying(200),
        "issuedByName" character varying(200),
        "issuedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_issued_documents_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_issued_documents_reference" UNIQUE ("referenceCode"),
        CONSTRAINT "FK_issued_documents_student" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "issued_documents"`);
  }
}
