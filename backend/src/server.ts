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

dotenv.config();

const server = Fastify({
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
    allowedHeaders: ['Content-Type', 'Authorization', 'X-User-Id', 'X-User-Role', 'x-user-id', 'x-user-role'],
    credentials: true,
  });

  // WebSocket support (must be registered before WS routes)
  await server.register(websocket);

  await server.register(prismaPlugin);
  await server.register(redisPlugin);
  await server.register(authPlugin);

  // ── HTTP routes ───────────────────────────────────────────────────────────
  await server.register(authRoutes, { prefix: '/api/auth' });
  await server.register(surveyRoutes, { prefix: '/api/surveys' });
  await server.register(voteEndpoint, { prefix: '/api/vote' });

  // ── WebSocket routes ──────────────────────────────────────────────────────
  // ws://localhost:3001/ws/results/:surveyId
  await server.register(wsRoutes, { prefix: '/ws' });

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
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

bootstrap();
