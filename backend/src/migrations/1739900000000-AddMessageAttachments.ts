import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMessageAttachments1739900000000 implements MigrationInterface {
  name = 'AddMessageAttachments1739900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
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

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "message_attachments"`);
  }
}
