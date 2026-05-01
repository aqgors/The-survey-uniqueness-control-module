import { FastifyPluginAsync, FastifyReply, FastifyRequest, FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

import '@fastify/jwt';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: { id: string; role: 'USER' };
  }
}

declare module 'fastify' {
  export interface FastifyRequest {
    // user provided by @fastify/jwt
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
      reply.code(401).send({ error: "Неавторизовано" });
      return;
    }

    const user = await fastify.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true }
    });

    if (!user) {
      reply.code(401).send({ error: "Обліковий запис видалено або не існує" });
      return;
    }

    request.user = { id: user.id, role: user.role as 'USER' };
  });
};

export const authPlugin = fp(plugin, { name: 'auth-plugin' });
