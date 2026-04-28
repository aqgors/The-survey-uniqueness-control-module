import {
  FastifyInstance,
  FastifyRequest,
  FastifyReply,
} from 'fastify';
import { randomUUID } from 'crypto';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { AntiFraudService, VoterIdentity } from '../anti-fraud/antifraud.service';
import { SurveyService } from './survey.service';
import { broadcaster } from '../realtime/broadcaster';
import { checkRateLimit, invalidateResultsCache } from '../../plugins/redis.helpers';

// ── Constants ──────────────────────────────────────────────────────────────

const COOKIE_NAME = 'survey_voter_id';
const COOKIE_TTL  = 60 * 60 * 24 * 365; // 1 рік у секундах

// ── Request body schema (Fastify/AJV validation) ───────────────────────────

const voteBodySchema = {
  type: 'object',
  required: ['answers'],
  additionalProperties: false,
  properties: {
    /** UUID токен з localStorage (надсилає frontend як резервний канал) */
    cookieId: {
      type: 'string',
      minLength: 10,
      maxLength: 128,
    },
    /** Масив відповідей — по одному об'єкту на кожне питання */
    answers: {
      type: 'array',
      minItems: 1,
      maxItems: 50,
      items: {
        type: 'object',
        required: ['questionId', 'optionIds'],
        additionalProperties: false,
        properties: {
          questionId: { type: 'string', minLength: 1 },
          optionIds: {
            type: 'array',
            minItems: 1,
            maxItems: 10,
            items: { type: 'string', minLength: 1 },
          },
        },
      },
    },
  },
};

const voteSchema = {
  tags: ['Voting'],
  summary: 'Submit a vote',
  description: 'Records a vote for a survey with anti-fraud protection.',
  params: {
    type: 'object',
    required: ['surveyId'],
    properties: {
      surveyId: { type: 'string', minLength: 1 },
    },
  },
  body: voteBodySchema,
  response: {
    201: {
      type: 'object',
      properties: {
        success:    { type: 'boolean' },
        message:    { type: 'string' },
        cookieId:   { type: 'string' },
        resultsUrl: { type: 'string' },
      },
    },
    400: {
      type: 'object',
      properties: {
        error:   { type: 'string' },
        details: { type: 'string' },
      },
    },
    403: {
      type: 'object',
      properties: {
        error:   { type: 'string' },
        signal:  { type: 'string' },
        message: { type: 'string' },
      },
    },
    404: {
      type: 'object',
      properties: { error: { type: 'string' } },
    },
    410: {
      type: 'object',
      properties: { error: { type: 'string' } },
    },
    500: {
      type: 'object',
      properties: { error: { type: 'string' } },
    },
  },
};

// ── Helper: extract real IP ────────────────────────────────────────────────

/**
 * Витягує IP-адресу клієнта.
 * Враховує reverse-proxy заголовки (X-Forwarded-For, X-Real-IP).
 */
function extractClientIp(req: FastifyRequest): string {
  // Заголовок від nginx/cloudflare: "client, proxy1, proxy2"
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    const first = ips.split(',')[0].trim();
    if (first) return first;
  }

  // Альтернативний заголовок від деяких proxy
  const realIp = req.headers['x-real-ip'];
  if (realIp && !Array.isArray(realIp)) return realIp.trim();

  // Пряме з'єднання
  return req.socket?.remoteAddress ?? '127.0.0.1';
}

// ── Helper: resolve cookieId ───────────────────────────────────────────────

/**
 * Визначає voter-токен у такому пріоритеті:
 *   1. Тіло запиту (cookieId поле) — надсилає frontend з localStorage
 *   2. HTTP Cookie header — встановлений попереднім голосуванням
 *   3. Новий UUID — перший візит
 */
