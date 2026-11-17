import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIdCardScans1788493097961 implements MigrationInterface {
  name = 'AddIdCardScans1788493097961';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "id_card_scans" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "studentId" uuid NOT NULL,
        "direction" character varying(16) NOT NULL,
        "scannedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_id_card_scans_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_id_card_scans_student" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_id_card_scans_scanned_at" ON "id_card_scans" ("scannedAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_id_card_scans_scanned_at"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "id_card_scans"`);
  }
}
