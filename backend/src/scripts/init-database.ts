/**
 * Connects to PostgreSQL, creates the database if missing,
 * synchronizes all tables with FK constraints, and applies integrity rules.
 */
import 'reflect-metadata';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { Client } from 'pg';
import { env } from '../config/env';
import { AppDataSource } from '../config/data-source';

const INTEGRITY_SQL = `
-- Composite unique constraints (prevent duplicate facts)
CREATE UNIQUE INDEX IF NOT EXISTS uq_exam_mark_student_subject_type_term
  ON exam_marks ("studentId", "subjectId", "examTypeId", "termId");
CREATE UNIQUE INDEX IF NOT EXISTS uq_student_attendance_student_date
  ON student_attendance ("studentId", date);
CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_attendance_staff_date
  ON staff_attendance ("staffId", date);
CREATE UNIQUE INDEX IF NOT EXISTS uq_report_card_student_term
  ON report_cards ("studentId", "termId");
CREATE UNIQUE INDEX IF NOT EXISTS uq_class_subject_class_subject
  ON class_subjects ("classId", "subjectId");
CREATE UNIQUE INDEX IF NOT EXISTS uq_honour_roll_student_term
  ON honour_rolls ("studentId", "termId");

-- Guardian: contact stored here only when no parent portal account (3NF)
ALTER TABLE guardians DROP CONSTRAINT IF EXISTS chk_guardian_contact_source;
ALTER TABLE guardians ADD CONSTRAINT chk_guardian_contact_source CHECK (
  ("parentId" IS NOT NULL) OR ("fullName" IS NOT NULL AND phone IS NOT NULL)
);

-- One primary guardian per student
CREATE UNIQUE INDEX IF NOT EXISTS uq_guardian_one_primary_per_student
  ON guardians ("studentId") WHERE "isPrimary" = true;

-- Only one current school year and one current term
CREATE UNIQUE INDEX IF NOT EXISTS uq_school_year_one_current
  ON school_years ("isCurrent") WHERE "isCurrent" = true;
CREATE UNIQUE INDEX IF NOT EXISTS uq_term_one_current
  ON terms ("isCurrent") WHERE "isCurrent" = true;

-- General ledger performance indexes (idempotent when migration already ran)
CREATE INDEX IF NOT EXISTS idx_gl_entry_transaction_date ON general_ledger_entries ("transactionDate");
CREATE INDEX IF NOT EXISTS idx_gl_entry_account_id ON general_ledger_entries ("accountId");
CREATE INDEX IF NOT EXISTS idx_gl_entry_reference_type ON general_ledger_entries ("referenceType");
CREATE INDEX IF NOT EXISTS idx_gl_entry_journal_batch ON general_ledger_entries ("journalBatchId");
CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_type ON chart_of_accounts ("accountType");
`;

async function ensureDatabaseExists() {
  const client = new Client({
    host: env.db.host,
    port: env.db.port,
    user: env.db.username,
    password: env.db.password,
    database: 'postgres',
  });
  await client.connect();
  const res = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [env.db.database]);
  if (res.rowCount === 0) {
    await client.query(`CREATE DATABASE "${env.db.database}"`);
    console.log(`Created database: ${env.db.database}`);
  } else {
    console.log(`Database exists: ${env.db.database}`);
  }
  await client.end();
}

async function applyIntegrityConstraints() {
  const statements = INTEGRITY_SQL.split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 10 && !s.startsWith('--'));

  for (const stmt of statements) {
    try {
      await AppDataSource.query(stmt);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('already exists') && !msg.includes('duplicate')) {
        console.warn('Constraint note:', msg.slice(0, 120));
      }
    }
  }
}

async function main() {
  console.log('Connecting to PostgreSQL...');
  console.log(`  Host: ${env.db.host}:${env.db.port}`);
  console.log(`  Database: ${env.db.database}`);
  console.log(`  User: ${env.db.username}`);

  await ensureDatabaseExists();

  await AppDataSource.initialize();
  console.log('Tables synchronized with foreign key relationships.');

  await applyIntegrityConstraints();
  console.log('Referential integrity and uniqueness constraints applied.');

  const tables = await AppDataSource.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  console.log(`\nTables created (${tables.length}):`);
  tables.forEach((t: { table_name: string }) => console.log(`  - ${t.table_name}`));

  await AppDataSource.destroy();
  console.log('\nDatabase initialization complete.');
}

main().catch((err) => {
  console.error('Database initialization failed:', err);
  process.exit(1);
});
