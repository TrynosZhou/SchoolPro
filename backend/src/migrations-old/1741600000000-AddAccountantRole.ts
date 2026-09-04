import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAccountantRole1741600000000 implements MigrationInterface {
  name = 'AddAccountantRole1741600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
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

  public async down(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL does not support removing enum values safely.
  }
}
