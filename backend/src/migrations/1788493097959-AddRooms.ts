import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRooms1788493097959 implements MigrationInterface {
  name = 'AddRooms1788493097959';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "rooms" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying(64) NOT NULL,
        "code" character varying(16),
        "capacity" integer,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_rooms_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_rooms_name" UNIQUE ("name")
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "rooms"`);
  }
}
