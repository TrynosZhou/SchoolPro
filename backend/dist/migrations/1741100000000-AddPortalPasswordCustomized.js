"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddPortalPasswordCustomized1741100000000 = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const date_only_1 = require("../utils/date-only");
class AddPortalPasswordCustomized1741100000000 {
    constructor() {
        this.name = 'AddPortalPasswordCustomized1741100000000';
    }
    async up(queryRunner) {
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
        const rows = await queryRunner.query(`
      SELECT u.id, u."passwordHash", s."dateOfBirth"
      FROM "users" u
      INNER JOIN "students" s ON s."userId" = u.id
      WHERE u.role = 'student'
        AND u."portalPasswordCustomized" = false
    `);
        for (const row of rows) {
            const recordDob = (0, date_only_1.normalizeDateOnly)(row.dateOfBirth);
            if (!recordDob) {
                await queryRunner.query(`UPDATE "users" SET "portalPasswordCustomized" = true WHERE id = $1`, [row.id]);
                continue;
            }
            let matchesDob = false;
            for (const candidate of (0, date_only_1.datePasswordCandidates)(recordDob)) {
                if (await bcryptjs_1.default.compare(candidate, row.passwordHash)) {
                    matchesDob = true;
                    break;
                }
            }
            if (!matchesDob) {
                await queryRunner.query(`UPDATE "users" SET "portalPasswordCustomized" = true WHERE id = $1`, [row.id]);
            }
        }
    }
    async down(queryRunner) {
        await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "portalPasswordCustomized"
    `);
    }
}
exports.AddPortalPasswordCustomized1741100000000 = AddPortalPasswordCustomized1741100000000;
