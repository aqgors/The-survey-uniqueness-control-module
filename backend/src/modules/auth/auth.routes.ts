import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as bcrypt from 'bcryptjs';
import { sendVerificationCode } from '../../services/email.service';

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
const CODE_TTL_MS = 15 * 60 * 1000;

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function authRoutes(fastify: FastifyInstance) {

  // ── POST /api/auth/register ───────────────────────────────────────────────
  fastify.post('/register', {
    schema: {
      tags: ['Authentication'],
      summary: 'Register a new user',
      body: {
        type: 'object',
        required: ['name', 'email', 'password'],
        properties: {
          name:     { type: 'string', minLength: 2 },
          email:    { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 6 },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            token: { type: 'string' },
            user: {
              type: 'object',
              properties: {
                id:        { type: 'string' },
                email:     { type: 'string' },
                name:      { type: 'string' },
                role:      { type: 'string' },
                createdAt: { type: 'string' },
              },
            },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { name, email, password } = request.body as any;

    if (!name || name.trim().length < 2)
      return reply.status(400).send({ error: "Ім'я має містити щонайменше 2 символи" });
    if (!email || !isValidEmail(email))
      return reply.status(400).send({ error: 'Введіть коректний email' });
    if (!password || password.length < 6)
      return reply.status(400).send({ error: 'Пароль має містити щонайменше 6 символів' });

    const existing = await fastify.prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (existing)
      return reply.status(409).send({ error: 'Користувач з таким email вже існує' });

    const hashed = await bcrypt.hash(password, 12);
    const user = await fastify.prisma.user.create({
      data: {
        name:  name.trim(),
        email: email.toLowerCase().trim(),
        password: hashed,
        role: 'USER',
        lastLoginAt: new Date(),
      },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });

    const token = fastify.jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      { expiresIn: '7d' }
    );

    fastify.log.info({ userId: user.id }, 'New user registered');
    return reply.status(201).send({ token, user });
  });

  // ── POST /api/auth/login ──────────────────────────────────────────────────
  fastify.post('/login', {
    schema: {
      tags: ['Authentication'],
      summary: 'Login user',
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email:    { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 1 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            token: { type: 'string' },
            user: {
              type: 'object',
              properties: {
                id:    { type: 'string' },
                email: { type: 'string' },
                name:  { type: 'string' },
                role:  { type: 'string' },
              },
            },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { email, password } = request.body as any;

    if (!email || !password)
      return reply.status(400).send({ error: 'Email та пароль є обов\'язковими' });
    if (!isValidEmail(email))
      return reply.status(400).send({ error: 'Введіть коректний email' });

    const user = await fastify.prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (!user)
      return reply.status(401).send({ error: 'Невірний email або пароль' });
    if (user.isBlocked)
      return reply.status(403).send({ error: 'Обліковий запис заблоковано' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return reply.status(401).send({ error: 'Невірний email або пароль' });

    // Update lastLoginAt
    await fastify.prisma.user.update({
      where: { id: user.id },
      data:  { lastLoginAt: new Date() },
    });

    const token = fastify.jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      { expiresIn: '7d' }
    );

    fastify.log.info({ userId: user.id }, 'User logged in');
    return reply.send({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  });

  // ── GET /api/auth/me ──────────────────────────────────────────────────────
  fastify.get('/me', {
    schema: {
      tags: ['Authentication'],
      summary: 'Get current user profile',
      security: [{ BearerAuth: [] }],
    },
    preValidation: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await fastify.prisma.user.findUnique({
      where:  { id: request.user.id },
      select: { id: true, email: true, name: true, role: true, createdAt: true, lastLoginAt: true },
    });
    if (!user) return reply.status(401).send({ error: 'Користувача не знайдено' });
    return reply.send({ user });
  });
  // ── POST /api/auth/forgot-password/request ──────────────────────────────
  fastify.post('/forgot-password/request', {
    schema: {
      tags: ['Authentication'],
      summary: 'Request password reset code',
      body: {
        type: 'object', required: ['email'],
        properties: { email: { type: 'string', format: 'email' } },
      },
    },
  }, async (request: FastifyRequest<{ Body: { email: string } }>, reply) => {
    const { email } = request.body;
    if (!email || !isValidEmail(email)) return reply.status(400).send({ error: 'Невірний email' });

    const user = await fastify.prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (!user) return reply.send({ ok: true }); // Prevent email enumeration

    // Invalidate old tokens
    await fastify.prisma.userToken.deleteMany({ where: { userId: user.id, type: 'FORGOT_PASSWORD' } });

    const code = generateCode();
    await fastify.prisma.userToken.create({
      data: {
        userId: user.id,
        type: 'FORGOT_PASSWORD',
        code,
        expiresAt: new Date(Date.now() + CODE_TTL_MS),
      },
    });

    await sendVerificationCode({ to: user.email, name: user.name, code, purpose: 'password' });
    fastify.log.info({ userId: user.id }, `Forgot password code sent: ${code}`);
    return reply.send({ ok: true });
  });

  // ── POST /api/auth/forgot-password/confirm ──────────────────────────────
  fastify.post('/forgot-password/confirm', {
    schema: {
      tags: ['Authentication'],
      summary: 'Confirm password reset code',
      body: {
        type: 'object', required: ['email', 'code', 'newPassword'],
        properties: {
          email:       { type: 'string', format: 'email' },
          code:        { type: 'string', minLength: 6, maxLength: 6 },
          newPassword: { type: 'string', minLength: 6 },
        },
      },
    },
  }, async (request: FastifyRequest<{ Body: { email: string; code: string; newPassword: string } }>, reply) => {
    const { email, code, newPassword } = request.body;

    const user = await fastify.prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (!user) return reply.status(400).send({ error: 'Невірний код або email' });

    const token = await fastify.prisma.userToken.findFirst({
      where: { userId: user.id, type: 'FORGOT_PASSWORD', code },
    });
    if (!token) return reply.status(400).send({ error: 'Невірний або прострочений код' });
    if (token.expiresAt < new Date()) {
      await fastify.prisma.userToken.delete({ where: { id: token.id } });
      return reply.status(400).send({ error: 'Код прострочений. Спробуйте знову.' });
    }

    const hashed = await bcrypt.hash(newPassword, 12);
    await fastify.prisma.user.update({ where: { id: user.id }, data: { password: hashed } });
    await fastify.prisma.userToken.deleteMany({ where: { userId: user.id, type: 'FORGOT_PASSWORD' } });

    return reply.send({ ok: true });
  });
}
