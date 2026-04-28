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
Object.defineProperty(exports, "__esModule", { value: true });
exports.surveyRoutes = surveyRoutes;
const survey_service_1 = require("./survey.service");
const redis_helpers_1 = require("../../plugins/redis.helpers");
const broadcaster_1 = require("../realtime/broadcaster");
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
            isPublic: { type: 'boolean', default: true },
            deadline: { type: 'string', format: 'date-time', example: '2026-05-01T18:00:00Z' },
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
                        isPublic: { type: 'boolean' },
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
            response: {
                200: {
                    description: 'List of surveys',
                    type: 'object',
                    properties: {
                        surveys: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    id: { type: 'string' },
                                    title: { type: 'string' },
                                    description: { type: 'string' },
                                    imageUrl: { type: 'string' },
                                    isPublic: { type: 'boolean' },
                                    deadline: { type: 'string', format: 'date-time' },
                                    createdById: { type: 'string' },
                                    createdAt: { type: 'string', format: 'date-time' },
                                },
                            },
                        },
                    },
                },
                500: { description: 'Server error', type: 'object', properties: { error: { type: 'string' } } },
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
    // POST /api/surveys ────────────────────────────────────────────────────────
    fastify.post('/', { schema: createSurveySchema, preValidation: [fastify.authenticate] }, async (req, reply) => {
        try {
            const body = req.body;
            const payload = { ...body, createdById: req.user?.id };
            const survey = await surveyService.createSurvey(payload);
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
                                isPublic: { type: 'boolean' },
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
            const survey = await surveyService.getSurveyById(req.params.id);
            if (!survey)
                return reply.status(404).send({ error: 'Опитування не знайдено' });
            // If private, only owner can see
            if (!survey.isPublic) {
                const userId = req.headers['x-user-id'];
                if (userId !== survey.createdById) {
                    return reply.status(403).send({ error: 'Опитування не є публічним' });
                }
            }
            return reply.send({ survey });
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
                                totalVoters: { type: 'number' },
                                deadline: { type: 'string', format: 'date-time' },
                                createdById: { type: 'string' },
                                voters: {
                                    type: 'array',
                                    items: {
                                        type: 'object',
                                        properties: {
                                            voterUserId: { type: 'string' },
                                            userName: { type: 'string' },
                                            userEmail: { type: 'string' },
                                            createdAt: { type: 'string', format: 'date-time' },
                                        },
                                    },
                                },
                                questions: {
                                    type: 'array',
                                    items: {
                                        type: 'object',
                                        properties: {
                                            questionId: { type: 'string' },
                                            totalVotes: { type: 'number' },
                                            options: {
                                                type: 'array',
                                                items: {
                                                    type: 'object',
                                                    properties: {
                                                        optionId: { type: 'string' },
                                                        count: { type: 'number' },
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
                    imageUrl: { type: 'string', format: 'uri' },
                    isPublic: { type: 'boolean' },
                    deadline: { type: 'string', format: 'date-time' },
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
            const results = await surveyService.updateSurvey(id, body);
            if (results) {
                // Broadcast update to all subscribers
                broadcaster_1.broadcaster.broadcast(id, {
                    type: 'survey_update',
                    ...results
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
}
//# sourceMappingURL=survey.routes.js.map