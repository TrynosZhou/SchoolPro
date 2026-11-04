// Vercel Serverless Function — catch-all handler for /api/* routes.
// Mounts the existing Express backend (built to backend/dist/app.js during `npm run build`).
//
// POST-DEPLOY SETUP (Vercel Project → Settings → Environment Variables):
//   Copy every variable from backend/.env (PORT is auto-injected by Vercel and unused here):
//     NODE_ENV=production
//     DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_DATABASE, DB_SSL_MODE
//     JWT_SECRET, JWT_EXPIRES_IN
//     FRONTEND_URL, API_PUBLIC_URL
//     WHATSAPP_ENABLED, REDIS_ENABLED
//     DEMO_FEATURE_ENABLED, DEMO_DB_*
//
// If you instead host the backend separately (e.g. Render), set this in Vercel env vars:
//     NG_APP_API_URL='https://your-backend.example.com/api'
// (frontend build will use it as the absolute base URL, and you can delete this /api folder.)

import type { IncomingMessage, ServerResponse } from 'node:http';

type ExpressApp = (
  req: IncomingMessage,
  res: ServerResponse,
  next?: (err?: unknown) => void
) => void;

let cachedApp: ExpressApp | null = null;
let cachedLoadError: { message: string } | null = null;

function loadApp(): ExpressApp {
  if (cachedLoadError) {
    const err = new Error(cachedLoadError.message);
    (err as any).statusCode = 500;
    throw err;
  }
  if (cachedApp) return cachedApp;

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('../backend/dist/app.js');
    const app: unknown = (mod && mod.default) || mod;
    if (typeof app !== 'function') {
      throw new Error(
        'backend/dist/app.js did not export an Express request handler function ' +
          '(expected a default export). Current export type: ' + typeof app
      );
    }
    cachedApp = app as ExpressApp;
    return cachedApp;
  } catch (err: any) {
    cachedLoadError = {
      message:
        '[Vercel /api function] Failed to load backend Express app: ' +
        (err && err.message ? err.message : String(err)),
    };
    const e = new Error(cachedLoadError.message);
    (e as any).statusCode = 500;
    throw e;
  }
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const app = loadApp();
    await new Promise<void>((resolve, reject) => {
      try {
        app(req, res, (err?: unknown) => {
          if (err) return reject(err);
          resolve();
        });
      } catch (syncErr) {
        reject(syncErr);
      }
    });
  } catch (err: any) {
    const status = (err && typeof err.statusCode === 'number' && err.statusCode) || 500;
    const body = JSON.stringify({
      error: 'api_unavailable',
      message: err && err.message ? err.message : 'Unknown error in Vercel API catch-all handler',
    });
    if (!res.headersSent) {
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
    }
    res.end(body);
  }
}

export const config = {
  // Route every path that starts with /api/ to this handler
  matcher: ['/api/:path*'],
};
