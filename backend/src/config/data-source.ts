import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { env } from './env';
import { entities } from '../entities';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: env.db.host,
  port: env.db.port,
  username: env.db.username,
  password: env.db.password,
  database: env.db.database,
  synchronize: env.nodeEnv === 'development',
  logging: env.nodeEnv === 'development',
  entities,
  migrations: ['src/migrations/*.ts'],
  /** Enforce referential integrity on all foreign keys */
  extra: {
    statement_timeout: 60000,
  },
});
