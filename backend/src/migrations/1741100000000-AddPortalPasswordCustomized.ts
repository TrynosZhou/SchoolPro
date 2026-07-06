import { MigrationInterface, QueryRunner } from 'typeorm';
import bcrypt from 'bcryptjs';
import { datePasswordCandidates, normalizeDateOnly } from '../utils/date-only';

export class AddPortalPasswordCustomized1741100000000 implements MigrationInterface {
  name = 'AddPortalPasswordCustomized1741100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "portalPasswordCustomized" boolean NOT NULL DEFAULT false
    `);

    await queryRunner.query(`
      UPDATE "users"
      SET "portalPasswordCustomized" = true
      WHERE role = 'student'
        AND email NOT LIKE '%@student.portal'
    `);

    const rows: { id: string; passwordHash: string; dateOfBirth: string | null }[] = await queryRunner.query(`
      SELECT u.id, u."passwordHash", s."dateOfBirth"
      FROM "users" u
      INNER JOIN "students" s ON s."userId" = u.id
      WHERE u.role = 'student'
        AND u."portalPasswordCustomized" = false
    `);

    for (const row of rows) {
      const recordDob = normalizeDateOnly(row.dateOfBirth);
      if (!recordDob) {
        await queryRunner.query(
          `UPDATE "users" SET "portalPasswordCustomized" = true WHERE id = $1`,
          [row.id],
        );
        continue;
      }

      let matchesDob = false;
      for (const candidate of datePasswordCandidates(recordDob)) {
        if (await bcrypt.compare(candidate, row.passwordHash)) {
          matchesDob = true;
          break;
        }
      }

      if (!matchesDob) {
        await queryRunner.query(
          `UPDATE "users" SET "portalPasswordCustomized" = true WHERE id = $1`,
          [row.id],
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "portalPasswordCustomized"
    `);
  }
}
