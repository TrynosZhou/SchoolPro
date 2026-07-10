"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRedisConnectionOptions = getRedisConnectionOptions;
const env_1 = require("./env");
function getRedisConnectionOptions() {
    return {
        url: env_1.env.redis.url,
        maxRetriesPerRequest: null,
    };
}
