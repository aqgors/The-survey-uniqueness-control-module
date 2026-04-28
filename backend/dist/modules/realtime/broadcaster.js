"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.broadcaster = exports.ResultsBroadcaster = void 0;
// ── ResultsBroadcaster ─────────────────────────────────────────────────────
/**
 * In-memory WebSocket connection registry.
 * Maps surveyId → Set of active WebSocket connections watching that survey.
 */
class ResultsBroadcaster {
    constructor() {
        this.rooms = new Map();
    }
    // ── Subscribe ─────────────────────────────────────────────────────────────
    /**
     * Adds a client to the survey's broadcast room.
     */
    subscribe(surveyId, socket) {
        // Remove from other rooms first if any (single subscription per socket for simplicity)
        this.unsubscribeAll(socket);
        if (!this.rooms.has(surveyId)) {
            this.rooms.set(surveyId, new Set());
        }
        this.rooms.get(surveyId).add(socket);
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
    unsubscribe(surveyId, socket) {
        const room = this.rooms.get(surveyId);
        if (!room)
            return;
        room.delete(socket);
        if (room.size === 0)
            this.rooms.delete(surveyId);
    }
    unsubscribeAll(socket) {
        for (const [surveyId, room] of this.rooms) {
            if (room.has(socket)) {
                room.delete(socket);
                if (room.size === 0)
                    this.rooms.delete(surveyId);
            }
        }
    }
    // ── Broadcast ─────────────────────────────────────────────────────────────
    broadcast(surveyId, payload) {
        const room = this.rooms.get(surveyId);
        if (!room || room.size === 0)
            return;
        const data = JSON.stringify(payload);
        const dead = [];
        for (const socket of room) {
            if (socket.readyState === socket.OPEN) {
                socket.send(data);
            }
            else {
                dead.push(socket);
            }
        }
        // Cleanup dead connections
        dead.forEach((s) => room.delete(s));
        if (room.size === 0)
            this.rooms.delete(surveyId);
    }
    // ── Stats ─────────────────────────────────────────────────────────────────
    getStats() {
        const rooms = {};
        for (const [id, clients] of this.rooms) {
            rooms[id] = clients.size;
        }
        return { totalRooms: this.rooms.size, rooms };
    }
    // ── Private ───────────────────────────────────────────────────────────────
    send(socket, payload) {
        if (socket.readyState === socket.OPEN) {
            socket.send(JSON.stringify(payload));
        }
    }
}
exports.ResultsBroadcaster = ResultsBroadcaster;
exports.broadcaster = new ResultsBroadcaster();
//# sourceMappingURL=broadcaster.js.map