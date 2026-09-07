declare const process: { env: Record<string, string | undefined> } | undefined;

const BUILD_TIME_API_URL: string | undefined =
  (typeof process !== 'undefined' && process && process.env && (process.env['NG_APP_API_URL'] || process.env['VERCEL_API_URL'])) ||
  undefined;

export const environment = {
  production: true,
  enableServiceWorker: true,
  /**
   * Defaults to same-origin '/api' (works when Express backend is co-located,
   * e.g. via the Vercel catch-all function at /api/[...all].ts).
   *
   * Override at build time by setting the Vercel env var:
   *   NG_APP_API_URL='https://your-backend.example.com/api'
   */
  apiUrl: BUILD_TIME_API_URL ?? '/api',
};