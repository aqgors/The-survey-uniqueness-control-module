import { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import '@fastify/jwt';

// ── JWT Payload type ───────────────────────────────────────────────────────
declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: { id: string; email: string; role: 'USER' | 'MODERATOR' | 'ADMIN' };
  }
}

declare module 'fastify' {
  export interface FastifyInstance {
    authenticate:  (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRole:   (roles: Array<'USER' | 'MODERATOR' | 'ADMIN'>) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const plugin: FastifyPluginAsync = async (fastify) => {

  // ── authenticate ─────────────────────────────────────────────────────────
  // Спочатку перевіряємо JWT Bearer token.
  // Fallback: x-user-id header (зворотна сумісність з існуючими публічними routes).
  fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    // 1. Try Bearer JWT
    const authHeader = request.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        await request.jwtVerify();
        // Update lastLoginAt asynchronously (fire-and-forget)
        if (request.user?.id) {
          fastify.prisma.user.update({
            where: { id: request.user.id },
            data:  { lastLoginAt: new Date() },
          }).catch(() => {});
        }
        return;
      } catch (err) {
        reply.code(401).send({ error: 'Недійсний або прострочений токен' });
        return;
      }
    }

    // 2. Fallback: x-user-id header (legacy support)
    const userId = request.headers['x-user-id'] as string;
    if (userId) {
      const user = await fastify.prisma.user.findUnique({
        where:  { id: userId },
        select: { id: true, email: true, role: true, isBlocked: true },
      });
      if (!user) {
        reply.code(401).send({ error: 'Обліковий запис не знайдено' });
        return;
      }
      if (user.isBlocked) {
        reply.code(403).send({ error: 'Обліковий запис заблоковано' });
        return;
      }
      request.user = { id: user.id, email: user.email, role: user.role as any };
      return;
    }

    reply.code(401).send({ error: 'Необхідна авторизація' });
  });

  // ── requireRole ──────────────────────────────────────────────────────────
  // RBAC middleware factory. Usage: preValidation: [fastify.authenticate, fastify.requireRole(['ADMIN'])]
  fastify.decorate('requireRole', (roles: Array<'USER' | 'MODERATOR' | 'ADMIN'>) => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) {
        reply.code(401).send({ error: 'Необхідна авторизація' });
        return;
      }
      if (!roles.includes(request.user.role)) {
        reply.code(403).send({
          error:   'Доступ заборонено',
          message: `Необхідна роль: ${roles.join(' або ')}`,
        });
        return;
      }
    };
  });
};

export const authPlugin = fp(plugin, { name: 'auth-plugin' });
