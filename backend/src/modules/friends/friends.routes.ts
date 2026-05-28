import { FastifyInstance, FastifyRequest } from 'fastify';
import { chatClients } from '../chat/chat.routes';

const notifyFriendUpdate = (userId: string) => {
  const ws = chatClients.get(userId);
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify({ type: 'friend_update' }));
  }
};

export async function friendsRoutes(fastify: FastifyInstance) {
  
  // ── GET /api/friends ──────────────────────────────────────────────────────
  fastify.get('/', {
    preValidation: [fastify.authenticate],
    schema: {
      tags: ['Friends'],
      summary: 'Get current user friends',
    },
  }, async (request, reply) => {
    const userId = request.user.id;

    const friendships = await fastify.prisma.friendship.findMany({
      where: {
        OR: [{ user1Id: userId }, { user2Id: userId }]
      },
      include: {
        user1: { select: { id: true, name: true, email: true, avatarUrl: true } },
        user2: { select: { id: true, name: true, email: true, avatarUrl: true } }
      }
    });

    const acceptedFriends = friendships
      .filter(f => f.status === 'ACCEPTED')
      .map(f => f.user1Id === userId ? f.user2 : f.user1);

    const incomingRequests = friendships
      .filter(f => f.status === 'PENDING' && f.requesterId !== userId)
      .map(f => f.user1Id === userId ? f.user2 : f.user1);

    const outgoingRequests = friendships
      .filter(f => f.status === 'PENDING' && f.requesterId === userId)
      .map(f => f.user1Id === userId ? f.user2 : f.user1);
    
    return reply.send({ 
      friends: acceptedFriends, 
      requests: incomingRequests,
      outgoingRequests
    });
  });

  // ── POST /api/friends ─────────────────────────────────────────────────────
  fastify.post('/', {
    preValidation: [fastify.authenticate],
    schema: {
      tags: ['Friends'],
      summary: 'Add a friend by ID',
      body: { type: 'object', required: ['friendId'], properties: { friendId: { type: 'string' } } },
    },
  }, async (request: FastifyRequest<{ Body: { friendId: string } }>, reply) => {
    const userId = request.user.id;
    const { friendId } = request.body;

    if (userId === friendId) {
      return reply.status(400).send({ error: 'You cannot add yourself' });
    }

    const friendExists = await fastify.prisma.user.findUnique({ where: { id: friendId } });
    if (!friendExists) {
      return reply.status(404).send({ error: 'User not found' });
    }

    const user1Id = userId < friendId ? userId : friendId;
    const user2Id = userId < friendId ? friendId : userId;

    const existing = await fastify.prisma.friendship.findUnique({
      where: { user1Id_user2Id: { user1Id, user2Id } }
    });

    if (existing) {
      if (existing.status === 'ACCEPTED') {
        return reply.status(400).send({ error: 'You are already friends' });
      }
      return reply.status(400).send({ error: 'Friend request already exists' });
    }

    await fastify.prisma.friendship.create({
      data: { 
        user1Id, 
        user2Id,
        status: 'PENDING',
        requesterId: userId
      }
    });

    notifyFriendUpdate(friendId);
    notifyFriendUpdate(userId);

    return reply.send({ ok: true });
  });

  // ── PATCH /api/friends/:friendId/accept ───────────────────────────────────
  fastify.patch('/:friendId/accept', {
    preValidation: [fastify.authenticate],
    schema: {
      tags: ['Friends'],
      summary: 'Accept friend request',
      params: { type: 'object', required: ['friendId'], properties: { friendId: { type: 'string' } } },
    },
  }, async (request: FastifyRequest<{ Params: { friendId: string } }>, reply) => {
    const userId = request.user.id;
    const { friendId } = request.params;

    const user1Id = userId < friendId ? userId : friendId;
    const user2Id = userId < friendId ? friendId : userId;

    const existing = await fastify.prisma.friendship.findUnique({
      where: { user1Id_user2Id: { user1Id, user2Id } }
    });

    if (!existing || existing.status === 'ACCEPTED') {
      return reply.status(404).send({ error: 'Friend request not found' });
    }

    if (existing.requesterId === userId) {
      return reply.status(400).send({ error: 'You cannot accept your own request' });
    }

    await fastify.prisma.friendship.update({
      where: { user1Id_user2Id: { user1Id, user2Id } },
      data: { status: 'ACCEPTED' }
    });

    notifyFriendUpdate(friendId);
    notifyFriendUpdate(userId);

    return reply.send({ ok: true });
  });

  // ── PATCH /api/friends/:friendId/reject ───────────────────────────────────
  fastify.patch('/:friendId/reject', {
    preValidation: [fastify.authenticate],
    schema: {
      tags: ['Friends'],
      summary: 'Reject friend request',
      params: { type: 'object', required: ['friendId'], properties: { friendId: { type: 'string' } } },
    },
  }, async (request: FastifyRequest<{ Params: { friendId: string } }>, reply) => {
    const userId = request.user.id;
    const { friendId } = request.params;

    const user1Id = userId < friendId ? userId : friendId;
    const user2Id = userId < friendId ? friendId : userId;

    await fastify.prisma.friendship.deleteMany({
      where: { user1Id, user2Id, status: 'PENDING' }
    });

    notifyFriendUpdate(friendId);
    notifyFriendUpdate(userId);

    return reply.send({ ok: true });
  });

  // ── DELETE /api/friends/:friendId ─────────────────────────────────────────
  fastify.delete('/:friendId', {
    preValidation: [fastify.authenticate],
    schema: {
      tags: ['Friends'],
      summary: 'Remove a friend',
      params: { type: 'object', required: ['friendId'], properties: { friendId: { type: 'string' } } },
    },
  }, async (request: FastifyRequest<{ Params: { friendId: string } }>, reply) => {
    const userId = request.user.id;
    const { friendId } = request.params;

    const user1Id = userId < friendId ? userId : friendId;
    const user2Id = userId < friendId ? friendId : userId;

    await fastify.prisma.friendship.deleteMany({
      where: { user1Id, user2Id }
    });

    notifyFriendUpdate(friendId);
    notifyFriendUpdate(userId);

    return reply.send({ ok: true });
  });

  // ── GET /api/friends/surveys ──────────────────────────────────────────────
  fastify.get('/surveys', {
    preValidation: [fastify.authenticate],
    schema: {
      tags: ['Friends'],
      summary: 'Get public surveys created by friends',
    },
  }, async (request, reply) => {
    const userId = request.user.id;

    const friendships = await fastify.prisma.friendship.findMany({
      where: {
        OR: [{ user1Id: userId }, { user2Id: userId }],
        status: 'ACCEPTED'
      }
    });

    const friendIds = friendships.map(f => f.user1Id === userId ? f.user2Id : f.user1Id);

    if (friendIds.length === 0) {
      return reply.send({ surveys: [] });
    }

    const surveys = await fastify.prisma.survey.findMany({
      where: {
        createdById: { in: friendIds },
        isActive: true,
        accessType: 'PUBLIC',
      },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { questions: true, votes: true } }
      }
    });

    // Fetch author names and avatars
    const authors = await fastify.prisma.user.findMany({
      where: { id: { in: friendIds } },
      select: { id: true, name: true, avatarUrl: true },
    });
    const authorMap: Record<string, { name: string, avatarUrl: string | null }> = {};
    authors.forEach(a => { authorMap[a.id] = { name: a.name, avatarUrl: a.avatarUrl }; });

    const result = surveys.map(s => ({
      ...s,
      authorName: s.createdById ? authorMap[s.createdById]?.name ?? null : null,
      authorAvatar: s.createdById ? authorMap[s.createdById]?.avatarUrl ?? null : null,
    }));

    return reply.send({ surveys: result });
  });
}
