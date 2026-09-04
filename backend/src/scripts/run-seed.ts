import 'reflect-metadata';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { AppDataSource } from '../config/data-source';
import { seedDatabase } from '../seed';

async function main() {
  console.log('Connecting to PostgreSQL...');
  await AppDataSource.initialize();
  console.log('Database connected');

  await seedDatabase();
  console.log('Seed complete');

  await AppDataSource.destroy();
  process.exit(0);
}

main().catch((err) => {
  console.error('SEED ERROR:', err);
  process.exit(1);
});