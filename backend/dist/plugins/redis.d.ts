import { FastifyInstance } from 'fastify';
import Redis from 'ioredis';
declare module 'fastify' {
    interface FastifyInstance {
        redis: Redis;
    }
}
export declare const redisPlugin: (fastify: FastifyInstance) => Promise<void>;
//# sourceMappingURL=redis.d.ts.map