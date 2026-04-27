"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.voteEndpoint = voteEndpoint;
const crypto_1 = require("crypto");
const library_1 = require("@prisma/client/runtime/library");
const antifraud_service_1 = require("../anti-fraud/antifraud.service");
const survey_service_1 = require("./survey.service");
const broadcaster_1 = require("../realtime/broadcaster");
const redis_helpers_1 = require("../../plugins/redis.helpers");
// ── Constants ──────────────────────────────────────────────────────────────
const COOKIE_NAME = 'survey_voter_id';
const COOKIE_TTL = 60 * 60 * 24 * 365; // 1 рік у секундах
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
                success: { type: 'boolean' },
                message: { type: 'string' },
                cookieId: { type: 'string' },
                resultsUrl: { type: 'string' },
            },
        },
        400: {
            type: 'object',
            properties: {
                error: { type: 'string' },
                details: { type: 'string' },
            },
        },
        403: {
            type: 'object',
            properties: {
                error: { type: 'string' },
                signal: { type: 'string' },
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
function extractClientIp(req) {
    // Заголовок від nginx/cloudflare: "client, proxy1, proxy2"
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded;
        const first = ips.split(',')[0].trim();
        if (first)
            return first;
    }
    // Альтернативний заголовок від деяких proxy
    const realIp = req.headers['x-real-ip'];
    if (realIp && !Array.isArray(realIp))
        return realIp.trim();
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
function resolveVoterCookieId(req) {
    // 1. З тіла запиту
    const body = req.body;
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
    return { cookieId: (0, crypto_1.randomUUID)(), isNew: true };
}
// ── Helper: set voter cookie on response ──────────────────────────────────
function setVoterCookie(reply, cookieId) {
    reply.header('Set-Cookie', [
        `${COOKIE_NAME}=${cookieId}`,
        `Max-Age=${COOKIE_TTL}`,
        'Path=/',
        'HttpOnly', // недоступний з JS — захист від XSS
        'SameSite=Lax', // захист від CSRF
        // 'Secure',              // розкоментуйте у production (HTTPS)
    ].join('; '));
}
// ── Route plugin ───────────────────────────────────────────────────────────
async function voteEndpoint(fastify) {
    const antiFraudService = new antifraud_service_1.AntiFraudService(fastify.prisma);
    const surveyService = new survey_service_1.SurveyService(fastify.prisma);
    /**
     * POST /vote/:surveyId
     *
     * Приймає голос від користувача.
     * Перед записом виконує anti-fraud перевірку:
     *   cookieId → IP → User-Agent
     */
    fastify.post('/:surveyId', { schema: voteSchema }, async (req, reply) => {
        const { surveyId } = req.params;
        const { answers } = req.body;
        // ────────────────────────────────────────────────────────────────────
        // STEP 1 — Отримати IP користувача
        // ────────────────────────────────────────────────────────────────────
        const rawIp = extractClientIp(req);
        // ────────────────────────────────────────────────────────────────────
        // STEP 0 — Rate limiting (Redis INCR sliding window)
        // ────────────────────────────────────────────────────────────────────
        const rateResult = await (0, redis_helpers_1.checkRateLimit)(fastify.redis, rawIp);
        if (!rateResult.allowed) {
            fastify.log.warn({ rawIp, count: rateResult.count }, 'Rate limit exceeded');
            reply
                .header('X-RateLimit-Limit', String(5))
                .header('X-RateLimit-Remaining', '0')
                .header('X-RateLimit-Reset', String(rateResult.resetIn))
                .header('Retry-After', String(rateResult.resetIn));
            return reply.status(429).send({
                error: 'rate_limit_exceeded',
                message: `Забагато запитів з вашого IP. Спробуйте через ${rateResult.resetIn} секунд.`,
                resetIn: rateResult.resetIn,
            });
        }
        // Attach rate-limit headers to successful responses too
        reply
            .header('X-RateLimit-Limit', String(5))
            .header('X-RateLimit-Remaining', String(rateResult.remaining))
            .header('X-RateLimit-Reset', String(rateResult.resetIn));
        fastify.log.info({ surveyId, rawIp }, 'Step 1: IP resolved');
        // ────────────────────────────────────────────────────────────────────
        // STEP 2 — Отримати User-Agent
        // ────────────────────────────────────────────────────────────────────
        const userAgent = (req.headers['user-agent'] ?? 'unknown').slice(0, 512);
        fastify.log.info({ userAgent: userAgent.slice(0, 80) }, 'Step 2: User-Agent resolved');
        // ────────────────────────────────────────────────────────────────────
        // STEP 3 — Отримати cookie або створити новий
        // ────────────────────────────────────────────────────────────────────
        const { cookieId, isNew } = resolveVoterCookieId(req);
        fastify.log.info({ cookieId, isNew }, 'Step 3: Cookie resolved');
        // Формуємо identity object для anti-fraud сервісу
        const identity = { ip: rawIp, userAgent, cookieId };
        // ────────────────────────────────────────────────────────────────────
        // STEP 4 — Викликати AntiFraudService
        // ────────────────────────────────────────────────────────────────────
        let fraudCheck;
        try {
            fraudCheck = await antiFraudService.checkUniqueness(surveyId, identity);
        }
        catch (err) {
            fastify.log.error({ err }, 'AntiFraudService error');
            return reply.status(500).send({ error: 'Помилка перевірки унікальності' });
        }
        fastify.log.info({ isUnique: fraudCheck.isUnique, signal: fraudCheck.signal }, 'Step 4: Anti-fraud result');
        // ────────────────────────────────────────────────────────────────────
        // STEP 5 (якщо НЕ ок) — Повернути 403
        // ────────────────────────────────────────────────────────────────────
        if (!fraudCheck.isUnique) {
            // Оновлюємо cookie навіть при відмові — щоб наступна перевірка
            // теж спрацювала через cookie-сигнал
            setVoterCookie(reply, cookieId);
            return reply.status(403).send({
                error: 'already_voted',
                signal: fraudCheck.signal, // 'ip' | 'userAgent' | 'cookieId'
                message: fraudCheck.message,
            });
        }
        // ────────────────────────────────────────────────────────────────────
        // STEP 5 (якщо ок) — Валідація + запис голосу
        // ────────────────────────────────────────────────────────────────────
        // 5a. Перевірити що опитування існує
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
        if (!survey.isPublic) {
            return reply.status(410).send({ error: 'Опитування недоступне' });
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
            await fastify.prisma.$transaction(async (tx) => {
                // Створити Vote
                const vote = await tx.vote.create({
                    data: { surveyId },
                    select: { id: true },
                });
                // Створити VoteItem для кожного обраного варіанта
                await tx.voteItem.createMany({
                    data: answers.flatMap((a) => a.optionIds.map((optionId) => ({
                        voteId: vote.id,
                        optionId,
                    }))),
                });
                // Записати VoteMeta (anti-fraud lock)
                await antiFraudService.recordVoteMeta(vote.id, surveyId, identity, tx);
            });
        }
        catch (err) {
            // P2002 = Unique constraint violation (race condition)
            if (err instanceof library_1.PrismaClientKnownRequestError &&
                err.code === 'P2002') {
                setVoterCookie(reply, cookieId);
                return reply.status(403).send({
                    error: 'already_voted',
                    signal: 'cookieId',
                    message: 'Ви вже голосували в цьому опитуванні.',
                });
            }
            fastify.log.error({ err }, 'Failed to persist vote');
            return reply.status(500).send({ error: 'Не вдалося записати голос. Спробуйте пізніше.' });
        }
        // ────────────────────────────────────────────────────────────────────
        // STEP 6 — Broadcast нові результати всім WS-підписникам
        //          + Invalidate results cache so next HTTP request gets fresh data
        // ────────────────────────────────────────────────────────────────────
        surveyService.getSurveyResults(surveyId)
            .then(async (results) => {
            if (!results)
                return;
            // Invalidate stale cache
            await (0, redis_helpers_1.invalidateResultsCache)(fastify.redis, surveyId);
            // Push fresh results to all WS subscribers
            broadcaster_1.broadcaster.broadcast(surveyId, {
                type: 'results_update',
                surveyId,
                totalVoters: results.totalVoters,
                questions: results.questions,
            });
        })
            .catch((err) => fastify.log.error(err, 'WS broadcast / cache invalidation failed'));
        // ────────────────────────────────────────────────────────────────────
        // STEP 7 — Успіх: встановити cookie і повернути 201
        // ────────────────────────────────────────────────────────────────────
        setVoterCookie(reply, cookieId);
        fastify.log.info({ surveyId, cookieId }, 'Vote recorded successfully');
        return reply.status(201).send({
            success: true,
            message: 'Ваш голос успішно прийнято',
            cookieId,
            resultsUrl: `/survey/${surveyId}/results`,
        });
    });
}
//# sourceMappingURL=vote.endpoint.js.map