import { FastifyPluginAsync, FastifyReply } from 'fastify';
declare module 'fastify' {
    interface FastifyRequest {
        user?: {
            id: string;
            role: 'USER';
        };
    }
    interface FastifyInstance {
        authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    }
}
export declare const authPlugin: FastifyPluginAsync;
//# sourceMappingURL=auth.d.ts.map