function resolveVoterCookieId(req: FastifyRequest): { cookieId: string; isNew: boolean } {
  // 1. З тіла запиту
  const body = req.body as Record<string, unknown> | null;
  if (body && typeof body.cookieId === 'string' && body.cookieId.length >= 10) {
    return { cookieId: body.cookieId, isNew: false };
  }

  // 2. З Cookie-заголовка
  const cookieHeader = req.headers['cookie'] ?? '';
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;\\s]+)`));
  if (match?.[1]) {
    return { cookieId: match[1], isNew: false };
  }

  // 3. Генеруємо новий
  return { cookieId: randomUUID(), isNew: true };
}

// ── Helper: set voter cookie on response ──────────────────────────────────

function setVoterCookie(reply: FastifyReply, cookieId: string): void {
  reply.header(
    'Set-Cookie',
    [
      `${COOKIE_NAME}=${cookieId}`,
      `Max-Age=${COOKIE_TTL}`,
      'Path=/',
      'HttpOnly',               // недоступний з JS — захист від XSS
      'SameSite=Lax',           // захист від CSRF
      // 'Secure',              // розкоментуйте у production (HTTPS)
    ].join('; ')
  );
}

// ── Route plugin ───────────────────────────────────────────────────────────

export async function voteEndpoint(fastify: FastifyInstance) {
  const antiFraudService = new AntiFraudService(fastify.prisma);
  const surveyService    = new SurveyService(fastify.prisma);

  /**
   * POST /vote/:surveyId
   *
   * Приймає голос від користувача.
   * Перед записом виконує anti-fraud перевірку:
   *   cookieId → IP → User-Agent
   */
  fastify.post<{
    Params: { surveyId: string };
    Body:   { cookieId?: string; answers: { questionId: string; optionIds: string[] }[] };
  }>(
    '/:surveyId',
    { schema: voteSchema },
    async (req: FastifyRequest, reply: FastifyReply) => {

      const { surveyId } = req.params as { surveyId: string };
      const { answers } = req.body as {
        answers: { questionId: string; optionIds: string[] }[];
      };
      // Get userId from header if logged in (optional — null = anonymous)
      const voterUserId = (req.headers['x-user-id'] as string) || null;

      // ────────────────────────────────────────────────────────────────────
      // ────────────────────────────────────────────────────────────────────
      // STEP 1 — Отримати IP та User-Agent
      // ────────────────────────────────────────────────────────────────────
      const rawIp = extractClientIp(req);
      const userAgent = (req.headers['user-agent'] ?? 'unknown').slice(0, 512);
      const { cookieId } = resolveVoterCookieId(req);
      const identity: VoterIdentity = { ip: rawIp, userAgent, cookieId };

      // ────────────────────────────────────────────────────────────────────
      // STEP 2 — Отримати опитування (потрібно для перевірки авторства)
      // ────────────────────────────────────────────────────────────────────
      const survey = await fastify.prisma.survey.findUnique({
        where: { id: surveyId },
        include: {
          questions: {
            include: { options: { select: { id: true } } },
          },
        },
      });

      if (!survey) {
        return reply.status(404).send({ error: 'Опитування не знайдено' });
      }

      // ────────────────────────────────────────────────────────────────────
      // STEP 3 — Перевірка авторства (skip anti-fraud & rate limit)
      // ────────────────────────────────────────────────────────────────────
      const isAuthorPreview = !!(voterUserId && voterUserId === survey.createdById);

      if (!isAuthorPreview) {
        // 3a. Rate limiting (тільки для звичайних користувачів)
        const rateResult = await checkRateLimit(fastify.redis, rawIp);
        if (!rateResult.allowed) {
          reply
            .header('X-RateLimit-Limit',     String(5))
            .header('X-RateLimit-Remaining', '0')
            .header('X-RateLimit-Reset',     String(rateResult.resetIn))
            .header('Retry-After',           String(rateResult.resetIn));
          return reply.status(429).send({
            error:   'rate_limit_exceeded',
            message: `Забагато запитів з вашого IP. Спробуйте через ${rateResult.resetIn} секунд.`,
            resetIn: rateResult.resetIn,
          });
        }
        
        reply
          .header('X-RateLimit-Limit',     String(5))
          .header('X-RateLimit-Remaining', String(rateResult.remaining))
          .header('X-RateLimit-Reset',     String(rateResult.resetIn));

        // 3b. Перевірка на приватність та дедлайн
        if (!survey.isActive) {
          return reply.status(410).send({ error: 'survey_closed', message: 'Опитування закрито автором' });
        }

        if (survey.isPrivate) {
          const unlockToken = req.headers['x-unlock-token'] as string;
          let unlocked = false;
          if (unlockToken) {
            try {
              const decoded = (fastify as any).jwt.verify(unlockToken) as any;
              if (decoded.surveyId === surveyId && decoded.type === 'unlock') unlocked = true;
            } catch(e) {}
          }
          if (!unlocked) {
            return reply.status(403).send({ error: 'not_public', message: 'Опитування захищене паролем', requiresPassword: true });
          }
        }

        if (survey.deadline && new Date() > survey.deadline) {
          return reply.status(410).send({ error: 'deadline_passed', message: 'Опитування вже завершено' });
        }

        // 3c. Anti-fraud check
        try {
          const fraudCheck = await antiFraudService.checkUniqueness(surveyId, identity);
          if (!fraudCheck.isUnique) {
            setVoterCookie(reply, cookieId);
            return reply.status(403).send({
              error:   'already_voted',
              signal:  fraudCheck.signal,
              message: fraudCheck.message,
            });
          }
        } catch (err) {
          fastify.log.error({ err }, 'AntiFraudService error');
          // Skip block on internal error but log it
        }
      } else {
        fastify.log.info({ surveyId, voterUserId }, 'Author preview vote — skipping anti-fraud and rate-limit');
      }

      // ────────────────────────────────────────────────────────────────────
      // STEP 4 — Валідація + запис голосу
      // ────────────────────────────────────────────────────────────────────
      // 4a. Повторна перевірка дедлайну (про всяк випадок)
      if (survey.deadline && new Date() > survey.deadline) {
        return reply.status(410).send({ error: 'deadline_passed', message: 'Опитування вже завершено' });
      }

      // 5b. Валідація відповідей
      const questionMap = new Map(survey.questions.map((q) => [q.id, q]));

      for (const answer of answers) {
        const question = questionMap.get(answer.questionId);

        if (!question) {
          return reply.status(400).send({
            error: 'Невалідні дані',
            details: `Питання "${answer.questionId}" не належить цьому опитуванню`,
          });
        }

        const validOptionIds = new Set(question.options.map((o) => o.id));

        for (const oid of answer.optionIds) {
          if (!validOptionIds.has(oid)) {
            return reply.status(400).send({
              error: 'Невалідні дані',
              details: `Варіант "${oid}" не належить питанню "${answer.questionId}"`,
            });
          }
        }
      }

      // 5c. Атомарний запис: Vote + VoteItems + VoteMeta
      try {
        if (!isAuthorPreview) {
          await fastify.prisma.$transaction(async (tx) => {
            // Створити Vote (з optional voterUserId для stub auth)
            const vote = await tx.vote.create({
              data: { surveyId, voterUserId: voterUserId ?? null },
              select: { id: true },
            });

            // Створити VoteItem для кожного обраного варіанта
            await tx.voteItem.createMany({
              data: answers.flatMap((a) =>
                a.optionIds.map((optionId) => ({
                  voteId: vote.id,
                  optionId,
                }))
              ),
            });

            // Записати VoteMeta (anti-fraud lock)
            await antiFraudService.recordVoteMeta(vote.id, surveyId, identity, tx);
          });

          // ────────────────────────────────────────────────────────────────────
          // STEP 6 — Broadcast нові результати всім WS-підписникам
          //          + Invalidate results cache so next HTTP request gets fresh data
          // ────────────────────────────────────────────────────────────────────
          surveyService.getSurveyResults(surveyId)
            .then(async (results) => {
              if (!results) return;

              // Invalidate stale cache
              await invalidateResultsCache(fastify.redis, surveyId);

              // Push fresh results to all WS subscribers
              broadcaster.broadcast(surveyId, {
                type:        'results_update',
                surveyId,
                totalVoters: results.totalVoters,
                voters:      results.voters,
                deadline:    results.deadline,
                createdById: results.createdById,
                questions:   results.questions,
              });
            })
            .catch((err) => fastify.log.error(err, 'WS broadcast / cache invalidation failed'));
        } else {
          fastify.log.info({ surveyId, voterUserId }, 'Author preview vote — skipping persistence');
        }

      } catch (err) {
        // P2002 = Unique constraint violation (race condition)
        if (
          err instanceof PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          setVoterCookie(reply, cookieId);
          return reply.status(403).send({
            error:   'already_voted',
            signal:  'cookieId',
            message: 'Ви вже голосували в цьому опитуванні.',
          });
        }

        fastify.log.error({ err }, 'Failed to persist vote');
        return reply.status(500).send({ error: 'Не вдалося записати голос. Спробуйте пізніше.' });
      }

      // ────────────────────────────────────────────────────────────────────
      // STEP 7 — Успіх: встановити cookie і повернути 201
      // ────────────────────────────────────────────────────────────────────
      setVoterCookie(reply, cookieId);

      fastify.log.info({ surveyId, cookieId }, 'Vote recorded successfully');

      return reply.status(201).send({
        success:    true,
        message:    'Ваш голос успішно прийнято',
        cookieId,
        resultsUrl: `/survey/${surveyId}/results`,
      });
    }
  );
}
