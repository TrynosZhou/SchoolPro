const app = require('../dist/app').default;
const { initializeServer } = require('../dist/server');

let bootPromise = null;

function bootOnce() {
  if (!bootPromise) {
    bootPromise = initializeServer()
      .then(() => {
        const { getStartupState } = require('../dist/server');
        const state = getStartupState();
        console.log(
          `[vercel:backend] boot finished — ok=${state.ok} startedAt=${state.startedAt}`,
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
          '[vercel:backend] initializeServer threw (continuing in degraded mode) — ' +
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
    console.error('[vercel:backend] bootOnce unexpected catch path (should be swallowed).', err && err.message);
  }
  try {
    return app(req, res);
  } catch (syncErr) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ message: 'The API failed to dispatch the request.', error: syncErr && syncErr.message }));
  }
};
