import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The issued_documents table on some databases was created without defaults, so inserts fail with
 * "null value in column issuedAt violates not-null constraint". This sets a default timestamp and
 * allows the optional columns to be empty. Safe to run more than once.
 */
export class FixIssuedDocumentDefaults1788493097964 implements MigrationInterface {
  name = 'FixIssuedDocumentDefaults1788493097964';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE "issued_documents" SET "issuedAt" = now() WHERE "issuedAt" IS NULL`);
    await queryRunner.query(`ALTER TABLE "issued_documents" ALTER COLUMN "issuedAt" SET DEFAULT now()`);
    await queryRunner.query(`ALTER TABLE "issued_documents" ALTER COLUMN "issuedAt" SET NOT NULL`);
    for (const column of ['studentId', 'studentName', 'recipientName', 'issuedByName']) {
      await queryRunner.query(`ALTER TABLE "issued_documents" ALTER COLUMN "${column}" DROP NOT NULL`);
    }
  }

  public async down(): Promise<void> {
    // Intentionally empty: restoring NOT NULL could fail on existing data.
  }
}
