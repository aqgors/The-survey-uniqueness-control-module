import { FastifyInstance, FastifyRequest } from 'fastify';
import { AdminUsersService } from './users.service';

// ─────────────────────────────────────────────────────────────────────────────
// ALL routes in this file → ADMIN only
// ─────────────────────────────────────────────────────────────────────────────

export async function adminUsersRoutes(fastify: FastifyInstance) {
  const svc       = new AdminUsersService(fastify.prisma);
  const onlyAdmin = [fastify.authenticate, (fastify as any).requireRole(['ADMIN'])];

  // GET /api/admin/users
  fastify.get('/', {
    schema: {
      tags: ['Admin - Users'], summary: 'List users (ADMIN only)', security: [{ BearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          page:      { type: 'integer', minimum: 1, default: 1 },
          limit:     { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          search:    { type: 'string' },
          role:      { type: 'string', enum: ['USER', 'MODERATOR', 'ADMIN'] },
          isBlocked: { type: 'boolean' },
          sortBy:    { type: 'string' },
          sortOrder: { type: 'string', enum: ['asc', 'desc'] },
        },
      },
    },
    preValidation: onlyAdmin,
  }, async (req: FastifyRequest<{ Querystring: any }>, reply) => {
    try { return reply.send(await svc.listUsers(req.query as any)); }
    catch (err) { fastify.log.error(err); return reply.status(500).send({ error: 'Помилка' }); }
  });

  // GET /api/admin/users/stats
  fastify.get('/stats', {
    schema: { tags: ['Admin - Users'], summary: 'User stats (ADMIN only)', security: [{ BearerAuth: [] }] },
    preValidation: onlyAdmin,
  }, async (_req, reply) => {
    try { return reply.send(await svc.getStats()); }
    catch (err) { fastify.log.error(err); return reply.status(500).send({ error: 'Помилка' }); }
  });

  // GET /api/admin/users/:id
  fastify.get('/:id', {
    schema: {
      tags: ['Admin - Users'], summary: 'Get user by ID (ADMIN only)', security: [{ BearerAuth: [] }],
      params: { type: 'object', properties: { id: { type: 'string' } } },
    },
    preValidation: onlyAdmin,
  }, async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
    try {
      const user = await svc.getUserById(req.params.id);
      if (!user) return reply.status(404).send({ error: 'Не знайдено' });
      return reply.send({ user });
    } catch (err) { fastify.log.error(err); return reply.status(500).send({ error: 'Помилка' }); }
  });

  // PATCH /api/admin/users/:id/role
  fastify.patch('/:id/role', {
    schema: {
      tags: ['Admin - Users'], summary: 'Change role (ADMIN only)', security: [{ BearerAuth: [] }],
      params: { type: 'object', properties: { id: { type: 'string' } } },
      body: { type: 'object', required: ['role'], properties: { role: { type: 'string', enum: ['USER', 'MODERATOR', 'ADMIN'] } } },
    },
    preValidation: onlyAdmin,
  }, async (req: FastifyRequest<{ Params: { id: string }; Body: { role: any } }>, reply) => {
    try {
      if (req.params.id === req.user.id) return reply.status(400).send({ error: 'Не можна змінити власну роль' });
      const updated = await svc.changeRole(req.params.id, req.body.role, req.user.id);
      if (!updated) return reply.status(404).send({ error: 'Не знайдено' });
      return reply.send({ user: updated });
    } catch (err) { fastify.log.error(err); return reply.status(500).send({ error: 'Помилка' }); }
  });

  // PATCH /api/admin/users/:id/block
  fastify.patch('/:id/block', {
    schema: {
      tags: ['Admin - Users'], summary: 'Block/Unblock user (ADMIN only)', security: [{ BearerAuth: [] }],
      params: { type: 'object', properties: { id: { type: 'string' } } },
      body: { type: 'object', required: ['block'], properties: { block: { type: 'boolean' }, reason: { type: 'string', maxLength: 500 } } },
    },
    preValidation: onlyAdmin,
  }, async (req: FastifyRequest<{ Params: { id: string }; Body: { block: boolean; reason?: string } }>, reply) => {
    try {
      if (req.params.id === req.user.id) return reply.status(400).send({ error: 'Не можна заблокувати себе' });
      const updated = await svc.toggleBlock(req.params.id, req.body.block, req.body.reason, req.user.id);
      if (!updated) return reply.status(404).send({ error: 'Не знайдено' });
      return reply.send({ user: updated });
    } catch (err) { fastify.log.error(err); return reply.status(500).send({ error: 'Помилка' }); }
  });



  // DELETE /api/admin/users/:id
  fastify.delete('/:id', {
    schema: {
      tags: ['Admin - Users'], summary: 'Delete user (ADMIN only)', security: [{ BearerAuth: [] }],
      params: { type: 'object', properties: { id: { type: 'string' } } },
    },
    preValidation: onlyAdmin,
  }, async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
    try {
      if (req.params.id === req.user.id) return reply.status(400).send({ error: 'Не можна видалити себе' });
      const result = await svc.deleteUser(req.params.id, req.user.id);
      if (!result) return reply.status(404).send({ error: 'Не знайдено' });
      return reply.send({ success: true });
    } catch (err) { fastify.log.error(err); return reply.status(500).send({ error: 'Помилка' }); }
  });
}
