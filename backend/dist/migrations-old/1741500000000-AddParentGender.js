"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddParentGender1741500000000 = void 0;
class AddParentGender1741500000000 {
    constructor() {
        this.name = 'AddParentGender1741500000000';
    }
    async up(queryRunner) {
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
    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "parents" DROP COLUMN IF EXISTS "gender"`);
    }
}
exports.AddParentGender1741500000000 = AddParentGender1741500000000;
