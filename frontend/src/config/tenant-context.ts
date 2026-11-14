import { AsyncLocalStorage } from 'async_hooks';

export interface TenantContextValue {
  isDemo: boolean;
  /** userId of the demo JWT, when known — useful for logging/debugging. */
  demoUserId?: string;
}

const storage = new AsyncLocalStorage<TenantContextValue>();

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
export const tenantContext = {
  run<T>(value: TenantContextValue, fn: () => T): T {
    return storage.run(value, fn);
  },
  runDemo<T>(fn: () => T): T {
    return storage.run({ isDemo: true }, fn);
  },
  get(): TenantContextValue | undefined {
    return storage.getStore();
  },
  isDemo(): boolean {
    return storage.getStore()?.isDemo === true;
  },
};
