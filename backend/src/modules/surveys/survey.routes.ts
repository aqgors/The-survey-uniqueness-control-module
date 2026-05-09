import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { SurveyService } from './survey.service';
import { getCachedResults, setCachedResults } from '../../plugins/redis.helpers';
import { broadcaster } from '../realtime/broadcaster';
import bcrypt from 'bcryptjs';

// ── Memory Store Fallback (when Redis is down) ─────────────────────────────
const memoryAttempts = new Map<string, { count: number, expiresAt: number }>();
function getMemoryAttempts(key: string): number {
  const data = memoryAttempts.get(key);
  if (!data) return 0;
  if (Date.now() > data.expiresAt) {
    memoryAttempts.delete(key);
    return 0;
  }
  return data.count;
}
function incrMemoryAttempts(key: string): number {
  const data = memoryAttempts.get(key);
  const now = Date.now();
  if (!data || now > data.expiresAt) {
    const newData = { count: 1, expiresAt: now + 600000 }; // 10 minutes
    memoryAttempts.set(key, newData);
    return 1;
  }
  data.count += 1;
  return data.count;
}
function delMemoryAttempts(key: string): void {
  memoryAttempts.delete(key);
}

const createSurveySchema = {
  tags: ['Surveys'],
  summary: 'Create a new survey',
  description: 'Creates a new survey with questions and options. Requires authentication.',
  security: [{ BearerAuth: [] }],
  body: {
    type: 'object',
    required: ['title', 'questions'],
    properties: {
      title:       { type: 'string', minLength: 3, maxLength: 200, example: 'Опитування' },
      description: { type: 'string', maxLength: 1000, example: 'Тест' },
      imageUrl:    { type: 'string', format: 'uri' },
      isPrivate:   { type: 'boolean', default: false },
      isActive:    { type: 'boolean', default: true },
      password:    { type: 'string', minLength: 4, maxLength: 100, pattern: '[A-Za-zА-Яа-яЁёІіЇїЄєҐґ]' },
      deadline:    { type: 'string', format: 'date-time', example: '2026-05-01T18:00:00Z' },
      accessType:  { type: 'string', enum: ['PUBLIC', 'PRIVATE', 'ANONYMOUS_INVITE'] },
      inviteExpiresAt: { type: 'string', format: 'date-time' },
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
  response: {
    201: {
      description: 'Survey created successfully',
      type: 'object',
      properties: {
        survey: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string' },
            isPrivate: { type: 'boolean' },
          },
        },
        voteUrl: { type: 'string' },
        resultsUrl: { type: 'string' },
      },
    },
    500: { description: 'Server error', type: 'object', properties: { error: { type: 'string' } } },
  },
};

