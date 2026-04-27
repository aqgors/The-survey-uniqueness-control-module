import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as bcrypt from 'bcryptjs';

export async function authRoutes(fastify: FastifyInstance) {
  fastify.post('/login', async (request: FastifyRequest, reply: FastifyReply) => {
    const { email, password } = request.body as any;

    if (!email || !password) {
      return reply.status(400).send({ error: 'Email and password are required' });
    }

    const user = await fastify.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return reply.status(401).send({ error: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return reply.status(401).send({ error: 'Invalid email or password' });
    }

    // Since we are using stub-like session for now but with real DB check,
    // we return the user info. The frontend will store this and send in headers.
    return reply.send({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      }
    });
  });

  fastify.get('/me', { preValidation: [fastify.authenticate] }, async (request, reply) => {
    return reply.send({ user: request.user });
  });
}
