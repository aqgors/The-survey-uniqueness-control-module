import { FastifyPluginAsync } from 'fastify';
import '@fastify/jwt';
declare module '@fastify/jwt' {
    interface FastifyJWT {
        user: {
            id: string;
            role: 'USER';
        };
    }
}
declare module 'fastify' {
    interface FastifyRequest {
    }
    interface FastifyInstance {
        authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    }
}
export declare const authPlugin: FastifyPluginAsync;
//# sourceMappingURL=auth.d.ts.map