import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWhatsAppNotificationSchema1741700000000 implements MigrationInterface {
  name = 'AddWhatsAppNotificationSchema1741700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "guardians"
      ADD COLUMN IF NOT EXISTS "guardianPhone" varchar(32)
    `);
    await queryRunner.query(`
      ALTER TABLE "guardians"
      ADD COLUMN IF NOT EXISTS "guardianWhatsappConsent" boolean NOT NULL DEFAULT false
    `);

    // Backfill guardianPhone from the legacy phone column where not yet set.
    await queryRunner.query(`
      UPDATE "guardians"
      SET "guardianPhone" = "phone"
      WHERE "guardianPhone" IS NULL AND "phone" IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "notification_logs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "studentId" uuid NOT NULL,
        "examId" uuid NOT NULL,
        "phone" varchar(32) NOT NULL,
        "messageSid" varchar(64),
        "status" varchar(24) NOT NULL DEFAULT 'queued',
        "errorMessage" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notification_logs" PRIMARY KEY ("id"),
        CONSTRAINT "FK_notification_logs_student" FOREIGN KEY ("studentId")
          REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "FK_notification_logs_exam" FOREIGN KEY ("examId")
          REFERENCES "exam_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_notification_logs_studentId"
      ON "notification_logs" ("studentId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_notification_logs_examId"
      ON "notification_logs" ("examId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_notification_logs_messageSid"
      ON "notification_logs" ("messageSid")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "notification_logs"`);
    await queryRunner.query(`
      ALTER TABLE "guardians" DROP COLUMN IF EXISTS "guardianWhatsappConsent"
    `);
    await queryRunner.query(`
      ALTER TABLE "guardians" DROP COLUMN IF EXISTS "guardianPhone"
    `);
  }
}
