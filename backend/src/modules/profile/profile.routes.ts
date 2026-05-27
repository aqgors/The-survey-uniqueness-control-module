import { FastifyInstance, FastifyRequest } from 'fastify';
import path from 'path';
import { ProfileService } from './profile.service';
import multipart from '@fastify/multipart';

export async function profileRoutes(fastify: FastifyInstance) {
  await fastify.register(multipart, {
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  });

  const svc = new ProfileService(fastify.prisma);
  const auth = [fastify.authenticate];

  // GET /api/profile/me
  fastify.get('/me', {
    schema: {
      tags: ['Profile'], summary: 'Get current user profile', security: [{ BearerAuth: [] }],
    },
    preValidation: auth,
  }, async (req, reply) => {
    try {
      const profile = await svc.getProfile(req.user.id);
      if (!profile) return reply.status(404).send({ error: 'Не знайдено' });
      return reply.send({ user: profile });
    } catch (err: any) {
      fastify.log.error(err);
      return reply.status(500).send({ error: err.message });
    }
  });

  // PATCH /api/profile/name
  fastify.patch('/name', {
    schema: {
      tags: ['Profile'], summary: 'Update display name', security: [{ BearerAuth: [] }],
      body: { type: 'object', required: ['name'], properties: { name: { type: 'string', minLength: 1, maxLength: 64 } } },
    },
    preValidation: auth,
  }, async (req: FastifyRequest<{ Body: { name: string } }>, reply) => {
    try {
      const user = await svc.updateName(req.user.id, req.body.name);
      return reply.send({ user: { name: user.name } });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /api/profile/avatar — upload avatar file
  fastify.post('/avatar', {
    schema: { tags: ['Profile'], summary: 'Upload avatar', security: [{ BearerAuth: [] }] },
    preValidation: auth,
  }, async (req, reply) => {
    try {
      const data = await req.file();
      if (!data) return reply.status(400).send({ error: 'Файл не знайдено' });

      const chunks: Buffer[] = [];
      for await (const chunk of data.file) chunks.push(chunk);
      const buffer = Buffer.concat(chunks);

      const avatarUrl = await svc.uploadAvatar(req.user.id, buffer, data.filename);
      return reply.send({ avatarUrl });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /api/profile/password/request — send verification code to email
  fastify.post('/password/request', {
    schema: { tags: ['Profile'], summary: 'Request password change code', security: [{ BearerAuth: [] }] },
    preValidation: auth,
  }, async (req, reply) => {
    try {
      await svc.requestPasswordChange(req.user.id);
      return reply.send({ ok: true });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /api/profile/password/confirm — confirm code + set new password
  fastify.post('/password/confirm', {
    schema: {
      tags: ['Profile'], summary: 'Confirm password change', security: [{ BearerAuth: [] }],
      body: {
        type: 'object', required: ['code', 'newPassword'],
        properties: {
          code:        { type: 'string', minLength: 6, maxLength: 6 },
          newPassword: { type: 'string', minLength: 6 },
        },
      },
    },
    preValidation: auth,
  }, async (req: FastifyRequest<{ Body: { code: string; newPassword: string } }>, reply) => {
    try {
      await svc.confirmPasswordChange(req.user.id, req.body.code, req.body.newPassword);
      return reply.send({ ok: true });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /api/profile/email/request — step 1: send code to OLD email
  fastify.post('/email/request', {
    schema: {
      tags: ['Profile'], summary: 'Request email change (step 1)', security: [{ BearerAuth: [] }],
      body: { type: 'object', required: ['newEmail'], properties: { newEmail: { type: 'string', format: 'email' } } },
    },
    preValidation: auth,
  }, async (req: FastifyRequest<{ Body: { newEmail: string } }>, reply) => {
    try {
      await svc.requestEmailChange(req.user.id, req.body.newEmail);
      return reply.send({ ok: true });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /api/profile/email/confirm-old — step 2: verify old email code, send to NEW email
  fastify.post('/email/confirm-old', {
    schema: {
      tags: ['Profile'], summary: 'Confirm old email (step 2)', security: [{ BearerAuth: [] }],
      body: { type: 'object', required: ['code'], properties: { code: { type: 'string', minLength: 6, maxLength: 6 } } },
    },
    preValidation: auth,
  }, async (req: FastifyRequest<{ Body: { code: string } }>, reply) => {
    try {
      await svc.confirmOldEmail(req.user.id, req.body.code);
      return reply.send({ ok: true });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /api/profile/email/confirm-new — step 3: verify new email code, apply change
  fastify.post('/email/confirm-new', {
    schema: {
      tags: ['Profile'], summary: 'Confirm new email (final step)', security: [{ BearerAuth: [] }],
      body: { type: 'object', required: ['code'], properties: { code: { type: 'string', minLength: 6, maxLength: 6 } } },
    },
    preValidation: auth,
  }, async (req: FastifyRequest<{ Body: { code: string } }>, reply) => {
    try {
      const result = await svc.confirmNewEmail(req.user.id, req.body.code);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });
}
