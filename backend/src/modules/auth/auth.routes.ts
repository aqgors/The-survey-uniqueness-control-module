import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as bcrypt from 'bcryptjs';

// ── Helpers ────────────────────────────────────────────────────────────────

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ── Auth Routes ────────────────────────────────────────────────────────────

export async function authRoutes(fastify: FastifyInstance) {

  // ── POST /api/auth/register ──────────────────────────────────────────────
  fastify.post('/register', async (request: FastifyRequest, reply: FastifyReply) => {
    const { name, email, password } = request.body as any;

    // ── Validation ──
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return reply.status(400).send({ error: "Ім'я має містити щонайменше 2 символи" });
    }
    if (!email || !isValidEmail(email)) {
      return reply.status(400).send({ error: 'Введіть коректний email' });
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
      return reply.status(400).send({ error: 'Пароль має містити щонайменше 6 символів' });
    }

    // ── Check uniqueness ──
    const existing = await fastify.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });
    if (existing) {
      return reply.status(409).send({ error: 'Користувач з таким email вже існує' });
    }

    // ── Hash & create ──
    const hashed = await bcrypt.hash(password, 12);
    const user = await fastify.prisma.user.create({
      data: {
        name: name.trim(),
        email: email.toLowerCase().trim(),
        password: hashed,
        role: 'USER',
      },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });

    fastify.log.info({ userId: user.id }, 'New user registered');

    return reply.status(201).send({ user });
  });

  // ── POST /api/auth/login ─────────────────────────────────────────────────
  fastify.post('/login', async (request: FastifyRequest, reply: FastifyReply) => {
    const { email, password } = request.body as any;

    // ── Validation ──
    if (!email || !password) {
      return reply.status(400).send({ error: 'Email та пароль є обов\u0027язковими' });
    }
    if (!isValidEmail(email)) {
      return reply.status(400).send({ error: 'Введіть коректний email' });
    }

    // ── Lookup ──
    const user = await fastify.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!user) {
      return reply.status(401).send({ error: 'Невірний email або пароль' });
    }

    if (user.isBlocked) {
      return reply.status(403).send({ error: 'Обліковий запис заблоковано' });
    }

    // ── Password check ──
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return reply.status(401).send({ error: 'Невірний email або пароль' });
    }

    fastify.log.info({ userId: user.id }, 'User logged in');

    return reply.send({
      user: {
        id:    user.id,
        email: user.email,
        name:  user.name,
        role:  user.role,
      },
    });
  });

  // ── GET /api/auth/me ─────────────────────────────────────────────────────
  fastify.get('/me', { preValidation: [fastify.authenticate] }, async (request, reply) => {
    return reply.send({ user: request.user });
  });
}
