import { FastifyInstance } from 'fastify';
import { SocketStream } from '@fastify/websocket';
import { broadcaster } from './broadcaster';
import { SurveyService } from '../surveys/survey.service';

export async function wsRoutes(fastify: FastifyInstance) {
  const surveyService = new SurveyService(fastify.prisma);

  /**
   * Generic WebSocket handler: GET /ws
   * Supports:
   *  - Direct path subscription (backward compatibility)
   *  - In-socket subscription via JSON message { type: 'subscribe', surveyId: '...' }
   */
  const handleConnection = async (connection: SocketStream, surveyIdFromPath?: string) => {
    const ws = connection.socket;
    let currentSurveyId = surveyIdFromPath;

    if (currentSurveyId) {
      broadcaster.subscribe(currentSurveyId, ws);
    }

    ws.on('message', async (raw: any) => {
      try {
        const msg = JSON.parse(raw.toString());
        
        if (msg.type === 'subscribe' && msg.surveyId) {
          currentSurveyId = msg.surveyId as string;
          const sid = currentSurveyId;
          broadcaster.subscribe(sid, ws);

          // Push initial data
          const results = await surveyService.getSurveyResults(sid);
          if (results && ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: 'results_update', ...results }));
          }
        }

        if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
        }
      } catch (e) {
        // Ignore malformed JSON
      }
    });

    ws.on('close', () => {
      const sid = currentSurveyId;
      if (sid) {
        broadcaster.unsubscribe(sid, ws);
      }
    });
  };

  // Main endpoint as requested: GET /ws
  fastify.get('/', { websocket: true }, (connection) => handleConnection(connection));

  // Param-based endpoint: GET /ws/results/:surveyId
  fastify.get('/results/:surveyId', { websocket: true }, (connection, req: any) => 
    handleConnection(connection, (req.params as any).surveyId)
  );

  // GET /ws/stats — active connection counts per survey
  fastify.get('/stats', {
    schema: {
      tags: ['System'],
      summary: 'WebSocket stats',
      description: 'Returns the number of active WebSocket connections per survey.',
      response: {
        200: {
          description: 'Stats object',
          type: 'object',
          additionalProperties: true,
        },
      },
    },
  }, async () => broadcaster.getStats());
}
