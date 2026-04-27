import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { SurveyService } from './survey.service';
import { getCachedResults, setCachedResults } from '../../plugins/redis.helpers';

const createSurveySchema = {
  body: {
    type: 'object',
    required: ['title', 'questions'],
    properties: {
      title:    { type: 'string', minLength: 3, maxLength: 200 },
      isPublic: { type: 'boolean' },
      questions: {
        type: 'array', minItems: 1, maxItems: 20,
        items: {
          type: 'object',
          required: ['text', 'options'],
          properties: {
            text: { type: 'string', minLength: 1, maxLength: 500 },
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
  fastify.get('/', async (_req, reply: FastifyReply) => {
    try {
      return reply.send({ surveys: await surveyService.getAllSurveys() });
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'Помилка завантаження опитувань' });
    }
  });

  // POST /api/surveys ────────────────────────────────────────────────────────
  fastify.post('/', { schema: createSurveySchema }, async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = req.body as {
        title: string; isPublic?: boolean;
        questions: { text: string; options: { text: string }[] }[]
      };
      const survey = await surveyService.createSurvey(body);
      return reply.status(201).send({
        survey,
        voteUrl:    `/vote/${survey.id}`,
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
      if (!survey.isPublic) return reply.status(403).send({ error: 'Опитування не є публічним' });
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
}
