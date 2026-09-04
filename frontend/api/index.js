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
    bootPromise = initializeServer().catch((err) => {
      console.error('[api:frontend-root] initializeServer failed on cold start:', err);
      bootPromise = null;
      throw err;
    });
  }
  return bootPromise;
}

module.exports = async (req, res) => {
  try {
    await bootOnce();
  } catch (err) {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Retry-After', '15');
    res.end(
      JSON.stringify({
        message:
          'The API service is warming up or unavailable right now. Please retry in a moment.',
      }),
    );
    return;
  }
  return loadApp()(req, res);
};
