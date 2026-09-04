const app = require('../dist/app').default;
const { initializeServer } = require('../dist/server');

let bootPromise = null;

function bootOnce() {
  if (!bootPromise) {
    bootPromise = initializeServer().catch((err) => {
      const meta = {
        name: err?.name,
        message: err?.message,
        code: err?.code,
        stack: err?.stack?.split('\n').slice(0, 8).join('\n'),
      };
      console.error(
        '[vercel:backend] initializeServer failed on cold start — ' +
          'this is usually DB credentials/network, or migrations failing. Check DB_HOST/DB_PORT/DB_USERNAME/DB_PASSWORD env vars in Vercel.',
        JSON.stringify(meta, null, 2),
      );
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
