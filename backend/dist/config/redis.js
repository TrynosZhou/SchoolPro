"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRedisConnectionOptions = getRedisConnectionOptions;
exports.probeRedis = probeRedis;
const ioredis_1 = __importDefault(require("ioredis"));
const env_1 = require("./env");
function getRedisConnectionOptions() {
    return {
        url: env_1.env.redis.url,
        maxRetriesPerRequest: null,
    };
}
/** Quick connectivity probe — used at boot to avoid a BullMQ worker that spams ECONNREFUSED. */
async function probeRedis(timeoutMs = 2500) {
    if (!env_1.env.redis.enabled)
        return false;
    const client = new ioredis_1.default(env_1.env.redis.url, {
        connectTimeout: timeoutMs,
        maxRetriesPerRequest: 1,
        lazyConnect: true,
        retryStrategy: () => null,
    });
    try {
        await client.connect();
        const pong = await client.ping();
        return pong === 'PONG';
    }
    catch {
        return false;
    }
    finally {
        client.disconnect();
    }
}
