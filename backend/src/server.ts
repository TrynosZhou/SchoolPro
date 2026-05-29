import 'reflect-metadata';
import app from './app';
import { AppDataSource } from './config/data-source';
import { env } from './config/env';
import { ensureUploadDirs } from './utils/pdf';

async function bootstrap() {
  try {
    ensureUploadDirs();
    await AppDataSource.initialize();
    console.log('Database connected');

    const { seedDatabase } = await import('./seed');
    await seedDatabase();
    const { ensureDefaultRoles } = await import('./services/role-permissions.service');
    await ensureDefaultRoles();

    app.listen(env.port, () => {
      console.log(`School Pro API running on http://localhost:${env.port}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

bootstrap();

