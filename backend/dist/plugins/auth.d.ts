import { FastifyPluginAsync, FastifyInstance } from 'fastify';
declare module '@fastify/jwt' {
    interface FastifyJWT {
        payload: {
            id: string;
            email: string;
            role: string;
        };
        user: {
            id: string;
            email: string;
            role: string;
        };
    }
}
declare module 'fastify' {
    interface FastifyInstance {
        authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
        adminOnly: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    }
}
export declare const authPlugin: FastifyPluginAsync;
export declare function authRoutes(fastify: FastifyInstance): Promise<void>;
//# sourceMappingURL=auth.d.ts.map