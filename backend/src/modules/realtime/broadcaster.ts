import type { WebSocket } from 'ws';

// ── Types ──────────────────────────────────────────────────────────────────

export interface ResultsPayload {
  type: 'results_update';
  surveyId: string;
  totalVoters: number;
  questions: {
    id: string;
    text: string;
    imageUrl?: string | null;
    options: {
      id: string;
      text: string;
      votes: number;
      percentage: number;
    }[];
  }[];
  voters: { voterUserId: string | null; createdAt: string }[];
  deadline?: string | null;
  createdById: string | null;
}

export interface SurveyPayload {
  type: 'survey_update';
  surveyId: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  isPrivate: boolean;
  isActive: boolean;
  deadline: string | null;
  createdById: string | null;
  questions: any[]; // simplified for now
}

export interface SurveyCreatedPayload {
  type: 'survey_created';
  survey: any;
}

export interface SurveyUpdatedPayload {
  type: 'survey_updated';
  survey: {
    id: string;
    isActive: boolean;
    deadline: string | null;
    title?: string;
    description?: string | null;
    imageUrl?: string | null;
  };
}

export type WsMessage =
  | ResultsPayload
  | SurveyPayload
  | SurveyCreatedPayload
  | SurveyUpdatedPayload
  | { type: 'subscribed'; surveyId: string; message: string }
  | { type: 'ping' }
  | { type: 'pong' }
  | { type: 'error'; message: string };

// ── ResultsBroadcaster ─────────────────────────────────────────────────────

/**
 * In-memory WebSocket connection registry.
 * Maps surveyId → Set of active WebSocket connections watching that survey.
 */
export class ResultsBroadcaster {
  private readonly rooms = new Map<string, Set<WebSocket>>();

  // ── Subscribe ─────────────────────────────────────────────────────────────

  /**
   * Adds a client to the survey's broadcast room.
   */
  subscribe(surveyId: string, socket: WebSocket): void {
    // Remove from other rooms first if any (single subscription per socket for simplicity)
    this.unsubscribeAll(socket);

    if (!this.rooms.has(surveyId)) {
      this.rooms.set(surveyId, new Set());
    }
    this.rooms.get(surveyId)!.add(socket);

    // Confirm subscription
    this.send(socket, {
      type: 'subscribed',
      surveyId,
      message: `Subscribed to survey ${surveyId}`,
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

  unsubscribeAll(socket: WebSocket): void {
    for (const [surveyId, room] of this.rooms) {
      if (room.has(socket)) {
        room.delete(socket);
        if (room.size === 0) this.rooms.delete(surveyId);
      }
    }
  }

  // ── Broadcast ─────────────────────────────────────────────────────────────

  broadcast(surveyId: string, payload: ResultsPayload | SurveyPayload | SurveyCreatedPayload | SurveyUpdatedPayload): void {
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

export const broadcaster = new ResultsBroadcaster();
