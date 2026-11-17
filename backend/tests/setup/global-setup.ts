import path from 'path';
import dotenv from 'dotenv';
import { Client } from 'pg';

/** Every test run starts from a freshly created database with this exact name. */
const TEST_DATABASE = 'schoolpro_test';

/**
 * Drops and recreates the dedicated test database once per run.
 *
 * A hard reset (rather than TRUNCATE) guarantees the schema is rebuilt from the
 * real migration files, so migrations are exercised on every run and no state
 * leaks between runs.
 */
export default async function globalSetup(): Promise<void> {
  dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

  // Safety rail: never allow this destructive setup near a non-test database.
  if (!TEST_DATABASE.endsWith('_test')) {
    throw new Error(`Refusing to run: test database "${TEST_DATABASE}" does not end with "_test".`);
  }

  const host = process.env.DB_HOST || 'localhost';
  const port = Number(process.env.DB_PORT || 5432);
  const user = process.env.DB_USERNAME || 'postgres';
  const password = process.env.DB_PASSWORD || 'postgres';
  const ssl = (process.env.DB_SSL_MODE || 'disable') === 'require' ? { rejectUnauthorized: false } : false;

  const client = new Client({
    host,
    port,
    user,
    password,
    database: 'postgres',
    ssl,
    connectionTimeoutMillis: 15000,
  });

  try {
    await client.connect();
  } catch (error) {
    throw new Error(
      `Could not reach PostgreSQL at ${host}:${port} as "${user}" to prepare "${TEST_DATABASE}". ` +
        `Set DB_HOST / DB_PORT / DB_USERNAME / DB_PASSWORD in backend/.env. Cause: ` +
        `${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    await client.query(`DROP DATABASE IF EXISTS "${TEST_DATABASE}" WITH (FORCE)`);
    await client.query(`CREATE DATABASE "${TEST_DATABASE}"`);
    // eslint-disable-next-line no-console
    console.log(`[tests] Recreated test database "${TEST_DATABASE}" on ${host}:${port}`);
  } finally {
    await client.end();
  }
}
