"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.wsRoutes = wsRoutes;
const broadcaster_1 = require("./broadcaster");
const survey_service_1 = require("../surveys/survey.service");
async function wsRoutes(fastify) {
    const surveyService = new survey_service_1.SurveyService(fastify.prisma);
    /**
     * GET /ws/results/:surveyId
     *
     * @fastify/websocket v8 API:
     *   handler(connection: SocketStream, req: FastifyRequest)
     *   connection.socket → raw WebSocket (ws.WebSocket)
     *
     * Flow:
     *   1. Validate survey exists
     *   2. Subscribe connection.socket to broadcaster room
     *   3. Push current results immediately
     *   4. Handle client ping → pong keepalive
     */
    fastify.get('/results/:surveyId', { websocket: true }, async (connection, req) => {
        const { surveyId } = req.params;
        const ws = connection.socket; // actual WebSocket instance
        // ── 1. Validate survey ─────────────────────────────────────────────
        const survey = await surveyService.getSurveyById(surveyId);
        if (!survey) {
            ws.send(JSON.stringify({ type: 'error', message: 'Опитування не знайдено' }));
            ws.close(1008, 'Survey not found');
            return;
        }
        fastify.log.info({ surveyId }, 'WS client connected');
        // ── 2. Subscribe to broadcaster room ───────────────────────────────
        // broadcaster.subscribe sends { type: 'subscribed' } confirmation
        broadcaster_1.broadcaster.subscribe(surveyId, ws);
        // ── 3. Push current results immediately ────────────────────────────
        try {
            const results = await surveyService.getSurveyResults(surveyId);
            if (results && ws.readyState === ws.OPEN) {
                ws.send(JSON.stringify({
                    type: 'results_update',
                    surveyId,
                    totalVoters: results.totalVoters,
                    questions: results.questions,
                }));
            }
        }
        catch (err) {
            fastify.log.error(err, 'Failed to push initial results over WS');
        }
        // ── 4. Handle client messages (ping → pong keepalive) ──────────────
        ws.on('message', (raw) => {
            try {
                const msg = JSON.parse(raw.toString());
                if (msg?.type === 'ping') {
                    ws.send(JSON.stringify({ type: 'pong' }));
                }
            }
            catch {
                // Ignore malformed messages
            }
        });
        ws.on('close', () => {
            fastify.log.info({ surveyId }, 'WS client disconnected');
        });
    });
    // GET /ws/stats — active connection counts per survey
    fastify.get('/stats', async () => broadcaster_1.broadcaster.getStats());
}
//# sourceMappingURL=ws.routes.js.map