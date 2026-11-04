"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tenantContext = void 0;
const async_hooks_1 = require("async_hooks");
const storage = new async_hooks_1.AsyncLocalStorage();
/**
 * Request-scoped "which database am I talking to" context, set once per request by
 * `tenantContextMiddleware` (based on the JWT's `demo` claim) and read by the
 * `AppDataSource` proxy (see `data-source.ts`) to route every repository/query call
 * to either the production or demo Postgres database.
 *
 * Using Node's built-in AsyncLocalStorage means this works transparently across any
 * number of `await`s within a request without needing to thread a context object
 * through every function signature in the codebase.
 */
exports.tenantContext = {
    run(value, fn) {
        return storage.run(value, fn);
    },
    runDemo(fn) {
        return storage.run({ isDemo: true }, fn);
    },
    get() {
        return storage.getStore();
    },
    isDemo() {
        return storage.getStore()?.isDemo === true;
    },
};
