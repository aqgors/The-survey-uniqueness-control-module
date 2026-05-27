import { FastifyInstance, FastifyRequest } from 'fastify';
import { SocketStream } from '@fastify/websocket';
import fs from 'fs';
import path from 'path';
import { encryptMessage, decryptMessage } from '../../utils/crypto';

const CHAT_UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'chat');
if (!fs.existsSync(CHAT_UPLOAD_DIR)) {
  fs.mkdirSync(CHAT_UPLOAD_DIR, { recursive: true });
}

// Track online users mapping: userId -> WebSocket
export const chatClients = new Map<string, WebSocket>();

export async function chatRoutes(fastify: FastifyInstance) {
  // ── GET /api/chat/history/:friendId ───────────────────────────────────────
  fastify.get('/history/:friendId', {
    preValidation: [fastify.authenticate],
    schema: {
      tags: ['Chat'],
      summary: 'Get chat history with a friend',
      params: { type: 'object', properties: { friendId: { type: 'string' } }, required: ['friendId'] },
    },
  }, async (request: FastifyRequest<{ Params: { friendId: string } }>, reply) => {
    const { friendId } = request.params;
    const userId = request.user.id;

    // Optional: check if they are friends first
    const isFriend = await fastify.prisma.friendship.findFirst({
      where: {
        OR: [
          { user1Id: userId, user2Id: friendId },
          { user1Id: friendId, user2Id: userId },
        ],
        status: 'ACCEPTED'
      }
    });

    if (!isFriend) {
      return reply.status(403).send({ error: 'You are not friends with this user' });
    }

    const rawMessages = await fastify.prisma.message.findMany({
      where: {
        OR: [
          { senderId: userId, receiverId: friendId },
          { senderId: friendId, receiverId: userId },
        ]
      },
      orderBy: { createdAt: 'asc' },
    });

    // Mark as read
    await fastify.prisma.message.updateMany({
      where: { senderId: friendId, receiverId: userId, isRead: false },
      data: { isRead: true }
    });

    // Decrypt message content before sending to client
    const messages = rawMessages.map(m => ({ ...m, content: decryptMessage(m.content) }));

    return reply.send({ messages });
  });

  // ── DELETE /api/chat/history/:friendId ──────────────────────────────────────
  fastify.delete('/history/:friendId', {
    preValidation: [fastify.authenticate],
    schema: {
      tags: ['Chat'],
      summary: 'Delete entire chat history with a friend',
      security: [{ BearerAuth: [] }]
    }
  }, async (request: FastifyRequest<{ Params: { friendId: string } }>, reply) => {
    const { friendId } = request.params;
    const userId = request.user.id;
    await fastify.prisma.message.deleteMany({
      where: {
        OR: [
          { senderId: userId, receiverId: friendId },
          { senderId: friendId, receiverId: userId },
        ]
      }
    });
    
    // Notify friend about history clear
    const receiverWs = chatClients.get(friendId);
    if (receiverWs?.readyState === WebSocket.OPEN) {
      receiverWs.send(JSON.stringify({ type: 'CHAT_CLEARED', data: { fromUserId: userId } }));
    }
    
    return reply.send({ success: true });
  });

  // ── DELETE /api/chat/messages/:messageId ────────────────────────────────────
  fastify.delete('/messages/:messageId', {
    preValidation: [fastify.authenticate],
    schema: {
      tags: ['Chat'],
      summary: 'Delete a single message',
      security: [{ BearerAuth: [] }]
    }
  }, async (request: FastifyRequest<{ Params: { messageId: string } }>, reply) => {
    const { messageId } = request.params;
    const userId = request.user.id;
    
    const msg = await fastify.prisma.message.findUnique({ where: { id: messageId } });
    if (!msg) return reply.status(404).send({ error: 'Повідомлення не знайдено' });
    if (msg.senderId !== userId) return reply.status(403).send({ error: 'Немає доступу' });
    
    await fastify.prisma.message.delete({ where: { id: messageId } });
    
    // Notify friend about message deletion
    const receiverWs = chatClients.get(msg.receiverId);
    if (receiverWs?.readyState === WebSocket.OPEN) {
      receiverWs.send(JSON.stringify({ type: 'MESSAGE_DELETED', data: { messageId } }));
    }
    
    return reply.send({ success: true });
  });

  // ── PUT /api/chat/messages/:messageId ───────────────────────────────────────
  fastify.put('/messages/:messageId', {
    preValidation: [fastify.authenticate],
    schema: {
      tags: ['Chat'],
      summary: 'Edit a single message',
      security: [{ BearerAuth: [] }],
      body: { type: 'object', properties: { content: { type: 'string' } }, required: ['content'] }
    }
  }, async (request: FastifyRequest<{ Params: { messageId: string }, Body: { content: string } }>, reply) => {
    const { messageId } = request.params;
    const { content } = request.body;
    const userId = request.user.id;
    
    const msg = await fastify.prisma.message.findUnique({ where: { id: messageId } });
    if (!msg) return reply.status(404).send({ error: 'Повідомлення не знайдено' });
    if (msg.senderId !== userId) return reply.status(403).send({ error: 'Немає доступу' });
    
    const updatedMsg = await fastify.prisma.message.update({
      where: { id: messageId },
      data: { content: encryptMessage(content) }
    });
    
    // Send decrypted content to client via WebSocket
    const decryptedMsg = { ...updatedMsg, content };
    const receiverWs = chatClients.get(msg.receiverId);
    if (receiverWs?.readyState === WebSocket.OPEN) {
      receiverWs.send(JSON.stringify({ type: 'MESSAGE_EDITED', data: decryptedMsg }));
    }
    
    return reply.send(decryptedMsg);
  });

  // ── POST /api/chat/image ──────────────────────────────────────────────────
  fastify.post('/image', {
    preValidation: [fastify.authenticate],
    schema: {
      tags: ['Chat'],
      summary: 'Upload chat image',
      security: [{ BearerAuth: [] }]
    }
  }, async (request: FastifyRequest, reply) => {
    try {
      const data = await request.file();
      if (!data) return reply.status(400).send({ error: 'Файл не знайдено' });

      const ext = path.extname(data.filename).toLowerCase();
      const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
      if (!allowed.includes(ext)) {
        return reply.status(400).send({ error: 'Дозволені формати: jpg, png, webp, gif' });
      }

      const chunks: Buffer[] = [];
      for await (const chunk of data.file) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);

      const filename = `${request.user.id}-${Date.now()}${ext}`;
      const filePath = path.join(CHAT_UPLOAD_DIR, filename);
      fs.writeFileSync(filePath, buffer);

      const url = `/uploads/chat/${filename}`;
      return reply.send({ url });
    } catch (err: any) {
      request.log.error(err, 'Failed to upload chat image');
      return reply.status(500).send({ error: 'Помилка завантаження зображення' });
    }
  });

  // ── WebSocket /api/chat/ws ────────────────────────────────────────────────
  fastify.get('/ws', { websocket: true }, async (connection: SocketStream, request: FastifyRequest) => {
    const ws = connection.socket;
    
    // Authenticate from query param or auth token
    const token = (request.query as any).token as string;
    if (!token) {
      ws.close(1008, 'Token required');
      return;
    }

    let decoded: any;
    try {
      decoded = fastify.jwt.verify(token);
    } catch (e) {
      ws.close(1008, 'Invalid token');
      return;
    }

    const userId = decoded.id;
    chatClients.set(userId, ws as unknown as WebSocket);

    ws.on('message', async (raw: any) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'chat' && msg.to && msg.text) {
          
          // Verify friendship
          const isFriend = await fastify.prisma.friendship.findFirst({
            where: {
              OR: [
                { user1Id: userId, user2Id: msg.to },
                { user1Id: msg.to, user2Id: userId },
              ],
              status: 'ACCEPTED'
            }
          });

          if (!isFriend) return; // Ignore message if not friend

          const plainText = msg.text || '';
          const savedMessage = await fastify.prisma.message.create({
            data: {
              senderId: userId,
              receiverId: msg.to,
              content: encryptMessage(plainText),
              type: msg.msgType || 'TEXT',
              metadata: msg.metadata || null
            }
          });

          // Always send decrypted content to clients
          const messageForClient = { ...savedMessage, content: plainText };

          // Forward to recipient if online
          const recipientWs = chatClients.get(msg.to);
          if (recipientWs && recipientWs.readyState === 1 /* OPEN */) {
            recipientWs.send(JSON.stringify({
              type: 'chat',
              message: messageForClient
            }));
          }

          // Echo back to sender with decrypted content
          if (ws.readyState === 1) {
             ws.send(JSON.stringify({
               type: 'chat_ack',
               message: messageForClient
             }));
          }
        }
      } catch (err) {
        fastify.log.error(err, 'WS Chat error');
      }
    });

    ws.on('close', () => {
      if (chatClients.get(userId) === (ws as unknown as WebSocket)) {
        chatClients.delete(userId);
      }
    });
  });
}
