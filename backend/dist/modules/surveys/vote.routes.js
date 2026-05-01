"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.voteRoutes = voteRoutes;
const crypto_1 = require("crypto");
const library_1 = require("@prisma/client/runtime/library");
const survey_service_1 = require("./survey.service");
const antifraud_service_1 = require("../anti-fraud/antifraud.service");
// ── Schema ─────────────────────────────────────────────────────────────────
const submitVoteSchema = {
    body: {
        type: 'object',
        required: ['answers'],
        properties: {
            cookieId: { type: 'string', minLength: 10 },
            answers: {
                type: 'array',
                minItems: 1,
                items: {
                    type: 'object',
                    required: ['questionId', 'optionIds'],
                    properties: {
                        questionId: { type: 'string' },
                        optionIds: { type: 'array', minItems: 1, items: { type: 'string' } },
                    },
                },
            },
        },
    },
};
// ── Helpers ─────────────────────────────────────────────────────────────────
const COOKIE_NAME = 'survey_voter_id';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
function resolveVoterCookieId(req) {
    const bodyId = req.body?.cookieId;
    if (typeof bodyId === 'string' && bodyId.length >= 10)
        return bodyId;
    const cookieHeader = req.headers['cookie'] || '';
    const match = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;\\s]+)`));
    if (match?.[1])
        return match[1];
    return (0, crypto_1.randomUUID)();
}
function setVoterCookie(reply, cookieId) {
    reply.header('Set-Cookie', [
        `${COOKIE_NAME}=${cookieId}`,
        `Max-Age=${COOKIE_MAX_AGE}`,
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
    ].join('; '));
}
function extractIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        const first = Array.isArray(forwarded) ? forwarded[0] : forwarded;
        return first.split(',')[0].trim();
    }
    return req.socket?.remoteAddress ?? '127.0.0.1';
}
// ── Route ──────────────────────────────────────────────────────────────────
async function voteRoutes(fastify) {
    const surveyService = new survey_service_1.SurveyService(fastify.prisma);
    const antiFraudService = new antifraud_service_1.AntiFraudService(fastify.prisma);
    // POST /api/surveys/:id/vote ───────────────────────────────────────────────
    fastify.post('/:id/vote', { schema: submitVoteSchema }, async (req, reply) => {
        const { id: surveyId } = req.params;
        // 1. Resolve identity
        const cookieId = resolveVoterCookieId(req);
        const ip = extractIp(req);
        const userAgent = (req.headers['user-agent'] ?? 'unknown').slice(0, 512);
        const identity = { ip, userAgent, cookieId };
        // 2. Load survey
        const survey = await surveyService.getSurveyById(surveyId);
        if (!survey)
            return reply.status(404).send({ error: 'Опитування не знайдено' });
        if (!survey.isActive)
            return reply.status(410).send({ error: 'Опитування закрите' });
        // 3. Anti-fraud check
        const fraudCheck = await antiFraudService.checkUniqueness(survey.id, identity);
        if (!fraudCheck.isUnique) {
            setVoterCookie(reply, cookieId);
            return reply.status(403).send({
                error: 'already_voted',
                signal: fraudCheck.signal,
                message: fraudCheck.message,
            });
        }
        // 4. Validate answers
        const { answers } = req.body;
        const questionMap = new Map(survey.questions.map((q) => [q.id, q]));
        for (const answer of answers) {
            const question = questionMap.get(answer.questionId);
            if (!question)
                return reply.status(400).send({ error: `Питання ${answer.questionId} не знайдено` });
            const validIds = new Set(question.options.map((o) => o.id));
            for (const oid of answer.optionIds)
                if (!validIds.has(oid))
                    return reply.status(400).send({ error: `Варіант ${oid} не належить питанню` });
        }
        // 5. Persist Vote + VoteItems + VoteMeta atomically
        try {
            await fastify.prisma.$transaction(async (tx) => {
                const vote = await tx.vote.create({
                    data: { surveyId: survey.id },
                    select: { id: true },
                });
                await tx.voteItem.createMany({
                    data: answers.flatMap((a) => a.optionIds.map((optionId) => ({ voteId: vote.id, optionId }))),
                });
                await antiFraudService.recordVoteMeta(vote.id, survey.id, identity, tx);
            });
        }
        catch (err) {
            if (err instanceof library_1.PrismaClientKnownRequestError && err.code === 'P2002') {
                setVoterCookie(reply, cookieId);
                return reply.status(403).send({
                    error: 'already_voted', signal: 'cookieId',
                    message: 'Ви вже голосували в цьому опитуванні.',
                });
            }
            fastify.log.error(err, 'Failed to persist vote');
            return reply.status(500).send({ error: 'Не вдалося записати голос' });
        }
        setVoterCookie(reply, cookieId);
        return reply.status(201).send({
            success: true,
            message: 'Голос успішно прийнято',
            cookieId,
            resultsUrl: `/api/surveys/${survey.id}/results`,
        });
    });
    // GET /api/surveys/:id/fraud-stats ─────────────────────────────────────────
    fastify.get('/:id/fraud-stats', async (req, reply) => {
        const survey = await surveyService.getSurveyById(req.params.id);
        if (!survey)
            return reply.status(404).send({ error: 'Опитування не знайдено' });
        const stats = await antiFraudService.getFraudStats(survey.id);
        return reply.send({ stats });
    });
}
//# sourceMappingURL=vote.routes.js.map