/**
 * Runs before any test module is imported (Jest `setupFiles`).
 *
 * The values set here must be in place before `src/config/env.ts` executes
 * `dotenv.config()`, because dotenv never overwrites variables that already
 * exist on `process.env`. That keeps the suite pinned to the dedicated
 * `schoolpro_test` database instead of the developer's `schoolpro` database.
 */
process.env.NODE_ENV = 'test';
process.env.DB_DATABASE = 'schoolpro_test';
process.env.DB_SSL_MODE = 'disable';
process.env.DEMO_FEATURE_ENABLED = 'false';
process.env.REDIS_ENABLED = 'false';
process.env.WHATSAPP_ENABLED = 'false';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'schoolpro-test-secret';
process.env.JWT_EXPIRES_IN = '1h';
process.env.STORAGE_DRIVER = 'local';
