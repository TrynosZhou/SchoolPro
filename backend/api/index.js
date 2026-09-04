const app = require('../dist/app').default;
const { initializeServer } = require('../dist/server');

let bootPromise = null;

function bootOnce() {
  if (!bootPromise) {
    bootPromise = initializeServer().catch((err) => {
      console.error('[vercel] initializeServer failed on cold start:', err);
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
  return app(req, res);
};
