import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { SurveyService } from './survey.service';
import { getCachedResults, setCachedResults } from '../../plugins/redis.helpers';
import { broadcaster } from '../realtime/broadcaster';

const createSurveySchema = {
  body: {
    type: 'object',
    required: ['title', 'questions'],
    properties: {
      title:       { type: 'string', minLength: 3, maxLength: 200 },
      description: { type: 'string', maxLength: 1000 },
      imageUrl:    { type: 'string', format: 'uri' },
      isPublic:    { type: 'boolean' },
      deadline:    { type: 'string', format: 'date-time' },
      questions: {
        type: 'array', minItems: 1, maxItems: 20,
        items: {
          type: 'object',
          required: ['text', 'options'],
          properties: {
            text:     { type: 'string', minLength: 1, maxLength: 500 },
            imageUrl: { type: 'string', format: 'uri' },
            options: {
              type: 'array', minItems: 2, maxItems: 10,
              items: {
                type: 'object',
                required: ['text'],
                properties: { text: { type: 'string', minLength: 1, maxLength: 200 } },
              },
            },
          },
        },
      },
    },
  },
};

export async function surveyRoutes(fastify: FastifyInstance) {
  const surveyService = new SurveyService(fastify.prisma);

  // GET /api/surveys ─────────────────────────────────────────────────────────
  fastify.get('/', async (req: FastifyRequest<{ Querystring: { authorId?: string } }>, reply: FastifyReply) => {
    try {
      const { authorId } = req.query;
      return reply.send({ surveys: await surveyService.getAllSurveys(authorId) });
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'Помилка завантаження опитувань' });
    }
  });

  // POST /api/surveys ────────────────────────────────────────────────────────
  fastify.post('/', { schema: createSurveySchema, preValidation: [(fastify as any).authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = req.body as {
        title: string; description?: string; imageUrl?: string; isPublic?: boolean; deadline?: string;
        questions: { text: string; imageUrl?: string; options: { text: string }[] }[]
      };
      
      const payload = { ...body, createdById: req.user?.id };
      const survey = await surveyService.createSurvey(payload);
      return reply.status(201).send({
        survey,
        voteUrl:    `/api/vote/${survey.id}`,
        resultsUrl: `/api/surveys/${survey.id}/results`,
      });
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'Помилка створення опитування' });
    }
  });

  // GET /api/surveys/:id ─────────────────────────────────────────────────────
  fastify.get('/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const survey = await surveyService.getSurveyById(req.params.id);
      if (!survey) return reply.status(404).send({ error: 'Опитування не знайдено' });
      
      // If private, only owner can see
      if (!survey.isPublic) {
        const userId = req.headers['x-user-id'] as string;
        if (userId !== survey.createdById) {
          return reply.status(403).send({ error: 'Опитування не є публічним' });
        }
      }
      
      return reply.send({ survey });
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'Помилка завантаження опитування' });
    }
  });

  // GET /api/surveys/:id/results ─────────────────────────────────────────────
  //
  // Cache layer:
  //   1. Check Redis (TTL 30s)
  //   2. Cache miss → query DB → write to Redis
  //   3. X-Cache header tells client whether it was a HIT or MISS
  //
  fastify.get('/:id/results', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = req.params;

    try {
      // ── 1. Redis cache lookup ──────────────────────────────────────────
      const cached = await getCachedResults(fastify.redis, id);
      if (cached) {
        fastify.log.info({ surveyId: id }, 'Results cache HIT');
        return reply
          .header('X-Cache', 'HIT')
          .header('X-Cache-TTL', '30')
          .send({ results: cached });
      }

      // ── 2. Cache miss — query DB ───────────────────────────────────────
      fastify.log.info({ surveyId: id }, 'Results cache MISS');
      const results = await surveyService.getSurveyResults(id);
      if (!results) return reply.status(404).send({ error: 'Опитування не знайдено' });

      // ── 3. Write to cache ──────────────────────────────────────────────
      await setCachedResults(fastify.redis, id, results);

      return reply
        .header('X-Cache', 'MISS')
        .send({ results });

    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'Помилка завантаження результатів' });
    }
  });

  // PATCH /api/surveys/:id ──────────────────────────────────────────────────
  fastify.patch('/:id', { preValidation: [(fastify as any).authenticate] }, async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const { id } = req.params;
      
      // Access check
      const survey = await surveyService.getSurveyById(id);
      if (!survey) return reply.status(404).send({ error: 'Опитування не знайдено' });
      if (req.user?.id !== survey.createdById) {
        return reply.status(403).send({ error: 'Forbidden', message: 'You can only edit your own surveys' });
      }

      const body = req.body as any;
      const results = await surveyService.updateSurvey(id, body);
      
      if (results) {
        // Broadcast update to all subscribers
        broadcaster.broadcast(id, {
          type: 'survey_update',
          ...results
        });
      }

      return reply.send({ success: true, results });
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'Помилка оновлення опитування' });
    }
  });

  // DELETE /api/surveys/:id ─────────────────────────────────────────────────
  fastify.delete('/:id', { preValidation: [(fastify as any).authenticate] }, async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const { id } = req.params;

      // Access check
      const survey = await surveyService.getSurveyById(id);
      if (!survey) return reply.status(404).send({ error: 'Опитування не знайдено' });
      if (req.user?.id !== survey.createdById) {
        return reply.status(403).send({ error: 'Forbidden', message: 'You can only delete your own surveys' });
      }

      await surveyService.deleteSurvey(id);
      return reply.send({ success: true, message: 'Опитування видалено' });
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'Помилка видалення опитування' });
    }
  });
}
