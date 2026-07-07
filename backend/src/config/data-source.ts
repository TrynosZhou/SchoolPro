import 'reflect-metadata';
import path from 'path';
import { DataSource } from 'typeorm';
import { env } from './env';
import { entities } from '../entities';

/** ts-node (CLI/dev) loads .ts migrations; compiled dist/server.js loads .js migrations. */
const migrationsGlob = path.join(
  __dirname,
  '..',
  'migrations',
  __filename.endsWith('.ts') ? '*.ts' : '*.js',
);

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: env.db.host,
  port: env.db.port,
  username: env.db.username,
  password: env.db.password,
  database: env.db.database,
  /** Migrations own schema changes; sync would race them and break on NOT NULL backfills. */
  synchronize: false,
  migrationsRun: true,
  logging: env.nodeEnv === 'development',
  entities,
  migrations: [migrationsGlob],
  /** Enforce referential integrity on all foreign keys */
  extra: {
    statement_timeout: 60000,
  },
});
