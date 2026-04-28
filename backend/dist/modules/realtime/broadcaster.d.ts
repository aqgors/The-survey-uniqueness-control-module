import type { WebSocket } from 'ws';
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
    voters: {
        voterUserId: string | null;
        createdAt: string;
    }[];
    deadline?: string | null;
    createdById: string | null;
}
export interface SurveyPayload {
    type: 'survey_update';
    surveyId: string;
    title: string;
    description: string | null;
    imageUrl: string | null;
    isPublic: boolean;
    deadline: string | null;
    createdById: string | null;
    questions: any[];
}
export type WsMessage = ResultsPayload | SurveyPayload | {
    type: 'subscribed';
    surveyId: string;
    message: string;
} | {
    type: 'ping';
} | {
    type: 'pong';
} | {
    type: 'error';
    message: string;
};
/**
 * In-memory WebSocket connection registry.
 * Maps surveyId → Set of active WebSocket connections watching that survey.
 */
export declare class ResultsBroadcaster {
    private readonly rooms;
    /**
     * Adds a client to the survey's broadcast room.
     */
    subscribe(surveyId: string, socket: WebSocket): void;
    unsubscribe(surveyId: string, socket: WebSocket): void;
    unsubscribeAll(socket: WebSocket): void;
    broadcast(surveyId: string, payload: ResultsPayload | SurveyPayload): void;
    getStats(): {
        totalRooms: number;
        rooms: Record<string, number>;
    };
    private send;
}
export declare const broadcaster: ResultsBroadcaster;
//# sourceMappingURL=broadcaster.d.ts.map