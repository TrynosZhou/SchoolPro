const path = require('path');

const APP_ROOT = path.resolve(__dirname, '..');
const MONOREPO_ROOT = path.resolve(APP_ROOT, '..');
const BACKEND_DIST = path.join(MONOREPO_ROOT, 'backend', 'dist');

let app;
let bootPromise = null;

function loadApp() {
  if (!app) {
    app = require(path.join(BACKEND_DIST, 'app')).default;
  }
  return app;
}

async function bootOnce() {
  if (!bootPromise) {
    const { initializeServer } = require(path.join(BACKEND_DIST, 'server'));
    bootPromise = initializeServer()
      .then(() => {
        const { getStartupState } = require(path.join(BACKEND_DIST, 'server'));
        const state = getStartupState();
        console.log(
          `[api:frontend-root] boot finished — ok=${state.ok} startedAt=${state.startedAt}`,
          state.error
            ? `error=${state.error.name}: ${state.error.message}`
            : '',
        );
      })
      .catch((err) => {
        const meta = {
          name: err?.name,
          message: err?.message,
          code: err?.code,
          stack: err?.stack?.split('\n').slice(0, 8).join('\n'),
        };
        console.error(
          '[api:frontend-root] initializeServer threw (continuing in degraded mode) — ' +
            'this is usually DB credentials/network, or migrations failing. Check DB_HOST/DB_PORT/DB_USERNAME/DB_PASSWORD env vars in Vercel.',
          JSON.stringify(meta, null, 2),
        );
      });
  }
  return bootPromise;
}

module.exports = async (req, res) => {
  try {
    await bootOnce();
  } catch (err) {
    console.error('[api:frontend-root] bootOnce unexpected catch path (should be swallowed).', err && err.message);
  }
  try {
    return loadApp()(req, res);
  } catch (syncErr) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ message: 'The API failed to dispatch the request.', error: syncErr && syncErr.message }));
  }
};
