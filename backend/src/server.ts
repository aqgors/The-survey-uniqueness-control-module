import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import dotenv from 'dotenv';
import { surveyRoutes } from './modules/surveys/survey.routes';
import { voteEndpoint } from './modules/surveys/vote.endpoint';
import { wsRoutes } from './modules/realtime/ws.routes';
import { prismaPlugin } from './plugins/prisma';
import { redisPlugin } from './plugins/redis';
import { authPlugin } from './plugins/auth';
import { authRoutes } from './modules/auth/auth.routes';
import { exportRoutes } from './modules/export/export.routes';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

dotenv.config();

// ── Logger: pino-pretty лише в розробці, JSON в production ──────────────────
// Причина: pino-pretty у Docker може спричиняти затримки старту через worker
// threads. У production використовуємо нативний JSON-формат pino.
const loggerConfig = process.env.NODE_ENV === 'production'
  ? { level: 'info' }
  : {
      level: 'info',
      transport: {
        target: 'pino-pretty',
        options: { translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' },
      },
    };

const server = Fastify({
  ajv: {
    customOptions: {
      allErrors: true,
      messages: true,
      strict: false,
    }
  },
  logger: loggerConfig,
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
    const contentType = reply.getHeader('content-type') as string | undefined;
    if (contentType && contentType.includes('application/json') && !contentType.includes('charset')) {
      reply.header('Content-Type', 'application/json; charset=utf-8');
    }
    done();
  });

  // ── Plugins ───────────────────────────────────────────────────────────────
  await server.register(cors, {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-User-Id', 'X-User-Role', 'x-user-id', 'x-user-role', 'x-unlock-token', 'X-Unlock-Token'],
    credentials: true,
  });

  // Cookie Support — необхідно для survey_browser_id (HttpOnly)
  await server.register(import('@fastify/cookie'), {
    secret: process.env.COOKIE_SECRET || 'super-secret-cookie-key-change-in-production',
    parseOptions: {}
  });

  // WebSocket support (must be registered before WS routes)
  await server.register(websocket);

  // JWT Support
  await server.register(import('@fastify/jwt'), {
    secret: process.env.JWT_SECRET || 'super-secret-development-key',
  });

  await server.register(prismaPlugin);
  await server.register(redisPlugin);
  await server.register(authPlugin);

  // ── Swagger ───────────────────────────────────────────────────────────────
  await server.register(swagger, {
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
            bearerFormat: 'JWT',
            description: 'Provide any token or stub session info if applicable',
          },
        },
      },
    },
  });

  await server.register(swaggerUi, {
    routePrefix: '/documentation',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false,
    },
    staticCSP: true,
  });

  // ── HTTP routes ───────────────────────────────────────────────────────────
  await server.register(authRoutes, { prefix: '/api/auth' });
  await server.register(surveyRoutes, { prefix: '/api/surveys' });
  await server.register(voteEndpoint, { prefix: '/api/vote' });
  await server.register(exportRoutes, { prefix: '/api/export' });

  // ── WebSocket routes ──────────────────────────────────────────────────────
  await server.register(wsRoutes, { prefix: '/ws' });

  // ── Health check ──────────────────────────────────────────────────────────
  // Production-ready: перевіряє і PostgreSQL і Redis разом з сервером.
  // Docker healthcheck звертається до: GET /health
  server.get('/health', {
    schema: {
      tags: ['System'],
      summary: 'Health check',
      response: {
        200: {
          type: 'object',
          properties: {
            status:    { type: 'string' },
            database:  { type: 'string' },
            redis:     { type: 'string' },
            timestamp: { type: 'string' },
          },
        },
      },
    },
  }, async (req, reply) => {
    // Перевірка PostgreSQL
    let dbStatus = 'disconnected';
    try {
      await (server as any).prisma.$queryRaw`SELECT 1`;
      dbStatus = 'connected';
    } catch {
      dbStatus = 'disconnected';
    }

    // Перевірка Redis
    let redisStatus = 'disconnected';
    try {
      const redis = (server as any).redis;
      if (redis && redis.status === 'ready') {
        await redis.ping();
        redisStatus = 'connected';
      }
    } catch {
      redisStatus = 'disconnected';
    }

    const isHealthy = dbStatus === 'connected';

    // Якщо БД недоступна — повертаємо 503, щоб healthcheck провалився
    return reply.status(isHealthy ? 200 : 503).send({
      status:    isHealthy ? 'ok' : 'degraded',
      database:  dbStatus,
      redis:     redisStatus,
      timestamp: new Date().toISOString(),
    });
  });

  const port = Number(process.env.PORT) || 3001;

  try {
    await server.listen({ port, host: '0.0.0.0' });
    server.log.info(`🚀 Server running at http://0.0.0.0:${port}`);
    server.log.info(`📖 Swagger docs at  http://0.0.0.0:${port}/documentation`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

// ── Graceful Shutdown ──────────────────────────────────────────────────────
// Docker надсилає SIGTERM перед зупинкою контейнера.
// Без цього обробника Node.js завершується негайно, обриваючи активні запити.
const shutdown = async (signal: string) => {
  server.log.info(`Received ${signal}, shutting down gracefully...`);
  try {
    await server.close();
    server.log.info('Server closed');
    process.exit(0);
  } catch (err) {
    server.log.error(err, 'Error during shutdown');
    process.exit(1);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

bootstrap();
