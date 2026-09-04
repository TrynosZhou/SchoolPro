"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddCommunicationFeatures1740600000000 = void 0;
class AddCommunicationFeatures1740600000000 {
    constructor() {
        this.name = 'AddCommunicationFeatures1740600000000';
    }
    async up(queryRunner) {
        // 1. Threaded conversation key on messages.
        await queryRunner.query(`ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "threadId" varchar(128)`);
        // Backfill threadId for existing rows: sorted(senderId, recipientId) joined by ':'.
        await queryRunner.query(`
      UPDATE "messages"
      SET "threadId" = CASE
        WHEN "senderId" <= "recipientId" THEN "senderId" || ':' || "recipientId"
        ELSE "recipientId" || ':' || "senderId"
      END
      WHERE "threadId" IS NULL
    `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_messages_threadId" ON "messages" ("threadId")`);
        // 2. Automated notification settings on school_settings.
        await queryRunner.query(`ALTER TABLE "school_settings" ADD COLUMN IF NOT EXISTS "notificationSettings" jsonb`);
        // 3. Bulk messaging campaigns + delivery log.
        await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "bulk_messages" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "senderId" uuid,
        "subject" varchar NOT NULL,
        "body" text NOT NULL,
        "channels" jsonb NOT NULL,
        "audience" jsonb,
        "audienceLabel" varchar,
        "totalRecipients" integer NOT NULL DEFAULT 0,
        "sentCount" integer NOT NULL DEFAULT 0,
        "failedCount" integer NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_bulk_messages" PRIMARY KEY ("id"),
        CONSTRAINT "FK_bulk_messages_sender" FOREIGN KEY ("senderId")
          REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
      )
    `);
        await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "bulk_message_recipients" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "bulkMessageId" uuid NOT NULL,
        "studentId" uuid,
        "userId" uuid,
        "recipientName" varchar NOT NULL,
        "recipientType" varchar(16) NOT NULL DEFAULT 'parent',
        "channel" varchar(16) NOT NULL,
        "destination" varchar,
        "status" varchar(16) NOT NULL,
        "error" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_bulk_message_recipients" PRIMARY KEY ("id"),
        CONSTRAINT "FK_bulk_message_recipients_message" FOREIGN KEY ("bulkMessageId")
          REFERENCES "bulk_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_bulk_recipients_messageId" ON "bulk_message_recipients" ("bulkMessageId")`);
    }
    async down(queryRunner) {
        await queryRunner.query(`DROP TABLE IF EXISTS "bulk_message_recipients"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "bulk_messages"`);
        await queryRunner.query(`ALTER TABLE "school_settings" DROP COLUMN IF EXISTS "notificationSettings"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_messages_threadId"`);
        await queryRunner.query(`ALTER TABLE "messages" DROP COLUMN IF EXISTS "threadId"`);
    }
}
exports.AddCommunicationFeatures1740600000000 = AddCommunicationFeatures1740600000000;
