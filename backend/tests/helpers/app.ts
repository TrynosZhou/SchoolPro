import { initializeServer, getStartupState } from '../../src/server';
import { RealAppDataSource } from '../../src/config/data-source';

/**
 * Boots the API the same way `server.ts` does on production startup — connecting
 * the DataSource, running migrations, seeding the baseline data and marking the
 * startup state healthy so the app's "database warming up" guard lets requests
 * through. It deliberately does NOT bind an HTTP port; Supertest talks to the
 * Express app directly.
 */
export async function startTestApp(): Promise<void> {
  await initializeServer();
  const state = getStartupState();
  if (!state.ok) {
    throw new Error(
      `Test database is not usable, the API would answer 503. Cause: ${state.error?.message ?? 'unknown'}`,
    );
  }
}

export async function stopTestApp(): Promise<void> {
  const dataSource = RealAppDataSource as unknown as {
    isInitialized?: boolean;
    destroy: () => Promise<void>;
  };
  if (dataSource.isInitialized) {
    await dataSource.destroy();
  }
}
