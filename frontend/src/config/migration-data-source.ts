/**
 * Dedicated entry point for the TypeORM CLI (`migration:run`, `migration:revert`).
 * The main `data-source.ts` file exports both `RealAppDataSource` and the `AppDataSource`
 * Proxy wrapping it — and because Proxies forward `instanceof` checks to their target,
 * TypeORM's CLI sees two things that look like DataSource instances and refuses to pick
 * one ("Given data source file must contain only one export of DataSource instance").
 * This file re-exports just the real DataSource as the sole export, so the CLI has
 * exactly one unambiguous instance to use.
 */
export { RealAppDataSource as default } from './data-source';