export async function surveyRoutes(fastify: FastifyInstance) {
  const surveyService = new SurveyService(fastify.prisma);

  // GET /api/surveys ─────────────────────────────────────────────────────────
  fastify.get('/', {
    schema: {
      tags: ['Surveys'],
      summary: 'Get all public surveys',
      description: 'Returns a list of public surveys. Optionally filter by authorId.',
      querystring: {
        type: 'object',
        properties: { authorId: { type: 'string' } },
      },
    },
  }, async (req: FastifyRequest<{ Querystring: { authorId?: string } }>, reply: FastifyReply) => {
    try {
      const { authorId } = req.query;
      return reply.send({ surveys: await surveyService.getAllSurveys(authorId) });
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'Помилка завантаження опитувань' });
    }
  });

  // GET /api/surveys/participated ─────────────────────────────────────────────
  // Returns surveys where the authenticated user has voted
  fastify.get('/participated', {
    schema: {
      tags: ['Surveys'],
      summary: 'Get surveys user has participated in',
      security: [{ BearerAuth: [] }],
    },
    preValidation: [(fastify as any).authenticate]
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = req.user?.id;
      if (!userId) return reply.status(401).send({ error: 'Неавторизовано' });

      // Find surveys where this user has a vote record
      const votes = await fastify.prisma.vote.findMany({
        where: { voterUserId: userId },
        select: { surveyId: true, createdAt: true },
        distinct: ['surveyId'],
        orderBy: { createdAt: 'desc' },
      });

      const surveyIds = votes.map(v => v.surveyId);

      if (surveyIds.length === 0) return reply.send({ surveys: [] });

      const surveys = await fastify.prisma.survey.findMany({
        where: { id: { in: surveyIds }, accessType: { not: 'ANONYMOUS_INVITE' } },
        select: {
          id: true, title: true, description: true,
          imageUrl: true, isPrivate: true, isActive: true,
          accessType: true, createdAt: true, deadline: true,
          _count: { select: { votes: true, questions: true } },
        },
      });

      // Keep vote order (most recent first)
      const sorted = surveyIds
        .map(id => surveys.find(s => s.id === id))
        .filter(Boolean);

      return reply.send({ surveys: sorted });
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'Помилка завантаження опитувань' });
    }
  });

  // POST /api/surveys ────────────────────────────────────────────────────────
  fastify.post('/', { schema: createSurveySchema, preValidation: [(fastify as any).authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = req.body as {
        title: string; description?: string; imageUrl?: string; isPrivate?: boolean; isActive?: boolean; password?: string; deadline?: string;
        accessType?: any; inviteExpiresAt?: string;
        questions: { text: string; imageUrl?: string; options: { text: string }[] }[]
      };
      
      // Hash password if creating a private survey — done in service layer
      const payload = { ...body, createdById: req.user?.id };
      const survey = await surveyService.createSurvey(payload);
      
      // Emit 'survey_created' to global channel
      broadcaster.broadcast('global', {
        type: 'survey_created',
        survey: {
          id: survey.id,
          title: survey.title,
          description: survey.description,
          imageUrl: survey.imageUrl,
          isPrivate: survey.isPrivate,
          isActive: survey.isActive,
          createdAt: (survey as any).createdAt?.toISOString() || new Date().toISOString(),
          deadline: survey.deadline ? survey.deadline.toISOString() : null,
          createdById: survey.createdById,
          accessType: survey.accessType,
          _count: { votes: 0, questions: survey.questions?.length || 0 }
        }
      });

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

  // POST /api/surveys/:id/unlock ────────────────────────────────────
  fastify.post('/:id/unlock', {
    schema: {
      tags: ['Surveys'],
      summary: 'Unlock private survey',
      body: {
        type: 'object',
        required: ['password'],
        additionalProperties: false,
        properties: {
          password: { type: 'string', minLength: 1, maxLength: 200 },
          // Ідентифікатор пристрою з localStorage (для анонімних користувачів)
          cookieId: { type: 'string', minLength: 10, maxLength: 128 },
        },
      },
      params: {
        type: 'object',
        properties: { id: { type: 'string' } },
      },
    },
  }, async (req: FastifyRequest<{
    Params: { id: string };
    Body: { password: string; cookieId?: string };
  }>, reply: FastifyReply) => {
    try {
      const { id } = req.params;
      const { password, cookieId: bodyCookieId } = req.body;
      const userId = req.headers['x-user-id'] as string | undefined;

      // ── Завантажити опитування ────────────────────────────────────────
      const survey = await surveyService.getSurveyById(id);
      if (!survey) return reply.status(404).send({ error: 'Опитування не знайдено' });
      if (!survey.isPrivate) return reply.status(400).send({ error: 'Опитування не є приватним' });
      if (!survey.passwordHash) return reply.status(400).send({ error: 'Пароль не встановлено для цього опитування' });

      // Автор опитування — без обмежень
      const isOwner = !!(userId && userId === survey.createdById);

      const redis        = (fastify as any).redis;
      const MAX_ATTEMPTS = 10;
      const TTL_SECONDS  = 600; // 10 хвилин

      // ── Визначення ключів блокування ──────────────────────────────────
      //
      // 1. Анонімний ідентифікатор:
      //    Спочатку шукаємо HttpOnly cookie. Якщо немає — генеруємо новий 
      //    (і встановлюємо його в reply). Також беремо bodyCookieId як додаткову гарантію.
      
      let browserId = req.cookies['survey_browser_id'] || bodyCookieId || require('crypto').randomUUID();
      
      if (!req.cookies['survey_browser_id']) {
        // Встановлюємо HttpOnly cookie
        reply.setCookie('survey_browser_id', browserId, {
          path: '/',
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          maxAge: 31536000, // 1 рік
          sameSite: 'lax',
        });
      }

      const cookieKey = `unlock_attempts:cookie:${browserId}:${id}`;
      const userKey   = userId ? `unlock_attempts:user:${userId}:${id}` : null;

      // ── КРОК 1: Прочитати лічильники (НЕ інкрементувати заздалегідь) ──
      if (!isOwner) {
        let attemptsCookie = 0;
        let attemptsUser   = 0;

        if (redis && redis.status === 'ready') {
          try {
            const [c, u] = await Promise.all([
              redis.get(cookieKey),
              userKey ? redis.get(userKey) : Promise.resolve(null)
            ]);
            attemptsCookie = parseInt(c || '0', 10);
            attemptsUser   = parseInt(u || '0', 10);
          } catch {
            attemptsCookie = getMemoryAttempts(cookieKey);
            attemptsUser   = userKey ? getMemoryAttempts(userKey) : 0;
          }
        } else {
          attemptsCookie = getMemoryAttempts(cookieKey);
          attemptsUser   = userKey ? getMemoryAttempts(userKey) : 0;
        }

        const maxAttemptsMade = Math.max(attemptsCookie, attemptsUser);

        if (maxAttemptsMade >= MAX_ATTEMPTS) {
          // Знаходимо ключ, який спричинив блокування, щоб дізнатись TTL
          const blockedKey = attemptsUser >= MAX_ATTEMPTS ? userKey! : cookieKey;
          let ttl = TTL_SECONDS;
          
          if (redis && redis.status === 'ready') {
            try { ttl = await redis.ttl(blockedKey); } catch {}
          } else {
            const data = memoryAttempts.get(blockedKey);
            if (data) ttl = Math.ceil((data.expiresAt - Date.now()) / 1000);
          }

          fastify.log.warn({ userId, browserId, surveyId: id, attemptsCookie, attemptsUser }, 'Unlock blocked: too many attempts');
          const minutesLeft = Math.ceil((ttl > 0 ? ttl : TTL_SECONDS) / 60);
          return reply.status(429).send({
            error:   'too_many_attempts',
            message: `Забагато невдалих спроб. Зачекайте ${minutesLeft} хвилин перед наступною спробою.`,
            retryAfter: ttl > 0 ? ttl : TTL_SECONDS,
          });
        }
      }

      // ── КРОК 2: Перевірити пароль ─────────────────────────────────────
      const isMatch = await bcrypt.compare(password, survey.passwordHash!);

      if (!isMatch) {
        // ── КРОК 3 (тільки при невдачі): Інкрементувати лічильники ──────
        let currentAttempts = 0;

        if (!isOwner) {
          if (redis && redis.status === 'ready') {
            try {
              const c = await redis.incr(cookieKey);
              if (c === 1) await redis.expire(cookieKey, TTL_SECONDS);
              
              if (userKey) {
                const u = await redis.incr(userKey);
                if (u === 1) await redis.expire(userKey, TTL_SECONDS);
                currentAttempts = Math.max(c, u);
              } else {
                currentAttempts = c;
              }
            } catch {
              const c = incrMemoryAttempts(cookieKey);
              const u = userKey ? incrMemoryAttempts(userKey) : 0;
              currentAttempts = Math.max(c, u);
            }
          } else {
            const c = incrMemoryAttempts(cookieKey);
            const u = userKey ? incrMemoryAttempts(userKey) : 0;
            currentAttempts = Math.max(c, u);
          }
        }

        const attemptsLeft = Math.max(0, MAX_ATTEMPTS - currentAttempts);
        fastify.log.info({ userId, browserId, surveyId: id, currentAttempts, attemptsLeft }, 'Wrong password attempt');

        return reply.status(401).send({
          error: 'wrong_password',
          message: 'Неправильний пароль',
          attemptsLeft,
        });
      }

      // ── КРОК 4: Успіх — очистити лічильники, видати токен ─────────────
      if (!isOwner) {
        if (redis && redis.status === 'ready') {
          try { 
            await redis.del(cookieKey);
            if (userKey) await redis.del(userKey);
          } catch {}
        }
        delMemoryAttempts(cookieKey);
        if (userKey) delMemoryAttempts(userKey);
      }

      const unlockToken = (fastify as any).jwt.sign(
        { surveyId: id, userId: userId || 'anon', type: 'unlock' },
        { expiresIn: '2h' }
      );

      fastify.log.info({ userId, surveyId: id }, 'Survey unlocked successfully');
      return reply.send({ success: true, unlockToken });

    } catch (err) {
      fastify.log.error({ err }, 'Unlock endpoint error');
      return reply.status(500).send({ error: 'Помилка сервера' });
    }
  });


  // GET /api/surveys/:id ─────────────────────────────────────────────────────
  fastify.get('/:id', {
    schema: {
      tags: ['Surveys'],
      summary: 'Get survey by ID',
      description: 'Returns survey details. Private surveys can only be accessed by the creator.',
      params: {
        type: 'object',
        properties: { id: { type: 'string' } },
      },
      querystring: {
        type: 'object',
        properties: { invite: { type: 'string' } },
      },
      response: {
        200: {
          description: 'Survey data',
          type: 'object',
          properties: {
            survey: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                title: { type: 'string' },
                description: { type: 'string' },
                imageUrl: { type: 'string' },
                isPrivate: { type: 'boolean' },
                isActive: { type: 'boolean' },
                accessType: { type: 'string' },
                deadline: { type: 'string', format: 'date-time' },
                createdById: { type: 'string' },
                createdAt: { type: 'string', format: 'date-time' },
                questions: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      text: { type: 'string' },
                      imageUrl: { type: 'string' },
                      options: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'string' },
                            text: { type: 'string' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        403: { description: 'Forbidden', type: 'object', properties: { error: { type: 'string' } } },
        404: { description: 'Not found', type: 'object', properties: { error: { type: 'string' } } },
        500: { description: 'Server error', type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (req: FastifyRequest<{ Params: { id: string }, Querystring: { invite?: string } }>, reply: FastifyReply) => {
    try {
      const { id } = req.params;  // ← FIX: destructure id so JWT check below works
      const { invite } = req.query;
      const survey = await surveyService.getSurveyById(id);
      if (!survey) return reply.status(404).send({ error: 'Опитування не знайдено' });
      
      const userId = req.headers['x-user-id'] as string;
      const userRole = req.headers['x-user-role'] as string;
      const isOwner = !!(userId && survey.createdById && userId === survey.createdById);
      const isAdmin = userRole === 'ADMIN';
      const hasPrivilegedAccess = isOwner || isAdmin;
      
      fastify.log.info({ userId, createdById: survey.createdById, userRole, isOwner, isAdmin }, 'Survey access check');

      if (!survey.isActive && !hasPrivilegedAccess) {
        return reply.status(410).send({ error: 'survey_closed', message: 'Опитування закрито автором' });
      }

      if (survey.accessType === 'ANONYMOUS_INVITE' && !hasPrivilegedAccess) {
        if (!invite) {
          return reply.status(403).send({ error: 'invalid_invite', message: 'Відсутнє посилання-запрошення' });
        }
        
        const validToken = await fastify.prisma.inviteToken.findFirst({
          where: { surveyId: id, token: invite, isActive: true }
        });

        if (!validToken) {
          return reply.status(403).send({ error: 'invalid_invite', message: 'Посилання недійсне або деактивоване' });
        }

        if (validToken.expiresAt && new Date(validToken.expiresAt) < new Date()) {
          return reply.status(403).send({ error: 'invalid_invite', message: 'Термін дії посилання вичерпано' });
        }
      }

      if (survey.isPrivate) {
        if (!hasPrivilegedAccess) {
          // Check for anti-bruteforce block first
          const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown';
          const redis = (fastify as any).redis;
          if (redis && redis.status === 'ready') {
            try {
              const attemptsIP = parseInt(await redis.get(`unlock_attempts:ip:${ip}:${id}`) || '0', 10);
              const attemptsUser = userId ? parseInt(await redis.get(`unlock_attempts:user:${userId}:${id}`) || '0', 10) : 0;
              if (attemptsIP >= 10 || attemptsUser >= 10) {
                return reply.status(429).send({ error: 'too_many_attempts', message: 'Забагато невдалих спроб. Зачекайте 10 хвилин.' });
              }
            } catch (e) {
              fastify.log.warn({ err: e }, 'Redis error during anti-bruteforce check');
            }
          }
          
          // Memory fallback check
          const memIP = getMemoryAttempts(`unlock_attempts:ip:${ip}:${id}`);
          const memUser = userId ? getMemoryAttempts(`unlock_attempts:user:${userId}:${id}`) : 0;
          if (memIP >= 10 || memUser >= 10) {
            return reply.status(429).send({ error: 'too_many_attempts', message: 'Забагато невдалих спроб. Зачекайте 10 хвилин.' });
          }

          const unlockToken = req.headers['x-unlock-token'] as string;
          let unlocked = false;
          if (unlockToken) {
            try {
              const decoded = (fastify as any).jwt.verify(unlockToken) as any;
              if (decoded.surveyId === id && decoded.type === 'unlock' && decoded.userId === (userId || 'anon')) {
                unlocked = true;
              }
            } catch(e) {}
          }
          if (!unlocked) {
            return reply.status(403).send({ error: 'not_public', message: 'Опитування захищене паролем', requiresPassword: true });
          }
        }
      }
      
      // Strip password hash before sending to client
      const { passwordHash: _pw, ...safeSurvey } = survey as any;
      return reply.send({ survey: safeSurvey });
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
  fastify.get('/:id/results', {
    schema: {
      tags: ['Results'],
      summary: 'Get survey results',
      description: 'Returns the aggregated results of a survey including voter list.',
      params: {
        type: 'object',
        properties: { id: { type: 'string' } },
      },
      response: {
        200: {
          description: 'Survey results',
          type: 'object',
          properties: {
            results: {
              type: 'object',
              properties: {
                surveyId: { type: 'string' },
                title: { type: 'string' },
                description: { type: 'string' },
                imageUrl: { type: 'string' },
                isPrivate: { type: 'boolean' },
                isActive: { type: 'boolean' },
                accessType: { type: 'string' },
                totalVoters: { type: 'number' },
                deadline: { type: 'string', format: 'date-time' },
                createdById: { type: 'string' },
                createdAt: { type: 'string', format: 'date-time' },
                voters: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      voterUserId: { type: 'string' },
                      userName: { type: 'string', nullable: true },
                      userEmail: { type: 'string', nullable: true },
                      createdAt: { type: 'string', format: 'date-time' },
                    },
                  },
                },
                questions: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      text: { type: 'string' },
                      imageUrl: { type: 'string' },
                      options: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'string' },
                            text: { type: 'string' },
                            votes: { type: 'number' },
                            percentage: { type: 'number' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        404: { description: 'Not found', type: 'object', properties: { error: { type: 'string' } } },
        500: { description: 'Server error', type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = req.params;

    try {
      // ── Access Control ───────────────────────────────────────────────
      const surveyCheck = await surveyService.getSurveyById(id);
      if (!surveyCheck) return reply.status(404).send({ error: 'Опитування не знайдено' });
      
      const userId = req.headers['x-user-id'] as string;
      const userRole = req.headers['x-user-role'] as string;
      const isOwner = !!(userId && surveyCheck.createdById && userId === surveyCheck.createdById);
      const isAdmin = userRole === 'ADMIN';
      const hasPrivilegedAccess = isOwner || isAdmin;
      
      fastify.log.info({ userId, createdById: surveyCheck.createdById, userRole, isOwner, isAdmin }, 'Results access check');

      if (!surveyCheck.isActive && !hasPrivilegedAccess) {
        return reply.status(410).send({ error: 'survey_closed', message: 'Опитування закрито автором' });
      }

      if (surveyCheck.isPrivate) {
        if (!hasPrivilegedAccess) {
          // Check for anti-bruteforce block first
          const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown';
          const redis = (fastify as any).redis;
          if (redis && redis.status === 'ready') {
            try {
              const attemptsIP = parseInt(await redis.get(`unlock_attempts:ip:${ip}:${id}`) || '0', 10);
              const attemptsUser = userId ? parseInt(await redis.get(`unlock_attempts:user:${userId}:${id}`) || '0', 10) : 0;
              if (attemptsIP >= 10 || attemptsUser >= 10) {
                return reply.status(429).send({ error: 'too_many_attempts', message: 'Забагато невдалих спроб. Зачекайте 10 хвилин.' });
              }
            } catch (e) {
              fastify.log.warn({ err: e }, 'Redis error during anti-bruteforce check');
            }
          }
          
          // Memory fallback check
          const memIP = getMemoryAttempts(`unlock_attempts:ip:${ip}:${id}`);
          const memUser = userId ? getMemoryAttempts(`unlock_attempts:user:${userId}:${id}`) : 0;
          if (memIP >= 10 || memUser >= 10) {
            return reply.status(429).send({ error: 'too_many_attempts', message: 'Забагато невдалих спроб. Зачекайте 10 хвилин.' });
          }

          const unlockToken = req.headers['x-unlock-token'] as string;
          let unlocked = false;
          if (unlockToken) {
            try {
              const decoded = (fastify as any).jwt.verify(unlockToken) as any;
              if (decoded.surveyId === id && decoded.type === 'unlock' && decoded.userId === (userId || 'anon')) {
                unlocked = true;
              }
            } catch(e) {}
          }
          if (!unlocked) {
            return reply.status(403).send({ error: 'not_public', message: 'Результати захищені паролем', requiresPassword: true });
          }
        }
      }

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
  fastify.patch('/:id', {
    schema: {
      tags: ['Surveys'],
      summary: 'Update a survey',
      description: 'Updates survey properties. Only the creator can do this.',
      security: [{ BearerAuth: [] }],
      params: { type: 'object', properties: { id: { type: 'string' } } },
      body: {
        type: 'object',
        properties: {
          title: { type: 'string', minLength: 3, maxLength: 200 },
          description: { type: 'string', maxLength: 1000 },
          imageUrl: { type: 'string' },
          isActive: { type: 'boolean' },
          accessType: { type: 'string', enum: ['PUBLIC', 'PRIVATE', 'ANONYMOUS_INVITE'] },
          currentPassword: { type: 'string' },
          password: { type: 'string', minLength: 4, maxLength: 100, pattern: '[A-Za-zА-Яа-яЁёІіЇїЄєҐґ]' },
          deadline: { type: 'string', format: 'date-time' },
          inviteExpiresAt: { type: 'string', format: 'date-time' },
          questions: {
            type: 'array', minItems: 1, maxItems: 20,
            items: {
              type: 'object',
              required: ['text', 'options'],
              properties: {
                text: { type: 'string', minLength: 1, maxLength: 500 },
                imageUrl: { type: 'string' },
                options: {
                  type: 'array', minItems: 2, maxItems: 10,
                  items: { type: 'object', required: ['text'], properties: { text: { type: 'string', minLength: 1 } } }
                }
              }
            }
          },
        },
      },
      response: {
        200: { description: 'Success', type: 'object', properties: { success: { type: 'boolean' } } },
        403: { description: 'Forbidden', type: 'object', properties: { error: { type: 'string' } } },
        404: { description: 'Not found', type: 'object', properties: { error: { type: 'string' } } },
        500: { description: 'Server error', type: 'object', properties: { error: { type: 'string' } } },
      },
    },
    preValidation: [(fastify as any).authenticate]
  }, async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const { id } = req.params;
      
      // Access check
      const survey = await surveyService.getSurveyById(id);
      if (!survey) return reply.status(404).send({ error: 'Опитування не знайдено' });
      if (req.user?.id !== survey.createdById) {
        return reply.status(403).send({ error: 'Forbidden', message: 'You can only edit your own surveys' });
      }

      const body = req.body as any;

      // ── Verify current password if changing password or access type ────────
      const isChangingPassword = body.password !== undefined && body.accessType === 'PRIVATE';
      if (isChangingPassword && survey.passwordHash) {
        // Existing private survey: require current password confirmation
        if (!body.currentPassword) {
          return reply.status(400).send({ error: 'current_password_required', message: 'Поточний пароль обов\u0027язковий' });
        }
        const passwordMatch = await bcrypt.compare(body.currentPassword, survey.passwordHash);
        if (!passwordMatch) {
          return reply.status(400).send({ error: 'wrong_current_password', message: 'Невірний поточний пароль' });
        }
      }

      const results = await surveyService.updateSurvey(id, body);
      
      if (results) {
        // Broadcast survey update to all subscribers
        broadcaster.broadcast(id, {
          type: 'survey_update',
          surveyId: results.surveyId,
          title: results.title,
          description: results.description,
          imageUrl: results.imageUrl,
          isPrivate: results.isPrivate,
          isActive: results.isActive !== undefined ? results.isActive : survey.isActive,
          deadline: results.deadline,
          createdById: results.createdById,
          questions: results.questions,
        });

        // Also broadcast to global channel for home page updates
        broadcaster.broadcast('global', {
          type: 'survey_updated',
          survey: {
            id: results.surveyId,
            isActive: results.isActive !== undefined ? results.isActive : survey.isActive,
            deadline: results.deadline,
            title: results.title,
            description: results.description,
            imageUrl: results.imageUrl
          }
        });
      }

      return reply.send({ success: true, results });
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'Помилка оновлення опитування' });
    }
  });

  // DELETE /api/surveys/:id ─────────────────────────────────────────────────
  fastify.delete('/:id', {
    schema: {
      tags: ['Surveys'],
      summary: 'Delete a survey',
      description: 'Deletes a survey and all related data. Only the creator can do this.',
      security: [{ BearerAuth: [] }],
      params: { type: 'object', properties: { id: { type: 'string' } } },
      response: {
        200: { description: 'Success', type: 'object', properties: { success: { type: 'boolean' }, message: { type: 'string' } } },
        403: { description: 'Forbidden', type: 'object', properties: { error: { type: 'string' } } },
        404: { description: 'Not found', type: 'object', properties: { error: { type: 'string' } } },
        500: { description: 'Server error', type: 'object', properties: { error: { type: 'string' } } },
      },
    },
    preValidation: [(fastify as any).authenticate]
  }, async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const { id } = req.params;

      // Access check
      const survey = await surveyService.getSurveyById(id);
      if (!survey) return reply.status(404).send({ error: 'Опитування не знайдено' });
      if (req.user?.id !== survey.createdById) {
        return reply.status(403).send({ error: 'Forbidden', message: 'You can only delete your own surveys' });
      }

      await surveyService.deleteSurvey(id);
      
      // Broadcast deletion to all subscribers
      broadcaster.broadcast(id, { type: 'survey_deleted', surveyId: id });

      return reply.send({ success: true, message: 'Опитування видалено' });
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'Помилка видалення опитування' });
    }
  });

  // GET /api/surveys/:id/fraud-stats ────────────────────────────────────────
  fastify.get('/:id/fraud-stats', {
    schema: {
      tags: ['System'],
      summary: 'Get fraud statistics',
      description: 'Returns anti-fraud statistics (IP, Cookie, UA rejections) for a survey.',
      params: { type: 'object', properties: { id: { type: 'string' } } },
      response: {
        200: {
          description: 'Statistics',
          type: 'object',
          properties: {
            stats: {
              type: 'object',
              additionalProperties: true,
            },
          },
        },
      },
    },
  }, async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      // Import AntiFraudService here since it's only used here in this file
      const { AntiFraudService } = await import('../anti-fraud/antifraud.service');
      const antiFraudService = new AntiFraudService(fastify.prisma);
      
      const survey = await surveyService.getSurveyById(req.params.id);
      if (!survey) return reply.status(404).send({ error: 'Опитування не знайдено' });
      
      const stats = await antiFraudService.getFraudStats(survey.id);
      return reply.send({ stats });
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'Помилка' });
    }
  });

  // GET /api/surveys/:id/invites ───────────────────────────────────────────
  fastify.get('/:id/invites', {
    preValidation: [(fastify as any).authenticate]
  }, async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const survey = await surveyService.getSurveyById(req.params.id);
      if (!survey) return reply.status(404).send({ error: 'Опитування не знайдено' });
      if (req.user?.id !== survey.createdById) {
        return reply.status(403).send({ error: 'Forbidden' });
      }

      const tokens = await surveyService.getInviteTokens(req.params.id);
      return reply.send({ tokens });
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'Помилка' });
    }
  });


  // POST /api/surveys/:id/invites/new — deactivate old, create fresh token ─
  fastify.post('/:id/invites/new', {
    preValidation: [(fastify as any).authenticate]
  }, async (req: FastifyRequest<{ Params: { id: string }; Body: { expiresAt?: string; label?: string } }>, reply: FastifyReply) => {
    try {
      const survey = await surveyService.getSurveyById(req.params.id);
      if (!survey) return reply.status(404).send({ error: 'Опитування не знайдено' });
      if (req.user?.id !== survey.createdById) return reply.status(403).send({ error: 'Forbidden' });

      const expiresAt = req.body.expiresAt ? new Date(req.body.expiresAt) : null;
      const tokens = await surveyService.activateNewToken(req.params.id, expiresAt, req.body.label);
      return reply.send({ tokens });
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'Помилка створення токена' });
    }
  });

  // POST /api/surveys/:id/invites/deactivate — deactivate all active tokens ─
  fastify.post('/:id/invites/deactivate', {
    preValidation: [(fastify as any).authenticate]
  }, async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const survey = await surveyService.getSurveyById(req.params.id);
      if (!survey) return reply.status(404).send({ error: 'Опитування не знайдено' });
      if (req.user?.id !== survey.createdById) return reply.status(403).send({ error: 'Forbidden' });

      await (fastify.prisma as any).inviteToken.updateMany({
        where: { surveyId: req.params.id },
        data: { isActive: false },
      });
      return reply.send({ success: true });
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'Помилка' });
    }
  });

  // POST /api/surveys/:id/invites/:tokenId/deactivate ─────────────────────
  fastify.post('/:id/invites/:tokenId/deactivate', {
    preValidation: [(fastify as any).authenticate]
  }, async (req: FastifyRequest<{ Params: { id: string, tokenId: string } }>, reply: FastifyReply) => {
    try {
      const survey = await surveyService.getSurveyById(req.params.id);
      if (!survey) return reply.status(404).send({ error: 'Опитування не знайдено' });
      if (req.user?.id !== survey.createdById) return reply.status(403).send({ error: 'Forbidden' });

      await surveyService.deactivateInviteToken(req.params.tokenId);
      return reply.send({ success: true });
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'Помилка' });
    }
  });
}

