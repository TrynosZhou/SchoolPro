import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentIntents1788493097959 implements MigrationInterface {
  name = 'AddPaymentIntents1788493097959';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "payment_intents" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "reference" character varying NOT NULL,
        "studentId" uuid NOT NULL,
        "invoiceId" uuid,
        "amount" numeric(12,2) NOT NULL,
        "method" character varying(16) NOT NULL,
        "status" character varying(16) NOT NULL DEFAULT 'pending',
        "paynowReference" character varying,
        "pollUrl" text,
        "browserUrl" text,
        "createdById" uuid,
        "paymentId" uuid,
        "payload" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_payment_intents_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_payment_intents_reference" UNIQUE ("reference"),
        CONSTRAINT "FK_payment_intents_student" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "FK_payment_intents_invoice" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE,
        CONSTRAINT "FK_payment_intents_user" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
      )`,
    );
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_payment_intents_student" ON "payment_intents" ("studentId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_payment_intents_status" ON "payment_intents" ("status")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_payment_intents_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_payment_intents_student"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "payment_intents"`);
  }
}
