import { FastifyInstance, FastifyRequest } from 'fastify';
import { AdminSurveysService } from './surveys.service';

export async function adminSurveysRoutes(fastify: FastifyInstance) {
  const svc = new AdminSurveysService(fastify.prisma);
  const adminOrMod = [fastify.authenticate, (fastify as any).requireRole(['ADMIN', 'MODERATOR'])];
  const onlyAdmin  = [fastify.authenticate, (fastify as any).requireRole(['ADMIN'])];

  // GET /api/admin/surveys
  fastify.get('/', {
    schema: {
      tags: ['Admin - Surveys'], summary: 'List all surveys', security: [{ BearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          page:        { type: 'integer', minimum: 1, default: 1 },
          limit:       { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          search:      { type: 'string' },
          isActive:    { type: 'boolean' },
          createdById: { type: 'string' },
          dateFrom:    { type: 'string' },
          dateTo:      { type: 'string' },
          sortBy:      { type: 'string' },
          sortOrder:   { type: 'string', enum: ['asc', 'desc'] },
        },
      },
    },
    preValidation: onlyAdmin,
  }, async (req: FastifyRequest<{ Querystring: any }>, reply) => {
    try { return reply.send(await svc.listSurveys(req.query as any)); }
    catch (err) { fastify.log.error(err); return reply.status(500).send({ error: 'Помилка' }); }
  });

  // GET /api/admin/surveys/dashboard
  fastify.get('/dashboard', {
    schema: { tags: ['Admin - Surveys'], summary: 'Dashboard stats', security: [{ BearerAuth: [] }] },
    preValidation: onlyAdmin,
  }, async (_req, reply) => {
    try { return reply.send(await svc.getDashboardStats()); }
    catch (err) { fastify.log.error(err); return reply.status(500).send({ error: 'Помилка' }); }
  });

  // GET /api/admin/surveys/:id/stats
  fastify.get('/:id/stats', {
    schema: {
      tags: ['Admin - Surveys'], summary: 'Survey statistics', security: [{ BearerAuth: [] }],
      params: { type: 'object', properties: { id: { type: 'string' } } },
    },
    preValidation: onlyAdmin,
  }, async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
    try {
      const stats = await svc.getSurveyStats(req.params.id);
      if (!stats) return reply.status(404).send({ error: 'Опитування не знайдено' });
      return reply.send(stats);
    } catch (err) { fastify.log.error(err); return reply.status(500).send({ error: 'Помилка' }); }
  });

  // PATCH /api/admin/surveys/:id/toggle
  fastify.patch('/:id/toggle', {
    schema: {
      tags: ['Admin - Surveys'], summary: 'Toggle survey active state', security: [{ BearerAuth: [] }],
      params: { type: 'object', properties: { id: { type: 'string' } } },
      body: { type: 'object', required: ['isActive'], properties: { isActive: { type: 'boolean' } } },
    },
    preValidation: onlyAdmin,
  }, async (req: FastifyRequest<{ Params: { id: string }; Body: { isActive: boolean } }>, reply) => {
    try {
      const result = await svc.toggleActive(req.params.id, req.body.isActive, req.user.id);
      if (!result) return reply.status(404).send({ error: 'Опитування не знайдено' });
      return reply.send({ survey: result });
    } catch (err) { fastify.log.error(err); return reply.status(500).send({ error: 'Помилка' }); }
  });

  // POST /api/admin/surveys/:id/duplicate
  fastify.post('/:id/duplicate', {
    schema: {
      tags: ['Admin - Surveys'], summary: 'Duplicate a survey', security: [{ BearerAuth: [] }],
      params: { type: 'object', properties: { id: { type: 'string' } } },
    },
    preValidation: onlyAdmin,
  }, async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
    try {
      const copy = await svc.duplicateSurvey(req.params.id, req.user.id);
      if (!copy) return reply.status(404).send({ error: 'Опитування не знайдено' });
      return reply.status(201).send({ survey: copy });
    } catch (err) { fastify.log.error(err); return reply.status(500).send({ error: 'Помилка' }); }
  });

  // DELETE /api/admin/surveys/:id
  fastify.delete('/:id', {
    schema: {
      tags: ['Admin - Surveys'], summary: 'Delete a survey', security: [{ BearerAuth: [] }],
      params: { type: 'object', properties: { id: { type: 'string' } } },
    },
    preValidation: onlyAdmin,
  }, async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
    try {
      const result = await svc.deleteSurvey(req.params.id, req.user.id);
      if (!result) return reply.status(404).send({ error: 'Опитування не знайдено' });
      return reply.send({ success: true });
    } catch (err) { fastify.log.error(err); return reply.status(500).send({ error: 'Помилка' }); }
  });
}
