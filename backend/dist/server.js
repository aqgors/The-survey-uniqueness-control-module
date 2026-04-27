"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_1 = __importDefault(require("fastify"));
const cors_1 = __importDefault(require("@fastify/cors"));
const websocket_1 = __importDefault(require("@fastify/websocket"));
const dotenv_1 = __importDefault(require("dotenv"));
const survey_routes_1 = require("./modules/surveys/survey.routes");
const vote_endpoint_1 = require("./modules/surveys/vote.endpoint");
const ws_routes_1 = require("./modules/realtime/ws.routes");
const prisma_1 = require("./plugins/prisma");
const redis_1 = require("./plugins/redis");
const auth_1 = require("./plugins/auth");
const users_routes_1 = require("./modules/admin/users.routes");
dotenv_1.default.config();
const server = (0, fastify_1.default)({
    ajv: {
        customOptions: {
            allErrors: true,
            messages: true,
        }
    },
    logger: {
        transport: {
            target: 'pino-pretty',
            options: { translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' },
        },
    },
});
server.setErrorHandler(function (error, request, reply) {
    if (error.validation) {
        server.log.warn({ body: request.body, validation: error.validation }, 'Validation error');
        const msg = error.validation.map(e => `${e.instancePath || 'body'} ${e.message}`).join(', ');
        return reply.status(400).send({ error: 'Validation failed', message: msg });
    }
    server.log.error(error);
    reply.status(error.statusCode || 500).send({ error: error.message || 'Internal Server Error' });
});
async function bootstrap() {
    // Force UTF-8 encoding on all JSON responses
    server.addHook('onSend', (request, reply, payload, done) => {
        const contentType = reply.getHeader('content-type');
        if (contentType && contentType.includes('application/json') && !contentType.includes('charset')) {
            reply.header('Content-Type', 'application/json; charset=utf-8');
        }
        done();
    });
    // ── Plugins ───────────────────────────────────────────────────────────────
    await server.register(cors_1.default, {
        origin: process.env.FRONTEND_URL || 'http://localhost:5173',
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        credentials: true,
    });
    // WebSocket support (must be registered before WS routes)
    await server.register(websocket_1.default);
    await server.register(prisma_1.prismaPlugin);
    await server.register(redis_1.redisPlugin);
    await server.register(auth_1.authPlugin);
    // ── HTTP routes ───────────────────────────────────────────────────────────
    await server.register(auth_1.authRoutes, { prefix: '/api/auth' });
    await server.register(users_routes_1.adminUsersRoutes, { prefix: '/api/admin/users' });
    await server.register(survey_routes_1.surveyRoutes, { prefix: '/api/surveys' });
    await server.register(vote_endpoint_1.voteEndpoint, { prefix: '/vote' });
    // ── WebSocket routes ──────────────────────────────────────────────────────
    // ws://localhost:3001/ws/results/:surveyId
    await server.register(ws_routes_1.wsRoutes, { prefix: '/ws' });
    // ── Health check ──────────────────────────────────────────────────────────
    server.get('/health', async () => ({
        status: 'ok',
        timestamp: new Date().toISOString(),
    }));
    const port = Number(process.env.PORT) || 3001;
    try {
        await server.listen({ port, host: '0.0.0.0' });
        console.log(`\n🚀 Server running at http://localhost:${port}`);
        console.log(`\n📋 Endpoints:`);
        console.log(`   HTTP  GET    /health`);
        console.log(`   HTTP  GET    /api/surveys`);
        console.log(`   HTTP  POST   /api/surveys`);
        console.log(`   HTTP  GET    /api/surveys/:id`);
        console.log(`   HTTP  GET    /api/surveys/:id/results`);
        console.log(`   HTTP  POST   /api/surveys/:id/vote`);
        console.log(`   HTTP  GET    /api/surveys/:id/fraud-stats`);
        console.log(`   HTTP  POST   /vote/:surveyId       ← anti-fraud endpoint`);
        console.log(`   WS    GET    /ws/results/:surveyId ← real-time updates`);
        console.log(`   HTTP  GET    /ws/stats`);
        console.log(`\n📊 Database: ${process.env.DATABASE_URL?.split('@')[1] || 'connected'}`);
    }
    catch (err) {
        server.log.error(err);
        process.exit(1);
    }
}
bootstrap();
//# sourceMappingURL=server.js.map