import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { env } from './env';
import { entities } from '../entities';

/**
 * Fresh demo databases have no tables — incremental migrations assume a base
 * schema that was originally created via synchronize. Bootstrap once from
 * entities when `users` is missing, then let the normal DemoDataSource init
 * handle connection pooling (migrations are skipped on demo; entities are the
 * source of truth for a greenfield demo install).
 */
export async function ensureDemoSchemaBootstrapped(): Promise<boolean> {
  const client = new Client({
    host: env.demo.db.host,
    port: env.demo.db.port,
    user: env.demo.db.username,
    password: env.demo.db.password,
    database: env.demo.db.database,
  });
  await client.connect();
  const res = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'users'
     ) AS exists`,
  );
  await client.end();

  if (res.rows[0]?.exists) return false;

  console.log('[demo] Bootstrapping demo database schema (first-time synchronize)…');
  const bootstrap = new DataSource({
    type: 'postgres',
    host: env.demo.db.host,
    port: env.demo.db.port,
    username: env.demo.db.username,
    password: env.demo.db.password,
    database: env.demo.db.database,
    synchronize: true,
    migrationsRun: false,
    logging: false,
    entities,
  });
  await bootstrap.initialize();
  await bootstrap.destroy();
  console.log('[demo] Demo schema bootstrap complete.');
  return true;
}
