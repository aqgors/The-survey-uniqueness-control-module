"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.surveyRoutes = surveyRoutes;
const survey_service_1 = require("./survey.service");
const redis_helpers_1 = require("../../plugins/redis.helpers");
const broadcaster_1 = require("../realtime/broadcaster");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
// ── Memory Store Fallback (when Redis is down) ─────────────────────────────
const memoryAttempts = new Map();
function getMemoryAttempts(key) {
    const data = memoryAttempts.get(key);
    if (!data)
        return 0;
    if (Date.now() > data.expiresAt) {
        memoryAttempts.delete(key);
        return 0;
    }
    return data.count;
}
function incrMemoryAttempts(key) {
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
function delMemoryAttempts(key) {
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
            title: { type: 'string', minLength: 3, maxLength: 200, example: 'Опитування' },
            description: { type: 'string', maxLength: 1000, example: 'Тест' },
            imageUrl: { type: 'string', format: 'uri' },
            isPrivate: { type: 'boolean', default: false },
            isActive: { type: 'boolean', default: true },
            password: { type: 'string', minLength: 4, maxLength: 100 },
            deadline: { type: 'string', format: 'date-time', example: '2026-05-01T18:00:00Z' },
            accessType: { type: 'string', enum: ['PUBLIC', 'PRIVATE', 'ANONYMOUS_INVITE'] },
            inviteExpiresAt: { type: 'string', format: 'date-time' },
            questions: {
                type: 'array', minItems: 1, maxItems: 20,
                items: {
                    type: 'object',
                    required: ['text', 'options'],
                    properties: {
                        text: { type: 'string', minLength: 1, maxLength: 500 },
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
async function surveyRoutes(fastify) {
    const surveyService = new survey_service_1.SurveyService(fastify.prisma);
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
    }, async (req, reply) => {
        try {
            const { authorId } = req.query;
            return reply.send({ surveys: await surveyService.getAllSurveys(authorId) });
        }
        catch (err) {
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
        preValidation: [fastify.authenticate]
    }, async (req, reply) => {
        try {
            const userId = req.user?.id;
            if (!userId)
                return reply.status(401).send({ error: 'Неавторизовано' });
            // Find surveys where this user has a vote record
            const votes = await fastify.prisma.vote.findMany({
                where: { voterUserId: userId },
                select: { surveyId: true, createdAt: true },
                distinct: ['surveyId'],
                orderBy: { createdAt: 'desc' },
            });
            const surveyIds = votes.map(v => v.surveyId);
            if (surveyIds.length === 0)
                return reply.send({ surveys: [] });
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
        }
        catch (err) {
            fastify.log.error(err);
            return reply.status(500).send({ error: 'Помилка завантаження опитувань' });
        }
    });
    // POST /api/surveys ────────────────────────────────────────────────────────
    fastify.post('/', { schema: createSurveySchema, preValidation: [fastify.authenticate] }, async (req, reply) => {
        try {
            const body = req.body;
            // Hash password if creating a private survey — done in service layer
            const payload = { ...body, createdById: req.user?.id };
            const survey = await surveyService.createSurvey(payload);
            // Emit 'survey_created' to global channel
            broadcaster_1.broadcaster.broadcast('global', {
                type: 'survey_created',
                survey: {
                    id: survey.id,
                    title: survey.title,
                    description: survey.description,
                    imageUrl: survey.imageUrl,
                    isPrivate: survey.isPrivate,
                    isActive: survey.isActive,
                    createdAt: survey.createdAt?.toISOString() || new Date().toISOString(),
                    deadline: survey.deadline ? survey.deadline.toISOString() : null,
                    createdById: survey.createdById,
                    accessType: survey.accessType,
                    _count: { votes: 0, questions: survey.questions?.length || 0 }
                }
            });
            return reply.status(201).send({
                survey,
                voteUrl: `/api/vote/${survey.id}`,
                resultsUrl: `/api/surveys/${survey.id}/results`,
            });
        }
        catch (err) {
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
    }, async (req, reply) => {
        try {
            const { id } = req.params;
            const { password, cookieId: bodyCookieId } = req.body;
            const userId = req.headers['x-user-id'];
            // ── Завантажити опитування ────────────────────────────────────────
            const survey = await surveyService.getSurveyById(id);
            if (!survey)
                return reply.status(404).send({ error: 'Опитування не знайдено' });
            if (!survey.isPrivate)
                return reply.status(400).send({ error: 'Опитування не є приватним' });
            if (!survey.passwordHash)
                return reply.status(400).send({ error: 'Пароль не встановлено для цього опитування' });
            // Автор опитування — без обмежень
            const isOwner = !!(userId && userId === survey.createdById);
            const redis = fastify.redis;
            const MAX_ATTEMPTS = 10;
            const TTL_SECONDS = 600; // 10 хвилин
            // ── Визначення ключа блокування ──────────────────────────────────
            //
            // Пріоритет (БЕЗ IP-блокування):
            //   1. userId     → блокуємо конкретний акаунт
            //   2. cookieId   → блокуємо конкретний браузер/пристрій
            //      (фронтенд надсилає з localStorage; також читаємо з Cookie-заголовка)
            //   3. Немає нічого → не блокуємо
            //
            // Кілька користувачів за одним NAT/VPN — повністю незалежні!
            let blockKey = null;
            if (userId) {
                blockKey = `unlock_attempts:user:${userId}:${id}`;
            }
            else {
                const cookieHeader = req.headers['cookie'] ?? '';
                const cookieMatch = cookieHeader.match(/(?:^|;\s*)survey_voter_id=([^;\s]+)/);
                const resolvedId = bodyCookieId || cookieMatch?.[1] || null;
                if (resolvedId)
                    blockKey = `unlock_attempts:cookie:${resolvedId}:${id}`;
            }
            // ── КРОК 1: Прочитати лічильник (НЕ інкрементувати заздалегідь) ──
            if (!isOwner && blockKey) {
                let attempts = 0;
                if (redis && redis.status === 'ready') {
                    try {
                        attempts = parseInt(await redis.get(blockKey) || '0', 10);
                    }
                    catch {
                        attempts = getMemoryAttempts(blockKey);
                    }
                }
                else {
                    attempts = getMemoryAttempts(blockKey);
                }
                if (attempts >= MAX_ATTEMPTS) {
                    let ttl = TTL_SECONDS;
                    if (redis && redis.status === 'ready') {
                        try {
                            ttl = await redis.ttl(blockKey);
                        }
                        catch { }
                    }
                    else {
                        const data = memoryAttempts.get(blockKey);
                        if (data)
                            ttl = Math.ceil((data.expiresAt - Date.now()) / 1000);
                    }
                    fastify.log.warn({ userId, surveyId: id, attempts, blockKey }, 'Unlock blocked: too many attempts');
                    return reply.status(429).send({
                        error: 'too_many_attempts',
                        message: 'Забагато невдалих спроб. Зачекайте 10 хвилин перед наступною спробою.',
                        retryAfter: ttl > 0 ? ttl : TTL_SECONDS,
                    });
                }
            }
            // ── КРОК 2: Перевірити пароль ─────────────────────────────────────
            const isMatch = await bcryptjs_1.default.compare(password, survey.passwordHash);
            if (!isMatch) {
                // ── КРОК 3 (тільки при невдачі): Інкрементувати лічильник ──────
                let currentAttempts = 0;
                if (!isOwner && blockKey) {
                    if (redis && redis.status === 'ready') {
                        try {
                            currentAttempts = await redis.incr(blockKey);
                            if (currentAttempts === 1)
                                await redis.expire(blockKey, TTL_SECONDS);
                        }
                        catch {
                            currentAttempts = incrMemoryAttempts(blockKey);
                        }
                    }
                    else {
                        currentAttempts = incrMemoryAttempts(blockKey);
                    }
                }
                const attemptsLeft = blockKey ? Math.max(0, MAX_ATTEMPTS - currentAttempts) : null;
                fastify.log.info({ userId, surveyId: id, currentAttempts, attemptsLeft, blockKey }, 'Wrong password attempt');
                return reply.status(401).send({
                    error: 'wrong_password',
                    message: 'Неправильний пароль',
                    ...(attemptsLeft !== null && { attemptsLeft }),
                });
            }
            // ── КРОК 4: Успіх — очистити лічильник, видати токен ─────────────
            if (blockKey) {
                if (redis && redis.status === 'ready') {
                    try {
                        await redis.del(blockKey);
                    }
                    catch { }
                }
                delMemoryAttempts(blockKey);
            }
            const unlockToken = fastify.jwt.sign({ surveyId: id, userId: userId || 'anon', type: 'unlock' }, { expiresIn: '2h' });
            fastify.log.info({ userId, surveyId: id }, 'Survey unlocked successfully');
            return reply.send({ success: true, unlockToken });
        }
        catch (err) {
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
    }, async (req, reply) => {
        try {
            const { id } = req.params; // ← FIX: destructure id so JWT check below works
            const { invite } = req.query;
            const survey = await surveyService.getSurveyById(id);
            if (!survey)
                return reply.status(404).send({ error: 'Опитування не знайдено' });
            const userId = req.headers['x-user-id'];
            const userRole = req.headers['x-user-role'];
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
                    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'unknown';
                    const redis = fastify.redis;
                    if (redis && redis.status === 'ready') {
                        try {
                            const attemptsIP = parseInt(await redis.get(`unlock_attempts:ip:${ip}:${id}`) || '0', 10);
                            const attemptsUser = userId ? parseInt(await redis.get(`unlock_attempts:user:${userId}:${id}`) || '0', 10) : 0;
                            if (attemptsIP >= 10 || attemptsUser >= 10) {
                                return reply.status(429).send({ error: 'too_many_attempts', message: 'Забагато невдалих спроб. Зачекайте 10 хвилин.' });
                            }
                        }
                        catch (e) {
                            fastify.log.warn({ err: e }, 'Redis error during anti-bruteforce check');
                        }
                    }
                    // Memory fallback check
                    const memIP = getMemoryAttempts(`unlock_attempts:ip:${ip}:${id}`);
                    const memUser = userId ? getMemoryAttempts(`unlock_attempts:user:${userId}:${id}`) : 0;
                    if (memIP >= 10 || memUser >= 10) {
                        return reply.status(429).send({ error: 'too_many_attempts', message: 'Забагато невдалих спроб. Зачекайте 10 хвилин.' });
                    }
                    const unlockToken = req.headers['x-unlock-token'];
                    let unlocked = false;
                    if (unlockToken) {
                        try {
                            const decoded = fastify.jwt.verify(unlockToken);
                            if (decoded.surveyId === id && decoded.type === 'unlock' && decoded.userId === (userId || 'anon')) {
                                unlocked = true;
                            }
                        }
                        catch (e) { }
                    }
                    if (!unlocked) {
                        return reply.status(403).send({ error: 'not_public', message: 'Опитування захищене паролем', requiresPassword: true });
                    }
                }
            }
            // Strip password hash before sending to client
            const { passwordHash: _pw, ...safeSurvey } = survey;
            return reply.send({ survey: safeSurvey });
        }
        catch (err) {
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
    }, async (req, reply) => {
        const { id } = req.params;
        try {
            // ── Access Control ───────────────────────────────────────────────
            const surveyCheck = await surveyService.getSurveyById(id);
            if (!surveyCheck)
                return reply.status(404).send({ error: 'Опитування не знайдено' });
            const userId = req.headers['x-user-id'];
            const userRole = req.headers['x-user-role'];
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
                    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'unknown';
                    const redis = fastify.redis;
                    if (redis && redis.status === 'ready') {
                        try {
                            const attemptsIP = parseInt(await redis.get(`unlock_attempts:ip:${ip}:${id}`) || '0', 10);
                            const attemptsUser = userId ? parseInt(await redis.get(`unlock_attempts:user:${userId}:${id}`) || '0', 10) : 0;
                            if (attemptsIP >= 10 || attemptsUser >= 10) {
                                return reply.status(429).send({ error: 'too_many_attempts', message: 'Забагато невдалих спроб. Зачекайте 10 хвилин.' });
                            }
                        }
                        catch (e) {
                            fastify.log.warn({ err: e }, 'Redis error during anti-bruteforce check');
                        }
                    }
                    // Memory fallback check
                    const memIP = getMemoryAttempts(`unlock_attempts:ip:${ip}:${id}`);
                    const memUser = userId ? getMemoryAttempts(`unlock_attempts:user:${userId}:${id}`) : 0;
                    if (memIP >= 10 || memUser >= 10) {
                        return reply.status(429).send({ error: 'too_many_attempts', message: 'Забагато невдалих спроб. Зачекайте 10 хвилин.' });
                    }
                    const unlockToken = req.headers['x-unlock-token'];
                    let unlocked = false;
                    if (unlockToken) {
                        try {
                            const decoded = fastify.jwt.verify(unlockToken);
                            if (decoded.surveyId === id && decoded.type === 'unlock' && decoded.userId === (userId || 'anon')) {
                                unlocked = true;
                            }
                        }
                        catch (e) { }
                    }
                    if (!unlocked) {
                        return reply.status(403).send({ error: 'not_public', message: 'Результати захищені паролем', requiresPassword: true });
                    }
                }
            }
            // ── 1. Redis cache lookup ──────────────────────────────────────────
            const cached = await (0, redis_helpers_1.getCachedResults)(fastify.redis, id);
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
            if (!results)
                return reply.status(404).send({ error: 'Опитування не знайдено' });
            // ── 3. Write to cache ──────────────────────────────────────────────
            await (0, redis_helpers_1.setCachedResults)(fastify.redis, id, results);
            return reply
                .header('X-Cache', 'MISS')
                .send({ results });
        }
        catch (err) {
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
                    password: { type: 'string', maxLength: 100 },
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
        preValidation: [fastify.authenticate]
    }, async (req, reply) => {
        try {
            const { id } = req.params;
            // Access check
            const survey = await surveyService.getSurveyById(id);
            if (!survey)
                return reply.status(404).send({ error: 'Опитування не знайдено' });
            if (req.user?.id !== survey.createdById) {
                return reply.status(403).send({ error: 'Forbidden', message: 'You can only edit your own surveys' });
            }
            const body = req.body;
            // ── Verify current password if changing password or access type ────────
            const isChangingPassword = body.password !== undefined && body.accessType === 'PRIVATE';
            if (isChangingPassword && survey.passwordHash) {
                // Existing private survey: require current password confirmation
                if (!body.currentPassword) {
                    return reply.status(400).send({ error: 'current_password_required', message: 'Поточний пароль обов\u0027язковий' });
                }
                const passwordMatch = await bcryptjs_1.default.compare(body.currentPassword, survey.passwordHash);
                if (!passwordMatch) {
                    return reply.status(400).send({ error: 'wrong_current_password', message: 'Невірний поточний пароль' });
                }
            }
            const results = await surveyService.updateSurvey(id, body);
            if (results) {
                // Broadcast survey update to all subscribers
                broadcaster_1.broadcaster.broadcast(id, {
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
                broadcaster_1.broadcaster.broadcast('global', {
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
        }
        catch (err) {
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
        preValidation: [fastify.authenticate]
    }, async (req, reply) => {
        try {
            const { id } = req.params;
            // Access check
            const survey = await surveyService.getSurveyById(id);
            if (!survey)
                return reply.status(404).send({ error: 'Опитування не знайдено' });
            if (req.user?.id !== survey.createdById) {
                return reply.status(403).send({ error: 'Forbidden', message: 'You can only delete your own surveys' });
            }
            await surveyService.deleteSurvey(id);
            // Broadcast deletion to all subscribers
            broadcaster_1.broadcaster.broadcast(id, { type: 'survey_deleted', surveyId: id });
            return reply.send({ success: true, message: 'Опитування видалено' });
        }
        catch (err) {
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
    }, async (req, reply) => {
        try {
            // Import AntiFraudService here since it's only used here in this file
            const { AntiFraudService } = await Promise.resolve().then(() => __importStar(require('../anti-fraud/antifraud.service')));
            const antiFraudService = new AntiFraudService(fastify.prisma);
            const survey = await surveyService.getSurveyById(req.params.id);
            if (!survey)
                return reply.status(404).send({ error: 'Опитування не знайдено' });
            const stats = await antiFraudService.getFraudStats(survey.id);
            return reply.send({ stats });
        }
        catch (err) {
            fastify.log.error(err);
            return reply.status(500).send({ error: 'Помилка' });
        }
    });
    // GET /api/surveys/:id/invites ───────────────────────────────────────────
    fastify.get('/:id/invites', {
        preValidation: [fastify.authenticate]
    }, async (req, reply) => {
        try {
            const survey = await surveyService.getSurveyById(req.params.id);
            if (!survey)
                return reply.status(404).send({ error: 'Опитування не знайдено' });
            if (req.user?.id !== survey.createdById) {
                return reply.status(403).send({ error: 'Forbidden' });
            }
            const tokens = await surveyService.getInviteTokens(req.params.id);
            return reply.send({ tokens });
        }
        catch (err) {
            fastify.log.error(err);
            return reply.status(500).send({ error: 'Помилка' });
        }
    });
    // POST /api/surveys/:id/invites/new — deactivate old, create fresh token ─
    fastify.post('/:id/invites/new', {
        preValidation: [fastify.authenticate]
    }, async (req, reply) => {
        try {
            const survey = await surveyService.getSurveyById(req.params.id);
            if (!survey)
                return reply.status(404).send({ error: 'Опитування не знайдено' });
            if (req.user?.id !== survey.createdById)
                return reply.status(403).send({ error: 'Forbidden' });
            const expiresAt = req.body.expiresAt ? new Date(req.body.expiresAt) : null;
            const tokens = await surveyService.activateNewToken(req.params.id, expiresAt, req.body.label);
            return reply.send({ tokens });
        }
        catch (err) {
            fastify.log.error(err);
            return reply.status(500).send({ error: 'Помилка створення токена' });
        }
    });
    // POST /api/surveys/:id/invites/deactivate — deactivate all active tokens ─
    fastify.post('/:id/invites/deactivate', {
        preValidation: [fastify.authenticate]
    }, async (req, reply) => {
        try {
            const survey = await surveyService.getSurveyById(req.params.id);
            if (!survey)
                return reply.status(404).send({ error: 'Опитування не знайдено' });
            if (req.user?.id !== survey.createdById)
                return reply.status(403).send({ error: 'Forbidden' });
            await fastify.prisma.inviteToken.updateMany({
                where: { surveyId: req.params.id },
                data: { isActive: false },
            });
            return reply.send({ success: true });
        }
        catch (err) {
            fastify.log.error(err);
            return reply.status(500).send({ error: 'Помилка' });
        }
    });
    // POST /api/surveys/:id/invites/:tokenId/deactivate ─────────────────────
    fastify.post('/:id/invites/:tokenId/deactivate', {
        preValidation: [fastify.authenticate]
    }, async (req, reply) => {
        try {
            const survey = await surveyService.getSurveyById(req.params.id);
            if (!survey)
                return reply.status(404).send({ error: 'Опитування не знайдено' });
            if (req.user?.id !== survey.createdById)
                return reply.status(403).send({ error: 'Forbidden' });
            await surveyService.deactivateInviteToken(req.params.tokenId);
            return reply.send({ success: true });
        }
        catch (err) {
            fastify.log.error(err);
            return reply.status(500).send({ error: 'Помилка' });
        }
    });
}
//# sourceMappingURL=survey.routes.js.map