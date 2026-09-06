const http = require('http');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
function getArg(name, def) {
  const i = args.indexOf(name);
  if (i === -1) return def;
  const v = args[i + 1];
  return v === undefined ? (def !== undefined ? def : true) : v;
}

const sessionId = getArg('--session');
if (!sessionId) { console.error('Missing --session'); process.exit(1); }
const startPort = parseInt(getArg('--port', '7777'), 10) || 7777;
const outdir = path.resolve(getArg('--outdir', '.dbg'));
const clean = getArg('--clean') !== undefined;
const idle = parseInt(getArg('--idle', '0'), 10) || 0;
const remote = getArg('--remote') !== undefined;
const host = remote ? '0.0.0.0' : '127.0.0.1';

if (!fs.existsSync(outdir)) fs.mkdirSync(outdir, { recursive: true });
const logFile = path.join(outdir, `trae-debug-log-${sessionId}.ndjson`);
const envFile = path.join(outdir, `${sessionId}.env`);
if (clean && fs.existsSync(logFile)) fs.unlinkSync(logFile);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS, GET, DELETE',
  'Access-Control-Allow-Headers': 'Content-Type',
};

let idleTimer = null;
function resetIdle() {
  if (!idle) return;
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    console.log(`[debug-server] idle ${idle}s, exiting.`);
    process.exit(0);
  }, idle * 1000);
}

function readAll() {
  if (!fs.existsSync(logFile)) return [];
  const txt = fs.readFileSync(logFile, 'utf8');
  return txt.split('\n').filter(Boolean).map(l => {
    try { return JSON.parse(l); } catch { return { raw: l }; }
  });
}

function startServer(port) {
  const server = http.createServer((req, res) => {
    resetIdle();
    Object.assign(res.headers || {}, CORS);
    for (const k of Object.keys(CORS)) res.setHeader(k, CORS[k]);

    if (req.method === 'OPTIONS' && req.url.startsWith('/event')) {
      res.writeHead(204); res.end(); return;
    }
    if (req.method === 'GET' && req.url === '/health') {
      const all = readAll();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', uptimeMs: Date.now() - startedAt, logCount: all.length, sessionId }));
      return;
    }
    if (req.method === 'GET' && (req.url === '/logs' || req.url.startsWith('/logs?'))) {
      let all = readAll();
      try {
        const u = new URL(req.url, 'http://localhost');
        const last = u.searchParams.get('last');
        const hid = u.searchParams.get('hypothesisId');
        const rid = u.searchParams.get('runId');
        if (rid) all = all.filter(e => e.runId === rid);
        if (hid) all = all.filter(e => e.hypothesisId === hid);
        if (last) all = all.slice(-parseInt(last, 10));
      } catch { /* ignore */ }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ count: all.length, items: all }));
      return;
    }
    if (req.method === 'DELETE' && req.url === '/logs') {
      if (fs.existsSync(logFile)) fs.unlinkSync(logFile);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, cleared: sessionId }));
      return;
    }
    if (req.method === 'POST' && req.url.startsWith('/event')) {
      let body = '';
      req.on('data', c => { body += c.toString(); if (body.length > 1e7) { req.destroy(); } });
      req.on('end', () => {
        try {
          const ev = JSON.parse(body || '{}');
          ev.sessionId = ev.sessionId || sessionId;
          if (!ev.ts) ev.ts = Date.now();
          fs.appendFileSync(logFile, JSON.stringify(ev) + '\n');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, received: ev.ts }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'bad json', message: e.message }));
        }
      });
      return;
    }
    res.writeHead(404); res.end('debug server: try /event, /logs, /health, /logs');
  });
  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE' && port - startPort < 10) {
      startServer(port + 1);
    } else {
      console.error('[debug-server] fatal:', e);
      process.exit(2);
    }
  });
  server.listen(port, host, () => {
    const apiUrl = `http://127.0.0.1:${port}/event`;
    fs.writeFileSync(envFile, `DEBUG_SERVER_URL=${apiUrl}\nDEBUG_SESSION_ID=${sessionId}\n`);
    console.log(`@@DEBUG_SERVER_INFO`);
    console.log(JSON.stringify({
      api_url: apiUrl,
      session_id: sessionId,
      log_dir: outdir,
      log_file: logFile,
      env_file: envFile,
    }, null, 2));
    console.log(`@@END_DEBUG_SERVER_INFO`);
    resetIdle();
  });
}
const startedAt = Date.now();
startServer(startPort);
