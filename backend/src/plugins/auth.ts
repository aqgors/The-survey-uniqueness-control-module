import { FastifyPluginAsync, FastifyReply, FastifyRequest, FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

declare module 'fastify' {
  export interface FastifyRequest {
    user?: { id: string; role: 'USER' };
  }
  export interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const plugin: FastifyPluginAsync = async (fastify) => {
  // Simple Stub Auth: gets user from headers
  fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.headers['x-user-id'] as string;

    if (!userId) {
      reply.code(401).send({ message: "Unauthorized" });
      return;
    }

    request.user = { id: userId, role: 'USER' };
  });
};

export const authPlugin = fp(plugin, { name: 'auth-plugin' });
