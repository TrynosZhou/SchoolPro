"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddGeneralLedger1735689600000 = void 0;
class AddGeneralLedger1735689600000 {
    constructor() {
        this.name = 'AddGeneralLedger1735689600000';
    }
    async up(queryRunner) {
        await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "gl_account_type_enum" AS ENUM ('REVENUE', 'EXPENSE', 'ASSET', 'LIABILITY', 'EQUITY');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
        await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "gl_reference_type_enum" AS ENUM (
          'FEE_PAYMENT', 'SALARY', 'EXPENSE', 'REFUND', 'MANUAL_ADJUSTMENT', 'OTHER'
        );
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
        await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "chart_of_accounts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "accountCode" character varying(32) NOT NULL,
        "accountName" character varying(128) NOT NULL,
        "accountType" "gl_account_type_enum" NOT NULL,
        "parentAccountId" uuid,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_chart_of_accounts_code" UNIQUE ("accountCode"),
        CONSTRAINT "PK_chart_of_accounts" PRIMARY KEY ("id"),
        CONSTRAINT "FK_chart_parent" FOREIGN KEY ("parentAccountId")
          REFERENCES "chart_of_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE
      )
    `);
        await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "general_ledger_entries" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "transactionDate" date NOT NULL,
        "accountId" uuid NOT NULL,
        "debitAmount" numeric(14,2) NOT NULL DEFAULT 0,
        "creditAmount" numeric(14,2) NOT NULL DEFAULT 0,
        "description" text NOT NULL,
        "referenceType" "gl_reference_type_enum" NOT NULL,
        "referenceId" uuid,
        "journalBatchId" uuid NOT NULL,
        "runningBalance" numeric(14,2) NOT NULL,
        "createdById" uuid NOT NULL,
        "isReversed" boolean NOT NULL DEFAULT false,
        "reversalOfEntryId" uuid,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_general_ledger_entries" PRIMARY KEY ("id"),
        CONSTRAINT "FK_gl_account" FOREIGN KEY ("accountId")
          REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT "FK_gl_created_by" FOREIGN KEY ("createdById")
          REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT "FK_gl_reversal_of" FOREIGN KEY ("reversalOfEntryId")
          REFERENCES "general_ledger_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE,
        CONSTRAINT "CHK_gl_one_side" CHECK (
          ("debitAmount" > 0 AND "creditAmount" = 0) OR ("creditAmount" > 0 AND "debitAmount" = 0)
        )
      )
    `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_gl_entry_transaction_date" ON "general_ledger_entries" ("transactionDate")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_gl_entry_account_id" ON "general_ledger_entries" ("accountId")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_gl_entry_reference_type" ON "general_ledger_entries" ("referenceType")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_gl_entry_journal_batch" ON "general_ledger_entries" ("journalBatchId")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_chart_of_accounts_type" ON "chart_of_accounts" ("accountType")`);
    }
    async down(queryRunner) {
        await queryRunner.query(`DROP TABLE IF EXISTS "general_ledger_entries"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "chart_of_accounts"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "gl_reference_type_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "gl_account_type_enum"`);
    }
}
exports.AddGeneralLedger1735689600000 = AddGeneralLedger1735689600000;
