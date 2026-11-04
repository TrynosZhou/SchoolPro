"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = void 0;
/**
 * Dedicated entry point for the TypeORM CLI (`migration:run`, `migration:revert`).
 * The main `data-source.ts` file exports both `RealAppDataSource` and the `AppDataSource`
 * Proxy wrapping it — and because Proxies forward `instanceof` checks to their target,
 * TypeORM's CLI sees two things that look like DataSource instances and refuses to pick
 * one ("Given data source file must contain only one export of DataSource instance").
 * This file re-exports just the real DataSource as the sole export, so the CLI has
 * exactly one unambiguous instance to use.
 */
var data_source_1 = require("./data-source");
Object.defineProperty(exports, "default", { enumerable: true, get: function () { return data_source_1.RealAppDataSource; } });
