"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddAccountantRole1741600000000 = void 0;
class AddAccountantRole1741600000000 {
    constructor() {
        this.name = 'AddAccountantRole1741600000000';
    }
    async up(queryRunner) {
        await queryRunner.query(`
      DO $$ BEGIN
        ALTER TYPE "users_role_enum" ADD VALUE IF NOT EXISTS 'accountant';
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
        await queryRunner.query(`
      DO $$ BEGIN
        ALTER TYPE "school_roles_baserole_enum" ADD VALUE IF NOT EXISTS 'accountant';
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    }
    async down(queryRunner) {
        // PostgreSQL does not support removing enum values safely.
    }
}
exports.AddAccountantRole1741600000000 = AddAccountantRole1741600000000;
