import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Brings the issued_documents table up to date with the IssuedDocument entity.
 * Safe to run on a table that already exists: each column is added only if it is missing.
 */
export class EnsureIssuedDocumentColumns1788493097963 implements MigrationInterface {
  name = 'EnsureIssuedDocumentColumns1788493097963';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "issued_documents" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "issuedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_issued_documents_id" PRIMARY KEY ("id")
      )`);
    await queryRunner.query(`ALTER TABLE "issued_documents" ADD COLUMN IF NOT EXISTS "type" character varying(32)`);
    await queryRunner.query(`ALTER TABLE "issued_documents" ADD COLUMN IF NOT EXISTS "title" character varying(200)`);
    await queryRunner.query(`ALTER TABLE "issued_documents" ADD COLUMN IF NOT EXISTS "body" text`);
    await queryRunner.query(`ALTER TABLE "issued_documents" ADD COLUMN IF NOT EXISTS "referenceCode" character varying(32)`);
    await queryRunner.query(`ALTER TABLE "issued_documents" ADD COLUMN IF NOT EXISTS "studentId" uuid`);
    await queryRunner.query(`ALTER TABLE "issued_documents" ADD COLUMN IF NOT EXISTS "studentName" character varying(200)`);
    await queryRunner.query(`ALTER TABLE "issued_documents" ADD COLUMN IF NOT EXISTS "recipientName" character varying(200)`);
    await queryRunner.query(`ALTER TABLE "issued_documents" ADD COLUMN IF NOT EXISTS "issuedByName" character varying(200)`);
    await queryRunner.query(`ALTER TABLE "issued_documents" ADD COLUMN IF NOT EXISTS "issuedAt" TIMESTAMP NOT NULL DEFAULT now()`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_issued_documents_reference" ON "issued_documents" ("referenceCode")`,
    );
  }

  public async down(): Promise<void> {
    // Intentionally empty: dropping columns would delete issued documents.
  }
}
