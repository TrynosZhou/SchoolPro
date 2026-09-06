# Debug Session: db-warming-503 [OPEN]

**Symptom**: UI shows alert toast `"Database is warming up or unreachable — please retry in a moment. ERROR"` — HTTP 503 response from backend on endpoints the user expected to succeed.

**Expected**: Backend should either (a) mark `_startupState.ok = true` after DB ping succeeds so endpoints like `/api/auth/login`, `/api/teachers`, etc. work, OR (b) serve the 503 only for endpoints that truly need DB — not for public-safe endpoints already on the allowlist.

**Reproduction steps (so far)**:
- Run `node dist/server.js` (production) with Neon SSL env.
- Open frontend, navigate to `/login`.
- Enter creds → submit → toast appears.
- Prior session established `/api/health=200 ok:true degraded:false` and `/api/auth/password-policy=200`. But some endpoint in the login flow still returns 503 with the DB-warming message.

## Session Metadata

| Field | Value |
|---|---|
| sessionId | `db-warming-503` |
| Started | 2026-09-05 |
| Status | `[OPEN]` |
| Debug Server URL | TBD (below) |
| Log file | `trae-debug-log-db-warming-503.ndjson` |

## 5 Falsifiable Hypotheses

**H1 — Race condition in startup state**: The first request(s) arrive BEFORE the DB ping completes. `_startupState.ok = true` is set asynchronously after the server starts listening on port 3000. The server calls `listen()` → user traffic starts flowing → first request sees `ok=false` → 503, even though boot finishes ~1ms later.
- **Prediction**: Debug log shows `getStartupState().ok = false` at request time, then later `boot finished ok=true` log appears after the 503 was emitted. First-hit requests to protected endpoints will fail once, succeed on retry.

**H2 — Sub-request triggered by Angular loads an endpoint not on the public-safe allowlist, AND degraded mode gets toggled during the request lifecycle by some parallel event.**
- Example: Login submits → auth controller calls `auditLogService.trackLogin()` (needs DB), then a parallel auth guard fires `/api/users/me` before auth is set up. Or `router.navigate` after 401 triggers some resolver that fetches `/api/school/settings` — which is not `/api/public/*` and not in the allowlist.
- **Prediction**: In server logs, find a 503 being thrown by `app.ts` middleware for a URL that is NOT in `{/api/health, /api/auth/password-policy, /api/public/, /webhooks/}` AND that URL was fetched by Angular as part of the login page navigation (e.g., `/api/users/me`, `/api/school/settings`, `/api/auth/myself`, some data resolver).

**H3 — `_startupState.ok` is being FALSELY reset to `false` AFTER boot already succeeded (regression / reentrancy).**
- `initializeServer()` may be getting called TWICE (e.g., `server.ts` top-level call on import + `api/index.js` `bootOnce()` call) and the second call's `bootstrapStartup()` re-assigns `_startupState = { ok:false, startedAt:null }`, wiping the prior success.
- **Prediction**: Debug log shows TWO `initializeServer begin` entries, then the second one's `bootstrapStartup` resets state, causing subsequent requests to 503 even though the first boot had `ok:true`.

**H4 — `env.nodeEnv` mismatch / missing .env injection in the Vercel serverless runtime causes connection to be attempted with host=undefined, but `SELECT 1` check silently returns without actually establishing the pool.**
- On Vercel the Neon connection needs `DB_SSL_MODE=require` and all `DB_*` env vars. The startup code tries `SELECT 1`; if that errors, `catch` branch sets `ok=false`. But on local `backend/.env` Neon is reachable; on Vercel env vars may not have propagated to the function.
- **Prediction**: Server logs show `connect ECONNREFUSED` / `no password supplied` / `ENOTFOUND` at `dataSource.initialize()`, `_startupState.ok=false`, and `initializeServer threw` error meta in lambda logs.

**H5 — TypeORM pool exhausted after failed migration run keeps DataSource in invalid state, so AUTH queries throw a raw error which the global error middleware (err object === "Database is warming up...") inadvertently converts to the 503 toast string.**
- The `auth.login` catch block on DB error may be throwing an Error with that exact string message, OR the global error-handler middleware's `res.status(503).json({ message })` response is being thrown as an Error object by a controller doing `throw new Error(res.message)` somehow.
- **Prediction**: Debug logs show a `QueryFailedError`/`ConnectionNotFoundError` at DB access inside the login controller, and the response is NOT coming from the app.ts startup middleware (it is coming from the error middleware, but with the same message text because we reused the string from a shared constant).

## Instrumentation Plan

1. Start Debug Server, capture session env vars.
2. Add instrumentation in:
   - `server.ts` → `bootstrapStartup()`: pre/post each step (select 1, migrations, scheduler).
   - `server.ts` → `initializeServer()`: entry, idempotency guard, re-entrancy log.
   - `app.ts` → startup-state middleware: log incoming URL + `getStartupState()` snapshot before returning 503.
   - `app.ts` → global error middleware: log err.message, err.name, stack, what URL triggered it, and whether `_startupState.ok` was true at that moment.
3. Rebuild, restart server, reproduce login flow by curling endpoints in sequence, capture debug logs.
4. Match logs against hypotheses:
   - If H1: first ever request's `state.ok===false` && boot finished logged AFTER → fix: wait until boot completes before calling `listen()` (call listen inside initializeServer's then).
   - If H2: specific URL name appears → either add to public-safe OR guard with try/catch on the frontend resolver.
   - If H3: two initializeServer logs → add `if (initialized)` return in initializeServer (idempotent).
   - If H4: env vars missing → print non-sensitive env vars on boot.
   - If H5: error middleware logs stack with QueryFailedError → fix the error middleware mapping so it distinguishes "real DB error after boot OK" (should be 500/401) vs "startup middleware gate" (503).

## Status Log

| Time | Step | Result |
|---|---|---|
| T0 | Session opened | Hypotheses listed, waiting on instrumentation |
