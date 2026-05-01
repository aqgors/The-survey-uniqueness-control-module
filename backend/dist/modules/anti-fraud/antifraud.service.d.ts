import { PrismaClient } from '@prisma/client';
export interface VoterIdentity {
    /** Raw IP address — hashed with SHA-256 before storage */
    ip: string;
    /** Full User-Agent string from request headers */
    userAgent: string;
    /** UUID token persisted in voter's browser cookie / localStorage */
    cookieId: string;
    /** FingerprintJS visitorId — device fingerprint, survives cookie clearing */
    fingerprint?: string;
}
export type FraudSignal = 'ip' | 'userAgent' | 'cookieId' | 'fingerprint' | 'userId';
export interface UniquenessCheckResult {
    isUnique: boolean;
    /** Which signal triggered the duplicate detection, or null if unique */
    signal: FraudSignal | null;
    /** Whether the check is a hard block or a soft warning */
    hardBlock: boolean;
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
     * Strictness levels:
     *   1. cookieId — HARD BLOCK: unique per browser session, most reliable
     *   2. IP       — SOFT signal only: shared NAT/Wi-Fi causes false positives
     *   3. UA       — SOFT signal only: many people share identical browser builds
     *
     * Only a cookieId match causes an actual vote rejection. IP and UA matches
     * are recorded in the signal field for analytics but do NOT block the vote.
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