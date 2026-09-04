"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddMessageAttachments1739900000000 = void 0;
class AddMessageAttachments1739900000000 {
    constructor() {
        this.name = 'AddMessageAttachments1739900000000';
    }
    async up(queryRunner) {
        await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "message_attachments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "messageId" uuid NOT NULL,
        "originalName" character varying NOT NULL,
        "storedName" character varying NOT NULL,
        "mimeType" character varying NOT NULL,
        "sizeBytes" integer NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_message_attachments" PRIMARY KEY ("id"),
        CONSTRAINT "FK_message_attachments_message" FOREIGN KEY ("messageId")
          REFERENCES "messages"("id") ON DELETE CASCADE
      )
    `);
        await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_message_attachments_messageId"
      ON "message_attachments" ("messageId")
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`DROP TABLE IF EXISTS "message_attachments"`);
    }
}
exports.AddMessageAttachments1739900000000 = AddMessageAttachments1739900000000;
