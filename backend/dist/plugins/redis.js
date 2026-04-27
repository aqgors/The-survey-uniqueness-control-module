"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.redisPlugin = void 0;
const fastify_plugin_1 = __importDefault(require("fastify-plugin"));
const ioredis_1 = __importDefault(require("ioredis"));
// ── Plugin ─────────────────────────────────────────────────────────────────
exports.redisPlugin = (0, fastify_plugin_1.default)(async (fastify) => {
    const redis = new ioredis_1.default({
        host: process.env.REDIS_HOST ?? 'localhost',
        port: Number(process.env.REDIS_PORT) || 6379,
        password: process.env.REDIS_PASSWORD ?? undefined,
        db: Number(process.env.REDIS_DB) || 0,
        // Reconnect strategy: retry indefinitely with capped backoff
        retryStrategy: (times) => Math.min(times * 100, 3000),
        lazyConnect: true,
        enableOfflineQueue: false, // 🚀 Fail fast if Redis is down (no hanging)
        maxRetriesPerRequest: 1,
        commandTimeout: 2000,
    });
    // Prevent unhandled error events when Redis is completely down
    redis.on('error', () => {
        // silently ignore socket errors so it fails gracefully
    });
    // Connect and validate
    try {
        await redis.connect();
        await redis.ping();
        fastify.log.info('✅ Redis connected');
    }
    catch (err) {
        fastify.log.warn('⚠️  Redis unavailable — caching/rate-limiting disabled');
    }
    // Expose on fastify instance
    fastify.decorate('redis', redis);
    // Graceful shutdown
    fastify.addHook('onClose', async () => {
        await redis.quit();
        fastify.log.info('Redis connection closed');
    });
});
//# sourceMappingURL=redis.js.map