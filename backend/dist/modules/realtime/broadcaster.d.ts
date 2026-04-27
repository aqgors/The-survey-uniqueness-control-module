import type { WebSocket } from 'ws';
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
export type WsMessage = ResultsPayload | {
    type: 'subscribed';
    surveyId: string;
    message: string;
} | {
    type: 'ping';
} | {
    type: 'error';
    message: string;
};
/**
 * In-memory WebSocket connection registry.
 * Maps surveyId → Set of active WebSocket connections watching that survey.
 *
 * Thread-safety note: Node.js is single-threaded, so no locks needed.
 */
export declare class ResultsBroadcaster {
    private readonly rooms;
    /**
     * Adds a client to the survey's broadcast room.
     * Automatically removes it on disconnect/error.
     */
    subscribe(surveyId: string, socket: WebSocket): void;
    unsubscribe(surveyId: string, socket: WebSocket): void;
    /**
     * Pushes a results_update payload to ALL clients watching a survey.
     * Dead connections are silently removed.
     */
    broadcast(surveyId: string, payload: ResultsPayload): void;
    getStats(): {
        totalRooms: number;
        rooms: Record<string, number>;
    };
    private send;
}
export declare const broadcaster: ResultsBroadcaster;
//# sourceMappingURL=broadcaster.d.ts.map