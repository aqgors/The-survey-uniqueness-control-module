import type { WebSocket } from 'ws';

// ── Types ──────────────────────────────────────────────────────────────────

export interface ResultsPayload {
  type: 'results_update';
  surveyId: string;
  totalVoters: number;
  questions: {
    id: string;
    text: string;
    options: {
      id: string;
      text: string;
      votes: number;
      percentage: number;
    }[];
  }[];
}

export type WsMessage =
  | ResultsPayload
  | { type: 'subscribed'; surveyId: string; message: string }
  | { type: 'ping' }
  | { type: 'error'; message: string };

// ── ResultsBroadcaster ─────────────────────────────────────────────────────

/**
 * In-memory WebSocket connection registry.
 * Maps surveyId → Set of active WebSocket connections watching that survey.
 *
 * Thread-safety note: Node.js is single-threaded, so no locks needed.
 */
export class ResultsBroadcaster {
  private readonly rooms = new Map<string, Set<WebSocket>>();

  // ── Subscribe ─────────────────────────────────────────────────────────────

  /**
   * Adds a client to the survey's broadcast room.
   * Automatically removes it on disconnect/error.
   */
  subscribe(surveyId: string, socket: WebSocket): void {
    if (!this.rooms.has(surveyId)) {
      this.rooms.set(surveyId, new Set());
    }
    this.rooms.get(surveyId)!.add(socket);

    // Confirm subscription
    this.send(socket, {
      type: 'subscribed',
      surveyId,
      message: `Підписано на оновлення результатів опитування ${surveyId}`,
    });

    // Auto-cleanup on disconnect
    socket.on('close', () => this.unsubscribe(surveyId, socket));
    socket.on('error', () => this.unsubscribe(surveyId, socket));
  }

  // ── Unsubscribe ───────────────────────────────────────────────────────────

  unsubscribe(surveyId: string, socket: WebSocket): void {
    const room = this.rooms.get(surveyId);
    if (!room) return;
    room.delete(socket);
    if (room.size === 0) this.rooms.delete(surveyId);
  }

  // ── Broadcast ─────────────────────────────────────────────────────────────

  /**
   * Pushes a results_update payload to ALL clients watching a survey.
   * Dead connections are silently removed.
   */
  broadcast(surveyId: string, payload: ResultsPayload): void {
    const room = this.rooms.get(surveyId);
    if (!room || room.size === 0) return;

    const data = JSON.stringify(payload);
    const dead: WebSocket[] = [];

    for (const socket of room) {
      if (socket.readyState === socket.OPEN) {
        socket.send(data);
      } else {
        dead.push(socket);
      }
    }

    // Cleanup dead connections
    dead.forEach((s) => room.delete(s));
    if (room.size === 0) this.rooms.delete(surveyId);
  }

  // ── Stats ─────────────────────────────────────────────────────────────────

  getStats() {
    const rooms: Record<string, number> = {};
    for (const [id, clients] of this.rooms) {
      rooms[id] = clients.size;
    }
    return { totalRooms: this.rooms.size, rooms };
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private send(socket: WebSocket, payload: WsMessage): void {
    if (socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify(payload));
    }
  }
}

// ── Singleton instance ─────────────────────────────────────────────────────
// Shared across all Fastify route handlers via server.decorator

export const broadcaster = new ResultsBroadcaster();
