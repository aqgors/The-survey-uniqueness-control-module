import { FastifyInstance, FastifyRequest } from 'fastify';
import { AnomalyService } from './anomaly.service';

export async function adminAnomaliesRoutes(fastify: FastifyInstance) {
  const svc        = new AnomalyService(fastify.prisma);
  const adminOrMod = [fastify.authenticate, (fastify as any).requireRole(['ADMIN', 'MODERATOR'])];
  const onlyAdmin  = [fastify.authenticate, (fastify as any).requireRole(['ADMIN'])];

  // GET /api/admin/anomalies/stats
  fastify.get('/stats', {
    schema: { tags: ['Admin - Anomalies'], summary: 'Anomaly global statistics', security: [{ BearerAuth: [] }] },
    preValidation: adminOrMod,
  }, async (_req, reply) => {
    try { return reply.send(await svc.getAnomalyStats()); }
    catch (err) { fastify.log.error(err); return reply.status(500).send({ error: 'Помилка' }); }
  });

  // GET /api/admin/anomalies
  fastify.get('/', {
    schema: {
      tags: ['Admin - Anomalies'], summary: 'List anomalies', security: [{ BearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          surveyId:  { type: 'string' },
          riskLevel: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
          flag:      { type: 'string' },
          dateFrom:  { type: 'string' },
          dateTo:    { type: 'string' },
          page:      { type: 'integer', minimum: 1, default: 1 },
          limit:     { type: 'integer', minimum: 1, maximum: 100, default: 50 },
          sortOrder: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
        },
      },
    },
    preValidation: adminOrMod,
  }, async (req: FastifyRequest<{ Querystring: any }>, reply) => {
    try { return reply.send(await svc.listAnomalies(req.query as any)); }
    catch (err) { fastify.log.error(err); return reply.status(500).send({ error: 'Помилка' }); }
  });

  // POST /api/admin/anomalies/scan/:surveyId
  fastify.post('/scan/:surveyId', {
    schema: {
      tags: ['Admin - Anomalies'], summary: 'Scan survey for anomalies', security: [{ BearerAuth: [] }],
      params: { type: 'object', properties: { surveyId: { type: 'string' } } },
    },
    preValidation: adminOrMod,
  }, async (req: FastifyRequest<{ Params: { surveyId: string } }>, reply) => {
    try {
      const result = await svc.scanSurvey(req.params.surveyId);
      return reply.send(result);
    } catch (err) { fastify.log.error(err); return reply.status(500).send({ error: 'Помилка сканування' }); }
  });

  // PATCH /api/admin/anomalies/:id/flag
  fastify.patch('/:id/flag', {
    schema: {
      tags: ['Admin - Anomalies'], summary: 'Toggle flag on a VoteMeta record', security: [{ BearerAuth: [] }],
      params: { type: 'object', properties: { id: { type: 'string' } } },
      body: { type: 'object', required: ['flag'], properties: { flag: { type: 'string' } } },
    },
    preValidation: onlyAdmin,
  }, async (req: FastifyRequest<{ Params: { id: string }; Body: { flag: string } }>, reply) => {
    try {
      const updated = await svc.flagVoteMeta(req.params.id, req.body.flag, req.user.id);
      if (!updated) return reply.status(404).send({ error: 'Запис не знайдено' });
      return reply.send(updated);
    } catch (err) { fastify.log.error(err); return reply.status(500).send({ error: 'Помилка' }); }
  });
}
