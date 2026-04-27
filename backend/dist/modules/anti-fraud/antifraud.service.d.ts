import { PrismaClient } from '@prisma/client';
export interface VoterIdentity {
    /** Raw IP address — hashed with SHA-256 before storage */
    ip: string;
    /** Full User-Agent string from request headers */
    userAgent: string;
    /** UUID token persisted in voter's browser cookie / localStorage */
    cookieId: string;
}
export type FraudSignal = 'ip' | 'userAgent' | 'cookieId';
export interface UniquenessCheckResult {
    isUnique: boolean;
    /** Which signal triggered the duplicate detection, or null if unique */
    signal: FraudSignal | null;
    message: string;
}
export declare class AntiFraudService {
    private readonly prisma;
    constructor(prisma: PrismaClient);
    /** SHA-256 hash of a string (for safe IP storage) */
    hashIp(rawIp: string): string;
    /** Truncate User-Agent to 512 chars to match DB column */
    normaliseUserAgent(ua: string): string;
    /**
     * Checks VoteMeta for duplicate identity signals before accepting a vote.
     *
     * Uses the composite DB indexes directly:
     *   @@unique([surveyId, ip])       → "unique_survey_ip"
     *   @@unique([surveyId, cookieId]) → "unique_survey_cookie"
     *   @@index([surveyId, userAgent]) → "index_votemeta_ua_survey"
     *
     * Priority: cookieId (most reliable) → IP → User-Agent
     */
    checkUniqueness(surveyId: string, identity: VoterIdentity): Promise<UniquenessCheckResult>;
    /**
     * Creates a VoteMeta record linking the vote to all three identity signals.
     * Must be called inside the same DB transaction as Vote creation.
     *
     * @param tx - Prisma transaction client (pass `tx` from $transaction callback)
     */
    recordVoteMeta(voteId: string, surveyId: string, identity: VoterIdentity, tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>): Promise<void>;
    /**
     * Returns fraud statistics for a survey — useful for survey creators.
     *
     * Leverages the @@index([surveyId, ip]) and @@index([surveyId, userAgent])
     * indexes for efficient aggregation.
     */
    getFraudStats(surveyId: string): Promise<{
        totalVotes: number;
        uniqueIps: number;
        uniqueUserAgents: number;
        uniqueCookies: number;
        suspiciousCount: number;
    }>;
}
//# sourceMappingURL=antifraud.service.d.ts.map