import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddParentGender1741500000000 implements MigrationInterface {
  name = 'AddParentGender1741500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "parents"
      ADD COLUMN IF NOT EXISTS "gender" character varying(16)
    `);

    await queryRunner.query(`
      UPDATE "parents" p
      SET "gender" = 'male'
      WHERE p."gender" IS NULL
        AND EXISTS (
          SELECT 1 FROM guardians g
          WHERE g."parentId" = p.id
            AND (
              LOWER(g.relationship) LIKE '%father%'
              OR LOWER(g.relationship) LIKE '%dad%'
            )
        )
    `);

    await queryRunner.query(`
      UPDATE "parents" p
      SET "gender" = 'female'
      WHERE p."gender" IS NULL
        AND EXISTS (
          SELECT 1 FROM guardians g
          WHERE g."parentId" = p.id
            AND (
              LOWER(g.relationship) LIKE '%mother%'
              OR LOWER(g.relationship) LIKE '%mom%'
              OR LOWER(g.relationship) LIKE '%mum%'
            )
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "parents" DROP COLUMN IF EXISTS "gender"`);
  }
}
