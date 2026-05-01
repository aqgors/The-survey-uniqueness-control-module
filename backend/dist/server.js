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
const auth_routes_1 = require("./modules/auth/auth.routes");
const export_routes_1 = require("./modules/export/export.routes");
const swagger_1 = __importDefault(require("@fastify/swagger"));
const swagger_ui_1 = __importDefault(require("@fastify/swagger-ui"));
dotenv_1.default.config();
const server = (0, fastify_1.default)({
    ajv: {
        customOptions: {
            allErrors: true,
            messages: true,
            strict: false,
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
        allowedHeaders: ['Content-Type', 'Authorization', 'X-User-Id', 'X-User-Role', 'x-user-id', 'x-user-role', 'x-unlock-token', 'X-Unlock-Token'],
        credentials: true,
    });
    // WebSocket support (must be registered before WS routes)
    await server.register(websocket_1.default);
    // JWT Support
    await server.register(Promise.resolve().then(() => __importStar(require('@fastify/jwt'))), {
        secret: process.env.JWT_SECRET || 'super-secret-development-key',
    });
    await server.register(prisma_1.prismaPlugin);
    await server.register(redis_1.redisPlugin);
    await server.register(auth_1.authPlugin);
    // ── Swagger ───────────────────────────────────────────────────────────────
    await server.register(swagger_1.default, {
        openapi: {
            info: {
                title: 'Survey Uniqueness Control Module API',
                description: 'API для системи онлайн-опитувань з контролем унікальності голосування',
                version: '1.0.0',
            },
            tags: [
                { name: 'Authentication', description: 'User authentication endpoints' },
                { name: 'Surveys', description: 'Survey management endpoints' },
                { name: 'Voting', description: 'Voting and uniqueness control' },
                { name: 'Results', description: 'Survey results' },
                { name: 'System', description: 'System health and metrics' }
            ],
            components: {
                securitySchemes: {
                    BearerAuth: {
                        type: 'http',
                        scheme: 'bearer',
                        bearerFormat: 'JWT', // Even if stub, we use Bearer format
                        description: 'Provide any token or stub session info if applicable',
                    },
                },
            },
        },
    });
    await server.register(swagger_ui_1.default, {
        routePrefix: '/documentation',
        uiConfig: {
            docExpansion: 'list',
            deepLinking: false,
        },
        staticCSP: true,
    });
    // ── HTTP routes ───────────────────────────────────────────────────────────
    await server.register(auth_routes_1.authRoutes, { prefix: '/api/auth' });
    await server.register(survey_routes_1.surveyRoutes, { prefix: '/api/surveys' });
    await server.register(vote_endpoint_1.voteEndpoint, { prefix: '/api/vote' });
    await server.register(export_routes_1.exportRoutes, { prefix: '/api/export' });
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
        console.log(`📖 Swagger docs at  http://localhost:${port}/documentation`);
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