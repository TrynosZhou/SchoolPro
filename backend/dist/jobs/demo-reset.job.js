"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startDemoResetJob = startDemoResetJob;
exports.stopDemoResetJob = stopDemoResetJob;
const node_cron_1 = __importDefault(require("node-cron"));
const env_1 = require("../config/env");
const seedDemo_1 = require("../seed/demo/seedDemo");
let task = null;
let running = false;
async function runReset(reason) {
    if (running) {
        console.log(`[demo-reset] Skipped (${reason}) — a reset is already in progress.`);
        return;
    }
    running = true;
    const startedAt = Date.now();
    try {
        console.log(`[demo-reset] Starting demo data reset (${reason})...`);
        await (0, seedDemo_1.seedDemoDatabase)({ force: true });
        console.log(`[demo-reset] Completed in ${Date.now() - startedAt}ms.`);
    }
    catch (err) {
        console.error('[demo-reset] Failed:', err);
    }
    finally {
        running = false;
    }
}
/**
 * Starts the recurring demo-data reset job. No-op unless the demo feature is
 * enabled. Schedule is controlled by `DEMO_RESET_CRON`; an immediate reseed
 * can also be forced on boot via `DEMO_RESET_ON_BOOT=true` (handy in dev so
 * every restart gives you a clean, known demo dataset).
 */
function startDemoResetJob() {
    if (!env_1.env.demo.enabled)
        return;
    if (env_1.env.demo.resetOnBoot) {
        void runReset('boot');
    }
    else {
        // Even without a forced reset, make sure the demo DB has *something* in it
        // the first time the app ever boots against a fresh database.
        void (0, seedDemo_1.seedDemoDatabase)({ force: false }).catch((err) => console.error('[demo-reset] Initial seed check failed:', err));
    }
    if (task) {
        task.stop();
    }
    task = node_cron_1.default.schedule(env_1.env.demo.resetCron, () => {
        void runReset('scheduled');
    });
    console.log(`[demo-reset] Scheduled demo reset job with cron "${env_1.env.demo.resetCron}".`);
}
function stopDemoResetJob() {
    task?.stop();
    task = null;
}
